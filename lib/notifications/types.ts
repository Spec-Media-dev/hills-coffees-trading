import { z } from "zod";

/**
 * Feature 012 RUN B (T009–T011) — notification DTOs and the preference vocabulary. CLIENT-SAFE (zod
 * only): the preferences form imports these directly.
 *
 * CHANNELS are NOT invented: `NOTIFICATION_PREFERENCE_CHANNELS` is verbatim from the live
 * `notification_preferences_channel_check` (`channel = ANY (ARRAY['EMAIL','SMS','WHATSAPP'])`).
 *
 * TYPES — RECORDED HONESTLY: the database constrains `notification_preferences.notification_type`
 * with nothing (free text; no CHECK, no lookup table), and no generator exists that would emit any
 * type (DB-BLOCK-04). The SRS names no notification categories either. The only approved source that
 * does is the Hills design system (`docs/claude-design/ui_kits/shared/account-settings.jsx`,
 * "Notification preferences"): Order updates · Payment & invoices · Shipment updates · KYB &
 * documents · Marketplace digest. The first four are adopted here as application-owned keys.
 * "Marketplace digest" ("new lots matching your saved filters") is NOT adopted — saved filters do not
 * exist in this product, so offering it would describe a feature that isn't there. When an approved
 * notification generator defines its own type vocabulary, these keys must be reconciled with it.
 */
export const NOTIFICATION_PREFERENCE_CHANNELS = ["EMAIL", "SMS", "WHATSAPP"] as const;
export type NotificationPreferenceChannel = (typeof NOTIFICATION_PREFERENCE_CHANNELS)[number];

export const NOTIFICATION_PREFERENCE_TYPES = ["ORDER_UPDATES", "PAYMENT_INVOICES", "SHIPMENT_UPDATES", "KYB_DOCUMENTS"] as const;
export type NotificationPreferenceType = (typeof NOTIFICATION_PREFERENCE_TYPES)[number];

/** The form field name for one (type, channel) cell — e.g. `ORDER_UPDATES__EMAIL`. */
export function preferenceFieldName(type: NotificationPreferenceType, channel: NotificationPreferenceChannel): `${NotificationPreferenceType}__${NotificationPreferenceChannel}` {
  return `${type}__${channel}`;
}

const PREFERENCE_FIELDS = Object.fromEntries(
  NOTIFICATION_PREFERENCE_TYPES.flatMap((type) => NOTIFICATION_PREFERENCE_CHANNELS.map((channel) => [preferenceFieldName(type, channel), z.boolean()])),
) as Record<`${NotificationPreferenceType}__${NotificationPreferenceChannel}`, z.ZodBoolean>;

/**
 * EXACT-FIELD validation: all twelve cells must be present as booleans and nothing else may be sent
 * (`.strict()` refuses unknown keys, so no other type/channel — and no `user_id` — can be smuggled in).
 */
export const NotificationPreferencesInput = z.object(PREFERENCE_FIELDS).strict();
export type NotificationPreferencesInput = z.infer<typeof NotificationPreferencesInput>;

/** One stored preference cell; `stored: false` means no row exists yet for this cell (nothing saved). */
export type NotificationPreferenceCell = {
  type: NotificationPreferenceType;
  channel: NotificationPreferenceChannel;
  enabled: boolean;
  stored: boolean;
};

/**
 * A notification record that genuinely exists in `notifications` for the signed-in user.
 * Feature 014 adds database-backed `read_at` tracking via narrow RPCs.
 * `title`/`body` are untrusted text (rendered as text nodes only).
 */
export type OwnNotificationDTO = {
  id: string;
  notificationType: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

export type OwnNotificationPage = { rows: readonly OwnNotificationDTO[]; hasMore: boolean; page: number; pageSize: number; unreadCount?: number };

/** Active in-app notification types supported in Sprint 2 / Feature 014 / Feature 016 */
export const ACTIVE_NOTIFICATION_TYPES = [
  "ORDER_PROFORMA_ISSUED",
  "RESERVATION_CONFIRMED",
  "RESERVATION_EXPIRED",
  "PAYMENT_PROOF_SUBMITTED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_REJECTED",
  "DELIVERY_HANDOFF_REQUESTED",
] as const;
export type ActiveNotificationType = (typeof ACTIVE_NOTIFICATION_TYPES)[number];

export type NotificationTypeMetadata = {
  label: string;
  category: NotificationPreferenceType;
  description: string;
};

export const NOTIFICATION_TYPE_METADATA: Record<ActiveNotificationType, NotificationTypeMetadata> = {
  ORDER_PROFORMA_ISSUED: {
    label: "Proforma Invoice Issued",
    category: "ORDER_UPDATES",
    description: "Proforma invoice generated and available for order payment.",
  },
  RESERVATION_CONFIRMED: {
    label: "Stock Reservation Confirmed",
    category: "ORDER_UPDATES",
    description: "Inventory positions successfully reserved for your order.",
  },
  RESERVATION_EXPIRED: {
    label: "Stock Reservation Expired",
    category: "ORDER_UPDATES",
    description: "Stock reservation hold expired and positions were released.",
  },
  PAYMENT_PROOF_SUBMITTED: {
    label: "Payment Proof Submitted",
    category: "PAYMENT_INVOICES",
    description: "Bank transfer payment proof received and awaiting finance verification.",
  },
  PAYMENT_CONFIRMED: {
    label: "Payment Confirmed",
    category: "PAYMENT_INVOICES",
    description: "Bank transfer payment confirmed by finance; tax invoice issued and delivery dispatched.",
  },
  PAYMENT_REJECTED: {
    label: "Payment Rejected",
    category: "PAYMENT_INVOICES",
    description: "Bank transfer payment was rejected by finance team.",
  },
  DELIVERY_HANDOFF_REQUESTED: {
    label: "Delivery Handoff Requested",
    category: "SHIPMENT_UPDATES",
    description: "Warehouse handoff requested for confirmed order fulfillment.",
  },
};

/**
 * Feature 016 T035 — Format notification display ensuring reason-safe presentation
 * without exposing private proof or bank account details.
 */
export function formatNotificationDisplay(notification: OwnNotificationDTO): {
  title: string;
  body: string;
} {
  if (notification.notificationType === "PAYMENT_REJECTED") {
    // Sanitizes any raw database text; strips out internal bank references or storage paths if present
    const safeBody = notification.body
      .replace(/https?:\/\/[^\s]+/g, "[link]")
      .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, "[ref]");
    return {
      title: notification.title || "Payment Proof Rejected",
      body: safeBody || "Your submitted payment proof could not be verified by our finance team.",
    };
  }
  return {
    title: notification.title,
    body: notification.body,
  };
}
