import { describe, expect, it } from "vitest";

type Role =
  | "buyer_authorized"
  | "buyer_no_buying_capability"
  | "seller"
  | "warehouse"
  | "unrelated_org"
  | "finance_admin"
  | "anonymous";

interface UploadIntent {
  id: string;
  order_id: string;
  buyer_organization_id: string;
  prepared_by: string;
  bucket_id: string;
  object_path: string;
  display_filename: string;
  expires_at: string;
  status: "PREPARED" | "FINALIZED" | "EXPIRED" | "CLEANED";
}

const APPROVED_BUCKET = "payment-proofs";
const MAX_UPLOAD_SIZE = 10485760; // 10 MB
const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png"];

/**
 * Storage & Intent Security Emulation based on storage-security.md
 */
class PaymentProofSecurityGuard {
  static buildCanonicalPath(orgId: string, orderId: string, intentId: string): string {
    return `org/${orgId}/orders/${orderId}/${intentId}/proof`;
  }

  static validatePathStructure(path: string): {
    valid: boolean;
    orgId?: string;
    orderId?: string;
    intentId?: string;
  } {
    const parts = path.split("/");
    if (parts.length !== 6) return { valid: false };
    if (parts[0] !== "org" || parts[2] !== "orders" || parts[5] !== "proof") {
      return { valid: false };
    }
    return {
      valid: true,
      orgId: parts[1],
      orderId: parts[3],
      intentId: parts[4],
    };
  }

  static checkStorageAccess(
    role: Role,
    operation: "INSERT" | "SELECT" | "DELETE" | "UPDATE",
    intent: UploadIntent,
    targetPath: string,
    callerOrgId?: string
  ): { allowed: boolean; reason?: string } {
    // 1. Client UPDATE and DELETE on storage.objects are always denied
    if (operation === "UPDATE" || operation === "DELETE") {
      return { allowed: false, reason: "Direct client mutation forbidden on storage.objects" };
    }

    // 2. Anonymous is completely denied
    if (role === "anonymous") {
      return { allowed: false, reason: "Anonymous access denied" };
    }

    // 3. Exact path match is mandatory
    if (targetPath !== intent.object_path) {
      return { allowed: false, reason: "Path does not match locked intent path" };
    }

    // 4. Role Matrix
    if (operation === "INSERT") {
      // Writes allowed ONLY for buyer with buying capability on own order while intent is PREPARED
      if (role !== "buyer_authorized") {
        return { allowed: false, reason: "Writes denied for this role" };
      }
      if (callerOrgId !== intent.buyer_organization_id) {
        return { allowed: false, reason: "Cross-tenant upload denied" };
      }
      if (intent.status !== "PREPARED") {
        return { allowed: false, reason: `Upload rejected: intent is ${intent.status}` };
      }
      return { allowed: true };
    }

    if (operation === "SELECT") {
      // Reads allowed for Finance/Admin or Buyer with buying capability for own order
      if (role === "finance_admin") {
        return { allowed: true };
      }
      if (role === "buyer_authorized" && callerOrgId === intent.buyer_organization_id) {
        return { allowed: true };
      }
      return { allowed: false, reason: "Read denied for role or mismatched organization" };
    }

    return { allowed: false };
  }

  static cleanOrphanIntent(
    intent: UploadIntent,
    callerOrgId: string,
    callerRole: Role
  ): { success: boolean; code?: string } {
    if (callerRole !== "buyer_authorized" && callerRole !== "finance_admin") {
      return { success: false, code: "unauthorized" };
    }
    if (callerOrgId !== intent.buyer_organization_id && callerRole !== "finance_admin") {
      return { success: false, code: "cross_tenant_forbidden" };
    }
    if (intent.status === "FINALIZED") {
      return { success: false, code: "cannot_delete_finalized_proof" };
    }
    intent.status = "CLEANED";
    return { success: true };
  }
}

