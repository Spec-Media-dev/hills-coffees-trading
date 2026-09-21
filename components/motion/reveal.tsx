"use client"

import type { ComponentProps } from "react"
import { motion, useReducedMotion } from "motion/react"

type RevealProps = ComponentProps<typeof motion.div> & {
  distance?: number
}

function Reveal({ children, distance = 20, ...props }: RevealProps) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: distance }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1] }}
      {...props}
    >
      {children}
    </motion.div>
  )
}

export { Reveal }
