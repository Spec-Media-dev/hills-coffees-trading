"use server";

import { revalidatePath } from "next/cache";
import { getRequestIdentity } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import {
  CreateTicketSchema,
  SendMessageSchema,
  type CreateTicketInput,
  type SendMessageInput,
} from "@/lib/messaging/types";

export type CreateTicketResponse =
  | { ok: true; ticketId: string; ticketCode: string }
  | { ok: false; error: "UNAUTHORIZED" | "VALIDATION_FAILED" | "ORDER_NOT_FOUND" | "INTERNAL_ERROR"; message?: string };

export type SendMessageResponse =
  | { ok: true; messageId: string; createdAt: string }
  | { ok: false; error: "UNAUTHORIZED" | "TICKET_CLOSED" | "VALIDATION_FAILED" | "NOT_FOUND" | "INTERNAL_ERROR"; message?: string };

/**
 * Server Action: Create a support ticket from the member portal.
 * Generates human-readable reference ticketCode database-side (HLP-YYYYMMDD-XXXXXXX).
 */
export async function createSupportTicketAction(input: CreateTicketInput): Promise<CreateTicketResponse> {
  const parsed = CreateTicketSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message };
  }

  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || !identity.isAuthorizedMember || identity.organization === null) {
    return { ok: false, error: "UNAUTHORIZED" };
  }

  const supabase = await createClient();

  // If orderId is linked, verify caller belongs to buyer or seller organization of this order
  if (parsed.data.orderId) {
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, buyer_organization_id, seller_organization_id")
      .eq("id", parsed.data.orderId)
      .maybeSingle();

    if (orderErr || !order) {
      return { ok: false, error: "ORDER_NOT_FOUND" };
    }

    const orgId = identity.organization.organizationId;
    if (order.buyer_organization_id !== orgId && order.seller_organization_id !== orgId) {
      return { ok: false, error: "ORDER_NOT_FOUND" };
    }
  }

  // One RPC inserts the ticket and initial message atomically. The database
  // derives requester/author IDs and verifies the acting organization again.
  const { data: ticket, error: ticketErr } = await supabase.rpc("create_member_support_ticket", {
    p_subject: parsed.data.subject,
    p_body: parsed.data.initialMessage,
    p_priority: parsed.data.priority ?? "NORMAL",
    p_order_id: parsed.data.orderId ?? null,
    p_org_id: identity.organization.organizationId,
  });

  if (ticketErr || !ticket || typeof ticket.ticket_id !== "string" || typeof ticket.ticket_code !== "string") {
    return { ok: false, error: "INTERNAL_ERROR", message: "Failed to create support ticket." };
  }

  revalidatePath("/dashboard/messages");
  return { ok: true, ticketId: ticket.ticket_id, ticketCode: ticket.ticket_code };
}

/**
 * Server Action: Post a reply message to an open support ticket.
 * Enforces author identity derivation, ticket access, and blocks posting to CLOSED tickets.
 */
export async function sendSupportMessageAction(input: SendMessageInput): Promise<SendMessageResponse> {
  const parsed = SendMessageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "VALIDATION_FAILED" };
  }

  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || !identity.isAuthorizedMember || identity.organization === null) {
    return { ok: false, error: "UNAUTHORIZED" };
  }

  const supabase = await createClient();

  // Verify ticket exists and belongs to caller's organization
  const { data: ticket, error: ticketErr } = await supabase
    .from("support_tickets")
    .select("id, status, requester_organization_id")
    .eq("id", parsed.data.ticketId)
    .maybeSingle();

  if (ticketErr || !ticket) {
    return { ok: false, error: "NOT_FOUND" };
  }

  if (ticket.requester_organization_id !== identity.organization.organizationId) {
    return { ok: false, error: "NOT_FOUND" };
  }

  // Block posting on CLOSED ticket
  if (ticket.status === "CLOSED") {
    return { ok: false, error: "TICKET_CLOSED" };
  }

  // Insert reply message
  const { data: message, error: messageErr } = await supabase
    .from("support_messages")
    .insert({
      ticket_id: parsed.data.ticketId,
      author_user_id: identity.userId,
      is_staff_reply: false,
      body: parsed.data.body,
    })
    .select("id, created_at")
    .single();

  if (messageErr || !message) {
    return { ok: false, error: "INTERNAL_ERROR" };
  }

  revalidatePath("/dashboard/messages");
  revalidatePath(`/dashboard/messages/${parsed.data.ticketId}`);

  return { ok: true, messageId: message.id, createdAt: message.created_at };
}