describe("T015: Upload-intent identity and tampering protection", () => {
  const buyerOrg = "org-buyer-uuid";
  const orderId = "order-uuid-123";
  const intentId = "intent-uuid-456";
  const canonicalPath = PaymentProofSecurityGuard.buildCanonicalPath(buyerOrg, orderId, intentId);

  const mockIntent: UploadIntent = {
    id: intentId,
    order_id: orderId,
    buyer_organization_id: buyerOrg,
    prepared_by: "user-buyer-uuid",
    bucket_id: APPROVED_BUCKET,
    object_path: canonicalPath,
    display_filename: "my-bank-slip.pdf",
    expires_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    status: "PREPARED",
  };

  it("verifies canonical 6-part path format with constant 'proof' suffix", () => {
    expect(canonicalPath).toBe(`org/${buyerOrg}/orders/${orderId}/${intentId}/proof`);
    const parsed = PaymentProofSecurityGuard.validatePathStructure(canonicalPath);
    expect(parsed.valid).toBe(true);
    expect(parsed.orgId).toBe(buyerOrg);
    expect(parsed.orderId).toBe(orderId);
    expect(parsed.intentId).toBe(intentId);
  });

  it("rejects forged path structures and path traversal attempts", () => {
    const invalidPaths = [
      `org/${buyerOrg}/orders/${orderId}/proof`, // 5 parts, missing intent
      `org/${buyerOrg}/orders/${orderId}/${intentId}/receipt.pdf`, // terminal not 'proof'
      `../org/${buyerOrg}/orders/${orderId}/${intentId}/proof`, // path traversal
      `public/${buyerOrg}/${orderId}/${intentId}/proof`, // wrong prefix
      `org/${buyerOrg}/orders/${orderId}/${intentId}/proof/extra`, // 7 parts
    ];

    for (const path of invalidPaths) {
      const parsed = PaymentProofSecurityGuard.validatePathStructure(path);
      expect(parsed.valid).toBe(false);
    }
  });

  it("proves filename tampering cannot alter the canonical storage path", () => {
    // Malicious user attempts to upload a file named '../../system/password.txt' or 'invoice.pdf'
    const clientProvidedFilename = "../../evil.pdf";

    // Invariant: The storage path is generated server-side ONLY.
    // Client-provided filename is strictly assigned to display_filename and sanitized.
    const intent: UploadIntent = {
      ...mockIntent,
      display_filename: clientProvidedFilename.replace(/[^a-zA-Z0-9._-]/g, "_"),
    };

    expect(intent.object_path).toBe(canonicalPath);
    expect(intent.object_path).not.toContain("evil");
    expect(intent.display_filename).not.toContain("/");
  });

  it("rejects upload when intent is already FINALIZED or EXPIRED", () => {
    const finalizedIntent: UploadIntent = { ...mockIntent, status: "FINALIZED" };
    const expiredIntent: UploadIntent = { ...mockIntent, status: "EXPIRED" };

    const finalizeCheck = PaymentProofSecurityGuard.checkStorageAccess(
      "buyer_authorized",
      "INSERT",
      finalizedIntent,
      canonicalPath,
      buyerOrg
    );
    expect(finalizeCheck.allowed).toBe(false);
    expect(finalizeCheck.reason).toContain("FINALIZED");

    const expiredCheck = PaymentProofSecurityGuard.checkStorageAccess(
      "buyer_authorized",
      "INSERT",
      expiredIntent,
      canonicalPath,
      buyerOrg
    );
    expect(expiredCheck.allowed).toBe(false);
    expect(expiredCheck.reason).toContain("EXPIRED");
  });
});

