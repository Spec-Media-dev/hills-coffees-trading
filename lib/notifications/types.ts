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
 * A notification record that genuinely exists in `notifications` for the signed-in user. `read_at`
 * is deliberately not represented: nothing can ever set it (DB-BLOCK-04), so showing a read/unread
 * state would be meaningless. `title`/`body` are untrusted text (rendered as text nodes only).
 */
export type OwnNotificationDTO = {
  id: string;
  notificationType: string;
  title: string;
  body: string;
  createdAt: string;
};

export type OwnNotificationPage = { rows: readonly OwnNotificationDTO[]; hasMore: boolean; page: number; pageSize: number };
