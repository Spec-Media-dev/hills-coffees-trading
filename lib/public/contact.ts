/**
 * Hills public contact details (final non-payment closure run) — the ONE typed source the Contact page
 * renders from. Dubai only: this is the confirmed office · warehouse · factory site; no other office is
 * published here.
 *
 * CONFIGURATION, NOT UI: every optional channel (email, WhatsApp, social pages, a direct Google Maps
 * place URL) is `null` until the business supplies the real value. A `null` channel is simply NOT
 * rendered — the page never shows a dead button, never renders a `#` placeholder link, and nothing here is guessed.
 * Adding a real value later is a one-line data change; the page picks it up with no redesign.
 *
 * Maps: without a place URL, both the preview and the "Open in Google Maps" action use Google's public,
 * key-less address-query endpoints for `mapsQuery`. No API key exists in this file or anywhere in client
 * code, and none is needed for these two URL forms.
 */

export type ContactChannelKey = "email" | "whatsapp" | "instagram" | "facebook" | "linkedin";
export type LocationTypeKey = "office" | "warehouse" | "factory";

export type HillsContactSite = {
  /** Kinds of operation at this site, in display order. */
  types: readonly LocationTypeKey[];
  /** Official postal address, rendered as-is (LTR) in every locale — it is an address, not prose. */
  addressLines: readonly string[];
  /** Official facility name, rendered as-is (LTR). */
  facility: string;
  phones: readonly { key: "primary" | "secondary"; display: string; tel: string }[];
  /** Free-text Google Maps query (a place name + city is enough for the address-query endpoints). */
  mapsQuery: string;
  /** A direct Google Maps place URL, once supplied. Overrides the query for the "open" action. */
  mapsPlaceUrl: string | null;
  /** Optional channels — `null` hides the action entirely. */
  channels: Record<ContactChannelKey, string | null>;
};

export const HILLS_DUBAI: HillsContactSite = {
  types: ["office", "warehouse", "factory"],
  addressLines: ["Office No. 2013, DAMAC Smart Heights,", "TECOM, Dubai Internet City,", "Dubai, UAE"],
  facility: "DMCC Coffee Centre",
  phones: [
    { key: "primary", display: "+971 52 361 8866", tel: "+971523618866" },
    // 04 is the Dubai landline area code: +971 4 323 0662 in international form.
    { key: "secondary", display: "04 323 0662", tel: "+97143230662" },
  ],
  mapsQuery: "DAMAC Smart Heights, Dubai, United Arab Emirates",
  mapsPlaceUrl: null,
  channels: { email: null, whatsapp: null, instagram: null, facebook: null, linkedin: null },
};

/** `tel:` link for a phone entry (E.164, no spaces). */
export function telHref(tel: string): string {
  return `tel:${tel.replace(/[^+\d]/g, "")}`;
}

/** Where "Open in Google Maps" (and a tap on the map preview) goes — a new tab, never a key. */
export function mapsOpenUrl(site: HillsContactSite = HILLS_DUBAI): string {
  return site.mapsPlaceUrl ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.mapsQuery)}`;
}

/** The key-less embeddable preview for the same query. */
export function mapsEmbedUrl(site: HillsContactSite = HILLS_DUBAI): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(site.mapsQuery)}&output=embed`;
}

const HTTPS = /^https:\/\/[^\s]+$/;

/**
 * Turns a configured channel value into a safe href, or `null` when it is missing or malformed:
 * email → `mailto:`, WhatsApp → `https://wa.me/<digits>` (a phone number or an existing wa.me URL),
 * social pages → an `https://` URL only (anything else is rejected, never "fixed up").
 */
export function channelHref(key: ContactChannelKey, value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (key === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? `mailto:${raw}` : null;
  if (key === "whatsapp") {
    if (HTTPS.test(raw) && /^https:\/\/(wa\.me|api\.whatsapp\.com)\//.test(raw)) return raw;
    const digits = raw.replace(/[^\d]/g, "");
    return digits.length >= 8 ? `https://wa.me/${digits}` : null;
  }
  return HTTPS.test(raw) ? raw : null;
}

/** Only the channels that are actually configured (and valid), in a stable order. */
export function configuredChannels(site: HillsContactSite = HILLS_DUBAI): { key: ContactChannelKey; href: string; external: boolean }[] {
  const order: ContactChannelKey[] = ["email", "whatsapp", "instagram", "facebook", "linkedin"];
  return order.flatMap((key) => {
    const href = channelHref(key, site.channels[key]);
    return href ? [{ key, href, external: key !== "email" }] : [];
  });
}
