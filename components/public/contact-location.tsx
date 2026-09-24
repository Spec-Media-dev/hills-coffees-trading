import { Bilingual, type CopySelector } from "@/components/locale/bilingual";
import { Icon, type IconName } from "@/components/ui/icon";
import { configuredChannels, HILLS_DUBAI, mapsEmbedUrl, mapsOpenUrl, telHref, type ContactChannelKey } from "@/lib/public/contact";
import { copy } from "@/lib/public/copy";

/**
 * The Dubai location block of `/contact/` (final non-payment closure run). Server Component; renders
 * ONLY from `lib/public/contact.ts` (the typed, configured contact model) and the bilingual dictionary.
 *
 * - Address and facility are official names: shown as-is, `lang="en" dir="ltr"`, in every locale.
 * - Phones are real `tel:` links (E.164). Optional channels render only when configured — never `#`.
 * - Map: Google's key-less embed as a NON-interactive preview (`pointer-events: none`, removed from the
 *   tab order and the accessibility tree), covered by one real link that opens Google Maps in a new tab.
 *   A tap anywhere on the map, or the explicit "Open in Google Maps" button, goes to the same place.
 */
const CHANNEL_ICON: Record<ContactChannelKey, IconName> = { email: "mail", whatsapp: "message-circle", instagram: "globe", facebook: "globe", linkedin: "globe" };

const PHONE_LABEL: Record<"primary" | "secondary", CopySelector> = {
  primary: (c) => c.contact.location.primaryPhone,
  secondary: (c) => c.contact.location.secondaryPhone,
};

const NEW_TAB_CLASS = "sr-only";
const DT_CLASS = "flex items-center gap-4 text-[length:var(--text-meta)] font-semibold uppercase tracking-[0.1em] text-muted-foreground rtl:tracking-normal";
const DT_ICON = "size-5 shrink-0 text-[var(--hc-accent)] dark:text-[var(--gold-on-dark)]";

