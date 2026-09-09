"use client"

import type { ComponentProps } from "react"
import { motion, useReducedMotion } from "motion/react"

function HoverLift(props: ComponentProps<typeof motion.div>) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      data-slot="hover-lift"
      whileHover={reduceMotion ? undefined : { y: -2 }}
      transition={{ duration: 0.16, ease: [0.2, 0.6, 0.2, 1] }}
      {...props}
    />
  )
}

export { HoverLift }
