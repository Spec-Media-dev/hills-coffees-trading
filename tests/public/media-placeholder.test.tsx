import { readFileSync } from "node:fs";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LocaleProvider } from "@/components/locale/locale-provider";
import { MediaPlaceholder } from "@/components/public/media-placeholder";
import { copy } from "@/lib/public/copy";

afterEach(cleanup);

describe("T044 — stable media placeholder", () => {
  it("reserves a caller-supplied stable aspect ratio before any media can load", () => {
    render(<LocaleProvider><MediaPlaceholder aspectRatio="16 / 9" /></LocaleProvider>);
    const placeholder = screen.getByRole("img", { name: copy.media.placeholderLabel });
    expect(placeholder.getAttribute("data-media-placeholder")).toBe("true");
    expect((placeholder as HTMLElement).style.aspectRatio).toBe("16 / 9");
    expect(placeholder.querySelector("img, video, picture, source")).toBeNull();
  });

  it("uses the documented default ratio and never fabricates a storage or file URL", () => {
    const { container } = render(<LocaleProvider><MediaPlaceholder /></LocaleProvider>);
    const placeholder = screen.getByRole("img", { name: copy.media.placeholderLabel });
    expect((placeholder as HTMLElement).style.aspectRatio).toBe("3 / 2");
    expect(container.querySelectorAll("[src], [href]")).toHaveLength(0);

    const source = readFileSync("components/public/media-placeholder.tsx", "utf8");
    expect(source).not.toMatch(/supabase|storage|createSignedUrl|getPublicUrl|https?:\/\//i);
  });
});
