import { AppBilingual } from "@/components/locale/app-bilingual";
import { Badge } from "@/components/ui/badge";
import type { OperationalRole } from "@/lib/auth/types";
import { cn } from "cn";

/**
 * Feature 010 T003 — the operator's attested roles as labelled badges (text + a semantic dot,
 * never colour alone). `roles` is `identity.operationalRoles` verbatim — the database's own
 * attestations, in the DAL's stable order. Presentation only. Server Component.
 */
export function AdminRoleBadges({ roles, className }: { roles: readonly OperationalRole[]; className?: string }) {
  if (roles.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)} data-admin-roles={roles.join(",")}>
      <span className="sr-only">
        <AppBilingual pick={(c) => c.admin.shell.operatorRoles} />
      </span>
      <ul className="contents">
      {roles.map((role) => (
        <li key={role} className="contents">
          <Badge variant="outline" className="gap-1.5 text-[length:var(--text-micro)] font-semibold uppercase tracking-[0.04em]">
            <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-[var(--gold-on-light)] dark:bg-[var(--gold-on-dark)]" />
            <AppBilingual pick={(c) => c.admin.roles[role]} />
          </Badge>
        </li>
      ))}
      </ul>
    </div>
  );
}