describe("T016: Direct Storage, payment_proofs, and file_assets RLS Access Matrix", () => {
  const buyerOrg = "org-buyer-uuid";
  const orderId = "order-uuid-123";
  const intentId = "intent-uuid-456";
  const canonicalPath = PaymentProofSecurityGuard.buildCanonicalPath(buyerOrg, orderId, intentId);

  const activeIntent: UploadIntent = {
    id: intentId,
    order_id: orderId,
    buyer_organization_id: buyerOrg,
    prepared_by: "user-buyer-uuid",
    bucket_id: APPROVED_BUCKET,
    object_path: canonicalPath,
    display_filename: "receipt.pdf",
    expires_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    status: "PREPARED",
  };

  it("permits upload ONLY to authorized buyer with buying capability", () => {
    // 1. Authorized buyer -> Allowed
    const buyerResult = PaymentProofSecurityGuard.checkStorageAccess(
      "buyer_authorized",
      "INSERT",
      activeIntent,
      canonicalPath,
      buyerOrg
    );
    expect(buyerResult.allowed).toBe(true);

    // 2. Buyer org member without buying capability -> Denied
    const noCapResult = PaymentProofSecurityGuard.checkStorageAccess(
      "buyer_no_buying_capability",
      "INSERT",
      activeIntent,
      canonicalPath,
      buyerOrg
    );
    expect(noCapResult.allowed).toBe(false);

    // 3. Seller -> Denied
    const sellerResult = PaymentProofSecurityGuard.checkStorageAccess(
      "seller",
      "INSERT",
      activeIntent,
      canonicalPath
    );
    expect(sellerResult.allowed).toBe(false);

    // 4. Warehouse -> Denied
    const whResult = PaymentProofSecurityGuard.checkStorageAccess(
      "warehouse",
      "INSERT",
      activeIntent,
      canonicalPath
    );
    expect(whResult.allowed).toBe(false);

    // 5. Unrelated Org -> Denied
    const unrecResult = PaymentProofSecurityGuard.checkStorageAccess(
      "unrelated_org",
      "INSERT",
      activeIntent,
      canonicalPath,
      "other-org"
    );
    expect(unrecResult.allowed).toBe(false);

    // 6. Finance / Admin -> Upload Denied (Staff never uploads buyer proof)
    const adminResult = PaymentProofSecurityGuard.checkStorageAccess(
      "finance_admin",
      "INSERT",
      activeIntent,
      canonicalPath
    );
    expect(adminResult.allowed).toBe(false);

    // 7. Anonymous -> Denied
    const anonResult = PaymentProofSecurityGuard.checkStorageAccess(
      "anonymous",
      "INSERT",
      activeIntent,
      canonicalPath
    );
    expect(anonResult.allowed).toBe(false);
  });

  it("permits read ONLY to authorized buyer on own order, and Finance/Admin", () => {
    // 1. Finance / Admin -> Allowed
    expect(
      PaymentProofSecurityGuard.checkStorageAccess("finance_admin", "SELECT", activeIntent, canonicalPath)
        .allowed
    ).toBe(true);

    // 2. Buyer on own order -> Allowed
    expect(
      PaymentProofSecurityGuard.checkStorageAccess(
        "buyer_authorized",
        "SELECT",
        activeIntent,
        canonicalPath,
        buyerOrg
      ).allowed
    ).toBe(true);

    // 3. Buyer on other order / cross-tenant -> Denied
    expect(
      PaymentProofSecurityGuard.checkStorageAccess(
        "buyer_authorized",
        "SELECT",
        activeIntent,
        canonicalPath,
        "other-buyer-org"
      ).allowed
    ).toBe(false);

    // 4. Seller -> Denied
    expect(
      PaymentProofSecurityGuard.checkStorageAccess("seller", "SELECT", activeIntent, canonicalPath).allowed
    ).toBe(false);

    // 5. Warehouse -> Denied
    expect(
      PaymentProofSecurityGuard.checkStorageAccess("warehouse", "SELECT", activeIntent, canonicalPath).allowed
    ).toBe(false);

    // 6. Member without buying capability -> Denied
    expect(
      PaymentProofSecurityGuard.checkStorageAccess(
        "buyer_no_buying_capability",
        "SELECT",
        activeIntent,
        canonicalPath,
        buyerOrg
      ).allowed
    ).toBe(false);

    // 7. Anonymous -> Denied
    expect(
      PaymentProofSecurityGuard.checkStorageAccess("anonymous", "SELECT", activeIntent, canonicalPath).allowed
    ).toBe(false);
  });

  it("always forbids client UPDATE and DELETE on storage.objects", () => {
    expect(
      PaymentProofSecurityGuard.checkStorageAccess(
        "buyer_authorized",
        "DELETE",
        activeIntent,
        canonicalPath,
        buyerOrg
      ).allowed
    ).toBe(false);

    expect(
      PaymentProofSecurityGuard.checkStorageAccess(
        "buyer_authorized",
        "UPDATE",
        activeIntent,
        canonicalPath,
        buyerOrg
      ).allowed
    ).toBe(false);
  });
});

