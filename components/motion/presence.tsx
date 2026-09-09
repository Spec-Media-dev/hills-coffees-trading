"use client"

import type { ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

type PresenceProps = {
  children: ReactNode
  presenceKey: string
  mode?: "sync" | "wait" | "popLayout"
}

function Presence({ children, presenceKey, mode = "wait" }: PresenceProps) {
  const reduceMotion = useReducedMotion()
  return (
    <AnimatePresence mode={mode} initial={false}>
      <motion.div
        key={presenceKey}
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={reduceMotion ? undefined : { opacity: 0 }}
        transition={{ duration: reduceMotion ? 0.001 : 0.22, ease: [0.2, 0.6, 0.2, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

export { Presence }
