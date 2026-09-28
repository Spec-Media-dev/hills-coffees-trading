# Interface Contracts: Operational Messaging & Support

**Feature**: `014-notifications-messaging-seo` (Sprint 2)  
**Spec**: [spec.md](../spec.md)

---

## 1. Server Action Contracts

### `createSupportTicketAction(input: CreateTicketInput)`

* **Path**: `src/app/dashboard/messages/actions.ts`
* **Input Schema**:
  ```typescript
  import { z } from "zod";

  export const CreateTicketSchema = z.object({
    subject: z.string().trim().min(3).max(200),
    initialMessage: z.string().trim().min(1).max(4000),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
    orderId: z.string().uuid().optional().nullable(),
  });

  export type CreateTicketInput = z.infer<typeof CreateTicketSchema>;
  ```
* **Output**:
  ```typescript
  export type CreateTicketResponse = 
    | { ok: true; ticketId: string; ticketCode: string }
    | { ok: false; error: "UNAUTHORIZED" | "VALIDATION_FAILED" | "INTERNAL_ERROR"; message?: string };
  ```
* **Security Checks**:
  1. Verifies caller via `getRequestIdentity()`. Requires `kind === 'authenticated' && isAuthorizedMember`.
  2. Resolves `requester_organization_id = identity.organization.id`.
  3. Derives `requester_user_id = identity.userId`.
  4. Ticket reference is generated exclusively database-side by `public.next_support_ticket_code()` (formatted `HLP-YYYYMMDD-XXXXXXX`, e.g., `HLP-20260928-0000001`). Client-supplied codes are forbidden and discarded.
  5. Inserts into `support_tickets`, then inserts `support_messages` in a single transaction. Returns generated `ticketCode`.

### `sendSupportMessageAction(input: SendMessageInput)`

* **Path**: `src/app/dashboard/messages/actions.ts`
* **Input Schema**:
  ```typescript
  export const SendMessageSchema = z.object({
    ticketId: z.string().uuid(),
    body: z.string().trim().min(1).max(4000),
  });

  export type SendMessageInput = z.infer<typeof SendMessageSchema>;
  ```
* **Output**:
  ```typescript
  export type SendMessageResponse = 
    | { ok: true; messageId: string; createdAt: string }
    | { ok: false; error: "UNAUTHORIZED" | "TICKET_CLOSED" | "VALIDATION_FAILED" | "INTERNAL_ERROR" };
  ```
* **Security Checks**:
  1. Author is strictly derived from session (`auth.uid()`).
  2. Verifies ticket is not in `CLOSED` status.
  3. Inserts into `support_messages` using caller's authenticated Supabase client (RLS enforces access).
  4. Updates `support_tickets.updated_at = now()`. If member replies to a `RESOLVED` ticket, status reverts to `IN_PROGRESS`.

### `adminUpdateTicketStatusAction(input: AdminUpdateTicketInput)`

* **Path**: `src/app/dashboard-admin/(system)/messages/actions.ts`
* **Input**:
  ```typescript
  export const AdminUpdateTicketSchema = z.object({
    ticketId: z.string().uuid(),
    status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  });
  ```
* **Security**: Enforces `identity.isPlatformAdmin`.

---

## 2. Data Transfer Objects (DTOs)

```typescript
export interface SupportMessageDTO {
  id: string;
  ticketId: string;
  authorUserId: string;
  authorName: string;
  isStaff: boolean;
  body: string;
  createdAt: string;
}

export interface SupportTicketListItemDTO {
  id: string;
  ticketCode: string; // e.g. "HLP-20260928-0000001"
  orderId: string | null;
  orderCodeSnapshot: string | null;
  subject: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicketDetailDTO {
  id: string;
  ticketCode: string; // e.g. "HLP-20260928-0000001"
  requesterUserId: string;
  requesterOrgId: string | null;
  requesterOrgName?: string;
  orderId: string | null;
  orderCodeSnapshot: string | null;
  subject: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  createdAt: string;
  updatedAt: string;
  messages: SupportMessageDTO[];
}
```

---

## 3. UI Reference Visibility Contract

1. **Human-Readable Primary Identifier**: Standard Member and Admin UI surfaces must exclusively present `ticketCode` (e.g., `HLP-20260928-0000001`) as the prominent heading, breadcrumb, table cell, and notification badge. Internal database UUIDs (`id`) are used strictly for technical keys and URL parameters where required, never displayed as raw reference numbers.
2. **Member List View**: Every row displays the badge `<span className="font-mono">{ticket.ticketCode}</span>`.
3. **Member Detail View**: Header displays `<h1 className="font-mono">{ticket.ticketCode}</h1> — {ticket.subject}`.
4. **Admin Queue View**: Queue table displays `ticketCode` in first data column alongside status pill and organization name.
5. **Success Confirmation**: After submitting a ticket, the success dialog or toast explicitly reports: `"Ticket created: {ticketCode}"`.
6. **Separation from Order Reference**: If a ticket has an associated order, `orderCodeSnapshot` is rendered as an independent badge (e.g. `Order: ORD-20260928-0000001`), maintaining clear separation from the ticket's own reference number.
