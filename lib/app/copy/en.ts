/**
 * The Member/Admin application shell copy dictionary (Phase 5.5, UIF-035/UIF-039/UIF-041).
 *
 * DELIBERATELY SEPARATE FROM `lib/public/copy` — not a second i18n SYSTEM (still the one i18next
 * instance, wired below through `lib/i18n/config.ts`), but a second CONTENT MODULE, and for a
 * concrete, tested reason: `tests/public/dto-structure.test.ts` scans every file under
 * `lib/public/` for denylisted private-table vocabulary (`organizations`, `payouts`, `disputes`,
 * `members`, ...) as a structural boundary on the audited PUBLIC read layer. Admin module NAMES —
 * honest UI labels naming a future operational area, nothing about a specific record — legitimately
 * contain exactly those words, so they cannot live inside `lib/public/*` without permanently
 * weakening that boundary test's guarantee for the surface it actually protects. This module is
 * simply outside its scan root.
 *
 * SERVER-SAFE BY CONSTRUCTION, same as `lib/public/copy`: no `"use client"`, no `react` import, no
 * `i18next` import. `getAppCopy(locale)` resolves untranslated Arabic keys to the reviewed English
 * exactly the way `lib/public/copy`'s `getCopy()` does — same honesty mechanism, same pattern,
 * different content root.
 *
 * WHAT BELONGS HERE: Member/Admin shell chrome — sidebar/topbar/drawer labels, landmark names,
 * breadcrumb copy, empty/forbidden-state copy for the two real guarded routes, and the NAMES (not
 * the content) of future operational modules the role-scalable navigation structure documents.
 *
 * WHAT DOES NOT: any business claim, KPI, count, or record. No module here is functionally
 * implemented (see `components/app/admin-navigation.tsx`, `member-navigation.tsx`).
 */
