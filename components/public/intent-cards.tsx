"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";

import { Bilingual } from "@/components/locale/bilingual";
import { PUBLIC_ROUTES } from "@/components/public/routes";
import { Icon } from "@/components/ui/icon";

const PANELS = [
  {
    key: "source" as const,
    href: PUBLIC_ROUTES.contact,
    image: "/images/new beans/new beans 1 (5).jpeg",
    meta: "01",
  },
  {
    key: "explore" as const,
    href: PUBLIC_ROUTES.coffee,
    image: "/images/new beans/new beans 1 (3).jpeg",
    meta: "02",
  },
  {
    key: "trade" as const,
    href: PUBLIC_ROUTES.portalEntry,
    image: "/images/new beans/new beans 1 (1).jpeg",
    meta: "03",
  },
];

export function IntentCards() {
  const [active, setActive] = useState(0);
  const reduceMotion = useReducedMotion();

  return (
    <div className="flex min-h-[34rem] flex-col gap-3 md:h-[38rem] md:min-h-0 md:flex-row">
      {PANELS.map((panel, index) => {
        const isActive = active === index;
        return (
          <motion.article
            key={panel.key}
            data-active={isActive}
            layout={!reduceMotion}
            transition={reduceMotion ? { duration: 0 } : { layout: { duration: 0.55, ease: [0.16, 1, 0.3, 1] } }}
            onPointerEnter={(event) => {
              if (event.pointerType === "mouse") setActive(index);
            }}
            onFocusCapture={() => setActive(index)}
            className="group/panel relative isolate flex min-h-[4.75rem] overflow-hidden rounded-[1.5rem] border border-[#173C32]/10 bg-[#173C32] text-[#EEE4D1] shadow-[0_18px_48px_rgba(23,60,50,0.12)] transition-[min-height,flex] duration-500 data-[active=true]:min-h-[27rem] md:min-h-0 md:flex-[0.7_1_0%] md:data-[active=true]:min-h-0 md:data-[active=true]:flex-[2_1_0%]"
          >
            <Image
              src={panel.image}
              alt=""
              fill
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover transition-transform duration-700 ease-out group-hover/panel:scale-[1.025]"
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,24,19,0.15)_10%,rgba(8,24,19,0.9)_88%)]" />
            <div className="absolute inset-0 bg-[#173C32]/30 transition-opacity duration-500 group-data-[active=true]/panel:opacity-0" />

            <div className="relative flex w-full flex-col justify-between p-5 sm:p-7">
              <button
                type="button"
                aria-expanded={isActive}
                onClick={() => setActive(index)}
                className="flex w-full items-center justify-between gap-4 text-start outline-none focus-visible:rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#CE8A39]"
              >
                <span className="text-[0.7rem] font-bold uppercase tracking-[0.16em] text-[#CE8A39] rtl:tracking-normal">
                  {panel.meta}
                </span>
                <span className="grid size-9 place-items-center rounded-full border border-[#EEE4D1]/25 bg-[#173C32]/45 md:hidden">
                  <Icon name={isActive ? "minus" : "plus"} className="size-4" />
                </span>
              </button>

              <div className="grid gap-4 overflow-hidden transition-all duration-500 group-data-[active=false]/panel:max-h-0 group-data-[active=false]/panel:opacity-0 md:group-data-[active=false]/panel:max-h-[20rem] md:group-data-[active=false]/panel:opacity-100">
                <h3 className="max-w-[12ch] font-heading text-[clamp(2rem,1.25rem+2.2vw,3.65rem)] font-semibold leading-[0.96] tracking-[-0.025em] text-[#EEE4D1] rtl:tracking-normal">
                  <Bilingual pick={(c) => c.home.intents[panel.key].title} />
                </h3>
                <p className="max-w-[38ch] text-sm leading-[1.7] text-[#EEE4D1]/78 transition-opacity duration-300 md:group-data-[active=false]/panel:opacity-0">
                  <Bilingual pick={(c) => c.home.intents[panel.key].body} />
                </p>
                <Link
                  href={panel.href}
                  className="mt-1 inline-flex min-h-11 w-fit items-center gap-2 rounded-full bg-[#EEE4D1] px-5 text-sm font-bold text-[#173C32] transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CE8A39] md:group-data-[active=false]/panel:pointer-events-none md:group-data-[active=false]/panel:opacity-0"
                >
                  <Bilingual pick={(c) => c.home.intents[panel.key].action} />
                  <Icon name="arrow-right" data-directional-icon="true" className="size-4" />
                </Link>
              </div>
            </div>
          </motion.article>
        );
      })}
    </div>
  );
}
