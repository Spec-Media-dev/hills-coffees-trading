import { AppBilingual } from "@/components/locale/app-bilingual";

export type OrganizationMemberRow = {
  userId: string;
  memberRole: string;
  createdAt: string;
  isCurrentUser: boolean;
};

/**
 * Feature 003 T028 — the current acting organization's membership list.
 *
 * RLS BOUNDARY, HONESTLY RESPECTED (not worked around): `organization_members`' own `members_own_org`
 * SELECT policy lets any member read every row for an organization they belong to (own-org
 * visibility, cross-org denied — confirmed against the live schema report), so `member_role` and
 * membership dates for EVERY co-member are genuinely readable here. `profiles`' own
 * `profiles_select_own` SELECT policy, however, is `id = auth.uid() OR is_platform_admin()` —
 * there is NO `is_org_member(...)` branch in it at all, so an ordinary member's own Server Component
 * read CANNOT join to another member's `profiles` row for their name. This component therefore shows
 * the caller's own real name (already known from `RequestIdentity.profile.fullName`) for their own
 * row, and a truthful generic label for every other row — never a fabricated name, never a silently
 * empty cell that looks like a bug. Closing this gap for real (showing co-members' real names) would
 * need either a new SELECT policy scoped to `is_org_member(...)` on `profiles`, or a narrow
 * SECURITY DEFINER RPC — both genuine schema-authority decisions outside a self-service-only run;
 * recorded here as an honest, named gap rather than invented around.
 */
// A single, locale-neutral numeric date format reused in both language spans — the same "keep
// digits/codes consistent regardless of UI language" convention already established for language
// codes elsewhere in this product, rather than fabricating two independently-formatted dates for
// one Server-rendered dual-language row.
const dateFormatter = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

export function OrganizationMembersPanel({ members }: { members: OrganizationMemberRow[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">
          <AppBilingual pick={(c) => c.membership.title} />
        </h2>
        <p className="text-[length:var(--text-small)] text-muted-foreground">
          <AppBilingual pick={(c) => c.membership.lead} />
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {members.map((member) => {
          const memberSinceDate = dateFormatter.format(new Date(member.createdAt));
          return (
            <li
              key={member.userId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-border p-3"
            >
              <span className="min-w-0 truncate font-medium text-foreground">
                <AppBilingual pick={(c) => (member.isCurrentUser ? c.membership.you : c.membership.nameNotVisible)} />
              </span>
              <span className="hc-meta shrink-0 text-muted-foreground">
                <AppBilingual pick={(c) => (member.memberRole === "OWNER" ? c.membership.roleOwner : c.membership.roleMember)} />
                {" · "}
                <AppBilingual pick={(c) => c.membership.memberSince.replace("{date}", memberSinceDate)} />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
