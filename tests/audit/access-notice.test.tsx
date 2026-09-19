import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AuditAccessNotice } from "@/components/audit/audit-access-notice";
import { canReadHistory } from "@/lib/audit/access";

/**
 * Feature 012 RUN C — T015 presentation: an auditor sees an EXPLANATION (DB-OPEN-06), never an empty
 * list that reads as "no activity"; a readable (admin) state renders no notice at all — the caller
 * renders the rows. The live resolution itself is proven in `tests/audit/history.test.ts`.
 */
afterEach(() => cleanup());

describe("AuditAccessNotice", () => {
  it("auditor (limited) → the DB-OPEN-06 explanation, in EN and AR, stating it is not an absence of activity", () => {
    const { container } = render(<AuditAccessNotice access={{ status: "limited", blocker: "DB-OPEN-06", audience: "auditor" }} />);
    const notice = container.querySelector('[data-slot="audit-access-notice"]');
    expect(notice?.getAttribute("data-blocker")).toBe("DB-OPEN-06");
    expect(notice?.querySelector('[lang="en"]')?.textContent).toBe("Audit log access");
    expect(notice?.textContent).toContain("does not mean that no activity took place");
    expect(notice?.textContent).toContain("لا يعني عدم وجود أي نشاط");
    expect(container.querySelector("table, ol, ul, button, a")).toBeNull();
  });

  it("readable (admin) → renders nothing; not-permitted / unavailable → their own honest statements", () => {
    expect(render(<AuditAccessNotice access={{ status: "readable", rows: [] }} />).container.innerHTML).toBe("");
    cleanup();
    expect(render(<AuditAccessNotice access={{ status: "not-permitted" }} />).container.textContent).toContain("does not include access");
    cleanup();
    expect(render(<AuditAccessNotice access={{ status: "unavailable" }} />).container.textContent).toContain("could not be read right now");
  });

  it("the access matrix never grants the auditor the audit log (DB-OPEN-06 stays open)", () => {
    expect(canReadHistory("auditLog", "auditor")).toBe(false);
    expect(canReadHistory("auditLog", "admin")).toBe(true);
    expect(canReadHistory("listing", "auditor")).toBe(true);
    expect(canReadHistory("order", "compliance")).toBe(false);
  });
});