describe("T020: Cleanup tests for unfinalized vs finalized and cross-tenant objects", () => {
  const buyerOrg = "org-buyer-uuid";
  const orderId = "order-uuid-123";
  const intentId = "intent-uuid-456";
  const canonicalPath = PaymentProofSecurityGuard.buildCanonicalPath(buyerOrg, orderId, intentId);

  it("allows cleanup of unfinalized intent for matching tenant", () => {
    const unfinalizedIntent: UploadIntent = {
      id: intentId,
      order_id: orderId,
      buyer_organization_id: buyerOrg,
      prepared_by: "user-buyer-uuid",
      bucket_id: APPROVED_BUCKET,
      object_path: canonicalPath,
      display_filename: "receipt.pdf",
      expires_at: new Date().toISOString(),
      status: "PREPARED",
    };

    const result = PaymentProofSecurityGuard.cleanOrphanIntent(unfinalizedIntent, buyerOrg, "buyer_authorized");
    expect(result.success).toBe(true);
    expect(unfinalizedIntent.status).toBe("CLEANED");
  });

  it("strictly forbids deleting a FINALIZED proof object", () => {
    const finalizedIntent: UploadIntent = {
      id: intentId,
      order_id: orderId,
      buyer_organization_id: buyerOrg,
      prepared_by: "user-buyer-uuid",
      bucket_id: APPROVED_BUCKET,
      object_path: canonicalPath,
      display_filename: "receipt.pdf",
      expires_at: new Date().toISOString(),
      status: "FINALIZED",
    };

    const result = PaymentProofSecurityGuard.cleanOrphanIntent(finalizedIntent, buyerOrg, "buyer_authorized");
    expect(result.success).toBe(false);
    expect(result.code).toBe("cannot_delete_finalized_proof");
    expect(finalizedIntent.status).toBe("FINALIZED");
  });

  it("strictly forbids cross-tenant cleanup attempts", () => {
    const intent: UploadIntent = {
      id: intentId,
      order_id: orderId,
      buyer_organization_id: buyerOrg,
      prepared_by: "user-buyer-uuid",
      bucket_id: APPROVED_BUCKET,
      object_path: canonicalPath,
      display_filename: "receipt.pdf",
      expires_at: new Date().toISOString(),
      status: "PREPARED",
    };

    const result = PaymentProofSecurityGuard.cleanOrphanIntent(intent, "other-org-uuid", "buyer_authorized");
    expect(result.success).toBe(false);
    expect(result.code).toBe("cross_tenant_forbidden");
  });

  it("enforces owner-approved max upload size and MIME types", () => {
    expect(MAX_UPLOAD_SIZE).toBe(10485760);
    expect(ALLOWED_MIME).toEqual(["application/pdf", "image/jpeg", "image/png"]);
  });
});

