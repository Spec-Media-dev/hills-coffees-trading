import { getRequestIdentity } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type {
  SupportTicketListItemDTO,
  SupportTicketDetailDTO,
  SupportMessageDTO,
  SupportTicketStatus,
  SupportTicketPriority,
} from "@/lib/messaging/types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_PAGE_SIZE = 25;

export class MessagingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MessagingError";
  }
}

/**
 * List support tickets for the caller's organization.
 */
export async function listMemberTickets({
  organizationId,
  status,
  page = 0,
  pageSize = DEFAULT_PAGE_SIZE,
}: {
  organizationId: string;
  status?: SupportTicketStatus;
  page?: number;
  pageSize?: number;
}): Promise<SupportTicketListItemDTO[]> {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || !identity.isAuthorizedMember || identity.organization === null) {
    return [];
  }

  // Cross-tenant guard: caller can only list for their active acting organization
  if (identity.organization.organizationId !== organizationId) {
    return [];
  }

  const supabase = await createClient();
  const from = Math.max(0, page) * Math.min(pageSize, 100);
  const to = from + pageSize - 1;

  let query = supabase
    .from("support_tickets")
    .select("id, ticket_code, order_id, order_code_snapshot, subject, status, priority, created_at, updated_at")
    .eq("requester_organization_id", organizationId)
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    throw new MessagingError(error.message);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    ticketCode: row.ticket_code,
    orderId: row.order_id,
    orderCodeSnapshot: row.order_code_snapshot,
    subject: row.subject,
    status: row.status as SupportTicketStatus,
    priority: row.priority as SupportTicketPriority,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Get ticket details with messages thread for an authorized member or admin.
 */
export async function getSupportTicketDetail(ticketId: string, scope: "member" | "admin" = "member"): Promise<SupportTicketDetailDTO | null> {
  if (!UUID_PATTERN.test(ticketId)) return null;

  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated") return null;

  const supabase = await createClient();

  // 1. Fetch ticket
  const { data: ticket, error: ticketError } = await supabase
    .from("support_tickets")
    .select("id, ticket_code, requester_user_id, requester_organization_id, order_id, order_code_snapshot, subject, status, priority, created_at, updated_at")
    .eq("id", ticketId)
    .maybeSingle();

  if (ticketError || !ticket) return null;

  const isPlatformAdmin = identity.operationalRoles.includes("ADMIN") || identity.operationalRoles.includes("SUPER_ADMIN");
  if (scope === "admin" ? !isPlatformAdmin : !identity.isAuthorizedMember ||
    !identity.organization || identity.organization.organizationId !== ticket.requester_organization_id) {
    return null;
  }

  // 2. Fetch messages
  const { data: messages, error: messagesError } = await supabase
    .from("support_messages")
    .select("id, ticket_id, author_user_id, is_staff_reply, body, created_at")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  if (messagesError) {
    throw new MessagingError(messagesError.message);
  }

  const mappedMessages: SupportMessageDTO[] = (messages ?? []).map((m) => ({
    id: m.id,
    ticketId: m.ticket_id,
    authorUserId: m.author_user_id,
    authorName: m.is_staff_reply
      ? "Hills Operations"
      : m.author_user_id === identity.userId
      ? "You"
      : "Member",
    isStaff: m.is_staff_reply,
    body: m.body,
    createdAt: m.created_at,
  }));

  return {
    id: ticket.id,
    ticketCode: ticket.ticket_code,
    requesterUserId: ticket.requester_user_id,
    requesterOrgId: ticket.requester_organization_id,
    orderId: ticket.order_id,
    orderCodeSnapshot: ticket.order_code_snapshot,
    subject: ticket.subject,
    status: ticket.status as SupportTicketStatus,
    priority: ticket.priority as SupportTicketPriority,
    createdAt: ticket.created_at,
    updatedAt: ticket.updated_at,
    messages: mappedMessages,
  };
}

/**
 * List support tickets for platform administrators.
 */
export async function listAdminTickets({
  status,
  priority,
  page = 0,
  pageSize = DEFAULT_PAGE_SIZE,
}: {
  status?: SupportTicketStatus;
  priority?: SupportTicketPriority;
  page?: number;
  pageSize?: number;
} = {}): Promise<SupportTicketListItemDTO[]> {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" ||
    !(identity.operationalRoles.includes("ADMIN") || identity.operationalRoles.includes("SUPER_ADMIN"))) {
    return [];
  }

  const supabase = await createClient();
  const from = Math.max(0, page) * Math.min(pageSize, 100);
  const to = from + pageSize - 1;

  let query = supabase
    .from("support_tickets")
    .select("id, ticket_code, order_id, order_code_snapshot, subject, status, priority, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (status) {
    query = query.eq("status", status);
  }
  if (priority) {
    query = query.eq("priority", priority);
  }

  const { data, error } = await query;
  if (error) {
    throw new MessagingError(error.message);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    ticketCode: row.ticket_code,
    orderId: row.order_id,
    orderCodeSnapshot: row.order_code_snapshot,
    subject: row.subject,
    status: row.status as SupportTicketStatus,
    priority: row.priority as SupportTicketPriority,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}
