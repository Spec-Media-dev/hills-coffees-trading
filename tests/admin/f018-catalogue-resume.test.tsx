/**
 * Feature 018 T041 - interrupted media / translation / offer resume, authorization and recovery.
 * STATIC: mocks the Supabase client and Server Actions; the real transaction/lock/RLS proofs live in
 * f018-catalogue-orchestration.test.ts against local PostgreSQL. Nothing here talks to any remote.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const guard = vi.hoisted(() => ({ result: { ok: true } as { ok: boolean; denial?: string } }));
vi.mock("@/lib/admin/guards", () => ({ checkRoleFunctionAccess: vi.fn(async () => guard.result) }));
const supabase = vi.hoisted(() => ({
  rpc: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  slug: "kenya-aa" as string | null,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    rpc: supabase.rpc,
    storage: { from: () => ({ upload: supabase.upload, remove: supabase.remove }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: supabase.slug ? { slug: supabase.slug } : null }) }) }) }),
  })),
}));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
const router = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const toasts = vi.hoisted(() => ({ calls: [] as { tone: string; message: string }[] }));
vi.mock("@/components/app/toast", () => {
  const push = (tone: string) => (message: string) => { toasts.calls.push({ tone, message }); };
  return { toast: { success: push("success"), error: push("error"), warning: push("warning"), info: push("info") } };
});
const actions = vi.hoisted(() => ({
  saveIdentityAction: vi.fn(), saveArabicAction: vi.fn(), saveTaxonomyAction: vi.fn(), createCoffeeAction: vi.fn(), attachMediaAction: vi.fn(),
  removeMediaAction: vi.fn(), setPrimaryMediaAction: vi.fn(), createOfferAction: vi.fn(), saveOfferAction: vi.fn(), setFeaturedAction: vi.fn(),
  publishCatalogueOnlyAction: vi.fn(), publishCoordinatedAction: vi.fn(), recoverOperationAction: vi.fn(),
}));
vi.mock("@/src/app/dashboard-admin/(catalogue)/coffees/workflow-actions", () => actions);
vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} /> }));

import {
  attachCoffeeMediaIntent, catalogueMediaPath, classifyWorkflowError, createBackedOfferIntent, createCoffeeIntent, publishCoffeeCoordinated,
  recoverCatalogueOperation, saveCoffeeIdentity, type CoffeeWorkflowState,
} from "@/lib/admin/catalogue";
import { CoffeeStepper } from "@/components/admin/catalogue/coffee-stepper";
import { LocaleProvider } from "@/components/locale/locale-provider";
import { f018AdminAr, f018AdminEn } from "@/lib/app/copy/f018-admin";

const re = (text: string) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
const COFFEE = "f0180005-0000-4000-8000-000000000001";
const REQ = "f018000c-0000-4000-8000-000000000001";
const OFFER = "f0180006-0000-4000-8000-000000000001";

beforeEach(() => {
  guard.result = { ok: true };
  supabase.rpc.mockReset(); supabase.upload.mockReset(); supabase.remove.mockReset();
  supabase.upload.mockResolvedValue({ error: null });
  supabase.remove.mockResolvedValue({ error: null });
  supabase.slug = "kenya-aa";
  for (const fn of Object.values(actions)) fn.mockReset();
  router.refresh.mockReset(); router.replace.mockReset();
  toasts.calls.length = 0;
});
afterEach(() => { cleanup(); document.documentElement.lang = "en"; window.history.replaceState(null, "", "/"); });

describe("classification: stable codes, never database text", () => {
  const rpcError = (message: string, details?: unknown, code = "P0001") => ({ code, message, details: details === undefined ? undefined : typeof details === "string" ? details : JSON.stringify(details) });

  it("maps every controlled token and parses structured detail", () => {
    expect(classifyWorkflowError(rpcError("mfa_step_up_required"))).toMatchObject({ code: "MFA_REQUIRED" });
    expect(classifyWorkflowError(rpcError("forbidden"))).toMatchObject({ code: "NOT_CAPABLE" });
    expect(classifyWorkflowError(rpcError("revision_conflict", { current_revision: 7 }))).toMatchObject({ code: "REVISION_CONFLICT", currentRevision: 7 });
    expect(classifyWorkflowError(rpcError("coffee_not_publish_ready", ["arabic_name", "primary_image"]))).toMatchObject({ code: "NOT_READY", missing: ["arabic_name", "primary_image"] });
    expect(classifyWorkflowError(rpcError("active_offer_exists", { offer_id: OFFER }))).toMatchObject({ code: "ACTIVE_OFFER_EXISTS", existingOfferId: OFFER });
    expect(classifyWorkflowError(rpcError("request_payload_conflict"))).toMatchObject({ code: "REQUEST_CONFLICT" });
    expect(classifyWorkflowError(rpcError("offer_quantity_exceeds_inventory"))).toMatchObject({ code: "STOCK_INSUFFICIENT" });
    expect(classifyWorkflowError(rpcError("publication_authority_required"))).toMatchObject({ code: "PUBLICATION_AUTHORITY_REQUIRED" });
    expect(classifyWorkflowError(rpcError("catalogue_field_invalid", "slug"))).toMatchObject({ code: "VALIDATION", fieldErrors: { slug: ["INVALID"] } });
  });

  it("does not match a token inside a longer identifier, and never echoes raw text", () => {
    const failure = classifyWorkflowError(rpcError("some_forbidden_thing leaked SELECT * FROM secrets"));
    expect(failure).toEqual({ ok: false, code: "SAVE_FAILED" });
    expect(JSON.stringify(failure)).not.toContain("secrets");
  });

  it("a failure without a SQLSTATE is an UNKNOWN outcome; unique/foreign-key states map safely", () => {
    expect(classifyWorkflowError({ message: "fetch failed" })).toMatchObject({ code: "OUTCOME_UNKNOWN" });
    expect(classifyWorkflowError({ code: "23505", message: "dup" })).toMatchObject({ code: "SLUG_TAKEN" });
    expect(classifyWorkflowError({ code: "23503", message: "fk" })).toMatchObject({ code: "REFERENCE_INVALID" });
  });
});

describe("authorization: denied before any database call", () => {
  it.each([
    ["anonymous", "AUTH_REQUIRED"], ["mfa-step-up", "MFA_REQUIRED"], ["no-operational-role", "NOT_CAPABLE"], ["forbidden", "NOT_CAPABLE"],
  ])("%s denial -> %s", async (denial, code) => {
    guard.result = { ok: false, denial };
    const results = await Promise.all([
      createCoffeeIntent({ requestId: REQ, name: "Kenya AA", slug: "kenya-aa", description: "d" }),
      saveCoffeeIdentity({ coffeeId: COFFEE, revision: 1, requestId: REQ, name: "Kenya AA", slug: "kenya-aa", description: "d" }),
      createBackedOfferIntent({ coffeeId: COFFEE, revision: 1, requestId: REQ, positionId: OFFER, priceUsdPerKg: 10, quantityKg: 5 }),
      publishCoffeeCoordinated({ coffeeId: COFFEE, revision: 1, requestId: REQ, offerId: OFFER, offerRevision: 1 }),
      recoverCatalogueOperation({ requestId: REQ }),
      attachCoffeeMediaIntent({ coffeeId: COFFEE, revision: 1, requestId: REQ }, new File([new Uint8Array(4)], "a.png", { type: "image/png" })),
    ]);
    for (const result of results) expect(result).toMatchObject({ ok: false, code });
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(supabase.upload).not.toHaveBeenCalled();
  });

  it("validates input on the server before calling the database (coordinated publish needs its offer)", async () => {
    expect(await publishCoffeeCoordinated({ coffeeId: COFFEE, revision: 1, requestId: REQ })).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(await createCoffeeIntent({ requestId: "not-a-uuid", name: "", slug: "Bad Slug", description: "" })).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

describe("interrupted media: verified-orphan compensation and recovery by the original intent", () => {
  const png = () => new File([new Uint8Array([1, 2, 3, 4])], "bean.png", { type: "image/png" });
  const input = { coffeeId: COFFEE, revision: 3, requestId: REQ };

  it("the stored path derives from the intent, so a retry targets the same object", () => {
    expect(catalogueMediaPath(COFFEE, REQ, "image/png")).toBe(catalogueMediaPath(COFFEE, REQ, "image/png"));
    expect(catalogueMediaPath(COFFEE, REQ, "image/png")).toContain(`catalogue/${COFFEE}/${REQ}`);
  });

  it("success: uploads once, attaches once, removes nothing", async () => {
    supabase.rpc.mockResolvedValueOnce({ data: { media_id: "m1", revision: 4, is_primary: true }, error: null });
    const result = await attachCoffeeMediaIntent(input, png());
    expect(result).toMatchObject({ ok: true, data: { mediaId: "m1", revision: 4, isPrimary: true } });
    expect(supabase.upload).toHaveBeenCalledTimes(1);
    expect(supabase.remove).not.toHaveBeenCalled();
  });

  it("definite failure (stale revision) removes ONLY the object this intent uploaded", async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "revision_conflict", details: JSON.stringify({ current_revision: 9 }) } });
    const result = await attachCoffeeMediaIntent(input, png());
    expect(result).toMatchObject({ ok: false, code: "REVISION_CONFLICT", currentRevision: 9, cleanup: "DONE" });
    expect(supabase.remove).toHaveBeenCalledWith([catalogueMediaPath(COFFEE, REQ, "image/png")]);
  });

  it("unknown outcome + recovery says COMMITTED: success, and the object is NOT removed", async () => {
    supabase.rpc
      .mockResolvedValueOnce({ data: null, error: { message: "network down" } })
      .mockResolvedValueOnce({ data: { status: "COMMITTED", response: { media_id: "m2", revision: 5, is_primary: false } }, error: null });
    const result = await attachCoffeeMediaIntent(input, png());
    expect(result).toMatchObject({ ok: true, data: { mediaId: "m2", revision: 5 } });
    expect(supabase.remove).not.toHaveBeenCalled();
  });

  it("unknown outcome + recovery says NOT_COMMITTED: the orphan is removed; failed removal is reported as PENDING, never silent", async () => {
    supabase.rpc
      .mockResolvedValueOnce({ data: null, error: { message: "timeout" } })
      .mockResolvedValueOnce({ data: { status: "NOT_COMMITTED" }, error: null });
    supabase.remove.mockRejectedValueOnce(new Error("storage down"));
    const result = await attachCoffeeMediaIntent(input, png());
    expect(result).toMatchObject({ ok: false, cleanup: "PENDING" });
  });

  it("unknown outcome + recovery itself unavailable: nothing is deleted (an attached object is never removed)", async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: "timeout" } }).mockResolvedValueOnce({ data: null, error: { message: "still down" } });
    expect(await attachCoffeeMediaIntent(input, png())).toMatchObject({ ok: false, code: "OUTCOME_UNKNOWN" });
    expect(supabase.remove).not.toHaveBeenCalled();
  });

  it("a retry whose object already exists never deletes it on failure (it may be the earlier attempt's committed file)", async () => {
    supabase.upload.mockResolvedValueOnce({ error: { message: "The resource already exists", statusCode: "409" } });
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "coffee_media_limit_reached" } });
    expect(await attachCoffeeMediaIntent(input, png())).toMatchObject({ ok: false, code: "MEDIA_LIMIT" });
    expect(supabase.remove).not.toHaveBeenCalled();
  });

  it("refuses an invalid file before any upload", async () => {
    const result = await attachCoffeeMediaIntent(input, new File([new Uint8Array(4)], "x.gif", { type: "image/gif" }));
    expect(result).toMatchObject({ ok: false, code: "MEDIA_INVALID" });
    expect(supabase.upload).not.toHaveBeenCalled();
  });
});

function workflow(overrides: Partial<CoffeeWorkflowState> = {}): CoffeeWorkflowState {
  return {
    coffee: {
      id: COFFEE, name: "Kenya AA", slug: "kenya-aa", description: "Bright and sweet.", status: "DRAFT", originId: "o1", coffeeTypeId: null, varietyId: null,
      processingMethodId: null, packagingTypeId: null, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", createdBy: null, updatedBy: null,
      revision: 3, featuredAt: null,
    },
    arabic: { name: "كينيا", description: "حلوة" },
    media: [],
    offers: [],
    options: { origins: [{ id: "o1", name: "Kenya", slug: "kenya", status: "ACTIVE" }], coffeeTypes: [], varieties: [], processingMethods: [], packagingTypes: [] },
    readiness: { coffeeId: COFFEE, revision: 3, status: "DRAFT", ready: false, missing: ["primary_image"], checks: { english: true, arabic: true, origin: true, primaryImage: false } },
    positions: [],
    ...overrides,
  };
}

const mount = (state: CoffeeWorkflowState, step?: string) => render(<LocaleProvider><CoffeeStepper workflow={state} initialStep={step} /></LocaleProvider>);

describe("resume: progress comes from the saved record, in English and Arabic", () => {
  it("derives step states from storage (not client memory) and opens the requested step", () => {
    mount(workflow(), "readiness");
    const nav = screen.getByRole("navigation", { name: f018AdminEn.catalogueWorkflow.stepperLabel });
    const states = Object.fromEntries(within(nav).getAllByRole("button").map((button) => [button.getAttribute("data-step-key"), button.getAttribute("data-step-state")]));
    expect(states).toMatchObject({ identity: "done", arabic: "done", taxonomy: "done", media: "todo", inventory: "attention", offer: "todo", readiness: "attention" });
    expect(within(nav).getByRole("button", { current: "step" }).getAttribute("data-step-key")).toBe("readiness");
    expect(document.querySelector('[data-readiness="not-ready"]')).not.toBeNull();
  });

  it("an interrupted Arabic save resumes with the missing translation flagged and the English intact", () => {
    mount(workflow({ arabic: null }), "arabic");
    const nav = screen.getByRole("navigation");
    expect(within(nav).getByRole("button", { name: re(f018AdminEn.catalogueWorkflow.steps.arabic.label) }).getAttribute("data-step-state")).toBe("attention");
    expect(within(nav).getByRole("button", { name: re(f018AdminEn.catalogueWorkflow.steps.identity.label) }).getAttribute("data-step-state")).toBe("done");
  });

  it("renders Arabic copy and keeps technical values direction-isolated", () => {
    document.documentElement.lang = "ar";
    mount(workflow({ offers: [{ id: OFFER, code: "OFR-100", status: "DRAFT", title: null, priceUsdPerKg: 9.5, quantityKg: 100, reservedKg: 0, filledKg: 0, revision: 2, lotId: "l1", rejectionReason: null }] }), "offer");
    expect(screen.getByRole("navigation", { name: f018AdminAr.catalogueWorkflow.stepperLabel })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: f018AdminAr.catalogueWorkflow.offer!.heading! })).toBeTruthy();
    const code = screen.getByText("OFR-100");
    expect(code.closest("bdi")!.getAttribute("dir")).toBe("ltr");
  });

  it("with no real stock the Inventory step hands off to the Warehouse and never invents stock", () => {
    mount(workflow({ positions: [] }), "inventory");
    expect(screen.getByText(f018AdminEn.catalogueWorkflow.inventory.emptyTitle)).toBeTruthy();
    expect(screen.getByRole("link", { name: re(f018AdminEn.catalogueWorkflow.inventory.handoff) }).getAttribute("href")).toBe("/dashboard-admin/inventory");
    expect(screen.queryByRole("button", { name: f018AdminEn.catalogueWorkflow.inventory.select })).toBeNull();
  });

  it("an offer in review is locked here and handed to Compliance (no role expansion)", () => {
    mount(workflow({ offers: [{ id: OFFER, code: "OFR-1", status: "PENDING_REVIEW", title: null, priceUsdPerKg: 9, quantityKg: 10, reservedKg: 0, filledKg: 0, revision: 2, lotId: "l1", rejectionReason: null }] }), "offer");
    expect(screen.getByText(f018AdminEn.catalogueWorkflow.offer.lockedByReview)).toBeTruthy();
    expect(screen.getByRole("link", { name: re(f018AdminEn.catalogueWorkflow.offer.openReview) }).getAttribute("href")).toBe(`/dashboard-admin/listings/${OFFER}`);
    expect(document.querySelector('[data-workflow-form="offer-save"]')).toBeNull();
  });

  it("coordinated publication is unavailable without an APPROVED offer; catalogue-only needs readiness", () => {
    mount(workflow(), "readiness");
    expect((screen.getByRole("button", { name: f018AdminEn.catalogueWorkflow.publish.catalogueOnlyTitle }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: f018AdminEn.catalogueWorkflow.publish.coordinatedTitle }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(f018AdminEn.catalogueWorkflow.publish.needsApproved)).toBeTruthy();
  });

  it("the public preview never carries price, quantity or stock; the purchase preview is separate", () => {
    mount(workflow({ offers: [{ id: OFFER, code: "OFR-1", status: "APPROVED", title: null, priceUsdPerKg: 12.5, quantityKg: 100, reservedKg: 10, filledKg: 0, revision: 2, lotId: "l1", rejectionReason: null }] }), "readiness");
    const publicPreview = document.querySelector('[data-preview="public"]')!;
    expect(publicPreview.textContent).not.toMatch(/12\.5|USD|\bkg\b/);
    const purchase = document.querySelector('[data-preview="purchase"]')!;
    expect(purchase.textContent).toContain("12.5");
    expect(purchase.textContent).toContain("90"); // 100 - 10 reserved
  });
});

describe("retry and conflict behavior of a step form", () => {
  const submitIdentity = async () => {
    const form = document.querySelector('[data-workflow-form="identity"]')!;
    await act(async () => { fireEvent.submit(form); });
  };

  it("keeps the operator's input on a stale revision, offers the latest version and warns once", async () => {
    actions.saveIdentityAction.mockResolvedValue({ ok: false, code: "REVISION_CONFLICT", currentRevision: 8 });
    mount(workflow(), "identity");
    fireEvent.change(screen.getByLabelText(re(f018AdminEn.catalogueWorkflow.identity.name)), { target: { value: "Kenya AA Top Lot" } });
    await submitIdentity();
    await waitFor(() => expect(screen.getByText(f018AdminEn.catalogueWorkflow.conflict.title)).toBeTruthy());
    expect((screen.getByLabelText(re(f018AdminEn.catalogueWorkflow.identity.name)) as HTMLInputElement).value).toBe("Kenya AA Top Lot");
    expect(toasts.calls.filter((call) => call.tone === "warning")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: f018AdminEn.catalogueWorkflow.conflict.action }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it("retries an uncertain outcome with the SAME intent key, then rotates it after a committed success", async () => {
    actions.saveIdentityAction
      .mockResolvedValueOnce({ ok: false, code: "OUTCOME_UNKNOWN" })
      .mockResolvedValueOnce({ ok: false, code: "OUTCOME_UNKNOWN" })
      .mockResolvedValueOnce({ ok: true, data: { coffeeId: COFFEE, revision: 4, status: "DRAFT" }, revalidatedTags: [] })
      .mockResolvedValue({ ok: true, data: { coffeeId: COFFEE, revision: 5, status: "DRAFT" }, revalidatedTags: [] });
    mount(workflow(), "identity");
    await submitIdentity();
    await waitFor(() => expect(screen.getByText(f018AdminEn.catalogueWorkflow.unknown.title)).toBeTruthy());
    await submitIdentity();
    await submitIdentity();
    await waitFor(() => expect(actions.saveIdentityAction).toHaveBeenCalledTimes(3));
    const keys = actions.saveIdentityAction.mock.calls.map(([, formData]) => (formData as FormData).get("requestId"));
    expect(keys[0]).toBe(keys[1]);
    expect(keys[1]).toBe(keys[2]);
    await waitFor(() => expect(toasts.calls.some((call) => call.tone === "success" && call.message === f018AdminEn.catalogueWorkflow.toasts.identitySaved)).toBe(true));
    await submitIdentity();
    await waitFor(() => expect(actions.saveIdentityAction).toHaveBeenCalledTimes(4));
    expect((actions.saveIdentityAction.mock.calls[3]![1] as FormData).get("requestId")).not.toBe(keys[2]);
  });

  it("'Check now' recovers by the ORIGINAL request key and refreshes only if it had committed", async () => {
    actions.saveIdentityAction.mockResolvedValue({ ok: false, code: "OUTCOME_UNKNOWN" });
    actions.recoverOperationAction.mockResolvedValue({ ok: true, recovery: { status: "COMMITTED", operation: "catalogue_step" } });
    mount(workflow(), "identity");
    await submitIdentity();
    await waitFor(() => screen.getByRole("button", { name: f018AdminEn.catalogueWorkflow.unknown.check }));
    const original = (actions.saveIdentityAction.mock.calls[0]![1] as FormData).get("requestId");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: f018AdminEn.catalogueWorkflow.unknown.check })); });
    await waitFor(() => expect(actions.recoverOperationAction).toHaveBeenCalledTimes(1));
    expect((actions.recoverOperationAction.mock.calls[0]![1] as FormData).get("requestId")).toBe(original);
    await waitFor(() => expect(screen.getByText(f018AdminEn.catalogueWorkflow.toasts.recoveredCommitted)).toBeTruthy());
    expect(router.refresh).toHaveBeenCalled();
  });

  it("shows inline, localized validation and does not rely on a toast alone", async () => {
    mount(workflow(), "identity");
    fireEvent.change(screen.getByLabelText(re(f018AdminEn.catalogueWorkflow.identity.slug)), { target: { value: "Bad Slug!" } });
    await submitIdentity();
    expect(await screen.findByText(f018AdminEn.catalogueWorkflow.validation.SLUG_INVALID)).toBeTruthy();
    expect(actions.saveIdentityAction).not.toHaveBeenCalled();
  });
});

describe("EN/AR parity", () => {
  const flatten = (value: unknown, prefix = ""): string[] =>
    value && typeof value === "object" ? Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => flatten(child, `${prefix}${key}.`)) : [prefix];
  it("every Feature 018 Admin string exists in both languages", () => {
    expect(flatten(f018AdminAr).sort()).toEqual(flatten(f018AdminEn).sort());
  });
  it("every error code the DAL can emit has a localized message", () => {
    const codes = ["AUTH_REQUIRED", "NOT_CAPABLE", "MFA_REQUIRED", "VALIDATION", "REVISION_CONFLICT", "REQUEST_CONFLICT", "SLUG_TAKEN", "NOT_FOUND", "ORIGIN_INACTIVE", "REFERENCE_INVALID", "NOT_READY", "NO_ELIGIBLE_STOCK", "STOCK_INSUFFICIENT", "ACTIVE_OFFER_EXISTS", "OFFER_INVALID", "OFFER_NOT_EDITABLE", "OFFER_NOT_APPROVED", "PUBLICATION_AUTHORITY_REQUIRED", "STATUS_INVALID", "MEDIA_INVALID", "MEDIA_LIMIT", "MEDIA_NOT_FOUND", "OUTCOME_UNKNOWN", "SAVE_FAILED"];
    for (const code of codes) {
      expect(f018AdminEn.catalogueWorkflow.errors).toHaveProperty(code);
      expect(f018AdminAr.catalogueWorkflow.errors).toHaveProperty(code);
    }
  });
});
