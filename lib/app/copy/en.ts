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
    /**
     * Feature 004 T006 — the topbar's reserved notification entry. `unavailable` is the ONLY
     * behaviour this entry has: no unread count, no dropdown content, no mark-read action. Real
     * notification delivery is 012's scope (DB-BLOCK-04); this copy exists so the reserved control
     * has an honest, localized accessible name/state rather than a silent disabled icon.
     */
    notifications: {
      label: "Notifications",
      unavailable: "Notifications aren't available yet.",
    },
    /**
     * Feature 004 T003 — the overview's always-present "account" area (`lib/dashboard/overview.ts`).
     * Composed directly from `RequestIdentity`/`OrganizationMembership`, never through the module
     * registry — see that file's header comment.
     */
    dashboardAccount: {
      cardTitle: "Your organization",
      roleLabel: "Your role",
      /**
       * Feature 004 T012 (RUN B) — the account-menu display-name fallback for a profile with no
       * `fullName`/`companyName` set. Resolved CLIENT-SIDE via `useLocale().tApp` inside
       * `DashboardAccountMenu`, not pre-resolved server-side, so it renders in the viewer's actual
       * locale rather than always English (the earlier, narrower pattern
       * `components/public/site-header.tsx` already used and this run deliberately does not touch).
       */
      fallbackName: "Account",
    },
    /** Feature 004 T009 — the compact acting-organization switcher rendered in the topbar. */
    dashboardOrgSwitcher: {
      label: "Switch acting organization",
    },
    /**
     * Feature 004 T011–T014 — the live member overview page's section titles and honest empty
     * states. Every area explains what WOULD appear there once relevant activity exists — never a
     * fabricated zero (`0 orders`, `$0`) for a module that has not been implemented yet.
     */
    dashboardOverview: {
      bought: {
        title: "What you've bought",
        empty: "Your completed purchases will appear here once you place an order.",
      },
      owe: {
        title: "What you owe",
        empty: "Any outstanding balance will appear here once an order is invoiced.",
      },
      where: {
        title: "Where it is",
        empty: "Delivery and custody status will appear here once you have coffee in transit or storage.",
      },
      needsAction: {
        title: "Needs your action",
        empty: "Nothing needs your attention right now.",
        acceptAgreements: "Accept the current membership agreements",
      },
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
      organizationContactSaved: "Business contact details saved.",
      organizationContactSaveFailed: "Could not save business contact details. Please try again.",
      actingOrganizationSwitchFailed: "Could not switch organization. Please try again.",
      mfaStepUpRequired: "Please complete your sign-in verification to continue.",
      mfaStepUpAction: "Verify now",
    },

    /**
     * Feature 003 Phase 6 (T023–T025). `types.*` keys mirror `lib/auth/agreements.ts`'s
     * `AGREEMENT_TYPES` exactly — one label per closed registry entry, never invented. No real legal
     * text exists yet (`documentHash === "PENDING_LEGAL_DOCUMENT"`), so `documentPending` is the
     * only content shown for that state — never fabricated legal prose.
     */
    agreements: {
      eyebrow: "Required agreements",
      title: "Accept required agreements",
      lead: "Your organization is approved. Review and accept each agreement below to continue.",
      types: {
        platform_terms: "Platform Terms of Use",
        purchase_terms: "Purchase Terms",
        storage_custody_terms: "Storage & Custody Terms",
        marketplace_terms: "Marketplace Terms",
        privacy_policy: "Privacy Policy",
      },
      versionLabel: "Version {version}",
      acceptedOn: "Accepted on {date}",
      staleAcceptance: "You accepted version {version} on {date}. A newer version is available and must be accepted.",
      notAccepted: "Not yet accepted.",
      documentPending: "Full legal text is pending Hills Coffee Legal approval.",
      documentReference: "See the current agreement document for full terms.",
      accept: "Accept",
      accepting: "Accepting…",
      toast: {
        accepted: "Agreement accepted.",
        acceptFailed: "Could not record your acceptance. Please try again.",
      },
    },

    /**
     * Feature 003 Phase 7 (T027) — personal profile self-service. `companyNameHint` exists
     * specifically to prevent the directive's named risk: a member reading `companyName` as the
     * organization's legal/trading identity. It is legacy/personal profile data only — the real
     * organization identity lives in the separate `organization.*` section below, backed by
     * `update_organization_contact`, never this field.
     */
    settingsPage: {
      description: "Manage your personal profile and your organization's business contact details.",
    },
    profile: {
      title: "Personal profile",
      lead: "Your own account details. This is separate from your organization's business contact information.",
      fullName: "Full name",
      phone: "Personal phone",
      companyName: "Company name (personal note)",
      companyNameHint: "Legacy personal field — not your organization's official trading name or legal identity.",
      avatarFallbackHint: "Shown as your initials. No avatar upload is available yet.",
      save: "Save",
      saving: "Saving…",
    },

    /** Feature 003 Phase 7 (T026–T028) — organization contact self-service + membership view. */
    organization: {
      title: "Organization",
      lead: "Business contact details shown to Hills Coffee and, where applicable, to trading counterparties.",
      displayName: "Trading name",
      email: "Business email",
      phone: "Business phone",
      save: "Save",
      saving: "Saving…",
    },
    membership: {
      title: "Team members",
      lead: "Members of your acting organization.",
      you: "You",
      roleOwner: "Owner",
      roleMember: "Member",
      memberSince: "Member since {date}",
      nameNotVisible: "Team member",
    },
    actingOrganization: {
      title: "Acting organization",
      lead: "You belong to more than one organization. Choose which one you're acting for.",
      current: "Current",
      switchTo: "Switch to {organization}",
    },

    /**
     * Feature 005 RUN B (T007–T012, T015) — member inventory/custody/history surfaces.
     *
     * QUANTITY LABELING (Feature 005 reconciliation, 2026-09-12): `inventory_positions` exposes
     * exactly two authoritative columns, `available_quantity_kg` and `reserved_quantity_kg`. Live
     * function tracing (`checkout_order`, `admin_review_payment`) proved `available_quantity_kg` is
     * the position's TOTAL/gross OWNED quantity, not "currently free to trade" as its column name
     * might suggest — the database has no column, view or function for a distinct "owned" or
     * "available to trade now" figure. `ownedQuantity`/`reservedQuantity` below are therefore the
     * ONLY two quantity labels this dictionary defines for a position; there is deliberately no
     * third "available"/"free" label, since presenting one would either misuse the misleading raw
     * column name or require the forbidden `owned - reserved` arithmetic.
     */
    inventory: {
      nav: {
        inventory: "Inventory",
        storage: "Storage",
      },
      overview: {
        positionsCard: "Owned positions",
        positionsValue: "{count} position",
        positionsValuePlural: "{count} positions",
        storedCard: "In Hills custody",
        storedValue: "{count} allocation",
        storedValuePlural: "{count} allocations",
      },
      list: {
        title: "Inventory",
        description: "Coffee your organization owns, and where it is held.",
        caption: "Your inventory positions",
        empty: {
          title: "No inventory yet",
          description: "Positions appear here once a purchase settles into your organization's custody.",
        },
        columns: {
          lot: "Lot",
          warehouse: "Warehouse",
          ownedQuantity: "Owned quantity",
          reservedQuantity: "Reserved quantity",
          actions: "Actions",
        },
        lotUnavailable: "Lot detail unavailable",
        warehouseUnavailable: "Warehouse detail unavailable",
        viewDetails: "View position",
        pagination: {
          previous: "Previous",
          next: "Next",
          pageLabel: "Page {page}",
        },
      },
      detail: {
        title: "Position",
        breadcrumb: "Inventory",
        lotHeading: "Lot",
        lotUnavailable: {
          title: "Lot detail unavailable",
          description: "This position is genuinely yours — its coffee/lot detail is not readable under current access rules.",
        },
        warehouseHeading: "Custody location",
        warehouseUnavailable: "Warehouse detail unavailable.",
        recordedSince: "Recorded since {date}",
        updated: "Last updated {date}",
      },
      availability: {
        title: "Availability",
        ownedQuantity: "Owned quantity",
        reservedQuantity: "Reserved quantity",
        reservationCause: {
          heading: "Reservation",
          knownOrder: "Reserved against order {orderCode}",
          knownHoldExpires: "Hold expires {date}",
          knownNoCode: "Reserved against an order you can view.",
          unknown: "Reservation details are unavailable right now.",
          none: "No quantity is currently reserved.",
        },
        integrityError: {
          title: "Data integrity issue",
          description: "This position's reserved quantity does not fit within its owned quantity. Contact Hills Coffee support.",
        },
      },
      storage: {
        title: "Storage",
        description: "Your coffee in Hills-approved custody, by allocation.",
        caption: "Your storage allocations",
        empty: {
          title: "Nothing in storage yet",
          description: "Allocations appear here once your purchased coffee is placed into custody.",
        },
        columns: {
          status: "Status",
          allocatedQuantity: "Allocated quantity",
          releasedQuantity: "Released quantity",
          order: "Order",
        },
        status: {
          STORED: "Stored",
          RELEASED: "Released",
          DELIVERED: "Delivered",
        },
        orderUnavailable: "Order reference unavailable",
      },
      history: {
        title: "Ownership history",
        breadcrumb: "Inventory",
        description: "An immutable record of how ownership of your coffee came to be. Nothing here can be edited or removed.",
        empty: {
          title: "No history yet",
          description: "Ownership events appear here once your organization is party to a transfer.",
        },
        eventType: {
          INITIAL_ALLOCATION: "Initial allocation",
          SALE: "Sale",
          RESALE: "Resale",
          ADJUSTMENT: "Adjustment",
          VOID: "Void",
        },
        direction: {
          incoming: "To your organization",
          outgoing: "From your organization",
          both: "Internal transfer",
        },
        counterpartyRedacted: "Another organization",
        reasonLabel: "Reason",
        correlationLabel: "Reference",
        immutableNote: "This history is read-only and cannot be edited, corrected or reordered.",
      },
      notFound: {
        title: "Position not found",
        description: "This position doesn't exist or isn't available to your organization.",
        backAction: "Back to inventory",
      },
    },

    /** Feature 006 RUN B (T009/T010) — the private marketplace browse/detail experience. */
    marketplace: {
      title: "Marketplace",
      breadcrumb: "Marketplace",
      browse: {
        description: "Coffee available to authorized members right now.",
        searchLabel: "Search listings",
        searchPlaceholder: "Search by title",
        caption: "Marketplace listings",
        resultsNote: "Showing {count} listing",
        resultsNotePlural: "Showing {count} listings",
        empty: {
          title: "No listings match your search",
          description: "Try a different search, or check back soon — new listings appear here as they go live.",
        },
        emptyNoSearch: {
          title: "No listings are live yet",
          description: "Published listings from Hills Coffee and verified sellers will appear here.",
        },
        pagination: {
          previous: "Previous",
          next: "Next",
          pageLabel: "Page {page}",
        },
      },
      card: {
        sellerLabel: "Seller",
        sellerType: {
          HILLS: "Hills Coffee",
          MEMBER_SELLER: "Verified seller",
        },
        priceUnit: "/ kg",
        viewDetails: "View listing",
      },
      detail: {
        breadcrumb: "Marketplace",
        backAction: "Back to marketplace",
        notFound: {
          title: "Listing not available",
          description: "This listing does not exist, or is not currently available to you.",
        },
        lotHeading: "Lot",
        coffeeLabel: "Coffee",
        lotCodeLabel: "Lot code",
        cropYearLabel: "Crop year",
        qualityGradeLabel: "Quality grade",
        lotUnavailable: {
          title: "Detailed lot information is currently unavailable",
          description: "This listing is genuine — its underlying lot detail cannot be shown under current access rules.",
        },
        warehouseHeading: "Storage",
        warehouseUnavailable: "Storage detail unavailable.",
        sensoryHeading: "Sensory notes",
        sensory: {
          aroma: "Aroma",
          flavor: "Flavor",
          acidity: "Acidity",
          body: "Body",
          finish: "Finish",
          notes: "Notes",
        },
        tagsHeading: "Tags",
        availabilityHeading: "Availability",
        advisoryNote: "Availability shown here is advisory. The final quantity is confirmed at checkout.",
        purchase: {
          heading: "Purchase",
          comingSoon: "Purchasing isn't available yet",
          comingSoonDescription: "Ordering from the marketplace is coming in a future update.",
        },
      },
      status: {
        DRAFT: "Draft",
        PENDING_REVIEW: "Pending review",
        APPROVED: "Approved",
        REJECTED: "Rejected",
        PUBLISHED: "Published",
        PARTIALLY_FILLED: "Partially filled",
        SUSPENDED: "Suspended",
        SOLD_OUT: "Sold out",
        ARCHIVED: "Archived",
      },
      availability: {
        listedLabel: "Listed",
        reservedLabel: "Reserved",
        filledLabel: "Filled",
        remainingLabel: "Remaining",
        integrityError: {
          title: "Data integrity issue",
          description: "This listing's quantities do not add up correctly. Contact Hills Coffee support.",
        },
      },
    },

    /** Feature 006 RUN B (T013–T015) — the seller listing-creation flow. */
    listings: {
      new: {
        title: "Create listing",
        breadcrumb: "New listing",
        description: "Turn your eligible, Hills-sourced inventory into a marketplace listing.",
        capabilityRequired: {
          title: "Selling isn't enabled for your organization",
          description: "Contact Hills Coffee to enable selling before creating a listing.",
        },
        picker: {
          heading: "Choose eligible inventory",
          description: "Only positions your organization can currently list are shown.",
          empty: {
            title: "No eligible inventory",
            description: "Purchase coffee through Hills Coffee to build eligible, sellable inventory.",
          },
          lotUnavailable: "Lot detail unavailable",
          warehouseUnavailable: "Storage detail unavailable",
          availableLabel: "Available",
          reservedLabel: "Reserved",
          eligibleLabel: "Eligible to list",
          ineligibleBadge: "Not eligible",
        },
        refusal: {
          SELLER_NOT_CAPABLE: "Your organization is not currently approved to sell.",
          POSITION_NOT_OWNED: "This position is not available to your organization.",
          NOT_HILLS_SOURCED: "This inventory wasn't acquired through a Hills-mediated purchase, so it can't be listed yet.",
          CUSTODY_NOT_ELIGIBLE: "This inventory's storage location is not currently active.",
          RESERVED_QUANTITY: "There is no unreserved quantity available to list.",
          INSUFFICIENT_QUANTITY: "Only {amount} kg is currently eligible to list.",
        },
        form: {
          positionLabel: "Inventory position",
          positionRequired: "Choose an eligible inventory position.",
          titleLabel: "Title (optional)",
          titleHint: "How buyers will see this listing.",
          quantityLabel: "Quantity (kg)",
          priceLabel: "Price per kg",
          currencyLabel: "Currency",
          currencyFixedNote: "USD is currently the only supported currency.",
          submit: "Save draft",
          saving: "Saving…",
        },
        toast: {
          created: "Draft listing saved.",
          createFailed: "The listing could not be saved. Please try again.",
          contextUnavailable: "This inventory's coffee details can't be confirmed right now, so the listing can't be created yet.",
        },
        confirmation: {
          title: "Draft saved",
          description: "Your listing is saved as a draft. Submit it for compliance review when you're ready.",
          submitForReview: "Submit for review",
          submitting: "Submitting…",
          createAnother: "Create another listing",
        },
        submitToast: {
          submitted: "Listing submitted for review.",
          submitFailed: "The listing could not be submitted. Please try again.",
        },
      },

      /** Feature 006 RUN C (T016) — the seller's own listings, across all approved states. */
      manage: {
        title: "My listings",
        description: "Every listing your organization has created, in any state.",
        caption: "Your listings",
        createAction: "Create listing",
        viewDetails: "View listing",
        capabilityRequired: {
          title: "Selling isn't enabled for your organization",
          description: "Contact Hills Coffee to enable selling before managing listings.",
        },
        empty: {
          title: "No listings yet",
          description: "Create your first listing from your eligible, Hills-sourced inventory.",
        },
        columns: {
          listing: "Listing",
          status: "Status",
          quantity: "Quantity",
          price: "Price",
          updated: "Updated",
          actions: "Actions",
        },
        pagination: {
          previous: "Previous",
          next: "Next",
          pageLabel: "Page {page}",
        },
        overview: {
          listingsCard: "My listings",
          listingsValue: "{count} listing",
          listingsValuePlural: "{count} listings",
        },
      },

      /** Feature 006 RUN C (T017) — seller listing detail, edit, withdraw, and REJECTED remediation. */
      detail: {
        title: "Listing",
        editHeading: "Edit listing",
        notEditable: "This listing can't be edited in its current state.",
        historyHeading: "Status history",
        historyEmpty: "No status changes recorded yet.",
        rejected: {
          title: "This listing was rejected",
          genericReason: "Compliance did not approve this listing. Move it back to draft to review and resubmit it.",
        },
        form: {
          titleLabel: "Title",
          quantityLabel: "Quantity (kg)",
          priceLabel: "Price per kg",
          save: "Save changes",
          saving: "Saving…",
          saved: "Listing updated.",
          saveFailed: "The listing could not be updated. Please try again.",
        },
        withdraw: {
          action: "Withdraw listing",
          withdrawing: "Withdrawing…",
          success: "Listing withdrawn.",
          failed: "The listing could not be withdrawn.",
        },
        remediation: {
          action: "Move to draft",
          moving: "Moving…",
          success: "Listing moved back to draft.",
          failed: "The listing could not be moved to draft.",
        },
      },

      /** Feature 006 RUN C (T019) — seller sales reconciliation (read-only; no Feature 008 settlement logic here). */
      sales: {
        title: "Sales",
        description: "Your listings' sales outcomes, reconciled to the underlying order records.",
        caption: "Your sales",
        empty: {
          title: "No sales yet",
          description: "Sales appear here once a buyer's order against one of your listings settles.",
        },
        columns: {
          listing: "Listing",
          quantity: "Quantity",
          unitPrice: "Unit price",
          total: "Total",
          outcome: "Order status",
        },
        pagination: {
          previous: "Previous",
          next: "Next",
          pageLabel: "Page {page}",
        },
      },
    },

    /**
     * Feature 007 RUN A (T001–T007) — draft-order construction and buyer-owned shipment planning
     * only. No checkout/hold/proforma/payment copy exists yet (Phase 4+, out of RUN A scope).
     */
    orders: {
      capabilityRequired: {
        title: "Buying isn't enabled for your organization",
        description: "Contact Hills Coffee to enable buying before starting an order.",
      },
      status: {
        DRAFT: "Draft",
        CONFIRMED: "Confirmed",
        HOLD: "On hold",
        PAYMENT_PROOF_SUBMITTED: "Payment proof submitted",
        PAYMENT_UNDER_REVIEW: "Payment under review",
        PAID: "Paid",
        FULFILLMENT_IN_PROGRESS: "Fulfilment in progress",
        PARTIALLY_DELIVERED: "Partially delivered",
        COMPLETED: "Completed",
        EXPIRED: "Expired",
        VOID: "Void",
        DISPUTED: "Disputed",
      },
      list: {
        title: "Orders",
        breadcrumb: "Orders",
        description: "Every order your organization has started.",
        caption: "Your orders",
        createAction: "Start new order",
        creating: "Starting…",
        viewDetails: "View order",
        empty: {
          title: "No orders yet",
          description: "Start an order from the marketplace to see it here.",
        },
        columns: {
          code: "Order",
          status: "Status",
          updated: "Updated",
          actions: "Actions",
        },
        pagination: {
          previous: "Previous",
          next: "Next",
          pageLabel: "Page {page}",
        },
        toast: {
          createFailed: "The order could not be started. Please try again.",
        },
      },
      detail: {
        title: "Order",
        itemsHeading: "Items",
        itemsEmpty: "No items added yet.",
        itemsNote: "Items can't be removed or changed once added — start a new order if you need to make a different selection.",
        addItem: {
          heading: "Add an item",
          offerIdLabel: "Listing ID",
          offerIdHint: "Paste the listing's ID from its marketplace page.",
          quantityLabel: "Quantity (kg)",
          submit: "Add item",
          adding: "Adding…",
          added: "Item added to your order.",
          addFailed: "That item couldn't be added. Check the listing ID and quantity and try again.",
        },
        advisoryNote: "Availability shown here is advisory only and can change before checkout.",
        notEditableNote: "This order can no longer be edited.",
        shipment: {
          heading: "Delivery details",
          empty: "No delivery details added yet.",
          create: {
            deliveryMethodLabel: "Delivery method",
            countryCodeLabel: "Country code",
            countryCodeHint: "2-letter country code, e.g. AE.",
            cityLabel: "City (optional)",
            addressLabel: "Delivery address",
            contactNameLabel: "Contact name",
            contactPhoneLabel: "Contact phone",
            submit: "Save delivery details",
            saving: "Saving…",
            saved: "Delivery details saved.",
            saveFailed: "Delivery details couldn't be saved. Please try again.",
          },
          request: {
            action: "Request shipment",
            requesting: "Requesting…",
            requested: "Shipment requested.",
            requestFailed: "The shipment couldn't be requested.",
          },
          statusLabel: "Shipment status",
          status: {
            DRAFT: "Draft",
            REQUESTED: "Requested",
            READY: "Ready",
            RESERVED: "Reserved",
          },
        },
        checkoutAction: "Proceed to checkout",
      },

      /** Feature 007 RUN B (T009–T011) — checkout review, outcome (HOLD), and availability failure. */
      checkout: {
        title: "Review and confirm",
        breadcrumb: "Checkout",
        description: "Confirming reserves this quantity for you for 20 minutes while you arrange payment. Nothing is reserved until you confirm.",
        itemsHeading: "Items",
        shipmentHeading: "Delivery",
        noShipment: "No delivery details on this order yet.",
        readiness: {
          ready: "This order is ready to confirm.",
          notReady: "This order can't be confirmed yet.",
          noItems: "Add at least one item before confirming.",
          shipmentNotReady: "The warehouse hasn't confirmed delivery readiness for this order yet. Confirmation becomes available once it does.",
          quantitiesMismatch: "The planned delivery quantities don't match the items in this order.",
        },
        totalsNote: "Item prices shown are the snapshots taken when each item was added. Shipping, VAT and the final buyer total are calculated by the platform when you confirm — never estimated here.",
        advisoryNote: "Availability is re-checked at the moment you confirm. If quantity is no longer available, nothing is reserved and you'll be told.",
        confirm: "Confirm and reserve",
        confirming: "Confirming…",
        alreadyCheckedOut: "This order has already been confirmed.",
        viewOrder: "View order",
        toast: {
          failed: "Checkout couldn't be completed. Please try again.",
          notReady: "This order isn't ready to confirm yet.",
          availability: "Some of this quantity is no longer available, so nothing was reserved. Start a new order for the quantity that's still available.",
          notEditable: "This order can no longer be confirmed from its current state.",
        },
        recovery: {
          title: "Nothing was reserved",
          description: "Availability changed before your confirmation reached the platform. Items in a confirmed order can't be edited, so start a new order with the quantity that's still available.",
          startNewOrder: "Start a new order",
          backToMarketplace: "Back to marketplace",
        },
      },

      /** Feature 007 RUN B (T010) — the HOLD outcome, read entirely from the database. */
      hold: {
        title: "Quantity reserved",
        description: "Your reservation is held while you arrange payment. Payment steps arrive in a later release.",
        expiresLabel: "Reservation held until",
        remainingLabel: "Time remaining",
        expired: "This reservation window has ended.",
        countdownSummary: "About {minutes} minutes remaining",
        countdownSummaryUnderMinute: "Less than a minute remaining",
        proformaLabel: "Proforma reference",
        proformaPending: "Proforma reference not yet available.",
        retryNote: "You've already confirmed this order — your existing reservation was kept.",
      },

      /** Feature 007 RUN B (T010) — `order_financials` pass-through labels. Values are never recomputed. */
      financials: {
        heading: "Order total",
        pending: "Totals are calculated when you confirm the order.",
        baseSubtotal: "Items subtotal",
        shipping: "Shipping",
        vat: "VAT",
        buyerTotal: "Total to pay",
        totalQuantity: "Total quantity",
      },
    },

} as const;
