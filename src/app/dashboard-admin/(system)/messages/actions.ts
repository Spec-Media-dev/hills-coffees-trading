"use server";

import { revalidatePath } from "next/cache";
import { getRequestIdentity } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import {
  AdminUpdateTicketSchema,
  SendMessageSchema,
  type AdminUpdateTicketInput,
  type SendMessageInput,
} from "@/lib/messaging/types";

export type AdminActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: "UNAUTHORIZED" | "VALIDATION_FAILED" | "NOT_FOUND" | "INTERNAL_ERROR"; message?: string };

/**
 * Server Action: Update support ticket status and/or priority (Platform Admin only).
 */
export async function adminUpdateTicketStatusAction(input: AdminUpdateTicketInput): Promise<AdminActionResult> {
  const parsed = AdminUpdateTicketSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "VALIDATION_FAILED" };
  }

  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" ||
    (!identity.operationalRoles.includes("ADMIN") && !identity.operationalRoles.includes("SUPER_ADMIN"))) {
    return { ok: false, error: "UNAUTHORIZED" };
  }

  const supabase = await createClient();

  const updates: Record<string, unknown> = {
    status: parsed.data.status,
    updated_at: new Date().toISOString(),
  };

  if (parsed.data.priority) {
    updates.priority = parsed.data.priority;
  }
  if (parsed.data.status === "RESOLVED") {
    updates.resolved_at = new Date().toISOString();
  } else if (parsed.data.status === "CLOSED") {
    updates.closed_at = new Date().toISOString();
  }

  const { error } = await supabase.from("support_tickets").update(updates).eq("id", parsed.data.ticketId);

  if (error) {
    return { ok: false, error: "INTERNAL_ERROR", message: error.message };
  }

  revalidatePath("/dashboard-admin/messages");
  revalidatePath(`/dashboard-admin/messages/${parsed.data.ticketId}`);
  revalidatePath(`/dashboard/messages/${parsed.data.ticketId}`);

  return { ok: true };
}

/**
 * Server Action: Post a staff reply to a support ticket (Platform Admin only).
 */
export async function adminSendSupportReplyAction(input: SendMessageInput): Promise<AdminActionResult<{ messageId: string; createdAt: string }>> {
  const parsed = SendMessageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "VALIDATION_FAILED" };
  }

  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" ||
    (!identity.operationalRoles.includes("ADMIN") && !identity.operationalRoles.includes("SUPER_ADMIN"))) {
    return { ok: false, error: "UNAUTHORIZED" };
  }

  const supabase = await createClient();

  // Verify ticket exists
  const { data: ticket, error: ticketErr } = await supabase
    .from("support_tickets")
    .select("id, status, first_response_at")
    .eq("id", parsed.data.ticketId)
    .maybeSingle();

  if (ticketErr || !ticket) {
    return { ok: false, error: "NOT_FOUND" };
  }

  if (ticket.status === "CLOSED") {
    return { ok: false, error: "VALIDATION_FAILED", message: "Reopen the ticket before replying." };
  }

  // Insert staff message
  const { data: message, error: messageErr } = await supabase
    .from("support_messages")
    .insert({
      ticket_id: parsed.data.ticketId,
      author_user_id: identity.userId,
      is_staff_reply: true,
      body: parsed.data.body,
    })
    .select("id, created_at")
    .single();

  if (messageErr || !message) {
    return { ok: false, error: "INTERNAL_ERROR", message: messageErr?.message };
  }

  // Update ticket timestamps and status
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (!ticket.first_response_at) {
    updates.first_response_at = new Date().toISOString();
  }
  if (ticket.status === "OPEN") {
    updates.status = "IN_PROGRESS";
  }

  await supabase.from("support_tickets").update(updates).eq("id", parsed.data.ticketId);

  revalidatePath("/dashboard-admin/messages");
  revalidatePath(`/dashboard-admin/messages/${parsed.data.ticketId}`);
  revalidatePath(`/dashboard/messages/${parsed.data.ticketId}`);

  return { ok: true, data: { messageId: message.id, createdAt: message.created_at } };
}
