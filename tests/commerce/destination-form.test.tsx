import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DestinationForm } from "@/components/commerce/destination-form";
import { LocaleProvider } from "@/components/locale/locale-provider";

afterEach(cleanup);

describe("T075 destination form", () => {
  it("labels the buyer fields and keeps the international phone LTR", () => {
    render(<LocaleProvider><DestinationForm /></LocaleProvider>);
    expect(screen.getByRole("textbox", { name: "Label" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /Country code/ })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /Address line 1/ })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /Phone/ }).getAttribute("dir")).toBe("ltr");
    expect(screen.getByRole("checkbox", { name: "Default destination" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save destination" })).toBeTruthy();
  });

  it("does not submit an empty create id", () => {
    const { container } = render(<LocaleProvider><DestinationForm /></LocaleProvider>);
    expect(container.querySelector('input[name="id"]')).toBeNull();
  });
});
