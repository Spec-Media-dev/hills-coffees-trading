import type { LucideProps } from "lucide-react"
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BadgeCheck,
  Bell,
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleX,
  ClipboardList,
  Clock,
  Eye,
  EyeOff,
  File,
  FileText,
  Globe,
  Inbox,
  KeyRound,
  LayoutGrid,
  LogOut,
  Mail,
  Menu,
  Moon,
  MoreHorizontal,
  Package,
  Percent,
  Search,
  Settings,
  Shield,
  Sun,
  Tag,
  TriangleAlert,
  Truck,
  Users,
  Wallet,
  X,
} from "lucide-react"

const glyphs = {
  "alert-circle": AlertCircle,
  "arrow-down": ArrowDown,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  "arrow-up": ArrowUp,
  "badge-check": BadgeCheck,
  bell: Bell,
  "building-2": Building2,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  "chevron-up": ChevronUp,
  "circle-x": CircleX,
  "clipboard-list": ClipboardList,
  clock: Clock,
  eye: Eye,
  "eye-off": EyeOff,
  file: File,
  "file-text": FileText,
  globe: Globe,
  inbox: Inbox,
  "key-round": KeyRound,
  "layout-grid": LayoutGrid,
  "log-out": LogOut,
  mail: Mail,
  menu: Menu,
  moon: Moon,
  more: MoreHorizontal,
  package: Package,
  percent: Percent,
  search: Search,
  settings: Settings,
  shield: Shield,
  sun: Sun,
  tag: Tag,
  truck: Truck,
  users: Users,
  wallet: Wallet,
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
