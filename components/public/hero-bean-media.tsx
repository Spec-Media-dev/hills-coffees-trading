"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

const POSTER = "/images/new beans/new beans 1 (2).jpeg";
const FILM = "/images/new beans/video beans.mp4";

/**
 * The homepage hero's green-coffee film as the hero BACKGROUND (pre-Stripe hardening run).
 *
 * - The film is a silent, looping, inline ambient layer — there is deliberately NO visible play/pause
 *   control (product decision: the film is atmosphere, not content). It carries no information that
 *   the still does not, so nothing is lost when it does not play.
 * - Playback is started from an effect (after `muted` is set as a PROPERTY — React does not reliably
 *   serialise the `muted` attribute, which is what browsers' autoplay policy checks). If the browser
 *   blocks autoplay, `play()` rejects and the poster simply stays: the film only fades in on the
 *   `playing` event, so a blocked or slow film never shows a blank or black frame.
 * - `prefers-reduced-motion` and the Save-Data hint both keep the still: the film never starts.
 * - The film pauses while the tab is hidden and resumes when it returns.
 * - Zero CLS: every layer is absolutely positioned inside the hero; the priority poster is the LCP.
 */
export function HeroBackdrop() {
  const reduceMotion = useReducedMotion() ?? false;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const saveData = typeof navigator !== "undefined" && (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    if (reduceMotion || saveData) {
      video.pause();
      return;
    }
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    const start = () => {
      video.play().catch(() => {
        // Autoplay refused (browser policy / power saving): the poster remains — no control, no error.
      });
    };
    start();
    const onVisibility = () => {
      if (document.hidden) video.pause();
      else start();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      video.pause();
    };
  }, [reduceMotion]);

  const showFilm = playing && !reduceMotion;

  return (
    <div data-hero-media aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 lg:start-[34%] lg:[mask-image:linear-gradient(to_left,#000_58%,transparent)] rtl:lg:[mask-image:linear-gradient(to_right,#000_58%,transparent)]">
        <Image
          src={POSTER}
          alt=""
          fill
          preload
          sizes="(min-width: 1024px) 66vw, 100vw"
          className={`object-cover object-center transition-opacity duration-1000 motion-reduce:transition-none ${showFilm ? "opacity-0" : "opacity-100"}`}
        />
        {reduceMotion ? null : (
          <video
            ref={videoRef}
            muted
            loop
            playsInline
            autoPlay
            preload="metadata"
            poster={POSTER}
            disablePictureInPicture
            disableRemotePlayback
            tabIndex={-1}
            data-hero-film
            onPlaying={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            className={`absolute inset-0 size-full object-cover transition-opacity duration-1000 ${showFilm ? "opacity-100" : "opacity-0"}`}
          >
            <source src={FILM} type="video/mp4" />
          </video>
        )}
      </div>

      {/* Readability scrims: strong on small screens (the film sits behind the text), a soft
          start-side wash on desktop (the mask already fades the film away from the headline). */}
      <div data-hero-scrim className="absolute inset-0 bg-[#173C32]/[0.8] lg:bg-transparent lg:bg-[linear-gradient(90deg,#173C32_30%,rgba(23,60,50,0.55)_55%,rgba(23,60,50,0.1)_100%)] rtl:lg:bg-[linear-gradient(270deg,#173C32_30%,rgba(23,60,50,0.55)_55%,rgba(23,60,50,0.1)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-56 bg-[linear-gradient(180deg,transparent,rgba(7,20,16,0.55))]" />
    </div>
  );
}
