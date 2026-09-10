import { readFileSync } from "node:fs"
import path from "node:path"

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { FoundationOverview } from "@/components/app/foundation-overview"

const root = process.cwd()
const source = (...segments: string[]) => readFileSync(path.join(root, ...segments), "utf8")

afterEach(cleanup)

describe("Phase 5.5 UIF-H — protected overview convergence", () => {
  it("renders honest Member and Operations orientation without business figures or actions", () => {
    const { rerender } = render(<FoundationOverview surface="member" />)
    expect(screen.getByRole("region", { name: "Workspace orientation" })).toBeTruthy()
    expect(screen.getByText("Your workspace foundation is ready")).toBeTruthy()
    expect(screen.getByText("What this page does not show")).toBeTruthy()

    rerender(<FoundationOverview surface="admin" />)
    expect(screen.getByText("Operations workspace foundation is ready")).toBeTruthy()
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.queryByRole("link")).toBeNull()
  })

  it("stays a server-only presentational foundation with no auth, role, data or client-island read", () => {
    const component = source("components", "app", "foundation-overview.tsx")
    expect(component).not.toMatch(/"use client"|getRequestIdentity|createClient|supabase|operationalRoles|canSell/i)
    expect(component).not.toMatch(/\b(?:AED|USD|EUR)\b|\$\d|\d+\s+(?:orders|shipments)/i)
  })

  it("mounts the same honest visual foundation on both existing protected routes", () => {
    expect(source("src", "app", "dashboard", "page.tsx")).toContain('<FoundationOverview surface="member" />')
    expect(source("src", "app", "dashboard-admin", "page.tsx")).toContain('<FoundationOverview surface="admin" />')
  })

  it("uses theme-derived surfaces, contrast-safe gold variants and logical sizing", () => {
    const component = source("components", "app", "foundation-overview.tsx")
    expect(component).toContain("var(--surface-card)")
    expect(component).toContain("var(--surface-subtle)")
    expect(component).toContain("var(--gold-on-light)")
    expect(component).toContain("var(--gold-on-dark)")
    expect(component).toContain("min-w-0")
    expect(component).not.toMatch(/text-left|text-right|border-l|border-r|ml-|mr-/)
  })
})
