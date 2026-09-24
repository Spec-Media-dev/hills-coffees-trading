import { readFileSync } from "node:fs";

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ar } from "@/lib/public/copy/ar";
import { en } from "@/lib/public/copy/en";
import { channelHref, configuredChannels, HILLS_DUBAI, mapsEmbedUrl, mapsOpenUrl, telHref, type HillsContactSite } from "@/lib/public/contact";

/**
 * Final non-payment closure run — Dubai-only Contact, real key-less Google Maps, config-driven channels.
 */
vi.mock("motion/react", async () => {
  const React = await import("react");
  const div = React.forwardRef<HTMLDivElement, Record<string, unknown>>((props, ref) => {
    const rest = Object.fromEntries(Object.entries(props).filter(([key]) => !["initial", "whileInView", "viewport", "transition", "animate"].includes(key)));
    return React.createElement("div", { ...rest, ref });
  });
  div.displayName = "MotionDiv";
  return { useReducedMotion: () => true, motion: { div } };
});
vi.mock("@/components/public/rfq-form", () => ({ RfqForm: () => null }));

afterEach(cleanup);

async function renderContact() {
  const [{ default: ContactPage }, { LocaleProvider }] = await Promise.all([import("@/src/app/(public)/contact/page"), import("@/components/locale/locale-provider")]);
  return render(<LocaleProvider>{ContactPage()}</LocaleProvider>);
}

describe("contact model (lib/public/contact.ts)", () => {
  it("holds exactly the confirmed Dubai site", () => {
    expect(HILLS_DUBAI.types).toEqual(["office", "warehouse", "factory"]);
    expect(HILLS_DUBAI.addressLines.join(" ")).toBe("Office No. 2013, DAMAC Smart Heights, TECOM, Dubai Internet City, Dubai, UAE");
    expect(HILLS_DUBAI.facility).toBe("DMCC Coffee Centre");
    expect(HILLS_DUBAI.phones.map((p) => p.display)).toEqual(["+971 52 361 8866", "04 323 0662"]);
    expect(HILLS_DUBAI.mapsQuery).toBe("DAMAC Smart Heights, Dubai, United Arab Emirates");
  });

  it("builds real tel: links in E.164", () => {
    expect(HILLS_DUBAI.phones.map((p) => telHref(p.tel))).toEqual(["tel:+971523618866", "tel:+97143230662"]);
  });

  it("uses Google's key-less address-query endpoints and a place URL when one is configured", () => {
    const open = new URL(mapsOpenUrl());
    expect(open.origin).toBe("https://www.google.com");
    expect(open.pathname).toBe("/maps/search/");
    expect(open.searchParams.get("api")).toBe("1");
    expect(open.searchParams.get("query")).toBe(HILLS_DUBAI.mapsQuery);
    const embed = new URL(mapsEmbedUrl());
    expect(embed.pathname).toBe("/maps");
    expect(embed.searchParams.get("q")).toBe(HILLS_DUBAI.mapsQuery);
    expect(embed.searchParams.get("output")).toBe("embed");
    for (const url of [open.href, embed.href]) expect(url).not.toMatch(/key=|AIza/);
    const withPlace: HillsContactSite = { ...HILLS_DUBAI, mapsPlaceUrl: "https://maps.app.goo.gl/example" };
    expect(mapsOpenUrl(withPlace)).toBe("https://maps.app.goo.gl/example");
  });

  it("an unconfigured channel produces nothing; malformed values are rejected, never 'fixed up'", () => {
    expect(configuredChannels()).toEqual([]);
    expect(channelHref("email", null)).toBeNull();
    expect(channelHref("email", "not-an-email")).toBeNull();
    expect(channelHref("email", "sales@example.com")).toBe("mailto:sales@example.com");
    expect(channelHref("whatsapp", "+971 52 361 8866")).toBe("https://wa.me/971523618866");
    expect(channelHref("instagram", "#")).toBeNull();
    expect(channelHref("instagram", "http://insecure.example")).toBeNull();
    expect(channelHref("linkedin", "javascript:alert(1)")).toBeNull();
    expect(channelHref("facebook", "https://www.facebook.com/example")).toBe("https://www.facebook.com/example");
  });

  it("a configured channel is picked up by data alone", () => {
    const site: HillsContactSite = { ...HILLS_DUBAI, channels: { ...HILLS_DUBAI.channels, email: "sales@example.com", linkedin: "https://www.linkedin.com/company/example" } };
    expect(configuredChannels(site)).toEqual([
      { key: "email", href: "mailto:sales@example.com", external: false },
      { key: "linkedin", href: "https://www.linkedin.com/company/example", external: true },
    ]);
  });
});

