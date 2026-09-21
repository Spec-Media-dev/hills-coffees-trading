"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

import { useLocale } from "@/components/locale/locale-provider";
import { Icon } from "@/components/ui/icon";

const POSTER = "/images/new beans/new beans 1 (2).jpeg";
const FILM = "/images/new beans/video beans.mp4";

export function HeroBeanMedia() {
  const { t } = useLocale();
  const reduceMotion = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  async function play() {
    if (reduceMotion) return;
    const video = videoRef.current;
    if (!video) return;
    try {
      await video.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }

  function reset() {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = 0;
    setPlaying(false);
  }

  async function toggle() {
    if (playing) reset();
    else {
      const video = videoRef.current;
      if (!video) return;
      try {
        await video.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") void play();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") reset();
      }}
      onFocus={() => void play()}
      onBlur={reset}
      aria-label={playing ? t.controls.pauseHeroFilm : t.controls.playHeroFilm}
      className="group/media relative block size-full overflow-hidden rounded-[1.75rem] bg-[#0b1915] text-start shadow-[0_36px_100px_rgba(0,0,0,0.48)] outline-none ring-1 ring-white/14 focus-visible:ring-2 focus-visible:ring-[var(--hc-ochre)]"
    >
      <Image
        src={POSTER}
        alt={t.home.hero.imageAlt}
        fill
        preload
        sizes="(min-width: 1024px) 48vw, 94vw"
        className={`object-cover object-center transition-opacity duration-500 ${playing ? "opacity-0" : "opacity-100"}`}
      />
      <video
        ref={videoRef}
        muted
        loop
        playsInline
        preload="metadata"
        poster={POSTER}
        onEnded={reset}
        className={`absolute inset-0 size-full object-cover transition-opacity duration-500 ${playing ? "opacity-100" : "opacity-0"}`}
      >
        <source src={FILM} type="video/mp4" />
      </video>

      <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_44%,rgba(7,20,16,0.72)_100%)]" />
      <span className="pointer-events-none absolute inset-x-5 bottom-5 flex items-end justify-between gap-4 sm:inset-x-7 sm:bottom-7">
        <span className="max-w-[23rem] font-heading text-[clamp(1.35rem,1rem+1.5vw,2.35rem)] font-semibold leading-[1.02] text-[#EEE4D1]">
          {t.home.credibility.origin.title}
        </span>
        <span className="grid size-12 shrink-0 place-items-center rounded-full border border-white/25 bg-[#EEE4D1] text-[#173C32] shadow-lg transition-transform duration-300 group-hover/media:scale-105 sm:size-14">
          <Icon name={playing ? "pause" : "play"} className="size-4 sm:size-5" />
        </span>
      </span>
    </button>
  );
}
