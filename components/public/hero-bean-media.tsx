"use client";

import Image from "next/image";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

import { useLocale } from "@/components/locale/locale-provider";
import { Icon } from "@/components/ui/icon";

const POSTER = "/images/new beans/new beans 1 (2).jpeg";
const FILM = "/images/new beans/video beans.mp4";

/**
 * Hardening run — the hero's green-coffee film as the hero BACKGROUND rather than a separate card.
 *
 * - `HeroStage` is the hero `<section>` itself (server content passes through as children). On a
 *   FINE pointer (mouse/trackpad) entering the hero, the film plays and the backdrop eases forward a
 *   touch; leaving restores the still. Touch pointers never trigger this — there is no hover on touch.
 * - `HeroBackdrop` is the full-bleed visual layer: the poster (priority image, reserved by absolute
 *   positioning, so zero CLS) with the film faded over it while playing. Desktop masks it toward the
 *   headline side; mobile lays a stronger forest scrim so text contrast never depends on the frame.
 * - `HeroFilmToggle` is the explicit, reversible control for touch AND keyboard: a real button with a
 *   state-reflecting label ("Play"/"Pause"), so nothing depends on hover and nothing traps focus.
 * - Reduced motion: no hover autoplay, no zoom; the still is shown and the film only ever plays if
 *   the visitor explicitly presses the toggle. The film is `preload="none"` — no bytes are spent on
 *   it until someone asks for motion.
 */
type HeroFilm = {
  playing: boolean;
  hovering: boolean;
  reduceMotion: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  play: () => Promise<void>;
  stop: () => void;
  setHovering: (value: boolean) => void;
};

const HeroFilmContext = createContext<HeroFilm | null>(null);

function useHeroFilm(): HeroFilm {
  const value = useContext(HeroFilmContext);
  if (!value) throw new Error("HeroBackdrop/HeroFilmToggle must be rendered inside <HeroStage>.");
  return value;
}

export function HeroStage({ className, children }: { className: string; children: React.ReactNode }) {
  const reduceMotion = useReducedMotion() ?? false;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [hovering, setHovering] = useState(false);
  // Film started by the explicit toggle stays on until toggled off; hover-started film stops on leave.
  const pinned = useRef(false);

  const play = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      await video.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }, []);

  const stop = useCallback(() => {
    const video = videoRef.current;
    if (video) video.pause();
    setPlaying(false);
  }, []);

  // Never keep decoding a film nobody can see.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [stop]);

  const value = useMemo<HeroFilm>(
    () => ({
      playing,
      hovering,
      reduceMotion,
      videoRef,
      play: async () => {
        pinned.current = true;
        await play();
      },
      stop: () => {
        pinned.current = false;
        stop();
      },
      setHovering,
    }),
    [playing, hovering, reduceMotion, play, stop],
  );

  return (
    <HeroFilmContext.Provider value={value}>
      <section
        data-page-opener="dark"
        data-hero-stage
        data-hero-active={playing || hovering ? "true" : "false"}
        className={className}
        onPointerEnter={(event) => {
          if (event.pointerType !== "mouse" || reduceMotion) return;
          setHovering(true);
          if (!playing) void play();
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== "mouse") return;
          setHovering(false);
          if (!pinned.current) stop();
        }}
      >
        {children}
      </section>
    </HeroFilmContext.Provider>
  );
}

export function HeroBackdrop() {
  const { playing, hovering, reduceMotion, videoRef, stop } = useHeroFilm();
  const enhanced = !reduceMotion && (playing || hovering);

  return (
    <div data-hero-media aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden">
      <div
        className={`absolute inset-0 transition-transform duration-[1200ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none lg:start-[34%] lg:[mask-image:linear-gradient(to_left,#000_58%,transparent)] rtl:lg:[mask-image:linear-gradient(to_right,#000_58%,transparent)] ${enhanced ? "scale-[1.04]" : "scale-100"}`}
      >
        <Image
          src={POSTER}
          alt=""
          fill
          preload
          sizes="(min-width: 1024px) 66vw, 100vw"
          className={`object-cover object-center transition-opacity duration-700 motion-reduce:transition-none ${playing ? "opacity-0" : "opacity-100"}`}
        />
        <video
          ref={videoRef}
          muted
          loop
          playsInline
          preload="none"
          poster={POSTER}
          onEnded={stop}
          tabIndex={-1}
          className={`absolute inset-0 size-full object-cover transition-opacity duration-700 motion-reduce:transition-none ${playing ? "opacity-100" : "opacity-0"}`}
        >
          <source src={FILM} type="video/mp4" />
        </video>
      </div>

      {/* Readability scrims: strong on small screens (the film sits behind the text), a soft
          start-side wash on desktop (the mask already fades the film away from the headline). */}
      <div data-hero-scrim className="absolute inset-0 bg-[#173C32]/[0.82] lg:bg-transparent lg:bg-[linear-gradient(90deg,#173C32_30%,rgba(23,60,50,0.55)_55%,rgba(23,60,50,0.1)_100%)] rtl:lg:bg-[linear-gradient(270deg,#173C32_30%,rgba(23,60,50,0.55)_55%,rgba(23,60,50,0.1)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-56 bg-[linear-gradient(180deg,transparent,rgba(7,20,16,0.55))]" />
      <div className={`absolute inset-0 bg-[#0b1915] transition-opacity duration-700 motion-reduce:transition-none ${enhanced ? "opacity-0" : "opacity-[0.12]"}`} />
    </div>
  );
}

export function HeroFilmToggle() {
  const { t } = useLocale();
  const { playing, play, stop } = useHeroFilm();

  return (
    <div className="flex items-end justify-between gap-4">
      <span className="hidden max-w-[20rem] font-heading text-[clamp(1.1rem,0.9rem+0.8vw,1.6rem)] font-semibold leading-[1.1] text-[#EEE4D1]/90 lg:block">{t.home.credibility.origin.title}</span>
      <button
        type="button"
        onClick={() => (playing ? stop() : void play())}
        className="group/toggle inline-flex min-h-12 items-center gap-3 rounded-full border border-[#EEE4D1]/25 bg-[#0b1915]/45 py-1.5 pe-5 ps-1.5 text-sm font-semibold text-[#EEE4D1] backdrop-blur-sm transition-[background-color,border-color] duration-[var(--dur-fast)] hover:border-[#EEE4D1]/45 hover:bg-[#0b1915]/65 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--hc-ochre)] motion-reduce:transition-none"
        data-hero-film-toggle={playing ? "playing" : "paused"}
      >
        <span className="grid size-9 place-items-center rounded-full bg-[#EEE4D1] text-[#173C32] transition-transform duration-300 group-hover/toggle:scale-105 motion-reduce:transition-none motion-reduce:group-hover/toggle:scale-100">
          <Icon name={playing ? "pause" : "play"} className="size-4" />
        </span>
        {playing ? t.controls.pauseHeroFilm : t.controls.playHeroFilm}
      </button>
    </div>
  );
}
