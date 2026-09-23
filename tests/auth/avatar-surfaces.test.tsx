import { readFileSync } from "node:fs";

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { UserAvatar } from "@/components/account/user-avatar";

/**
 * Hardening run — ONE avatar component for every shell that represents the signed-in user (Admin /
 * Super Admin / every operational role in the Operations Console; Buyer / Seller in the Member
 * Portal; the public header + mobile drawer), fed by `profiles.avatar_path` resolved per request.
 */
afterEach(cleanup);

const read = (path: string) => readFileSync(path, "utf8");

describe("UserAvatar", () => {
  it("renders the real image when avatar_path is set (public-assets URL, circular object-cover), with the initials fallback underneath", () => {
    const { container } = render(<UserAvatar displayName="Sara Haddad" avatarPath="avatars/u-1/1727000000000.webp" />);
    const root = container.querySelector("[data-user-avatar]");
    expect(root?.getAttribute("data-user-avatar")).toBe("image");
    // Base UI mounts the <img> only once it has loaded; the fallback (initials) is what jsdom shows.
    expect(container.textContent).toContain("SH");
  });

  it("renders initials (no image element) when there is no avatar", () => {
    const { container } = render(<UserAvatar displayName="Omar" avatarPath={null} />);
    expect(container.querySelector("[data-user-avatar]")?.getAttribute("data-user-avatar")).toBe("initials");
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("OM");
  });

  it("builds the URL through the single shared helper (no second URL builder)", () => {
    const source = read("components/account/user-avatar.tsx");
    expect(source).toContain('import { publicAssetUrl } from "@/lib/storage/public-url";');
    expect(source).toContain("src={publicAssetUrl(avatarPath)}");
    expect(read("components/ui/avatar.tsx")).toMatch(/object-cover/);
  });
});

describe("every shell threads the request profile's avatar_path into UserAvatar", () => {
  it("the DAL reads avatar_path into RequestProfile (per request, never cached)", () => {
    const dal = read("lib/auth/dal.ts");
    expect(dal).toContain('"full_name, company_name, avatar_path"');
    expect(dal).toContain("avatarPath: profileRow.data?.avatar_path ?? null");
  });

  it("Operations Console (Admin / Super Admin / operational roles)", () => {
    expect(read("src/app/dashboard-admin/layout.tsx")).toContain("avatarPath={identity.profile.avatarPath}");
    expect(read("components/admin/topbar.tsx")).toMatch(/<UserAvatar displayName=\{[^}]*\} avatarPath=\{avatarPath\}/);
  });

  it("Member Portal (Buyer / Seller)", () => {
    expect(read("src/app/dashboard/layout.tsx")).toContain("avatarPath={identity.profile.avatarPath}");
    expect(read("components/dashboard/topbar.tsx")).toMatch(/<UserAvatar[^>]*avatarPath=\{avatarPath\}/);
  });

  it("public header account menu and mobile drawer", () => {
    const header = read("components/public/site-header.tsx");
    expect(header).toContain("avatarPath={identity.profile.avatarPath}");
    expect(header).toContain("avatarPath: identity.profile.avatarPath");
    expect(read("components/account/account-menu.tsx")).toMatch(/<UserAvatar[^>]*avatarPath=\{avatarPath\}/);
    expect(read("components/public/mobile-nav.tsx")).toMatch(/<UserAvatar[^>]*avatarPath=\{auth\.avatarPath\}/);
  });

  it("admin account page shows the real avatar, not initials only", () => {
    expect(read("src/app/dashboard-admin/account/page.tsx")).toContain("avatarPath={profile?.avatar_path ?? null}");
  });

  it("upload / remove revalidate the ROOT layout so every shell refreshes without sign-out (new object path per upload = no stale cache)", () => {
    const actions = read("src/app/dashboard/settings/actions.ts");
    const upload = actions.slice(actions.indexOf("export async function uploadMyAvatar"), actions.indexOf("export async function removeMyAvatar"));
    const remove = actions.slice(actions.indexOf("export async function removeMyAvatar"));
    expect(upload).toContain('revalidatePath("/", "layout")');
    expect(upload).toMatch(/const objectPath = `avatars\/\$\{identity\.userId\}\/\$\{Date\.now\(\)\}/);
    expect(remove.slice(0, remove.indexOf("\n}\n"))).toContain('revalidatePath("/", "layout")');
  });
});