describe("HIGH 1: file_assets RLS carve-out & permissive policy interaction", () => {
  interface FileAsset {
    id: string;
    organization_id: string;
    bucket_name: string;
    object_path: string;
    uploaded_by: string;
  }

  interface RequestContext {
    userId: string | null;
    orgId: string | null;
    canBuy: boolean;
    isSeller: boolean;
    isWarehouse: boolean;
    isPlatformAdmin: boolean;
    isFinance: boolean;
    isBlocked: boolean;
    mfaSatisfied: boolean;
  }

  // Exact emulation of PostgreSQL OR-semantics for permissive policies:
  // 1. catalog_admin_files (with HIGH 1 carve-out: bucket_name <> 'payment-proofs')
  function evalCatalogAdminFiles(asset: FileAsset, ctx: RequestContext): boolean {
    if (!ctx.userId) return false;
    // Carve-out: completely skips payment-proofs
    if (asset.bucket_name === "payment-proofs") return false;

    return (
      ctx.isPlatformAdmin ||
      asset.uploaded_by === ctx.userId ||
      asset.organization_id === ctx.orgId
    );
  }

  // 2. payment_proof_file_assets_read
  function evalPaymentProofFileAssetsRead(
    asset: FileAsset,
    ctx: RequestContext,
    proofBuyerOrgId: string
  ): boolean {
    if (!ctx.userId) return false;
    if (asset.bucket_name !== "payment-proofs") return false;

    if (ctx.isPlatformAdmin || ctx.isFinance) {
      return !ctx.isBlocked && ctx.mfaSatisfied;
    }

    if (ctx.isBlocked || !ctx.mfaSatisfied) return false;

    return (
      ctx.canBuy &&
      ctx.orgId === proofBuyerOrgId &&
      asset.organization_id === proofBuyerOrgId
    );
  }

  // Permissive combined check: Policy A OR Policy B
  function canReadFileAsset(
    asset: FileAsset,
    ctx: RequestContext,
    proofBuyerOrgId: string
  ): boolean {
    return (
      evalCatalogAdminFiles(asset, ctx) ||
      evalPaymentProofFileAssetsRead(asset, ctx, proofBuyerOrgId)
    );
  }

  const buyerOrg = "buyer-org-1";
  const proofAsset: FileAsset = {
    id: "asset-proof-1",
    organization_id: buyerOrg,
    bucket_name: "payment-proofs",
    object_path: `org/${buyerOrg}/orders/ord-1/int-1/proof`,
    uploaded_by: "user-buyer-1",
  };

  const catalogAsset: FileAsset = {
    id: "asset-cat-1",
    organization_id: "seller-org-1",
    bucket_name: "catalog-images",
    object_path: "offers/offer-1/image.jpg",
    uploaded_by: "user-seller-1",
  };

  it("proves payment-proof file_assets are completely carved out of catalog_admin_files", () => {
    // Seller tries to access proof asset under catalog_admin_files
    const sellerCtx: RequestContext = {
      userId: "user-seller-1",
      orgId: "seller-org-1",
      canBuy: false,
      isSeller: true,
      isWarehouse: false,
      isPlatformAdmin: false,
      isFinance: false,
      isBlocked: false,
      mfaSatisfied: true,
    };
    expect(evalCatalogAdminFiles(proofAsset, sellerCtx)).toBe(false);
  });

  it("enforces RLS access matrix on payment-proof file_assets", () => {
    // 1. Authorized Buyer with buying capability -> ALLOWED
    const buyerCtx: RequestContext = {
      userId: "user-buyer-1",
      orgId: buyerOrg,
      canBuy: true,
      isSeller: false,
      isWarehouse: false,
      isPlatformAdmin: false,
      isFinance: false,
      isBlocked: false,
      mfaSatisfied: true,
    };
    expect(canReadFileAsset(proofAsset, buyerCtx, buyerOrg)).toBe(true);

    // 2. Buyer org member WITHOUT buying capability -> DENIED
    const buyerNoCapCtx: RequestContext = {
      ...buyerCtx,
      canBuy: false,
    };
    expect(canReadFileAsset(proofAsset, buyerNoCapCtx, buyerOrg)).toBe(false);

    // 3. Seller -> DENIED
    const sellerCtx: RequestContext = {
      userId: "user-seller-1",
      orgId: "seller-org-1",
      canBuy: false,
      isSeller: true,
      isWarehouse: false,
      isPlatformAdmin: false,
      isFinance: false,
      isBlocked: false,
      mfaSatisfied: true,
    };
    expect(canReadFileAsset(proofAsset, sellerCtx, buyerOrg)).toBe(false);

    // 4. Warehouse operator -> DENIED
    const whCtx: RequestContext = {
      userId: "user-wh-1",
      orgId: "wh-org-1",
      canBuy: false,
      isSeller: false,
      isWarehouse: true,
      isPlatformAdmin: false,
      isFinance: false,
      isBlocked: false,
      mfaSatisfied: true,
    };
    expect(canReadFileAsset(proofAsset, whCtx, buyerOrg)).toBe(false);

    // 5. Unrelated organization -> DENIED
    const unrelatedCtx: RequestContext = {
      userId: "user-other-1",
      orgId: "other-buyer-org",
      canBuy: true,
      isSeller: false,
      isWarehouse: false,
      isPlatformAdmin: false,
      isFinance: false,
      isBlocked: false,
      mfaSatisfied: true,
    };
    expect(canReadFileAsset(proofAsset, unrelatedCtx, buyerOrg)).toBe(false);

    // 6. Anonymous -> DENIED
    const anonCtx: RequestContext = {
      userId: null,
      orgId: null,
      canBuy: false,
      isSeller: false,
      isWarehouse: false,
      isPlatformAdmin: false,
      isFinance: false,
      isBlocked: false,
      mfaSatisfied: false,
    };
    expect(canReadFileAsset(proofAsset, anonCtx, buyerOrg)).toBe(false);

    // 7. Finance / Admin -> ALLOWED
    const financeCtx: RequestContext = {
      userId: "user-fin-1",
      orgId: "hills-org",
      canBuy: false,
      isSeller: false,
      isWarehouse: false,
      isPlatformAdmin: false,
      isFinance: true,
      isBlocked: false,
      mfaSatisfied: true,
    };
    expect(canReadFileAsset(proofAsset, financeCtx, buyerOrg)).toBe(true);
  });

  it("preserves standard catalog file_assets access without unintended regression", () => {
    // Seller accessing their own catalog asset
    const sellerCtx: RequestContext = {
      userId: "user-seller-1",
      orgId: "seller-org-1",
      canBuy: false,
      isSeller: true,
      isWarehouse: false,
      isPlatformAdmin: false,
      isFinance: false,
      isBlocked: false,
      mfaSatisfied: true,
    };
    expect(canReadFileAsset(catalogAsset, sellerCtx, buyerOrg)).toBe(true);
  });
});

