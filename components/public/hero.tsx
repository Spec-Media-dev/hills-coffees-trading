import Link from "next/link";

import { Bilingual } from "@/components/locale/bilingual";
import { AnimatedHero } from "@/components/public/animated-hero";
import { HeroBackdrop } from "@/components/public/hero-bean-media";
import { PUBLIC_ROUTES } from "@/components/public/routes";
import { Icon } from "@/components/ui/icon";

/**
 * Homepage hero (hardening run redesign). The green-coffee film/still is the hero's own BACKGROUND
 * (`HeroBackdrop`), masked away from the headline on desktop and under a strong forest scrim on small
 * screens — no longer a separate card beside the copy. The film is a silent looping ambient layer
 * with no visible playback control (`hero-bean-media.tsx`); reduced motion / blocked autoplay keep
 * the still. The copy column is server-rendered bilingual chrome.
 */
export function Hero() {
  return (
    <AnimatedHero>
      <section data-page-opener="dark" data-hero-stage className="relative isolate -mt-[var(--header-h)] min-h-[100svh] overflow-hidden bg-[#173C32] pt-[var(--header-h)] text-[#EEE4D1]">
        <HeroBackdrop />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -end-[18rem] -top-[16rem] size-[52rem] rounded-full border border-[#CE8A39]/20" />
          <div className="absolute inset-0 opacity-[0.045] [background-image:radial-gradient(#EEE4D1_0.8px,transparent_0.8px)] [background-size:10px_10px]" />
        </div>

        <div className="hc-public-container-wide flex min-h-[calc(100svh-var(--header-h))] flex-col justify-center gap-10 py-[clamp(2.5rem,4vw,4.5rem)]">
          <div className="relative z-10 flex max-w-[44rem] flex-col items-start">
            <div data-hero-step className="mb-7 inline-flex items-center gap-3 text-[0.7rem] font-bold uppercase tracking-[0.18em] text-[#CE8A39] rtl:tracking-normal">
              <span className="h-px w-9 bg-[#CE8A39]" />
              <Bilingual pick={(c) => c.home.hero.eyebrow} />
            </div>

            <h1
              data-hero-step
              className="max-w-[10.7ch] font-heading text-[clamp(3.6rem,3rem+3.4vw,7.6rem)] font-semibold leading-[0.86] tracking-[-0.045em] text-[#EEE4D1] text-balance [text-shadow:0_2px_24px_rgba(7,20,16,0.35)] rtl:max-w-[12ch] rtl:leading-[1.03] rtl:tracking-normal"
            >
              <Bilingual pick={(c) => c.home.hero.headline} />
            </h1>

            <p data-hero-step className="mt-8 max-w-[38rem] text-[clamp(1rem,0.93rem+0.28vw,1.18rem)] leading-[1.75] text-[#EEE4D1]/85 text-pretty">
              <Bilingual pick={(c) => c.home.hero.lead} />
            </p>

            <div data-hero-step className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link href={PUBLIC_ROUTES.contact} className="hc-btn-accent min-w-44 shadow-[0_16px_36px_rgba(164,72,25,0.28)]">
                <Bilingual pick={(c) => c.cta.requestAnOffer} />
                <Icon name="arrow-right" data-directional-icon="true" className="size-4" />
              </Link>
              <Link href={PUBLIC_ROUTES.coffee} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#EEE4D1]/24 bg-[#0b1915]/20 px-6 text-sm font-semibold text-[#EEE4D1] backdrop-blur-[2px] transition-colors duration-[var(--dur-fast)] hover:bg-[#EEE4D1]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CE8A39]">
                <Bilingual pick={(c) => c.home.hero.exploreAction} />
                <Icon name="arrow-right" data-directional-icon="true" className="size-4" />
              </Link>
            </div>
          </div>
        </div>

        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-5 hidden justify-center lg:flex">
          <span className="flex items-center gap-3 text-[0.66rem] font-bold uppercase tracking-[0.18em] text-[#EEE4D1]/50">
            <span className="h-px w-10 bg-[#EEE4D1]/30" />
            <Bilingual pick={(c) => c.home.hero.scrollCue} />
            <span className="h-px w-10 bg-[#EEE4D1]/30" />
          </span>
        </div>
      </section>
    </AnimatedHero>
  );
}