describe("/contact/ page", () => {
  it("renders the Dubai details, both call links and the Google Maps actions — and no Cairo/Egypt", async () => {
    const { container } = await renderContact();
    const location = container.querySelector("[data-contact-location]");
    expect(location).toBeTruthy();
    const address = container.querySelector("[data-contact-address]");
    expect(address?.getAttribute("dir")).toBe("ltr");
    expect(address?.getAttribute("lang")).toBe("en");
    expect(address?.textContent).toContain("DAMAC Smart Heights");
    expect(container.querySelector("[data-contact-facility]")?.textContent).toBe("DMCC Coffee Centre");
    expect(container.querySelector('[data-contact-call="primary"]')?.getAttribute("href")).toBe("tel:+971523618866");
    expect(container.querySelector('[data-contact-call="secondary"]')?.getAttribute("href")).toBe("tel:+97143230662");

    const action = container.querySelector("[data-contact-maps-action]");
    const mapLink = container.querySelector("[data-contact-map-link]");
    for (const link of [action, mapLink]) {
      expect(link?.getAttribute("href")).toBe(mapsOpenUrl());
      expect(link?.getAttribute("target")).toBe("_blank");
      expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    }
    const iframe = container.querySelector("[data-contact-map] iframe");
    expect(iframe?.getAttribute("src")).toBe(mapsEmbedUrl());
    expect(iframe?.getAttribute("title")).toBeTruthy();
    expect(iframe?.getAttribute("tabindex")).toBe("-1");

    const text = container.textContent ?? "";
    expect(text).not.toMatch(/Cairo|Egypt|القاهرة|مصر/);
  });

  it("renders no channel block and no dead links while channels are unconfigured", async () => {
    const { container } = await renderContact();
    expect(container.querySelector("[data-contact-channels]")).toBeNull();
    expect(container.querySelectorAll('a[href="#"], a[href=""], a:not([href])')).toHaveLength(0);
  });

  it("serves both locales from the dictionaries (EN + AR spans)", async () => {
    const { container } = await renderContact();
    const html = container.innerHTML;
    for (const value of [en.contact.location.types.office, en.contact.location.openInMaps, en.contact.location.hoursValue]) expect(html).toContain(value);
    for (const value of [ar.contact!.location!.types!.office!, ar.contact!.location!.openInMaps!, ar.contact!.location!.hoursValue!]) expect(html).toContain(value);
  });

  it("source: no API key, no hardcoded maps URL outside the model, no href=\"#\"", () => {
    for (const file of ["components/public/contact-location.tsx", "src/app/(public)/contact/page.tsx", "lib/public/contact.ts"]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/AIza|GOOGLE_MAPS_API_KEY|href="#"/);
    }
    expect(readFileSync("components/public/contact-location.tsx", "utf8")).not.toMatch(/https:\/\/www\.google\.com/);
  });
});

describe("contact copy parity", () => {
  it("every EN contact.location key has an Arabic value", () => {
    const walk = (enNode: unknown, arNode: unknown, trail: string) => {
      if (typeof enNode === "string") {
        expect(typeof arNode, trail).toBe("string");
        expect((arNode as string).length, trail).toBeGreaterThan(0);
        return;
      }
      for (const [key, value] of Object.entries(enNode as Record<string, unknown>)) walk(value, (arNode as Record<string, unknown> | undefined)?.[key], `${trail}.${key}`);
    };
    walk(en.contact.location, ar.contact?.location, "contact.location");
    walk(en.home.marketplace, ar.home?.marketplace, "home.marketplace");
    walk(en.megaMenu.marketplace, ar.megaMenu?.marketplace, "megaMenu.marketplace");
    walk(en.portalEntry, ar.portalEntry, "portalEntry");
  });
});
