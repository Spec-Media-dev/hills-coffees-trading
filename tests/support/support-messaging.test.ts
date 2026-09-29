import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSupportTicketAction,
  sendSupportMessageAction,
} from "@/src/app/dashboard/messages/actions";
import {
  adminUpdateTicketStatusAction,
  adminSendSupportReplyAction,
} from "@/src/app/dashboard-admin/(system)/messages/actions";
import {
  getSupportTicketDetail,
  listMemberTickets,
} from "@/lib/messaging/tickets";

const mockIdentity = vi.hoisted(() => ({
  value: {
    kind: "authenticated" as const,
    userId: "usr-org-a-member-1",
    organization: {
      organizationId: "org-aaa-1111",
      legalName: "Org A Corp",
      displayName: "Org A",
      roles: ["MEMBER"],
    },
    organizations: [],
    isAuthorizedMember: true,
    operationalRoles: [] as string[],
    profile: {
      id: "usr-org-a-member-1",
      fullName: "Alice Member",
      companyName: "Org A",
      avatarPath: null,
    },
  },
}));

vi.mock("@/lib/auth/dal", () => ({
  getRequestIdentity: vi.fn(async () => mockIdentity.value),
}));

const mockSupabase = vi.hoisted(() => ({
  client: null as unknown as SupabaseClient,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => mockSupabase.client),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const migrationSql = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260929110000_feature_014_support_ticket_reference.sql"),
  "utf8"
);

describe("Feature 014 — Support Messaging Security & Ticket Reference (T012)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIdentity.value = {
      kind: "authenticated",
      userId: "usr-org-a-member-1",
      organization: {
        organizationId: "org-aaa-1111",
        legalName: "Org A Corp",
        displayName: "Org A",
        roles: ["MEMBER"],
      },
      organizations: [],
      isAuthorizedMember: true,
      operationalRoles: [],
      profile: {
        id: "usr-org-a-member-1",
        fullName: "Alice Member",
        companyName: "Org A",
        avatarPath: null,
      },
    };
  });

  describe("Database Migration Static Verification", () => {

    it("declares HLP-YYYYMMDD-XXXXXXX reference code format", () => {
      expect(migrationSql).toMatch(/'HLP-' \|\| to_char\(clock_timestamp\(\), 'YYYYMMDD'\) \|\| '-' \|\| lpad\(nextval\('public\.support_ticket_code_seq'\)::text, 7, '0'\)/);
    });

    it("enforces immutability of ticket_code on UPDATE", () => {
      expect(migrationSql).toMatch(/if new\.ticket_code is distinct from old\.ticket_code then/);
      expect(migrationSql).toMatch(/raise exception 'ticket_code_immutable';/);
    });

    it("enforces immutability of requester_user_id and requester_organization_id", () => {
      expect(migrationSql).toMatch(/raise exception 'ticket_requester_user_immutable';/);
      expect(migrationSql).toMatch(/raise exception 'ticket_requester_org_immutable';/);
    });

    it("ensures unique index on ticket_code", () => {
      expect(migrationSql).toMatch(/create unique index if not exists idx_support_tickets_ticket_code on public\.support_tickets\(ticket_code\);/);
    });

    it("enforces tenant and closed-ticket rules for direct database writes", () => {
      expect(migrationSql).toContain("new.requester_user_id := auth.uid()");
      expect(migrationSql).toContain("public.is_org_member(new.requester_organization_id)");
      expect(migrationSql).toContain("new.author_user_id := auth.uid()");
      expect(migrationSql).toContain("new.is_staff_reply := public.is_platform_admin()");
      expect(migrationSql).toContain("v_ticket.status = 'CLOSED'");
      expect(migrationSql).toContain("for update");
      expect(migrationSql).toContain("drop policy if exists tickets_view_own_or_admin");
      expect(migrationSql).toContain("drop policy if exists messages_insert_access");
      expect(migrationSql).toContain("revoke all on function public.next_support_ticket_code() from public, anon, authenticated, service_role");
      expect(migrationSql).toContain("grant execute on function public.create_member_support_ticket(text,text,text,uuid,uuid) to authenticated");
      expect(migrationSql).toContain("length(btrim(new.body)) not between 1 and 4000");
    });
  });

  describe("createSupportTicketAction", () => {
    it("rejects unauthenticated caller", async () => {
      mockIdentity.value.kind = "unauthenticated" as unknown as "authenticated";
      const res = await createSupportTicketAction({
        subject: "Need help with shipment",
        initialMessage: "Where is my lot?",
        priority: "NORMAL",
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toBe("UNAUTHORIZED");
    });

    it("uses the atomic RPC with the server-resolved acting organization", async () => {
      const insertedTicket = {
        ticket_id: "ticket-1111-uuid",
        ticket_code: "HLP-20260928-0001001",
      };
      const rpcMock = vi.fn(async () => ({ data: insertedTicket, error: null }));
      mockSupabase.client = { rpc: rpcMock } as unknown as SupabaseClient;

      const res = await createSupportTicketAction({
        subject: "Need help with shipment",
        initialMessage: "Where is my lot?",
        priority: "HIGH",
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.ticketId).toBe("ticket-1111-uuid");
        expect(res.ticketCode).toBe("HLP-20260928-0001001");
      }

      expect(rpcMock).toHaveBeenCalledWith(
        "create_member_support_ticket",
        expect.objectContaining({
          p_org_id: "org-aaa-1111",
          p_subject: "Need help with shipment",
          p_body: "Where is my lot?",
          p_priority: "HIGH",
        })
      );
      expect(migrationSql).toContain("values (auth.uid(), p_org_id, btrim(p_subject), p_priority, p_order_id)");
      expect(migrationSql).toContain("values (v_ticket.id, auth.uid(), btrim(p_body))");
    });

    it("rejects linking an order that does not belong to caller's organization", async () => {
      const orderQueryMock = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: {
                id: "b0000000-0000-4000-8000-000000000001",
                order_code: "ORD-001",
                buyer_organization_id: "org-bbb-2222",
                seller_organization_id: "org-ccc-3333",
              },
              error: null,
            })),
          })),
        })),
      }));

      mockSupabase.client = {
        from: vi.fn((table: string) => {
          if (table === "orders") return orderQueryMock();
          return {};
        }),
      } as unknown as SupabaseClient;

      const res = await createSupportTicketAction({
        subject: "Need help with order",
        initialMessage: "Order issue",
        priority: "NORMAL",
        orderId: "b0000000-0000-4000-8000-000000000001",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toBe("ORDER_NOT_FOUND");
    });
  });

  describe("sendSupportMessageAction", () => {
    it("blocks posting a message to a ticket of another organization", async () => {
      const ticketQueryMock = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: {
                id: "ticket-org-b-uuid",
                status: "OPEN",
                requester_organization_id: "org-bbb-2222", // Different org!
              },
              error: null,
            })),
          })),
        })),
      }));

      mockSupabase.client = {
        from: vi.fn((table: string) => {
          if (table === "support_tickets") return ticketQueryMock();
          return {};
        }),
      } as unknown as SupabaseClient;

      const res = await sendSupportMessageAction({
        ticketId: "b0000000-0000-4000-8000-000000000002",
        body: "I shouldn't be able to talk here",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toBe("NOT_FOUND");
    });

    it("blocks posting on a CLOSED ticket with TICKET_CLOSED", async () => {
      const ticketQueryMock = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: {
                id: "b0000000-0000-4000-8000-000000000003",
                status: "CLOSED",
                requester_organization_id: "org-aaa-1111",
              },
              error: null,
            })),
          })),
        })),
      }));

      mockSupabase.client = {
        from: vi.fn((table: string) => {
          if (table === "support_tickets") return ticketQueryMock();
          return {};
        }),
      } as unknown as SupabaseClient;

      const res = await sendSupportMessageAction({
        ticketId: "b0000000-0000-4000-8000-000000000003",
        body: "Trying to post to closed ticket",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toBe("TICKET_CLOSED");
    });

    it("lets the database reopen a RESOLVED ticket atomically on member reply", async () => {
      const updateMock = vi.fn(() => ({
        eq: vi.fn(async () => ({ error: null })),
      }));

      const ticketBuilder = {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: {
                id: "b0000000-0000-4000-8000-000000000004",
                status: "RESOLVED",
                requester_organization_id: "org-aaa-1111",
              },
              error: null,
            })),
          })),
        })),
        update: updateMock,
      };

      const messageInsertMock = vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: { id: "msg-resolved-reply", created_at: "2026-09-29T11:00:00Z" },
            error: null,
          })),
        })),
      }));

      mockSupabase.client = {
        from: vi.fn((table: string) => {
          if (table === "support_tickets") return ticketBuilder;
          if (table === "support_messages") return { insert: messageInsertMock };
          return {};
        }),
      } as unknown as SupabaseClient;

      const res = await sendSupportMessageAction({
        ticketId: "b0000000-0000-4000-8000-000000000004",
        body: "I still have a question.",
      });

      expect(res.ok).toBe(true);
      expect(updateMock).not.toHaveBeenCalled();
      expect(migrationSql).toContain("when v_ticket.status in ('RESOLVED', 'WAITING_FOR_CUSTOMER') and not new.is_staff_reply then 'IN_PROGRESS'");
    });
  });

  describe("Platform Admin Support Actions", () => {
    it("refuses non-admin caller for adminUpdateTicketStatusAction", async () => {
      mockIdentity.value.operationalRoles = []; // Member, not admin
      const res = await adminUpdateTicketStatusAction({
        ticketId: "b0000000-0000-4000-8000-000000000001",
        status: "CLOSED",
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toBe("UNAUTHORIZED");
    });

    it("allows platform admin to close a ticket and marks closed_at", async () => {
      mockIdentity.value.operationalRoles = ["ADMIN"];
      const updateMock = vi.fn(() => ({
        eq: vi.fn(() => ({ select: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { id: "b0000000-0000-4000-8000-000000000001" }, error: null })) })) })),
      }));

      mockSupabase.client = {
        from: vi.fn((table: string) => {
          if (table === "support_tickets") return { update: updateMock };
          return {};
        }),
      } as unknown as SupabaseClient;

      const res = await adminUpdateTicketStatusAction({
        ticketId: "b0000000-0000-4000-8000-000000000001",
        status: "CLOSED",
      });

      expect(res.ok).toBe(true);
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "CLOSED",
          closed_at: expect.any(String),
        })
      );
    });

    it("does not report success when a ticket update matched no visible row", async () => {
      mockIdentity.value.operationalRoles = ["ADMIN"];
      mockSupabase.client = {
        from: vi.fn(() => ({ update: vi.fn(() => ({
          eq: vi.fn(() => ({ select: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })) })),
        })) })),
      } as unknown as SupabaseClient;

      const res = await adminUpdateTicketStatusAction({
        ticketId: "b0000000-0000-4000-8000-000000000001",
        status: "CLOSED",
      });
      expect(res).toEqual({ ok: false, error: "NOT_FOUND" });
    });

    it("sets is_staff_reply: true when platform admin replies", async () => {
      mockIdentity.value.operationalRoles = ["ADMIN"];

      const ticketQueryMock = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: { id: "b0000000-0000-4000-8000-000000000001", status: "OPEN", first_response_at: null },
              error: null,
            })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null })),
        })),
      }));

      const messageInsertMock = vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: { id: "staff-msg-1", created_at: "2026-09-29T12:00:00Z" },
            error: null,
          })),
        })),
      }));

      mockSupabase.client = {
        from: vi.fn((table: string) => {
          if (table === "support_tickets") return ticketQueryMock();
          if (table === "support_messages") return { insert: messageInsertMock };
          return {};
        }),
      } as unknown as SupabaseClient;

      const res = await adminSendSupportReplyAction({
        ticketId: "b0000000-0000-4000-8000-000000000001",
        body: "Hello, this is Hills Operations reviewing your ticket.",
      });

      expect(res.ok).toBe(true);
      expect(messageInsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          is_staff_reply: true,
          body: "Hello, this is Hills Operations reviewing your ticket.",
        })
      );
    });
  });

  describe("Data Access Layer: listMemberTickets & getSupportTicketDetail", () => {
    it("listMemberTickets returns empty when caller requests another organization", async () => {
      const tickets = await listMemberTickets({
        organizationId: "org-bbb-other",
      });
      expect(tickets).toEqual([]);
    });

    it("getSupportTicketDetail returns null when ticket belongs to another organization", async () => {
      mockIdentity.value.organization = {
        organizationId: "org-aaa-1111",
        legalName: "Org A",
        displayName: "Org A",
        roles: ["MEMBER"],
      };

      const ticketQueryMock = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: {
                id: "b0000000-0000-4000-8000-000000000009",
                ticket_code: "HLP-20260928-0001009",
                requester_organization_id: "org-bbb-2222", // outsider
              },
              error: null,
            })),
          })),
        })),
      }));

      mockSupabase.client = {
        from: vi.fn(() => ticketQueryMock()),
      } as unknown as SupabaseClient;

      const detail = await getSupportTicketDetail("b0000000-0000-4000-8000-000000000009");
      expect(detail).toBeNull();
    });
  });
});
