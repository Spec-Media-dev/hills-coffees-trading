import { AppBilingual } from "@/components/locale/app-bilingual";
import { Icon } from "@/components/ui/icon";
import { cn } from "cn";

/**
 * The real onboarding progress list (Feature 003 T012). Every step here is an actual
 * completed/current/upcoming state derived by the caller — never an invented completion metric.
 * Steps 1–2 (account + verify email) are always "complete" wherever this renders, since reaching
 * either surface that uses this component already requires both.
 */
const STEP_KEYS = ["account", "verifyEmail", "businessProfile", "kyb", "review", "access"] as const;
type StepKey = (typeof STEP_KEYS)[number];

export function OnboardingProgress({ currentStep }: { currentStep: Extract<StepKey, "businessProfile" | "kyb"> }) {
  const currentIndex = STEP_KEYS.indexOf(currentStep);

  return (
    <ol className="flex flex-col gap-2">
      {STEP_KEYS.map((step, index) => {
        const state = index < currentIndex ? "complete" : index === currentIndex ? "current" : "upcoming";

        return (
          <li
            key={step}
            className={cn(
              "flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-[length:var(--text-small)]",
              state === "current" && "bg-[var(--surface-subtle)] font-semibold text-foreground",
              state === "complete" && "text-muted-foreground",
              state === "upcoming" && "text-muted-foreground/70"
            )}
          >
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full border text-xs",
                state === "complete" && "border-[var(--success)] bg-[var(--success)]/10 text-[var(--success)]",
                state === "current" && "border-primary bg-primary text-primary-foreground",
                state === "upcoming" && "border-border"
              )}
              aria-hidden="true"
            >
              {state === "complete" ? <Icon name="check" className="size-3.5" /> : index + 1}
            </span>
            <span>
              <AppBilingual pick={(c) => c.onboarding.steps[step]} />
            </span>
            {state === "current" ? <span className="sr-only">(current step)</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
