import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";

/**
 * The Header account trigger's avatar (Feature 003 — Header integration).
 *
 * DELIBERATE DECISION: initials/icon fallback ONLY, never a real image. `RequestProfile`
 * (`lib/auth/types.ts`) exposes `fullName`/`companyName` and nothing else — there is no approved
 * avatar-image field on the identity this Header reads, and no Storage bucket exists to serve one
 * from even if there were (the same DB-BLOCK-01 constraint Feature 003's KYB documents are bound
 * by). Inventing an `<Image src>` here would mean guessing at a URL with nothing behind it. If a
 * real, approved avatar source is ever added to `RequestIdentity`, this component gets an
 * `AvatarImage` branch then — not before.
 */
export function UserAvatar({ displayName, size = "default" }: { displayName: string; size?: "default" | "sm" }) {
  const initials = getInitials(displayName);

  return (
    <Avatar size={size} className="border border-border">
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
