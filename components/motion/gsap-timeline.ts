"use client"

import { useLayoutEffect, useRef, type RefObject } from "react"
import { gsap } from "gsap"

export type StoryTimelineControls = {
  play: () => void
  pause: () => void
  resume: () => void
  seek: (time: number) => void
}

type TimelineBuilder = (timeline: gsap.core.Timeline, scope: HTMLElement) => void

export function useGsapTimeline(
  scopeRef: RefObject<HTMLElement | null>,
  build: TimelineBuilder,
  paused = true
): StoryTimelineControls {
  const timelineRef = useRef<gsap.core.Timeline | null>(null)
  const buildRef = useRef(build)

  useLayoutEffect(() => {
    buildRef.current = build
  }, [build])

  useLayoutEffect(() => {
    const scope = scopeRef.current
    if (!scope) return

    const context = gsap.context(() => {
      const timeline = gsap.timeline({ paused })
      buildRef.current(timeline, scope)
      timelineRef.current = timeline
    }, scope)

    return () => {
      timelineRef.current?.kill()
      timelineRef.current = null
      context.revert()
    }
  }, [paused, scopeRef])

  return {
    play: () => timelineRef.current?.play(),
    pause: () => timelineRef.current?.pause(),
    resume: () => timelineRef.current?.resume(),
    seek: (time) => timelineRef.current?.seek(time),
  }
}
