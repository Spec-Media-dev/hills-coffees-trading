import { z } from "zod";

export const SUPPORT_TICKET_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

export const SUPPORT_TICKET_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type SupportTicketPriority = (typeof SUPPORT_TICKET_PRIORITIES)[number];

export const CreateTicketSchema = z.object({
  subject: z.string().trim().min(3).max(200),
  initialMessage: z.string().trim().min(1).max(4000),
  priority: z.enum(SUPPORT_TICKET_PRIORITIES).default("NORMAL"),
  orderId: z.string().uuid().optional().nullable(),
});
export type CreateTicketInput = z.infer<typeof CreateTicketSchema>;

export const SendMessageSchema = z.object({
  ticketId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
});
export type SendMessageInput = z.infer<typeof SendMessageSchema>;

export const AdminUpdateTicketSchema = z.object({
  ticketId: z.string().uuid(),
  status: z.enum(SUPPORT_TICKET_STATUSES),
  priority: z.enum(SUPPORT_TICKET_PRIORITIES).optional(),
});
export type AdminUpdateTicketInput = z.infer<typeof AdminUpdateTicketSchema>;

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
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
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
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  createdAt: string;
  updatedAt: string;
  messages: SupportMessageDTO[];
}