export const en = {
  skipToContent: "Skip to main content",
    sidebarNavigation: "Application",
    breadcrumbNavigation: "Breadcrumb",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    menuTitle: "Menu",
    /** `{workspace}` filled at render — "Member portal" / "Operations console". */
    menuDescription: "{workspace} navigation",
    collapseSidebar: "Collapse sidebar",
    expandSidebar: "Expand sidebar",
    memberWorkspace: "Member portal",
    adminWorkspace: "Operations console",
    overview: "Overview",
    account: "Account",
    settings: "Settings",
    signedInAs: "Signed in as {name}",
    /** Recorded honestly: this run's shells own no live operational modules yet. */
    modulesArriveLater: "Modules arrive with later features.",
    foundationOverview: {
      foundation: {
        title: "Your workspace foundation is ready",
        description:
          "This portal is prepared for your organization. Commercial, order and custody modules appear here only when their approved features are available.",
        currentTitle: "Available today",
        currentDescription: "Overview and account settings are available from the application navigation.",
      },
      operations: {
        title: "Operations workspace foundation is ready",
        description:
          "This console is ready for authorized operational work areas. Each future module will verify its own server-side role requirement before showing live records or actions.",
        currentTitle: "Available today",
        currentDescription: "The overview is available now. Role-specific operational areas arrive with Feature 010.",
      },
      boundaryTitle: "What this page does not show",
      boundaryDescription:
        "No sample figures, commercial records or placeholder actions are shown. Live information appears only when its approved module is implemented.",
    },
    noOrganization: {
      title: "No organization linked to your account",
      description:
        "Your account is not yet linked to an approved organization, so the member portal is unavailable. Hills Coffee operations complete this step as part of membership onboarding.",
    },
    organizationSelection: {
      title: "Choose which organization to act for",
      description:
        "Your account belongs to more than one organization. Choose which one you're acting for — you can switch later.",
      confirm: "Continue",
    },
    emailNotVerified: {
      title: "Verify your email to continue",
      description:
        "This area requires a verified email address. Check your inbox for the verification link, or request a new one.",
      resend: "Resend verification email",
    },
    /** Feature 003 T012 — the real, no-fake-modules onboarding/KYB-next experience. */
    onboarding: {
      steps: {
        account: "Create your account",
        verifyEmail: "Verify your email",
        businessProfile: "Business profile",
        kyb: "KYB verification",
        review: "Compliance review",
        access: "Access after approval",
      },
      form: {
        title: "Tell us about your business",
        lead: "This starts your membership application. Hills Coffee reviews every application before granting trading access.",
        buyerTitle: "Buy Coffee",
        buyerDescription: "Source green coffee from Hills once your membership is approved.",
        sellerTitle: "Buy & Sell Coffee",
        sellerDescription: "Buy from Hills and resell approved inventory once your membership is approved.",
        legalName: "Company legal name",
        displayName: "Trading name",
        optional: "optional",
        country: "Country",
        taxNumber: "Tax number",
        registrationNumber: "Company registration number",
        contactEmail: "Business contact email",
        contactPhone: "Business contact phone",
        consent: "I confirm this information is accurate and I'm authorized to submit it on behalf of this company.",
        submit: "Continue to KYB",
        submitting: "Submitting…",
        serverError: "We couldn't start your membership application. Please try again.",
      },
      awaitingKyb: {
        title: "Business profile complete — KYB verification is next",
        description:
          "Your company profile has been submitted. The next step is Know Your Business (KYB) verification, followed by Hills Compliance review. You'll be able to access trading features once your organization is approved.",
      },
    },
    noOperationalRole: {
      title: "Operations access required",
      description:
        "Your account is signed in, but it does not hold an operational role for the Hills Coffee operations console.",
    },
    seller: {
      groupLabel: "Selling",
      note: "Shown only when Feature 004 supplies can_sell = true for the acting organization.",
    },
    patternsNote:
      "Visual foundation only — no business data is read, and no module here is functionally implemented.",
    roleVisibilityNote:
      "Navigation visibility is never authorization. Each real module re-verifies its own role requirement server-side once it exists.",
    /**
     * Operations console module names (Phase 5.5, UIF-041). NAMES ONLY — module labels, not module
     * content. These feed the role-scalable navigation STRUCTURE (`admin-navigation.tsx`); none is
     * wired to a live `/dashboard-admin/*` route in this phase (§29 of the run's directive — "do
     * not create dead pages"), and none carries a count, KPI or record.
     */
    admin: {
      groups: {
        organizations: "Organizations",
        catalogue: "Catalogue",
        commercial: "Orders & finance",
        logistics: "Logistics",
        compliance: "Compliance",
        audit: "Audit",
      },
      modules: {
        organizations: "Organizations",
        members: "Members",
        kyb: "KYB",
        catalogue: "Catalogue",
        inventory: "Inventory",
        listings: "Listings",
        orders: "Orders",
        paymentProofs: "Payment proofs",
        finance: "Finance",
        settlement: "Settlement",
        payouts: "Payouts",
        pricing: "Pricing",
        commission: "Commission",
        delivery: "Delivery",
        disputes: "Disputes",
        audit: "Audit",
      },
    },

    /**
     * Feature 003 RUN B (T014–T022) — the member-facing KYB draft/upload/status experience.
     * `reviewerLabel` is always the literal constant the DB returns (`list_kyb_document_reviews`);
     * this dictionary never invents its own reviewer-identity string.
     */
    kyb: {
      hub: {
        eyebrow: "Business verification",
        noApplication: {
          title: "Start your KYB verification",
          description:
            "Know Your Business (KYB) verification is the next step. It confirms your company's identity, ownership, and banking details before Hills Compliance can approve trading access.",
          start: "Start KYB verification",
        },
        draft: {
          title: "Continue your KYB verification",
          description: "Your KYB application is in progress. Finish the remaining items to submit it for review.",
          continue: "Continue verification",
        },
        submitted: {
          title: "Your verification is under review",
          description:
            "Your documents were submitted. Hills Compliance will review them, and business/trading access remains locked until your organization is approved.",
        },
        underReview: {
          title: "Under review",
          description:
            "Hills Compliance is reviewing your KYB application. Business/trading access remains locked until your organization is approved.",
        },
        resubmissionRequired: {
          title: "Action needed on your verification",
          description: "Hills Compliance requested changes to specific items. Fix the items listed below to continue.",
          fix: "Fix these items",
          reviewedBy: "Reviewed by {reviewer}",
        },
        rejected: {
          title: "Your verification was not approved",
          description: "Hills Compliance did not approve this application.",
          reasonLabel: "Reason",
          noReason: "No reason was recorded for this decision.",
        },
        suspended: {
          title: "Your organization is suspended",
          description: "Trading access is currently restricted. Contact Hills Coffee for more information.",
        },
        approved: {
          title: "Verification approved",
          description: "Your organization is approved. Business access is being finalized for your account.",
        },
      },
      form: {
        title: "Business verification details",
        lead: "This information is reviewed by Hills Compliance alongside your submitted documents.",
        registeredAddress: "Registered business address",
        businessActivity: "Business activity",
        save: "Save",
        saving: "Saving…",
        saved: "Saved",
      },
      documents: {
        title: "Required documents",
        lead: "Upload each required document below. Accepted formats: PDF, JPEG, or PNG, up to 10 MB.",
        types: {
          TRADE_LICENSE: "Trade licence",
          PROOF_OF_INCORPORATION: "Proof of incorporation",
          AUTHORIZED_SIGNATORY_ID: "Authorized signatory identity document",
          UBO_DECLARATION: "Ultimate beneficial ownership declaration",
          BANKING_EVIDENCE: "Bank account evidence",
        },
        status: {
          missing: "Not uploaded",
          PENDING: "Submitted — awaiting review",
          ACCEPTED: "Accepted",
          REJECTED: "Rejected — replacement required",
        },
        upload: "Upload",
        replace: "Replace",
        uploading: "Uploading…",
        expiresOn: "Expires {date}",
        expired: "Expired {date} — upload a current document",
        rejectionReason: "Reason: {reason}",
        fileRequired: "Choose a file to upload.",
        invalidFileType: "Choose a PDF, JPEG, or PNG file.",
        fileTooLarge: "Choose a file that is 10 MB or smaller.",
      },
      completeness: {
        title: "Before you submit",
        allComplete: "Everything required is complete.",
        registeredAddressRequired: "Registered business address is required.",
        businessActivityRequired: "A description of your business activity is required.",
        documentRequired: "{document} is required or needs replacement.",
        itemRequired: "A required item is missing.",
      },
      submit: {
        submit: "Submit for review",
        submitting: "Submitting…",
        resubmit: "Resubmit for review",
        resubmitting: "Resubmitting…",
      },
      toast: {
        startFailed: "Could not start KYB verification. Please try again.",
        draftSaved: "Business details saved.",
        draftSaveFailed: "Could not save — please try again.",
        uploadSuccess: "Document uploaded.",
        uploadFailed: "Upload failed — please try again.",
        applicationNotEditable: "This application cannot accept documents right now.",
        replacementStale: "That document could not be replaced. Refresh and try again.",
        submitSuccess: "Application submitted for review.",
        submitFailed: "Could not submit — check the items below.",
        resubmitSuccess: "Application resubmitted for review.",
        resubmitFailed: "Could not resubmit — check the items below.",
      },
    },

    feedback: {
      signInRequired: "Please sign in to continue.",
      profileSaved: "Profile changes saved.",
      profileSaveFailed: "Could not save your profile. Please try again.",
    },

} as const;
