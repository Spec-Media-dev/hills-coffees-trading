import type { LucideProps } from "lucide-react"
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleX,
  Clock,
  File,
  Globe,
  Inbox,
  Menu,
  Moon,
  MoreHorizontal,
  Search,
  Sun,
  TriangleAlert,
  X,
} from "lucide-react"

const glyphs = {
  "alert-circle": AlertCircle,
  "arrow-down": ArrowDown,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  "arrow-up": ArrowUp,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  "chevron-up": ChevronUp,
  "circle-x": CircleX,
  clock: Clock,
  file: File,
  globe: Globe,
  inbox: Inbox,
  menu: Menu,
  moon: Moon,
  more: MoreHorizontal,
  search: Search,
  sun: Sun,
  warning: TriangleAlert,
  x: X,
} as const

export type IconName = keyof typeof glyphs

const directionalIcons = new Set<IconName>([
  "arrow-left",
  "arrow-right",
  "chevron-left",
  "chevron-right",
])

type IconProps = Omit<LucideProps, "ref"> & {
  name: IconName
  directional?: boolean
}

function Icon({
  name,
  directional = directionalIcons.has(name),
  strokeWidth = 1.75,
  "aria-hidden": ariaHidden,
  ...props
}: IconProps) {
  const Glyph = glyphs[name]

  return (
    <Glyph
      data-directional-icon={directional ? "true" : undefined}
      strokeWidth={strokeWidth}
      aria-hidden={ariaHidden ?? true}
      focusable="false"
      {...props}
    />
  )
}

export { Icon }
