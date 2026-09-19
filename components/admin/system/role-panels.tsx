"use client";

import { DecisionForm, type DecisionOption } from "@/components/admin/compliance/decision-form";
import type { ActionToastFeedback } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import type { SystemWriteOutcome } from "@/lib/admin/system-errors";
import { PLATFORM_ADMIN_ROLES, type PlatformAdminRole } from "@/lib/admin/system-validation";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";
import { changeRole, setRoleActive } from "@/src/app/dashboard-admin/(system)/(super)/actions";

/**
 * Feature 010 RUN F — T027 per-operator controls, reusing the ONE admin decision form: a confirmed
 * role change (exactly one of the other five CHECK roles) and a confirmed activate/deactivate. Both
 * are compare-and-set against the role/activity the page rendered (`expectedRole`/`expectedActive`
 * hidden fields); the server refuses the operator's own row (`ROLE_SELF_CHANGE_REFUSED`) and any
 * non-super-admin caller (`SYSTEM_NOT_CAPABLE`). The role vocabulary is the database's own.
 */

function useSystemFeedback() {
  const { tApp } = useLocale();
  const copy = tApp.admin.system.feedback;
  return (result: ActionFeedbackResult<SystemWriteOutcome>): ActionToastFeedback | null => {
    if (result.ok) return { tone: "success", message: copy.saved };
    switch (result.code) {
      case ACTION_FEEDBACK.SYSTEM_NOT_CAPABLE:
        return { tone: "error", message: copy.notCapable };
      case ACTION_FEEDBACK.PROFILE_AUTH_REQUIRED:
        return { tone: "error", message: tApp.feedback.signInRequired };
      case ACTION_FEEDBACK.SYSTEM_STALE:
        return { tone: "warning", message: copy.stale };
      case ACTION_FEEDBACK.ROLE_SELF_CHANGE_REFUSED:
        return { tone: "error", message: copy.selfChangeRefused };
      case ACTION_FEEDBACK.SYSTEM_VALUE_INVALID:
        return { tone: "error", message: copy.valueInvalid };
      case ACTION_FEEDBACK.VALIDATION_ERROR:
        return { tone: "error", message: copy.validationError };
      default:
        return { tone: "error", message: copy.failed };
    }
  };
}

const NO_REASON = { label: "", hint: "", required: "", tooLong: "", minLength: 0, maxLength: 0 };

export function RoleChangePanel({ userId, currentRole }: { userId: string; currentRole: PlatformAdminRole }) {
  const { tApp } = useLocale();
  const roles = tApp.admin.system.roles;
  const feedbackFor = useSystemFeedback();
  const options: DecisionOption<PlatformAdminRole>[] = PLATFORM_ADMIN_ROLES.filter((role) => role !== currentRole).map((role) => ({
    value: role,
    label: roles.roleLabels[role],
    description: role === "SUPER_ADMIN" || role === "ADMIN" ? roles.hierarchyNote : "",
    reasonRequired: false,
    destructive: true,
  }));
  return (
    <DecisionForm<PlatformAdminRole, SystemWriteOutcome>
      hiddenFields={{ userId, expectedRole: currentRole }}
      decisionFieldName="decision"
      formKey="role-change"
      options={options}
      action={changeRole}
      feedbackFor={feedbackFor}
      heading={roles.change.heading}
      lead={tApp.admin.system.common.changesRecorded}
      submitLabel={roles.change.submit}
      confirmTitle={roles.change.confirmTitle}
      confirmDescription={roles.change.confirmDescription}
      reason={NO_REASON}
      hideReason
    />
  );
}

export function RoleActivityPanel({ userId, currentRole, isActive }: { userId: string; currentRole: PlatformAdminRole; isActive: boolean }) {
  const { tApp } = useLocale();
  const roles = tApp.admin.system.roles;
  const feedbackFor = useSystemFeedback();
  const options: DecisionOption<"activate" | "deactivate">[] = isActive
    ? [{ value: "deactivate", label: roles.activity.deactivate, description: roles.activity.confirmDeactivateDescription, reasonRequired: false, destructive: true }]
    : [{ value: "activate", label: roles.activity.activate, description: roles.activity.confirmActivateDescription, reasonRequired: false, destructive: false }];
  return (
    <DecisionForm<"activate" | "deactivate", SystemWriteOutcome>
      hiddenFields={{ userId, expectedRole: currentRole, expectedActive: isActive ? "true" : "false" }}
      decisionFieldName="decision"
      formKey="role-activity"
      options={options}
      action={setRoleActive}
      feedbackFor={feedbackFor}
      heading={isActive ? roles.activity.deactivate : roles.activity.activate}
      lead={tApp.admin.system.common.superAdminOnly}
      submitLabel={isActive ? roles.activity.deactivate : roles.activity.activate}
      confirmTitle={isActive ? roles.activity.confirmDeactivateTitle : roles.activity.confirmActivateTitle}
      confirmDescription={isActive ? roles.activity.confirmDeactivateDescription : roles.activity.confirmActivateDescription}
      reason={NO_REASON}
      hideReason
    />
  );
}
