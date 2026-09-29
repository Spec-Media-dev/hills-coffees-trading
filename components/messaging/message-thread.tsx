import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { UntrustedText } from "@/components/disputes/untrusted-text";
import { AppBilingual } from "@/components/locale/app-bilingual";
import type { SupportMessageDTO } from "@/lib/messaging/types";

export function MessageThread({ messages }: { messages: SupportMessageDTO[] }) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <ol data-slot="message-thread-list" className="flex flex-col gap-4">
      {messages.map((message) => (
        <li
          key={message.id}
          data-slot="message-item"
          data-staff={message.isStaff ? "true" : "false"}
          className={`flex flex-col gap-2.5 rounded-[var(--radius-lg)] p-4.5 shadow-xs transition-colors ${
            message.isStaff
              ? "border border-border border-s-4 border-s-[var(--brand-primary)] bg-[color-mix(in_srgb,var(--card),var(--brand-primary)_4%)]"
              : "border border-border bg-card"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2">
            <div className="flex items-center gap-2">
              {message.isStaff ? (
                <span
                  data-slot="staff-badge"
                  className="inline-flex items-center rounded-sm bg-[var(--brand-primary)] px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider"
                >
                  <AppBilingual pick={(c) => c.supportMessaging.staffBadge} />
                </span>
              ) : (
                <span className="text-xs font-semibold text-foreground">
                  <AppBilingual pick={(c) => message.authorName === "You" ? c.supportMessaging.youBadge : c.supportMessaging.memberBadge} />
                </span>
              )}
            </div>

            <span className="text-[length:var(--text-micro)] text-muted-foreground">
              <AdminDateTime value={message.createdAt} fallback="—" />
            </span>
          </div>

          <UntrustedText
            value={message.body}
            slot="message-body"
            className="text-sm leading-relaxed text-foreground"
          />
        </li>
      ))}
    </ol>
  );
}
