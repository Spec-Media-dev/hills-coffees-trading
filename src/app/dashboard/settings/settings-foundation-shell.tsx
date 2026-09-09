import type { ReactNode } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type SettingsFoundationShellProps = {
  children: ReactNode;
  description: string;
  dir?: "ltr" | "rtl";
  title: string;
};

/**
 * Synchronous presentation shell for the Foundation settings proof. Keeping authorization and
 * data loading in page.tsx lets the same rendered surface be exercised by Vitest without mocking
 * an async Server Component.
 */
export function SettingsFoundationShell({
  children,
  description,
  dir,
  title,
}: SettingsFoundationShellProps) {
  return (
    <section
      data-testid="hills-settings-proof"
      dir={dir}
      className="w-full max-w-2xl min-w-0 text-start"
    >
      <Card
        data-testid="hills-settings-card"
        className="min-w-0 border-border bg-card text-card-foreground shadow-sm"
      >
        <CardHeader className="min-w-0 border-b border-border pb-4 text-start">
          <div className="flex min-w-0 items-start gap-3">
            <span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-full bg-accent" />
            <div className="min-w-0">
              <CardTitle className="text-2xl font-bold text-foreground">
                <h1 className="hc-heading-3">
                  {title}
                </h1>
              </CardTitle>
              <CardDescription
                data-testid="hills-settings-description"
                className="mt-2 min-w-0 break-words text-start text-base leading-relaxed text-muted-foreground"
                style={{ overflowWrap: "anywhere" }}
              >
                {description}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="min-w-0 pt-5">{children}</CardContent>
      </Card>
    </section>
  );
}