export function ContactLocation() {
  const site = HILLS_DUBAI;
  const channels = configuredChannels(site);
  const openUrl = mapsOpenUrl(site);

  return (
    <section id="location" className="scroll-mt-[calc(var(--header-h)+1rem)] bg-background py-[clamp(3.5rem,7vw,6.5rem)] text-foreground" aria-labelledby="contact-location-heading" data-contact-location>
      <div className="hc-container flex flex-col gap-10">
        <div className="flex max-w-[48rem] flex-col gap-3">
          <span className="hc-eyebrow text-[var(--hc-accent)] dark:text-[var(--gold-on-dark)]">
            <Bilingual pick={(c) => c.contact.location.eyebrow} />
          </span>
          <h2 id="contact-location-heading" className="font-heading text-[clamp(1.9rem,1.5rem+1.8vw,3rem)] font-semibold leading-[1.08] tracking-[-0.02em] rtl:leading-[1.2] rtl:tracking-normal">
            <Bilingual pick={(c) => c.contact.location.heading} />
          </h2>
          <p className="text-[length:var(--text-body)] leading-[1.7] text-muted-foreground text-pretty">
            <Bilingual pick={(c) => c.contact.location.lead} />
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          {/* ── The site ── */}
          <div className="flex min-w-0 flex-col gap-6 rounded-[var(--radius-xl)] border border-border bg-card p-6 sm:p-8" data-contact-site>
            <div className="flex flex-col gap-3">
              <ul className="flex flex-wrap gap-2" aria-label={copy.contact.location.eyebrow} data-contact-types>
                {site.types.map((type) => (
                  <li key={type} className="rounded-[var(--radius-pill)] border border-border bg-secondary px-3 py-1 text-[length:var(--text-meta)] font-semibold text-foreground">
                    <Bilingual pick={(c) => c.contact.location.types[type]} />
                  </li>
                ))}
              </ul>
              <p className="font-heading text-[clamp(1.5rem,1.25rem+1vw,2.1rem)] font-semibold leading-tight text-[var(--hc-accent)] dark:text-[var(--gold-on-dark)]">
                <Bilingual pick={(c) => c.contact.location.city} />
              </p>
            </div>

            <dl className="flex flex-col divide-y divide-border">
              <div className="flex flex-col gap-1 py-4 first:pt-0">
                <dt className={DT_CLASS}>
                  <Icon name="map-pin" className={DT_ICON} aria-hidden="true" />
                  <Bilingual pick={(c) => c.contact.location.addressLabel} />
                </dt>
                <dd lang="en" dir="ltr" className="ps-9 text-start text-[length:var(--text-body)] leading-[1.6] text-foreground rtl:pe-9 rtl:ps-0 rtl:text-end" data-contact-address>
                  {site.addressLines.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </dd>
              </div>
              <div className="flex flex-col gap-1 py-4">
                <dt className={DT_CLASS}>
                  <Icon name="store" className={DT_ICON} aria-hidden="true" />
                  <Bilingual pick={(c) => c.contact.location.facilitiesLabel} />
                </dt>
                <dd lang="en" dir="ltr" className="ps-9 text-start text-[length:var(--text-body)] text-foreground rtl:pe-9 rtl:ps-0 rtl:text-end" data-contact-facility>
                  {site.facility}
                </dd>
              </div>
              <div className="flex flex-col gap-1 py-4">
                <dt className={DT_CLASS}>
                  <Icon name="clock" className={DT_ICON} aria-hidden="true" />
                  <Bilingual pick={(c) => c.contact.location.hoursLabel} />
                </dt>
                <dd className="ps-9 text-[length:var(--text-body)] text-foreground" data-contact-hours>
                  <Bilingual pick={(c) => c.contact.location.hoursValue} />
                </dd>
              </div>
              <div className="flex flex-col gap-3 py-4 last:pb-0">
                <dt className={DT_CLASS}>
                  <Icon name="phone" className={DT_ICON} aria-hidden="true" />
                  <Bilingual pick={(c) => c.contact.location.phoneLabel} />
                </dt>
                <dd className="ps-9">
                  <ul className="flex flex-col gap-3" data-contact-phones>
                    {site.phones.map((phone) => (
                      <li key={phone.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                        <span className="flex min-w-0 flex-col">
                          <span className="text-[length:var(--text-meta)] text-muted-foreground">
                            <Bilingual pick={PHONE_LABEL[phone.key]} />
                          </span>
                          <span dir="ltr" className="whitespace-nowrap text-start font-mono text-[length:var(--text-small)] font-semibold tabular-nums text-foreground sm:text-[length:var(--text-body)] rtl:text-end">
                            {phone.display}
                          </span>
                        </span>
                        <a
                          href={telHref(phone.tel)}
                          data-contact-call={phone.key}
                          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold text-foreground transition-colors duration-[var(--dur-fast)] hover:border-[var(--border-strong)] hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] motion-reduce:transition-none"
                        >
                          <Icon name="phone" className="size-4" aria-hidden="true" />
                          <Bilingual pick={(c) => c.contact.location.call} />
                          <span className="sr-only" dir="ltr">
                            {phone.display}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            </dl>

            <div className="mt-auto flex flex-col gap-4 border-t border-border pt-6">
              <a
                href={openUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-contact-maps-action
                className="hc-btn-accent justify-center self-start"
              >
                <Icon name="map-pin" className="size-4" aria-hidden="true" />
                <Bilingual pick={(c) => c.contact.location.openInMaps} />
                <Icon name="external-link" className="size-4" aria-hidden="true" />
                <span className={NEW_TAB_CLASS}>
                  <Bilingual pick={(c) => c.contact.location.newTab} />
                </span>
              </a>

              {channels.length > 0 ? (
                <div className="flex flex-col gap-2" data-contact-channels>
                  <p className="text-[length:var(--text-meta)] font-semibold text-muted-foreground">
                    <Bilingual pick={(c) => c.contact.location.channelsHeading} />
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {channels.map((channel) => (
                      <li key={channel.key}>
                        <a
                          href={channel.href}
                          {...(channel.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                          data-contact-channel={channel.key}
                          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold text-foreground transition-colors duration-[var(--dur-fast)] hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                        >
                          <Icon name={CHANNEL_ICON[channel.key]} className="size-4" aria-hidden="true" />
                          <Bilingual pick={(c) => c.contact.location.channels[channel.key]} />
                          {channel.external ? (
                            <span className={NEW_TAB_CLASS}>
                              <Bilingual pick={(c) => c.contact.location.newTab} />
                            </span>
                          ) : null}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>

          {/* ── The map: a real Google Maps preview; one tap opens Google Maps ── */}
          <div className="relative min-h-[20rem] overflow-hidden rounded-[var(--radius-xl)] border border-border bg-muted sm:min-h-[26rem] lg:min-h-full" data-contact-map>
            <iframe
              src={mapsEmbedUrl(site)}
              title={copy.contact.location.mapTitle}
              aria-hidden="true"
              tabIndex={-1}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="pointer-events-none absolute inset-0 size-full border-0"
            />
            <a
              href={openUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-contact-map-link
              className="group/map absolute inset-0 flex items-end justify-end p-4 focus-visible:outline-3 focus-visible:-outline-offset-4 focus-visible:outline-[var(--focus-ring)]"
            >
              <span className="sr-only">
                <Bilingual pick={(c) => c.contact.location.mapOpenLabel} />
              </span>
              <span aria-hidden="true" className="inline-flex items-center gap-2 rounded-full bg-[var(--hc-forest)] px-4 py-2 text-sm font-semibold text-[#f2f5eb] shadow-[var(--shadow-md)] transition-transform duration-[var(--dur-fast)] group-hover/map:-translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover/map:translate-y-0">
                <Icon name="map-pin" className="size-4" />
                <Bilingual pick={(c) => c.contact.location.openInMaps} />
                <Icon name="external-link" className="size-3.5" />
              </span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
