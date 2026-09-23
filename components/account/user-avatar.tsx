import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { publicAssetUrl } from "@/lib/storage/public-url";

/**
 * The signed-in user's avatar, used by EVERY shell that represents them: the public header account
 * menu, the public mobile drawer, the Member Portal topbar (Buyer/Seller) and the Operations Console
 * topbar (every operational role). One component, one URL builder (`publicAssetUrl`), so no surface
 * can drift from another.
 *
 * `avatarPath` is `profiles.avatar_path` as resolved per request by `getRequestIdentity()` (never
 * cached across requests). Every upload writes a NEW timestamped object path, so a replaced avatar can
 * never be served from a stale browser/CDN cache entry; the avatar Server Actions revalidate the root
 * layout, so every shell re-renders with the new path without a sign-out.
 *
 * Fallback: initials (or a person icon) render until the image loads and whenever it fails —
 * Base UI's `Avatar` swaps to `AvatarFallback` on a load error, so a broken/removed object never
 * shows a broken-image glyph.
 */
export function UserAvatar({ displayName, avatarPath, size = "default" }: { displayName: string; avatarPath?: string | null; size?: "default" | "sm" }) {
  const initials = getInitials(displayName);

  return (
    <Avatar size={size} className="border border-border" data-user-avatar={avatarPath ? "image" : "initials"}>
      {avatarPath ? <AvatarImage src={publicAssetUrl(avatarPath)} alt="" className="transition-opacity duration-[var(--dur-fast)] motion-reduce:transition-none" /> : null}
      <AvatarFallback className="bg-[var(--sidebar)] text-[var(--sidebar-foreground)]">
        {initials || <Icon name="users" className="size-4" />}
      </AvatarFallback>
    </Avatar>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}