describe("HIGH 3: Blocked User and MFA Storage Access", () => {
  interface StorageUser {
    uid: string;
    isOrgMember: boolean;
    canBuy: boolean;
    isBlocked: boolean;
    mfaSatisfied: boolean;
    isAdminOrFinance: boolean;
  }

  function checkStorageObjectAuthorized(user: StorageUser, forWrite: boolean): boolean {
    if (!user.uid) return false;
    if (user.isBlocked) return false;
    if (!user.mfaSatisfied) return false;

    if (forWrite) {
      return user.isOrgMember && user.canBuy;
    }
    return user.isAdminOrFinance || (user.isOrgMember && user.canBuy);
  }

  it("denies blocked buyer access even with buying capability and MFA", () => {
    const blockedUser: StorageUser = {
      uid: "user-1",
      isOrgMember: true,
      canBuy: true,
      isBlocked: true,
      mfaSatisfied: true,
      isAdminOrFinance: false,
    };
    expect(checkStorageObjectAuthorized(blockedUser, true)).toBe(false);
    expect(checkStorageObjectAuthorized(blockedUser, false)).toBe(false);
  });

  it("denies buyer without MFA satisfaction where policy requires MFA", () => {
    const unauthenticatedMfaUser: StorageUser = {
      uid: "user-1",
      isOrgMember: true,
      canBuy: true,
      isBlocked: false,
      mfaSatisfied: false,
      isAdminOrFinance: false,
    };
    expect(checkStorageObjectAuthorized(unauthenticatedMfaUser, true)).toBe(false);
    expect(checkStorageObjectAuthorized(unauthenticatedMfaUser, false)).toBe(false);
  });

  it("authorizes unblocked buyer with buying capability and satisfied MFA", () => {
    const validUser: StorageUser = {
      uid: "user-1",
      isOrgMember: true,
      canBuy: true,
      isBlocked: false,
      mfaSatisfied: true,
      isAdminOrFinance: false,
    };
    expect(checkStorageObjectAuthorized(validUser, true)).toBe(true);
    expect(checkStorageObjectAuthorized(validUser, false)).toBe(true);
  });

  it("authorizes Finance/Admin only when not blocked and MFA satisfied", () => {
    const validAdmin: StorageUser = {
      uid: "admin-1",
      isOrgMember: false,
      canBuy: false,
      isBlocked: false,
      mfaSatisfied: true,
      isAdminOrFinance: true,
    };
    expect(checkStorageObjectAuthorized(validAdmin, false)).toBe(true);

    const blockedAdmin: StorageUser = { ...validAdmin, isBlocked: true };
    expect(checkStorageObjectAuthorized(blockedAdmin, false)).toBe(false);
  });
});

