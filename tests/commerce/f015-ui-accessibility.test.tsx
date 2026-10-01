import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

import { PendingVerificationCard } from "@/components/commerce/pending-verification-card";
import { getAppCopy } from "@/lib/app/copy";
import { getCopy } from "@/lib/public/copy";
import { useLocale } from "@/components/locale/locale-provider";

// Mock router and locale
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/components/locale/locale-provider", () => ({
  useLocale: vi.fn(() => ({
    direction: "ltr",
    locale: "en",
    t: {} as ReturnType<typeof getCopy>,
    tApp: {} as ReturnType<typeof getAppCopy>,
    setLocale: vi.fn(),
    toggleLocale: vi.fn(),
  })),
}));

describe("Feature 015 T050: UI accessibility and responsive requirements", () => {
  it("PendingVerificationCard renders order code and accessible action links", () => {
    render(<PendingVerificationCard orderCode="ORD-20260929-1234567" />);

    expect(screen.getByText("Payment Pending Verification")).toBeDefined();
    expect(screen.getByText(/ORD-20260929-1234567/)).toBeDefined();
    expect(screen.getByText("Pending Finance Review")).toBeDefined();

    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    expect(buttons.some((b) => b.getAttribute("href") === "/dashboard/orders")).toBe(true);
    expect(buttons.some((b) => b.getAttribute("href") === "/dashboard/coffee")).toBe(true);
  });

  it("PendingVerificationCard respects RTL direction when locale is Arabic", () => {
    vi.mocked(useLocale).mockReturnValue({
      direction: "rtl",
      locale: "ar",
      t: getCopy("ar"),
      tApp: getAppCopy("ar"),
      setLocale: vi.fn(),
      toggleLocale: vi.fn(),
    });

    const { container } = render(<PendingVerificationCard orderCode="ORD-AR-001" />);
    expect(container.textContent).toContain("قيد التحقق من الدفع");
    expect(container.textContent).toContain("ORD-AR-001");
  });
});
