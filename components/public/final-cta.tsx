import Image from "next/image";
import Link from "next/link";

import { Bilingual } from "@/components/locale/bilingual";
import { Reveal } from "@/components/motion/reveal";
import { PUBLIC_ROUTES } from "@/components/public/routes";
import { Icon } from "@/components/ui/icon";
import { copy } from "@/lib/public/copy";

/**
 * Homepage closing commercial moment (pre-Stripe hardening run redesign).
 *
 * An editorial split on the forest ground: real origin photography in the Hills arch crop on one side;
 * on the other the ask ("Tell us what you need"), a three-step "what happens next" drawn from the
 * approved customer journey (RFQ → sourcing conversation → allocation and delivery under custody), and
 * the two actions. It replaces a faded background photo, a pulsing pill and a text panel that repeated
 * the footer word for word. Every string is existing or newly added bilingual copy; no figure, promise
 * or timeline is invented. Motion: the shared `Reveal` (respects reduced motion).
 */
export function FinalCta() {
  const steps = [
    { key: "send", icon: "mail" },
    { key: "conversation", icon: "users" },
    { key: "allocation", icon: "truck" },
  ] as const;

  return (
    <section className="relative isolate overflow-hidden bg-[var(--hc-forest)] text-[#f2f5eb]" aria-labelledby="home-final-cta-heading" data-home-final-cta>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_55%_60%_at_85%_40%,rgba(164,72,25,0.16),transparent_72%)]" />

      <div className="hc-public-container grid gap-12 py-[clamp(4.5rem,9vw,8.5rem)] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-[clamp(3rem,6vw,6rem)]">
        <Reveal className="relative order-2 lg:order-1" distance={24}>
          <div className="relative aspect-[4/5] w-full max-w-[34rem] overflow-hidden rounded-t-[min(14rem,45%)] rounded-b-[var(--radius-xl)] border border-[rgba(242,245,235,0.14)] shadow-[0_30px_80px_rgba(0,0,0,0.35)] lg:max-w-none">
            <Image src="/images/origin-yemen.jpg" alt={copy.home.rfq.imageAlt} fill sizes="(min-width: 1024px) 40vw, 90vw" className="object-cover object-[70%_45%]" />
            <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,rgba(8,24,18,0.55))]" />
          </div>
          <span aria-hidden="true" className="absolute -bottom-5 -end-5 -z-10 hidden h-32 w-32 rounded-br-[2.25rem] border-b border-e border-[#CE8A39]/40 sm:block rtl:rounded-none rtl:rounded-bl-[2.25rem]" />
        </Reveal>

        <Reveal className="order-1 flex flex-col items-start gap-6 lg:order-2" distance={24} transition={{ delay: 0.1 }}>
          <span className="hc-eyebrow text-[var(--gold-on-dark)]">
            <Bilingual pick={(c) => c.nav.contact} />
          </span>
          <h2 id="home-final-cta-heading" className="font-heading text-[clamp(2.25rem,1.6rem+3.2vw,4.75rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-balance rtl:leading-[1.2] rtl:tracking-normal">
            <Bilingual pick={(c) => c.home.rfq.title} />
          </h2>
          <p className="max-w-[46ch] text-[clamp(1.0625rem,1rem+0.25vw,1.2rem)] leading-[1.7] text-[rgba(242,245,235,0.86)] text-pretty">
            <Bilingual pick={(c) => c.home.rfq.lead} />
          </p>

          <div className="flex w-full flex-col gap-3">
            <h3 className="font-sans text-[length:var(--text-micro)] font-semibold uppercase tracking-[0.14em] text-[rgba(242,245,235,0.7)] rtl:tracking-normal">
              <Bilingual pick={(c) => c.home.rfq.stepsHeading} />
            </h3>
            <ol className="flex flex-col divide-y divide-[rgba(242,245,235,0.12)] border-y border-[rgba(242,245,235,0.12)]" data-rfq-steps>
              {steps.map((step, index) => (
                <li key={step.key} className="flex items-start gap-4 py-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full border border-[rgba(242,245,235,0.18)] text-[var(--gold-on-dark)]">
                    <Icon name={step.icon} className="size-4" aria-hidden="true" />
                  </span>
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="flex items-baseline gap-2 font-semibold">
                      <span className="font-mono text-[length:var(--text-micro)] text-[var(--gold-on-dark)]" dir="ltr">
                        0{index + 1}
                      </span>
                      <Bilingual pick={(c) => c.home.rfq.steps[step.key].title} />
                    </span>
                    <span className="text-[length:var(--text-small)] leading-[1.65] text-[rgba(242,245,235,0.78)]">
                      <Bilingual pick={(c) => c.home.rfq.steps[step.key].body} />
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="flex w-full flex-col gap-3 pt-1 sm:w-auto sm:flex-row sm:items-center">
            <Link href={PUBLIC_ROUTES.contact} className="hc-btn-accent h-12 w-full justify-center px-8 shadow-[0_4px_22px_rgba(164,72,25,0.4)] sm:w-auto">
              <Bilingual pick={(c) => c.cta.requestAnOffer} />
              <Icon name="arrow-right" data-directional-icon="true" className="size-4" />
            </Link>
            <Link
              href={PUBLIC_ROUTES.coffee}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-pill)] border border-[rgba(242,245,235,0.3)] px-6 text-sm font-semibold text-[#f2f5eb] transition-colors duration-[var(--dur-fast)] hover:border-[rgba(242,245,235,0.55)] hover:bg-[rgba(242,245,235,0.1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-on-dark)] sm:w-auto"
            >
              <Bilingual pick={(c) => c.cta.exploreAllCoffee} />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
