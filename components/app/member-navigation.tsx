import type { AppNavGroup } from "@/components/app/app-navigation"
import { AppBilingual } from "@/components/locale/app-bilingual"
import { Icon } from "@/components/ui/icon"

/**
 * Member (`/dashboard`) navigation structure (Phase 5.5, UIF-037 buyer baseline + UIF-038 seller
 * additive architecture).
 *
 * ── BUYER IS THE BASELINE (UIF-037) ──────────────────────────────────────────────────────────────
 *
 * `canBuy = true, canSell = false`. `buildMemberNavGroups({ canSell: false })` returns exactly the
 * two groups the LIVE `/dashboard` route composes today: Overview and Account (Settings) — the only
 * two real routes this phase ships. It does not list Discovery/Orders/Custody/Deliveries/Invoices/
 * Organisation/KYB/Notifications as live navigation entries, because none of those routes exists yet
 * and "do not create a dead page merely to make the sidebar look full" (contract §29 of this run's
 * directive) is unconditional. Those areas are proven as reusable LAYOUT patterns instead — see
 * `module-page.tsx` / `detail-page.tsx` and `tests/design/uif-f.test.tsx`.
 *
 * ── SELLER IS ADDITIVE, NOT A SECOND SHELL (UIF-038) ─────────────────────────────────────────────
 *
 * `canBuy = true, canSell = true`. `buildMemberNavGroups({ canSell: true })` returns the SAME two
 * groups PLUS one more — "Selling" — inside the SAME `/dashboard` architecture. There is no
 * `/seller-dashboard`, no second `AppShell` composition, no second `Sidebar`: the seller group is
 * exactly one more `AppNavGroup` entry in the same array `Sidebar` already knows how to render.
 *
 * THIS FUNCTION IS NEVER CALLED WITH `canSell: true` ON THE LIVE ROUTE. `dashboard/layout.tsx` calls
 * it with a hardcoded `{ canSell: false }` and a comment recording that Feature 004 supplies the
 * real `organization.canSell` value once real capability resolution exists — reading `can_sell`
 * early here would be exactly the "real capability resolution" this phase must not implement
 * (UIF-038 MUST NOT). The `canSell: true` branch is exercised ONLY by the component-level test
 * (`tests/design/uif-f.test.tsx`), which is the documented prop path UIF-038's Verify requires.
 *
 * Every label below is `<AppBilingual>` (a server-rendered dual-language span), so `Sidebar` — a Server
 * Component — renders correctly in both languages with no client island of its own.
 */

export type MemberNavCapabilities = {
  /** Additive on top of buying. NEVER fed from `getRequestIdentity()` in this phase — see above. */
  canSell: boolean
}

export function buildMemberNavGroups({ canSell }: MemberNavCapabilities): AppNavGroup[] {
  const groups: AppNavGroup[] = [
    {
      key: "overview",
      label: <AppBilingual pick={(c) => c.overview} />,
      items: [
        {
          key: "overview",
          label: <AppBilingual pick={(c) => c.overview} />,
          href: "/dashboard",
          icon: <Icon name="layout-grid" className="size-[18px]" />,
        },
      ],
    },
    {
      key: "account",
      label: <AppBilingual pick={(c) => c.account} />,
      items: [
        {
          key: "settings",
          label: <AppBilingual pick={(c) => c.settings} />,
          href: "/dashboard/settings",
          icon: <Icon name="settings" className="size-[18px]" />,
        },
      ],
    },
  ]

  // Additive path (UIF-038): one more group, same shell, same array shape. Never enabled here on
  // the live route — see the file-level note.
  if (canSell) {
    groups.push({
      key: "selling",
      label: <AppBilingual pick={(c) => c.seller.groupLabel} />,
      items: [
        {
          key: "selling-overview",
          label: <AppBilingual pick={(c) => c.seller.groupLabel} />,
          href: "/dashboard/selling",
          icon: <Icon name="package" className="size-[18px]" />,
          description: <AppBilingual pick={(c) => c.seller.note} />,
        },
      ],
    })
  }

  return groups
}