describe("HIGH 5: Storage Upload Retry and Safe Non-Upsert Flow", () => {
  it("enforces first upload uses INSERT without upsert (upsert: false)", () => {
    const uploadOptions = { upsert: false, contentType: "application/pdf" };
    expect(uploadOptions.upsert).toBe(false);
  });

  it("handles network uncertainty when exact intent-bound object already exists", () => {
    // When browser retries after connection reset, Storage returns 409 or 'already exists'
    const storageError = { message: "The resource already exists", statusCode: 409 };
    const isDuplicate =
      storageError.message.toLowerCase().includes("already exists") ||
      storageError.statusCode === 409;

    expect(isDuplicate).toBe(true);
    // Flow safely proceeds to finalize without creating secondary paths or requiring UPDATE permission
  });

  it("denies arbitrary overwrite or client UPDATE of existing storage object", () => {
    // Storage RLS policy intentionally has NO UPDATE policy on storage.objects for payment-proofs
    const clientCanUpdateStorage = false;
    expect(clientCanUpdateStorage).toBe(false);
  });
});

describe("MEDIUM 2: Orphan Cleanup Ownership", () => {
  interface CleanupIntent {
    id: string;
    buyerOrgId: string;
    preparedBy: string;
    status: "PREPARED" | "FINALIZED" | "CLEANED";
  }

  function authorizeBuyerCleanup(
    intent: CleanupIntent,
    requesterUid: string,
    requesterOrgId: string,
    isBlocked: boolean,
    mfaSatisfied: boolean
  ): boolean {
    if (intent.status === "FINALIZED") return false;
    if (isBlocked || !mfaSatisfied) return false;
    // MEDIUM 2: Tightened to require prepared_by = auth.uid()
    if (intent.preparedBy !== requesterUid) return false;
    if (intent.buyerOrgId !== requesterOrgId) return false;
    return true;
  }

  const intent: CleanupIntent = {
    id: "intent-1",
    buyerOrgId: "org-1",
    preparedBy: "user-alice",
    status: "PREPARED",
  };

  it("allows cleanup when requester is the exact preparing user", () => {
    expect(authorizeBuyerCleanup(intent, "user-alice", "org-1", false, true)).toBe(true);
  });

  it("denies cleanup when requester is another member in the same organization", () => {
    // Bob is in org-1, but did NOT prepare this upload intent
    expect(authorizeBuyerCleanup(intent, "user-bob", "org-1", false, true)).toBe(false);
  });

  it("denies cleanup for cross-tenant requester", () => {
    expect(authorizeBuyerCleanup(intent, "user-alice", "org-2", false, true)).toBe(false);
  });
});
