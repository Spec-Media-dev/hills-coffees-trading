import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AddToCartForm } from "@/components/commerce/add-to-cart-form";
import { LocaleProvider } from "@/components/locale/locale-provider";

afterEach(cleanup);

describe("T073 add-to-cart form", () => {
  it("has an accessible quantity and a truthful no-reservation notice", () => {
    render(<LocaleProvider><AddToCartForm offerId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" /></LocaleProvider>);
    expect(screen.getByRole("spinbutton", { name: /Quantity \(kg\)/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add to cart" })).toBeTruthy();
    expect(screen.getByText(/Cart quantities are not reserved/)).toBeTruthy();
  });

  it("disables own and ineligible listings without presenting an operable purchase", () => {
    const { rerender } = render(<LocaleProvider><AddToCartForm offerId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" disabledReason="own" /></LocaleProvider>);
    expect((screen.getByRole("button", { name: "Add to cart" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/cannot buy its own listing/)).toBeTruthy();
    rerender(<LocaleProvider><AddToCartForm offerId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" disabledReason="unavailable" /></LocaleProvider>);
    expect((screen.getByRole("button", { name: "Add to cart" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
