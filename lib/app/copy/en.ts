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
     * Feature 010 — Operations Console copy. `groups`/`areas` label the access matrix declared in
     * `lib/admin/areas.ts` (labels only — authorization lives in `lib/admin/guards.ts`). `states`
     * are the honest per-area conditions (forbidden / planned / blocked), `overview` is the real-data
     * cockpit, and `account` is the operator's own self-account surface composed from existing
     * Feature 003 authority only.
     */
    admin: {
      groups: {
        compliance: "Compliance",
        warehouse: "Warehouse",
        finance: "Finance",
        catalogue: "Catalogue",
        audit: "Audit",
        system: "System",
        account: "Account",
      },
      areas: {
        kyb: "KYB review",
        organizations: "Organizations",
        listings: "Listing review",
        disputes: "Disputes",
        shipments: "Shipments",
        inventory: "Custody & inventory",
        payments: "Payments",
        payouts: "Payouts",
        invoices: "Tax invoices",
        coffees: "Coffees",
        origins: "Origins",
        regions: "Regions",
        taxonomy: "Taxonomy",
        warehouses: "Warehouses",
        media: "Media",
        audit: "Audit evidence",
        roles: "Platform admins",
        commission: "Commission",
        tax: "Tax rules",
        shipping: "Shipping rules",
        paymentAccounts: "Payment accounts",
        prices: "Reference prices",
        branding: "Branding",
      },
      roles: {
        SUPER_ADMIN: "Super admin",
        ADMIN: "Admin",
        COMPLIANCE: "Compliance",
        WAREHOUSE: "Warehouse",
        FINANCE: "Finance",
        AUDITOR: "Auditor",
      },
      shell: {
        operatorRoles: "Operator roles",
        accountMenuLabel: "Operator account",
        account: "My account",
        signOut: "Sign out",
        navigationNote: "You see only the areas your operational roles permit. Every area re-verifies your role on the server.",
      },
      states: {
        roleMismatch: {
          title: "Not permitted for your role",
          description: "Your account holds an operational role, but not the one this area requires. Access is verified on the server for every request.",
          requiredRole: "Required role: {role}",
        },
        planned: {
          title: "Not available yet",
          description: "This area is part of Feature 010 phase {phase}. Its workflow has not been built, so nothing here is simulated.",
        },
        blocked: {
          title: "Waiting on a dependency",
          description: "This area cannot be built yet. The reason is recorded below — no substitute workflow is offered.",
        },
        blockers: {
          "feature-008-finance-layer": "Feature 008 has not yet supplied its finance decision layer (payment review queue, settlement decision, payout management, invoice recording). The console never calls settlement directly.",
          "feature-012-audit-layer": "Feature 012 has not yet supplied the audit/history layer, and the audit log is not readable by the Auditor role (DB-OPEN-06). The console will compose that layer read-only.",
        },
        backToOverview: "Back to overview",
      },
      overview: {
        title: "Operations overview",
        description: "Live figures from the areas your roles permit. Every number is a real query under your own authorization — nothing here is estimated or sampled.",
        none: "None",
        unavailable: "Unavailable",
        unavailableHint: "This figure could not be read under your role right now.",
        emptySection: "Nothing is waiting in this area right now.",
        openArea: "Open {area}",
        sections: {
          compliance: "Compliance",
          warehouse: "Warehouse",
          finance: "Finance",
          catalogue: "Catalogue",
          audit: "Audit",
          system: "System",
        },
        metrics: {
          kybSubmitted: "KYB applications submitted",
          kybUnderReview: "KYB applications under review",
          kybResubmissionRequired: "KYB awaiting resubmission",
          listingsPendingReview: "Listings pending review",
          disputesOpen: "Disputes open or under review",
          shipmentsRequested: "Shipments requested",
          shipmentsInProgress: "Shipments in progress",
          shipmentsDispatched: "Shipments dispatched",
          shipmentsDisputed: "Shipments disputed (frozen)",
          inventoryPositions: "Custody positions held",
          paymentsProofSubmitted: "Payment proofs submitted",
          paymentsUnderReview: "Payments under review",
          payoutsPending: "Payouts pending",
          coffeesPublished: "Coffees published",
          coffeesDraft: "Coffees in draft",
          originsActive: "Origins active",
          warehousesActive: "Warehouses active",
          auditEvents24h: "Audit events in the last 24 hours",
          platformAdminsActive: "Active platform admins",
        },
        notes: {
          financeMoneyDeferred: "Monetary totals (settled value, amounts awaiting review, commission) are shown only once Feature 008 defines those metrics. Counts above are real; no amount is estimated.",
          auditOpen06: "The audit log is not readable by the Auditor role (DB-OPEN-06). This figure will appear once the approved policy change lands.",
          systemNote: "Role changes are recorded in Phase 9. This count is read from platform_admins under your own authorization.",
        },
      },
      account: {
        title: "My account",
        description: "Your operator profile and sign-in security. Everything here uses the same account authority as the member portal — nothing is stored in a separate admin profile.",
        profile: {
          title: "Profile",
          lead: "Your display name and contact details, saved through the approved profile update.",
        },
        email: {
          title: "Sign-in email",
          current: "Current email",
        },
        password: {
          title: "Password",
        },
        security: {
          title: "Two-factor authentication",
          enrolled: "An authenticator app is enrolled on this account.",
          notEnrolled: "No authenticator app is enrolled yet.",
          unknown: "Enrolment status could not be read right now.",
          action: "Manage authenticator app",
        },
        signOut: {
          title: "Sign out",
          description: "Ends this session on the server. You will need to sign in again to return.",
        },
      },
      /** Feature 010 T047 (RUN F010-ACCOUNT-MEDIA) — platform-admin-controlled site logo. */
      branding: {
        title: "Branding",
        description: "Manage the platform's site logo.",
        logo: {
          title: "Site logo",
          lead: "Shown in the public site header. JPEG, PNG, or WebP, up to 5 MB. Remove it to fall back to the default Hills Coffee wordmark.",
          defaultLogoNote: "Using default logo",
        },
      },
      /**
       * Feature 010 RUN B — Compliance console (KYB queue/detail/decisions, organization status,
       * listing review). Every "unavailable" string names a REAL, verified policy gap rather than
       * hiding it; every status label is the database's own vocabulary.
       */
      compliance: {
        statuses: {
          kyb: {
            DRAFT: "Draft",
            SUBMITTED: "Submitted",
            UNDER_REVIEW: "Under review",
            APPROVED: "Approved",
            REJECTED: "Rejected",
            RESUBMISSION_REQUIRED: "Resubmission required",
            SUSPENDED: "Suspended",
          },
          organization: {
            PENDING_KYB: "Pending KYB",
            UNDER_REVIEW: "Under review",
            ACTIVE: "Active",
            SUSPENDED: "Suspended",
            REJECTED: "Rejected",
            CLOSED: "Closed",
          },
          document: {
            PENDING: "Awaiting review",
            ACCEPTED: "Accepted",
            REJECTED: "Rejected",
            SUPERSEDED: "Superseded",
          },
        },
        common: {
          organizationId: "Organization ID",
          organizationNameUnavailable: "Organization name is not readable by your role.",
          organizationGapNote:
            "This organization's details did not come back for your session under the current database policies, so its name and status are not shown here. Nothing is bypassed or guessed.",
          reason: "Reason",
          reasonHint: "Recorded with your decision and shown in the review history. Treat it as a formal note.",
          reasonRequired: "A reason is required for this decision (at least 5 characters).",
          reasonTooLong: "Keep the reason under 2,000 characters.",
          reviewer: "Reviewer",
          decision: "Decision",
          recordedAt: "Recorded",
          submittedAt: "Submitted",
          decidedAt: "Decided",
          createdAt: "Created",
          updatedAt: "Updated",
          notRecorded: "Not recorded",
          notProvided: "Not provided",
          you: "You",
          yes: "Yes",
          no: "No",
          confirm: "Confirm",
          cancel: "Cancel",
          recording: "Recording…",
          loadError: {
            title: "Could not load this queue",
            description: "The data could not be read right now. Try again in a moment.",
          },
          notFound: {
            title: "Not found",
            description: "This record does not exist or is not readable by your role.",
          },
        },
        kyb: {
          title: "KYB review",
          description: "Applications awaiting a compliance decision, oldest submission first. Every row is a real application read under your own authorization.",
          breadcrumb: "KYB review",
          columns: {
            organization: "Organization",
            status: "Status",
            submitted: "Submitted",
            outstanding: "Outstanding",
            review: "Review",
          },
          filters: {
            actionable: "Awaiting action",
            all: "All applications",
          },
          outstandingNone: "Nothing outstanding",
          outstandingCount: "{count} outstanding",
          expiredCount: "{count} expired",
          open: "Open",
          empty: {
            title: "No applications are waiting",
            description: "There is no KYB application awaiting a compliance decision right now.",
          },
          detail: {
            breadcrumb: "Application",
            title: "KYB application",
            application: "Application",
            applicationId: "Application ID",
            organization: "Organization",
            organizationStatus: "Organization status",
            capabilities: "Trading capability",
            canBuy: "May buy",
            canSell: "May sell",
            registeredAddress: "Registered address",
            businessActivity: "Business activity",
            rejectionReason: "Latest recorded reason",
            documents: {
              heading: "Documents",
              type: "Document",
              status: "Status",
              version: "Version",
              expires: "Expires",
              noExpiry: "No expiry",
              expired: "Expired",
              file: "File",
              fileUnavailable: "File name, type and size are not readable by your role (no compliance read path to file metadata).",
              bytesNote:
                "Opening evidence uses the approved KYB storage seam under your own session (a compliance read of the private kyb-evidence bucket, streamed through the console — no public link is created). The file record that locates each document is readable by platform admins; for a pure Compliance role it is not, so the View action is shown only when the file can actually be located. Payment, delivery and dispute evidence is outside the KYB seam entirely and belongs to Features 008, 009 and 012.",
              none: "No documents have been attached to this application.",
              view: "View document",
              viewHint: "Opens in a new tab; access is re-verified on every request.",
              viewUnavailable: "Document preview is unavailable under the approved access model: your role cannot read the file record that locates the evidence bytes (recorded gap). A platform admin can open it.",
              replaces: "Replaces version {version}",
              superseded: "Superseded by a newer version — no longer reviewable.",
              review: {
                heading: "Document outcome",
                lead: "Record what you found for this document. It is appended to the immutable document review ledger and updates the document's status.",
                accept: "Accept",
                acceptDescription: "The evidence is genuine, legible and satisfies this requirement.",
                reject: "Reject",
                rejectDescription: "The evidence does not satisfy this requirement. A reason is required; the applicant will need to supply a replacement.",
                reasonLabel: "Reason",
                reasonHint: "Required for a rejection. Recorded in the document review history.",
                reasonRequired: "Enter a reason for rejecting this document.",
                reasonTooLong: "Keep the reason under 2,000 characters.",
                submit: "Record document outcome",
                confirmTitle: "Record this document outcome?",
                confirmDescription: "{decision} will be recorded for this document in your name. It cannot be edited afterwards.",
                decided: "Decided: {decision}",
                notReviewable: "This version is not reviewable ({status}).",
                bytesWarning: "You have not been able to open this document's bytes from the console. Record an outcome only if you reviewed the evidence through another approved channel.",
              },
            },
            summary: {
              heading: "Review progress",
              lead: "Derived from the persisted document rows and Feature 003's completeness rule — never from this page's own controls.",
              required: "Required evidence",
              accepted: "Accepted",
              awaiting: "Awaiting review",
              rejected: "Rejected",
              expired: "Expired",
              missing: "Missing",
              fieldsMissing: "Application fields missing",
              approvalReady: "All required evidence is accepted and current. Approval is available.",
              approvalBlocked: "Approval is blocked: {count} required item(s) are missing, awaiting review, rejected or expired.",
              blockersHeading: "Blocking approval",
              nextAction: {
                heading: "What to do next",
                startReview: "Start the review so the applicant sees the application is being handled.",
                openDocuments: "Open each required document and record an outcome (accept or reject).",
                awaiting: "{count} required document(s) still await an outcome.",
                fixBlockers: "Resolve the blockers above: request resubmission for rejected, expired or missing evidence, or reject the application with a reason.",
                readyToApprove: "Every required item is satisfied — record the final decision.",
                decided: "A final decision has been recorded. No further action is required unless the applicant resubmits.",
                notSubmitted: "The applicant has not submitted this application yet.",
              },
            },
            outstanding: {
              heading: "Outstanding items",
              none: "Nothing outstanding — the application is complete against the required document set.",
            },
            reviews: {
              heading: "Decision history",
              none: "No application-level decision has been recorded yet.",
            },
            documentReviews: {
              heading: "Document review history",
              none: "No document-level review has been recorded yet.",
              document: "Document",
            },
            history: {
              heading: "Organization status history",
              unavailable: "Organization status history is not readable by your role (recorded gap).",
              none: "No organization status change has been recorded.",
              from: "From",
              to: "To",
            },
            decision: {
              heading: "Record a decision",
              lead: "Choose exactly one decision. It is recorded once, attributed to you, and cannot be edited afterwards — a later decision adds to the history.",
              notDecidable: "This application is not in a state that accepts a decision ({status}).",
              startReview: "Start review",
              startReviewHint: "Moves the application from Submitted to Under review. Not a decision — no review row is written.",
              blockedHint: "Approve is unavailable until every required document is accepted and current — {count} item(s) still block it. The server re-checks this before recording the decision.",
              confirmContext: "Organization: {organization} · Application: {application}",
              confirmReason: "Reason: {reason}",
              confirmNoReason: "No reason entered.",
              confirmBlockers: "Outstanding evidence at the time of this decision: {blockers}",
              confirmNoBlockers: "All required evidence is accepted and current.",
              distinctionNote:
                "Request resubmission when the applicant can correct or replace evidence and submit again; Reject when the application itself is refused. The approved business rules do not define further criteria separating the two — record the business decision, do not infer one.",
              nextAfter: {
                APPROVED: "The application is approved. The organization becomes eligible for trading once its status is Active.",
                REJECTED: "The application is refused at application level. The applicant's organization is not activated.",
                RESUBMISSION_REQUIRED: "The application returns to the applicant, who may replace rejected or missing evidence and submit again.",
                SUSPENDED: "Trading capability is withdrawn. Effects on in-flight shipments and payments follow the separately recorded (still undecided) suspension policy — nothing is cancelled automatically.",
              },
              options: {
                APPROVED: { label: "Approve", description: "Application approved. The organization is activated for trading where your role can update organization status." },
                REJECTED: { label: "Reject", description: "Application rejected with a reason. The organization is not activated." },
                RESUBMISSION_REQUIRED: { label: "Request resubmission", description: "Sends the application back to the applicant with a reason; they may correct and resubmit." },
                SUSPENDED: { label: "Suspend", description: "Suspends an approved application with a reason. Trading capability is withdrawn where your role can update organization status." },
              },
              destructive: "High-impact decision",
              submit: "Record decision",
              confirmTitle: "Record this decision?",
              confirmDescription: "{decision} will be recorded against this application in your name. This cannot be undone.",
              followThrough: {
                applied: "Organization status updated to match.",
                unavailable: "Organization status was NOT changed: the organization was not in a state this decision moves (or it did not come back for your session). Review the organization directly — nothing was forced.",
                notRequired: "No organization status change is required for this decision.",
              },
            },
          },
        },
        organizations: {
          title: "Organizations",
          description: "Organization status and suspension. Suspension takes effect on the member's next request through the database's own capability rules.",
          breadcrumb: "Organizations",
          columns: { name: "Organization", status: "Status", type: "Type", country: "Country", created: "Created", open: "Open" },
          gap: {
            title: "Organizations are not readable by your role",
            description: "No organization rows came back for your session under the current database policies, so this area cannot list organizations or change their status. The console does not bypass this.",
          },
          empty: { title: "No organizations", description: "No organization row is readable right now." },
          detail: {
            title: "Organization",
            legalName: "Legal name",
            displayName: "Display name",
            accountType: "Account type",
            country: "Country",
            status: "Status",
            latestApplication: "Latest KYB application",
            noApplication: "No KYB application exists for this organization.",
            actions: {
              heading: "Status actions",
              suspend: "Suspend organization",
              suspendDescription: "Moves the organization to Suspended. Its members lose trading capability on their next request. The reason is recorded as a review decision on the current application.",
              reinstate: "Reinstate organization",
              reinstateDescription: "Moves the organization back to Active. Trading capability follows the database's own rules on the member's next request.",
              notApplicable: "No status action applies to an organization in this state ({status}).",
              inFlightNote: "What happens to shipments or payments already in progress when an organization is suspended is not decided by this console — that policy is recorded as open and is not simulated here.",
              confirmTitle: "Change organization status?",
              confirmDescription: "The organization will move to {status}. This takes effect for every member on their next request.",
            },
          },
        },
        listings: {
          title: "Listing review",
          description: "Listings awaiting a compliance decision and live listings that may be suspended. Every row is a real listing read under your own authorization.",
          breadcrumb: "Listing review",
          columns: { listing: "Listing", seller: "Seller", status: "Status", quantity: "Quantity", price: "Price", updated: "Updated", open: "Open" },
          sellerUnavailable: "Seller organization name is not readable by your role.",
          hillsSeller: "Hills Coffee",
          empty: { title: "No listings to review", description: "No listing is awaiting a compliance decision, and no live listing is readable right now." },
          detail: {
            title: "Listing",
            listingId: "Listing ID",
            seller: "Seller",
            sellerType: "Seller type",
            quantity: "Listed quantity",
            reserved: "Reserved",
            filled: "Filled",
            price: "Price",
            rejectionReason: "Latest recorded reason",
            reviews: { heading: "Decision history", none: "No compliance decision has been recorded for this listing." },
            history: { heading: "Status history", none: "No status change has been recorded." },
            decision: {
              heading: "Record a decision",
              lead: "Choose exactly one decision. It is recorded once and attributed to you; the database's own transition rules remain the authority.",
              notDecidable: "This listing is not in a state that accepts a compliance decision ({status}).",
              options: {
                APPROVED: { label: "Approve", description: "Approves a listing awaiting review. The seller may then publish it." },
                REJECTED: { label: "Reject", description: "Rejects a listing awaiting review, with a reason. The seller may correct it from Draft." },
                SUSPENDED: { label: "Suspend", description: "Suspends a live listing with a reason. It stops being visible or purchasable by members immediately." },
              },
              submit: "Record decision",
              confirmTitle: "Record this decision?",
              confirmDescription: "{decision} will be recorded against this listing in your name.",
              reinstateNote: "There is no approved compliance vocabulary for lifting a suspension; a suspended listing stays suspended until that decision is defined.",
            },
          },
        },
        /**
         * Feature 010 T012 — the dispute review surface, composed ONLY from Feature 012's dispute layer
         * (`lib/disputes/read.ts` operator reads + `lib/disputes/compliance.ts` named transitions →
         * the database's `transition_dispute()`). Status labels reuse `disputes.status`. Every
         * "frozen" string says what the record says — no order/shipment/payment effect (DB-OPEN-09).
         */
        disputes: {
          title: "Dispute review",
          description: "Disputes raised by members on their orders, oldest first. Every row is a real dispute read under your own authorization.",
          breadcrumb: "Dispute review",
          columns: { dispute: "Dispute", order: "Order", status: "Status", opened: "Opened", updated: "Updated", open: "Open" },
          filters: { actionable: "Awaiting action", all: "All disputes" },
          orderReferenceOnly: "Order reference only",
          empty: { title: "No disputes in this view", description: "No dispute matches this view right now. Nothing is hidden or simulated." },
          freezeNote: {
            heading: "What a dispute status does",
            body: "A dispute status — including Frozen — applies to the dispute record only. Changing it does not hold, stop or change the order, its shipment, payment, settlement, inventory or delivery (DB-OPEN-09). Any action on the order itself is a separate operational decision.",
          },
          detail: {
            title: "Dispute",
            disputeId: "Dispute ID",
            order: "Order",
            orderUnreadable: "Your role cannot read this order's details under the current database policies, so only its reference is shown. Nothing is bypassed.",
            openedBy: "Raised by (user)",
            openedByOrganization: "Raised for organization",
            openedAt: "Opened",
            updatedAt: "Last updated",
            resolvedAt: "Decided",
            resolvedBy: "Decided by",
            correlation: "Correlation reference",
            reasonHeading: "Member's description",
            resolutionHeading: "Recorded outcome",
            resolutionPending: "No resolution or rejection has been recorded yet.",
            evidence: {
              heading: "Evidence notes",
              none: "No evidence note has been added.",
              addedBy: "Added by",
              filesUnavailable: "Evidence files cannot be stored yet (DB-BLOCK-01), so only written notes exist.",
            },
            history: {
              heading: "Transition history",
              lead: "Every status change as the database recorded it: who made it, the reason, and when. Entries cannot be edited or removed.",
              none: "No status change has been recorded yet.",
              actor: "Changed by",
            },
            decision: {
              heading: "Record a status change",
              lead: "Choose exactly one next status. A reason is required; it is recorded with your name and the time. The database enforces the approved transitions and refuses a change if the dispute moved meanwhile.",
              notDecidable: "This dispute is {status}. No further status change is possible.",
              options: {
                UNDER_REVIEW: { label: "Under review", description: "Starts the compliance review, or resumes it after a freeze." },
                FROZEN: { label: "Frozen", description: "Marks the dispute record as frozen while something is awaited. Record label only — it does not hold the order, shipment, payment, settlement, inventory or delivery." },
                RESOLVED: { label: "Resolved", description: "Records the outcome. Your reason becomes the resolution shown to the member, written once." },
                REJECTED: { label: "Rejected", description: "Rejects the dispute. Your reason becomes the recorded rejection shown to the member, written once." },
                CLOSED: { label: "Closed", description: "Closes a decided dispute. The recorded outcome is kept unchanged; no further change is possible." },
              },
              reason: {
                label: "Reason",
                hint: "Between 10 and 2,000 characters. Recorded in the transition history in your name. For Resolved and Rejected it is also the outcome the member sees.",
                required: "A reason of at least 10 characters is required.",
                tooLong: "Keep the reason under 2,000 characters.",
              },
              submit: "Record status change",
              confirmTitle: "Record this status change?",
              confirmDescription: "“{decision}” will be recorded against this dispute in your name. It cannot be undone.",
            },
          },
        },
        feedback: {
          kybDecisionRecorded: "Decision recorded.",
          kybDecisionStale: "This application changed before your decision was applied. Review the current state and try again.",
          kybDecisionFailed: "The decision could not be recorded. Nothing was changed.",
          kybHistoryIncomplete: "The status changed, but the review row could not be written. Report this — the decision is attributed on the application itself.",
          kybApprovalBlocked: "Approval refused: required evidence is missing, awaiting review, rejected or expired. Nothing was changed.",
          documentReviewRecorded: "Document outcome recorded.",
          documentReviewStale: "This document is no longer reviewable (already decided or superseded). Nothing was changed.",
          documentReviewFailed: "The document outcome could not be recorded. Nothing was changed.",
          reviewStarted: "Review started.",
          complianceNotCapable: "Your role is not permitted to record compliance decisions.",
          organizationAccessUnavailable: "This organization did not come back for your session (it may not exist, or it is not readable under the current database policies). Nothing was changed.",
          organizationStatusChanged: "Organization status changed. It applies on the member's next request.",
          organizationStatusStale: "The organization is no longer in the expected state. Nothing was changed.",
          organizationStatusFailed: "The organization status could not be changed. Nothing was changed.",
          listingDecisionRecorded: "Listing decision recorded.",
          listingDecisionStale: "This listing changed before your decision was applied. Review the current state and try again.",
          listingDecisionFailed: "The listing decision could not be recorded. Nothing was changed.",
          listingHistoryIncomplete: "The listing status changed, but the review row could not be written. Report this.",
          disputeTransitionRecorded: "Status change recorded in the dispute's transition history.",
          disputeTransitionStale: "This dispute changed before your change was applied. Review the current status and try again. Nothing was changed.",
          disputeTransitionRefused: "This status change is not allowed from the dispute's current status. Nothing was changed.",
          disputeTransitionFailed: "The status change could not be recorded. Nothing was changed.",
          disputeNotFound: "This dispute does not exist or is not readable by your role. Nothing was changed.",
          validationError: "Check the highlighted field.",
        },
      },
      /**
       * Feature 010 RUN D — Warehouse console (shipment queues, operational transitions, delivered
       * quantities, custody/inventory oversight, reconciliation gap). Every status label reuses the
       * approved `deliveries.status` / `inventory.storage.status` vocabularies; every "unavailable"
       * string names a REAL, verified read-policy gap; quantities always carry `kg`.
       */
      warehouse: {
        common: {
          orderUnavailable: "Order reference is not readable by your role.",
          organizationUnavailable: "Organization name is not readable by your role.",
          readGapNote:
            "Your role (WAREHOUSE) has no read path to the orders, order items or organizations tables under the current database policies, so order references, item names and organization names are unavailable here. Identifiers are shown instead — nothing is bypassed or invented. Platform admins see these values.",
          lotUnavailable: "Lot detail is not readable by your role.",
          warehouseUnavailable: "Warehouse detail unavailable.",
          notRecorded: "Not recorded",
          none: "None",
          confirm: "Confirm",
          cancel: "Cancel",
          working: "Applying…",
          previous: "Previous page",
          next: "Next page",
          loadError: {
            title: "Could not load this view",
            description: "The data could not be read right now. Try again in a moment.",
          },
          notFound: {
            title: "Not found",
            description: "This record does not exist or is not readable by your role.",
          },
          backToShipments: "Back to shipments",
          backToInventory: "Back to inventory",
        },
        shipments: {
          title: "Shipments",
          description: "Every organization's delivery requests, grouped by operational state. Each transition is executed through the delivery layer and decided by the database — nothing here moves a shipment directly.",
          breadcrumb: "Shipments",
          caption: "Warehouse shipment queue",
          queues: {
            requested: "Requested",
            inProgress: "In progress",
            dispatched: "Dispatched",
            held: "Disputed & failed",
            closed: "Closed",
          },
          queueDescriptions: {
            requested: "Submitted by buyers and awaiting warehouse action.",
            inProgress: "Capacity confirmed, ready, reserved, picking or booked.",
            dispatched: "In transit or partially delivered — delivered quantities are recorded here.",
            held: "Disputed (reservation frozen) or failed. No forward operation exists until a dedicated recovery workflow is approved.",
            closed: "Delivered or cancelled. Terminal — no further change is possible.",
          },
          columns: {
            shipment: "Shipment",
            order: "Order",
            status: "Status",
            method: "Method",
            destination: "Destination",
            planned: "Planned",
            delivered: "Delivered",
            items: "Items",
            updated: "Updated",
            open: "Open",
          },
          empty: {
            title: "Nothing in this queue",
            description: "No shipment is currently in this state. This is a real query under your own authorization — nothing is sampled.",
          },
          detail: {
            title: "Shipment",
            breadcrumb: "Shipment",
            identityHeading: "Shipment",
            order: "Order",
            buyerOrganization: "Buyer organization",
            method: "Delivery method",
            destination: "Destination",
            contact: "Contact",
            readyAt: "Ready since",
            deliveredAt: "Delivered at",
            createdAt: "Created",
            updatedAt: "Updated",
            queue: "Queue",
            itemsHeading: "Items",
            itemsLead: "Planned and delivered quantities per item, exactly as stored. Item names require order access your role may not have; the order item identifier is shown instead.",
            itemFallback: "Order item",
            custodyHeading: "Linked custody",
            custodyLead: "Storage allocations linked to this shipment's order items — Feature 005's custody record, shown read-only.",
            custodyNone: "No storage allocation is linked to this shipment's items yet.",
            custodyByItemNote: "Resolved by order item because the buyer organization is not readable by your role.",
            heldNote: "This shipment is in a held state. DISPUTED freezes its delivery reservation; FAILED has released it. Neither state has an approved forward transition — recovery belongs to a dedicated workflow (Feature 012).",
            terminalNote: "This shipment is closed. Terminal states cannot change.",
            draftNote: "This shipment is still the buyer's unsubmitted plan. Warehouse operations begin once it is requested.",
            suspensionNote: "Organization status is not consulted here: the database does not gate warehouse transitions on it, and no approved policy exists for in-flight shipments of a suspended organization. Escalate to Compliance if in doubt — nothing is decided automatically.",
            operations: {
              heading: "Warehouse operations",
              lead: "Only operations valid for the current state are shown. The database's transition rules and settlement gate remain the authority on every attempt — a hidden control is never permission, and a shown one is never a guarantee.",
              none: "No warehouse operation applies to a shipment in this state ({status}).",
              settlementNote: "Marked operations require the order to be settled. If it is not, the database refuses the progression and nothing changes.",
              settlementGated: "Settlement-gated",
              destructive: "Irreversible",
              options: {
                confirmCapacity: { label: "Confirm capacity", description: "Requested → Capacity confirmed. Settlement-gated." },
                markReady: { label: "Mark ready", description: "Requested or Capacity confirmed → Ready. Allowed before payment; a settled Ready shipment is reserved by the database." },
                reserve: { label: "Reserve", description: "Capacity confirmed or Ready → Reserved. Applies the delivery reservation if not already held at settlement." },
                startPicking: { label: "Start picking", description: "Ready or Reserved → Picking." },
                book: { label: "Book transport", description: "Ready or Reserved → Booked." },
                dispatch: { label: "Dispatch", description: "Picking or Booked → Dispatched. Delivered quantities are recorded afterwards." },
                fail: { label: "Mark failed", description: "Marks the shipment failed. Any held delivery reservation is released by the database. No forward transition exists afterwards." },
                cancel: { label: "Cancel", description: "Cancels a shipment that has not been dispatched. Any held delivery reservation is released by the database. Terminal." },
              },
              reason: "Reason",
              reasonHint: "Required for irreversible operations as operator discipline. The shipment record has no reason column in the current schema, so it is validated but not stored — recorded here for the confirmation only.",
              reasonRequired: "Enter a reason for this irreversible operation.",
              reasonTooLong: "Keep the reason under 500 characters.",
              submit: "Apply operation",
              confirmTitle: "Apply this operation?",
              confirmDescription: "{operation} will be applied to this shipment. This cannot be undone.",
            },
            delivery: {
              heading: "Record delivered quantity",
              lead: "Enter the NEW total delivered per item (not the increment). The database refuses a decrease, a value above the plan, a non-warehouse caller and an unsettled order; on a full delivery it marks the shipment delivered and releases the remaining reservation itself.",
              notApplicable: "Delivered quantities can be recorded only once the shipment is dispatched or partially delivered.",
              item: "Item",
              planned: "Planned",
              delivered: "Delivered so far",
              newTotal: "New delivered total (kg)",
              leaveBlank: "Leave blank to keep an item unchanged.",
              submit: "Record delivery",
              confirmTitle: "Record these delivered quantities?",
              confirmDescription: "Delivered quantities can only increase. The database applies the custody and reservation effects; this cannot be undone.",
              noChanges: "Enter at least one new delivered total.",
              invalidQuantity: "Enter a non-negative number.",
              decreaseHint: "A value below the current delivered total will be refused.",
              overPlanHint: "A value above the planned quantity will be refused.",
            },
          },
        },
        inventory: {
          title: "Custody & inventory",
          description: "Every organization's positions and storage allocations in Hills custody, read from the inventory domain exactly as stored. Read-only: no console action adjusts a quantity.",
          breadcrumb: "Custody & inventory",
          views: {
            positions: "Positions",
            allocations: "Storage allocations",
          },
          semantics: {
            heading: "How to read these quantities",
            onHand: "On hand (gross) is the position's total owned quantity (available_quantity_kg).",
            reserved: "Reserved is the subset currently held against an active order hold or a live delivery reservation (reserved_quantity_kg) — the database writes it at checkout, settlement and delivery.",
            free: "The quantity free to trade is computed by the database at checkout as on hand minus reserved. It is not stored and is deliberately not recomputed here.",
          },
          positions: {
            caption: "Inventory positions across organizations",
            columns: {
              lot: "Lot",
              owner: "Owner organization",
              warehouse: "Warehouse",
              location: "Location",
              onHand: "On hand (gross)",
              reserved: "Reserved",
              updated: "Updated",
              open: "Open",
            },
            empty: {
              title: "No inventory positions",
              description: "No position is recorded in any warehouse yet. This is a real query — nothing is sampled.",
            },
          },
          allocations: {
            caption: "Storage allocations across organizations",
            columns: {
              lot: "Lot",
              owner: "Owner organization",
              warehouse: "Warehouse",
              status: "Custody state",
              allocated: "Allocated",
              released: "Released",
              order: "Order",
              started: "Started",
            },
            empty: {
              title: "No storage allocations",
              description: "No allocation is recorded yet. This is a real query — nothing is sampled.",
            },
          },
          detail: {
            title: "Position",
            breadcrumb: "Position",
            positionHeading: "Position",
            lot: "Lot",
            owner: "Owner organization",
            warehouse: "Warehouse",
            location: "Location",
            onHand: "On hand (gross)",
            reserved: "Reserved",
            createdAt: "Recorded since",
            updatedAt: "Updated",
            allocationsHeading: "Storage allocations for this lot, owner and warehouse",
            allocationsNone: "No storage allocation matches this position.",
            warehouseInactive: "This warehouse is currently marked inactive.",
          },
          reconciliation: {
            heading: "Variance & reconciliation",
            title: "No approved variance or reconciliation model exists",
            description:
              "The approved schema has no variance, discrepancy, reconciliation, quarantine, warehouse-hold or stock-count representation — no table, column, status value or function (re-verified against the live schema report and every applied migration). A reconciliation screen would have to invent one, so none is built. AC-05 (reconciliation) remains release-blocking until the approved database-change process adds that capability.",
            minimum: "Minimum future capability: an approved, append-only inventory adjustment/variance record (position, warehouse, counted vs. recorded quantity, reason, actor, correlation) plus a warehouse-only decision path that the database — not this console — applies to the position.",
          },
        },
        feedback: {
          operationApplied: "{operation} applied. The shipment is now {status}.",
          deliveryRecorded: "Delivered quantities recorded. The shipment is now {status}.",
          warehouseNotCapable: "Your role is not permitted to perform warehouse operations.",
          validationError: "Check the highlighted field.",
          shipmentNotFound: "This shipment does not exist or is not readable by your role. Nothing was changed.",
          shipmentNotEditable: "This operation is not available for the shipment's current state, or the value was refused by the database. Nothing was changed.",
          orderNotSettled: "The order is not settled. The database refused this progression — nothing was changed.",
          reservationUnavailable: "The delivery reservation could not be applied (insufficient inventory or no matching position). Nothing was changed.",
          quantityInvalid: "The delivered quantity was refused: it cannot exceed the planned quantity. Nothing was changed.",
          operationFailed: "The operation could not be applied. The shipment may have changed — review its current state. Nothing was changed.",
        },
      },
      /**
       * Feature 010 RUN E — Catalogue management (coffees, origins, regions, taxonomy, warehouses,
       * media). Status labels are the database's own vocabularies (`coffees_status_check`,
       * `origins_status_check`, `warehouses.is_active`); validation keys mirror
       * `lib/admin/catalogue-validation.ts` messages.
       */
      catalogue: {
        common: {
          name: "Name",
          slug: "Slug",
          slugHint: "Lower-case letters, digits and single hyphens. This is the public URL segment.",
          description: "Description",
          status: "Status",
          countryCode: "Country code",
          countryCodeHint: "Two-letter ISO code, e.g. ET.",
          region: "Region",
          parentOrigin: "Parent origin",
          origin: "Origin",
          coffeeType: "Coffee type",
          variety: "Variety",
          processingMethod: "Processing method",
          packagingType: "Packaging type",
          none: "None",
          notSet: "Not set",
          save: "Save changes",
          create: "Create",
          saving: "Saving…",
          cancel: "Cancel",
          confirm: "Confirm",
          back: "Back",
          open: "Open",
          edit: "Edit",
          updated: "Updated",
          created: "Created",
          publicNote: "Saving revalidates the public website's cached catalogue pages immediately through Feature 002's tag register — no manual purge exists or is needed.",
          noDeleteNote: "Catalogue records are never deleted from this console (the database grants no delete). Retire content with the status shown here.",
          loadError: { title: "Could not load this view", description: "The data could not be read right now. Try again in a moment." },
          notFound: { title: "Not found", description: "This record does not exist or is not readable by your role." },
          validation: {
            NAME_REQUIRED: "Enter a name (at least 2 characters).",
            NAME_TOO_LONG: "Keep the name under 120 characters.",
            SLUG_REQUIRED: "Enter a slug.",
            SLUG_TOO_LONG: "Keep the slug under 100 characters.",
            SLUG_INVALID: "Use lower-case letters, digits and single hyphens only.",
            DESCRIPTION_TOO_LONG: "Keep the description under 4,000 characters.",
            INVALID_REFERENCE: "Choose a valid entry.",
            COUNTRY_CODE_INVALID: "Enter a two-letter country code.",
            CODE_REQUIRED: "Enter a code (at least 2 characters).",
            CODE_TOO_LONG: "Keep the code under 32 characters.",
            CODE_INVALID: "Use upper-case letters, digits and hyphens only.",
            CITY_TOO_LONG: "Keep the city under 120 characters.",
            ADDRESS_TOO_LONG: "Keep the address under 500 characters.",
            SORT_ORDER_INVALID: "Enter a whole number between 0 and 9999.",
          },
        },
        statuses: {
          coffee: { DRAFT: "Draft", PUBLISHED: "Published", ARCHIVED: "Archived" },
          origin: { ACTIVE: "Active", INACTIVE: "Inactive", ARCHIVED: "Archived" },
          warehouse: { active: "Active", inactive: "Inactive" },
        },
        prices: {
          title: "Reference prices",
          description: "Market-reference sources, observations and basis differentials that Feature 011 shows on the public website. Reference information only — never an offer, quote or executable price. Only APPROVED and active sources are ever shown publicly.",
          breadcrumb: "Reference prices",
          publicNote: "Saving revalidates the public reference prices immediately (Feature 011's reference-prices tag). Values, units and currencies are stored exactly as entered — nothing is converted.",
          noConversionNote: "No currency or unit conversion exists (DB-OPEN-08): values are stored and shown exactly as recorded. Exchange-rate observations cannot be recorded here.",
          appendOnlyNote: "Observations are append-only: a newer observation supersedes older ones for the same source and symbol. Recorded observations are never edited or deleted.",
          noDeleteNote: "Nothing is deleted from this console (the database grants no delete). Retire a source with its licence status or the active flag, and a differential with its active flag or effective-until.",
          newSource: "New source",
          newDifferential: "New differential",
          sections: { sources: "Sources", observations: "Latest observations", differentials: "Differentials" },
          captions: { sources: "Reference price sources", observations: "Reference price observations", differentials: "Reference price differentials" },
          columns: {
            source: "Source",
            type: "Type",
            licence: "Licence",
            delay: "Delay",
            active: "Active",
            publicStatus: "Public",
            symbol: "Symbol",
            commodity: "Commodity",
            value: "Stored value",
            observedAt: "Observed (UTC)",
            stale: "Stale",
            differential: "Differential",
            amount: "Stored amount",
            scope: "Scope",
            period: "Effective (UTC)",
            updated: "Updated",
            open: "Open",
          },
          publicStates: { shown: "Shown publicly", hidden: "Not shown" },
          yes: "Yes",
          no: "No",
          scopeGeneral: "General",
          scopeLot: "Lot (private)",
          openEnded: "open-ended",
          empty: {
            sources: { title: "No price sources", description: "No reference price source exists yet. This is a real query — nothing is sampled." },
            observations: { title: "No observations", description: "No observation has been recorded yet." },
            differentials: { title: "No differentials", description: "No differential exists yet." },
          },
          forms: {
            priceSource: {
              createTitle: "New price source",
              createLead: "A source is only ever shown publicly while its licence status is Approved and it is active.",
              editTitle: "Source details",
              editLead: "Changing the licence status or activity takes effect on the public website immediately. Code and source type are fixed once created.",
            },
            priceObservation: {
              createTitle: "Record an observation",
              createLead: "Enter the value exactly as the source published it. The observation time is UTC.",
              editTitle: "Record an observation",
            },
            priceDifferential: {
              createTitle: "New differential",
              createLead: "A basis component shown next to a current benchmark as explanation only — never added up or presented as a price. Choose at most one scope: a coffee or an origin (neither = general).",
              editTitle: "Differential lifecycle",
              editLead: "Amount, currency, unit, type and scope are fixed once created. Retire a differential by clearing Active or setting Effective until.",
            },
          },
          fields: {
            code: "Code",
            codeHint: "Upper-case letters, digits, hyphens. Fixed once created.",
            sourceType: "Source type",
            sourceUrl: "Source URL",
            sourceUrlHint: "Optional public attribution link (https://…).",
            licenceStatus: "Licence status",
            delayType: "Delay type",
            delayMinutes: "Delay (minutes)",
            delayMinutesHint: "Optional whole number of minutes.",
            isActive: "Active",
            isActiveHint: "Inactive sources and differentials are never shown publicly.",
            symbol: "Symbol",
            symbolHint: "The source's own symbol, e.g. KC.",
            commodityType: "Commodity",
            rawValue: "Value",
            rawValueHint: "Exactly as published — up to 6 decimal places, no thousands separators.",
            rawCurrency: "Currency",
            currencyHint: "Three-letter code, e.g. USD. Stored as entered; never converted.",
            rawUnit: "Unit",
            unitHint: "As published, e.g. cents/lb or USD/MT.",
            observedAt: "Observed at (UTC)",
            isStale: "Stale",
            isStaleHint: "Marks this observation as stale: the public site then shows the stale state and no value.",
            differentialType: "Differential type",
            amount: "Amount",
            amountHint: "Up to 6 decimal places; may be negative.",
            currency: "Currency",
            unit: "Unit",
            effectiveFrom: "Effective from (UTC)",
            effectiveUntil: "Effective until (UTC)",
            coffeeId: "Coffee scope",
            originId: "Origin scope",
            notes: "Internal notes",
            notesHint: "Never shown publicly.",
          },
          vocab: {
            sourceType: { ICE_ARABICA: "ICE Arabica", ICE_ROBUSTA: "ICE Robusta", ICO: "ICO", FX: "Exchange rate", OTHER: "Other" },
            licenceStatus: { PENDING: "Pending", APPROVED: "Approved", RESTRICTED: "Restricted", DISABLED: "Disabled" },
            delayType: { REAL_TIME: "Real time", DELAYED: "Delayed", DAILY: "Daily", MANUAL: "Manual" },
            commodity: { ARABICA: "Arabica", ROBUSTA: "Robusta", ICO_INDICATOR: "ICO indicator", FX: "Exchange rate", OTHER: "Other" },
            differentialType: { ORIGIN: "Origin", QUALITY: "Quality", CERTIFICATION: "Certification", CROP: "Crop", COMMERCIAL: "Commercial", OTHER: "Other" },
          },
          validation: {
            CODE_TAKEN: "This source code is already used.",
            URL_INVALID: "Enter a full http(s) URL under 500 characters.",
            DELAY_MINUTES_INVALID: "Enter a whole number of minutes.",
            SYMBOL_REQUIRED: "Enter the symbol.",
            SYMBOL_TOO_LONG: "Keep the symbol under 32 characters.",
            SYMBOL_INVALID: "Use letters, digits, dots, hyphens, underscores or slashes.",
            COMMODITY_INVALID: "Choose Arabica, Robusta or ICO indicator.",
            VALUE_INVALID: "Enter a plain decimal number with at most 6 decimal places.",
            CURRENCY_INVALID: "Enter a three-letter currency code.",
            UNIT_REQUIRED: "Enter the unit.",
            UNIT_TOO_LONG: "Keep the unit under 32 characters.",
            DATE_REQUIRED: "Enter a date and time.",
            DATE_INVALID: "Enter a valid date and time.",
            DATE_IN_FUTURE: "An observation cannot be in the future.",
            OBSERVATION_DUPLICATE: "This source already has an observation for this symbol at this time.",
            EFFECTIVE_UNTIL_BEFORE_FROM: "Effective until must be after effective from.",
            SCOPE_SINGLE: "Choose a coffee or an origin — not both.",
            NOTES_TOO_LONG: "Keep the notes under 1,000 characters.",
          },
        },
        coffees: {
          title: "Coffees",
          description: "The coffees the public website describes. Draft and archived coffees are never publicly visible; publishing is an explicit, confirmed step.",
          breadcrumb: "Coffees",
          caption: "Catalogue coffees",
          newCoffee: "New coffee",
          columns: { coffee: "Coffee", origin: "Origin", type: "Type", status: "Status", updated: "Updated", open: "Open" },
          filters: { all: "All", DRAFT: "Draft", PUBLISHED: "Published", ARCHIVED: "Archived" },
          empty: { title: "No coffees", description: "No coffee matches this filter. This is a real query — nothing is sampled." },
          form: {
            createTitle: "New coffee",
            createLead: "A new coffee is created as Draft. Publish it from its detail page once the content is ready.",
            editTitle: "Coffee details",
            editLead: "Name, slug, description and reference links. Status is changed only through the publication controls.",
            publicUrl: "Public URL",
            publicUrlHint: "Live only while the coffee is Published.",
          },
          transitions: {
            heading: "Publication",
            lead: "Exactly one operation, confirmed before it runs. The database's status vocabulary and the console's compare-and-set decide; a stale state is refused, never overwritten.",
            none: "No publication operation applies in the current state.",
            options: {
              publish: { label: "Publish", description: "Draft → Published. The coffee appears on the public website immediately after revalidation." },
              unpublish: { label: "Unpublish", description: "Published → Draft. The public page becomes a 404 immediately after revalidation." },
              archive: { label: "Archive", description: "Retires the coffee (Archived). Not publicly visible; can be restored to Draft later." },
              restore: { label: "Restore to draft", description: "Archived → Draft, for editing and re-publishing." },
            },
            submit: "Apply",
            confirmTitle: "Apply this publication change?",
            confirmDescription: "{decision} will be applied to this coffee and the public catalogue cache will be revalidated.",
            highImpact: "Public",
          },
          media: {
            heading: "Media",
            lead: "Images of this coffee. Upload, order, replace or remove them and choose the primary image.",
            none: "No media record is linked to this coffee.",
            columns: { file: "File", type: "Type", size: "Size", primary: "Primary", order: "Order" },
            primary: "Primary",
            setPrimary: "Set as primary",
            sortOrder: "Sort order",
            saveOrder: "Save order",
            fileUnavailable: "File record unavailable",
            uploadHeading: "Upload images",
            upload: "Add images",
            uploading: "Uploading…",
            hint: "JPEG, PNG or WebP · up to 5 MB each · {count} of {max} images",
            uploaded: "Image uploaded.",
            removed: "Image removed.",
            invalidFile: "Please choose JPEG, PNG or WebP images up to 5 MB each.",
            limitReached: "This coffee already has the maximum number of images. Remove one first.",
            remove: "Remove",
            confirmRemove: "Confirm removal",
            removing: "Removing…",
            cancel: "Cancel",
            replace: "Replace",
            replacing: "Replacing…",
            moveEarlier: "Move earlier",
            moveLater: "Move later",
            publicNote: "The primary image appears on the public coffee card and detail page once the coffee is published.",
          },
        },
        origins: {
          title: "Origins",
          description: "Coffee origins the public website lists. Only Active origins are publicly visible.",
          breadcrumb: "Origins",
          caption: "Catalogue origins",
          newOrigin: "New origin",
          columns: { origin: "Origin", region: "Region", country: "Country", status: "Status", updated: "Updated", open: "Open" },
          empty: { title: "No origins", description: "No origin has been created yet." },
          form: { createTitle: "New origin", editTitle: "Origin details", lead: "Status is the database's own vocabulary: Active (public), Inactive and Archived (not public)." },
        },
        regions: {
          title: "Regions",
          description: "Producing regions origins belong to. Regions are always publicly readable reference data.",
          breadcrumb: "Regions",
          caption: "Catalogue regions",
          newRegion: "New region",
          columns: { region: "Region", country: "Country", updated: "Updated", open: "Open" },
          empty: { title: "No regions", description: "No region has been created yet." },
          form: { createTitle: "New region", editTitle: "Region details", lead: "Regions have no status; they are reference data referenced by origins." },
        },
        taxonomy: {
          title: "Taxonomy",
          description: "Reference vocabularies the public website and listings use: coffee types, varieties, processing methods, packaging types and tags. Each is its own table with its own rules.",
          breadcrumb: "Taxonomy",
          caption: "Taxonomy entries",
          newEntry: "New entry",
          kinds: { coffeeTypes: "Coffee types", varieties: "Varieties", processingMethods: "Processing methods", packagingTypes: "Packaging types", tags: "Tags" },
          columns: { entry: "Entry", slug: "Slug", coffeeType: "Coffee type", open: "Open" },
          empty: { title: "No entries", description: "This vocabulary has no entries yet." },
          form: { createTitle: "New entry", editTitle: "Entry details", lead: "Name and slug only; varieties also belong to a coffee type. Reference entries have no status and are never deleted." },
        },
        warehouses: {
          title: "Warehouses",
          description: "Warehouse reference data: code, name, location, owner and active flag. Stock, custody and shipments are operated from the Warehouse area, never edited here.",
          breadcrumb: "Warehouses",
          caption: "Warehouses",
          newWarehouse: "New warehouse",
          columns: { warehouse: "Warehouse", location: "Location", owner: "Owner organization", active: "Active", updated: "Updated", open: "Open" },
          empty: { title: "No warehouses", description: "No warehouse has been created yet." },
          form: {
            createTitle: "New warehouse",
            editTitle: "Warehouse details",
            lead: "Reference fields only. Deactivating a warehouse hides it from public/member reads but changes no inventory; there is no delete.",
            code: "Code",
            codeHint: "Upper-case letters, digits and hyphens; unique.",
            city: "City",
            address: "Address",
            owner: "Owner organization",
            ownerNone: "No owner organization",
            isActive: "Active",
            isActiveHint: "Inactive warehouses are not offered for new custody and are hidden from public reads.",
          },
          locations: {
            heading: "Locations",
            lead: "Named positions inside this warehouse (code + name). Locations are reference data; inventory positions reference them.",
            none: "No location has been defined for this warehouse.",
            code: "Location code",
            name: "Location name",
            add: "Add location",
            save: "Save location",
          },
          operationsNote: "Shipments, inventory and custody for this warehouse are managed in the Warehouse area (Phase 6). Stock adjustment and reconciliation have no approved model (DB-OPEN-19) and are not offered anywhere.",
        },
        arabic: {
          heading: "Arabic content",
          englishBadge: "English (canonical)",
          lead: "The form above holds the English content. Arabic is stored separately here, so saving one language never changes the other.",
          fallbackNote: "When no Arabic is saved, Arabic visitors see the English text, marked as English.",
          nameLabel: "Name in Arabic",
          descriptionLabel: "Description in Arabic",
          clearHint: "Leave the Arabic name empty and save to remove the Arabic translation.",
          save: "Save Arabic",
          saving: "Saving…",
          saved: "Arabic content saved.",
          failed: "The Arabic content could not be saved. Nothing was changed.",
          nameRequired: "Enter an Arabic name before adding an Arabic description.",
          tooLong: "This text is too long.",
          unavailable: "Arabic content storage is not available yet (database migration pending review). Nothing can be saved here until it is applied.",
          noTranslationForTags: "Tags have no Arabic translation store.",
        },
        media: {
          title: "Media",
          description: "Media records across the catalogue, exactly as stored. Images are uploaded and managed from each coffee's detail page.",
          breadcrumb: "Media",
          caption: "Catalogue media records",
          columns: { coffee: "Coffee", file: "File", type: "Type", size: "Size", primary: "Primary", order: "Order" },
          empty: { title: "No media records", description: "No coffee has a linked media record. No upload capability exists yet, so none can be created from this console." },
        },
        feedback: {
          saved: "Saved. Public catalogue pages were revalidated.",
          created: "Created as Draft. Publish it once the content is ready.",
          transitionApplied: "{operation} applied — the coffee is now {status}. The public catalogue cache was revalidated.",
          notCapable: "Your role is not permitted to manage the catalogue.",
          validationError: "Check the highlighted fields.",
          slugTaken: "This slug (or code) is already in use. Choose another.",
          referenceInvalid: "One of the referenced entries does not exist. Nothing was changed.",
          statusInvalid: "The database refused this status value. Nothing was changed.",
          stale: "This record changed before your action was applied. Review its current state and try again. Nothing was changed.",
          notFound: "This record does not exist or is not readable by your role. Nothing was changed.",
          failed: "The change could not be saved. Nothing was changed.",
        },
      },
      /**
       * Feature 010 RUN F — Phase 9 system configuration (SUPER_ADMIN). Every vocabulary here is the
       * database's own CHECK list; the commission semantics sentences mirror `checkout_order`
       * exactly (`docs/database/commission-capability.md`); every recorded gap (OPS-01,
       * COMMISSION-OPEN-01, UPDATE attribution, unconsumed shipping rules) is stated, never hidden.
       */
      system: {
        common: {
          futureOnlyTitle: "Changes apply to eligible future checkouts only",
          futureOnly: "Saving this changes what the NEXT checkout snapshots. Existing orders keep their recorded snapshot: no historical order, commission, tax, seller net amount or payout is recalculated, restated or re-snapshotted — no such action exists in this console.",
          changesRecorded: "Every change to this configuration — creation, edit and deactivation — is recorded in the platform audit log with who made it and when.",
          noDeleteNote: "Configuration rows are never deleted from this console (the database grants no delete). Retire them with the status or activity flag shown here.",
          superAdminOnly: "Super administrators only. Every read and write re-verifies the super-admin role on the server; the database policy is the backstop.",
          loadError: { title: "Could not load this view", description: "The data could not be read right now. Try again in a moment." },
          notFound: { title: "Not found", description: "This record does not exist or is not readable by your role." },
          back: "Back",
          create: "Create",
          save: "Save changes",
          saving: "Saving…",
          effectiveFrom: "Effective from",
          effectiveUntil: "Effective until",
          openEnded: "Open-ended",
          active: "Active",
          inactive: "Inactive",
          yes: "Yes",
          no: "No",
          createdBy: "Created by",
          created: "Created",
          you: "You",
          notSet: "Not set",
        },
        fields: {
          name: "Name",
          userId: "User (profile id)",
          userIdHint: "The exact profile id of the person. Operator identities are not searchable by email from this console.",
          role: "Role",
          effectiveFrom: "Effective from",
          effectiveFromHint: "The instant from which a checkout may select this row.",
          effectiveUntil: "Effective until",
          effectiveUntilHint: "Optional. Leave empty for no end.",
          minQuantityKg: "Minimum quantity (kg, inclusive)",
          maxQuantityKg: "Maximum quantity (kg, exclusive)",
          maxQuantityHint: "Leave empty for an open-ended top band.",
          percentage: "Commission percentage",
          percentageHint: "Applied to the whole order base subtotal when this band is selected — not progressively.",
          countryCode: "Country code",
          countryCodeHint: "Two-letter ISO code, e.g. AE.",
          countryCodeOptionalHint: "Optional two-letter ISO code; empty = any country.",
          taxName: "Tax name",
          ratePercentage: "Rate (%)",
          taxableBase: "Taxable base",
          isActive: "Active",
          isActiveHint: "Inactive rows are never selected.",
          deliveryMethod: "Delivery method",
          flatFee: "Flat fee",
          currency: "Currency",
          currencyHint: "The database accepts USD only.",
          accountName: "Account name",
          bankName: "Bank name",
          accountNumber: "Account number",
          iban: "IBAN",
          swiftCode: "SWIFT / BIC",
        },
        validation: {
          NAME_REQUIRED: "Enter a name (at least 2 characters).",
          NAME_TOO_LONG: "Keep this under the allowed length.",
          INVALID_REFERENCE: "Choose a valid entry.",
          COUNTRY_CODE_INVALID: "Enter a two-letter country code.",
          DATE_REQUIRED: "Enter a date and time.",
          DATE_INVALID: "Enter a valid date and time.",
          EFFECTIVE_UNTIL_BEFORE_FROM: "The end must be after the start.",
          PERCENTAGE_INVALID: "Enter a percentage between 0 and 100.",
          QUANTITY_INVALID: "Enter a quantity of 0 kg or more.",
          MAX_NOT_ABOVE_MIN: "The maximum must be greater than the minimum (or empty).",
          CURRENCY_INVALID: "Only USD is accepted.",
          ACCOUNT_NUMBER_TOO_LONG: "Keep the account number under 64 characters.",
          IBAN_TOO_LONG: "Keep the IBAN under 34 characters.",
          IBAN_INVALID: "Use letters and digits only.",
          SWIFT_TOO_LONG: "A SWIFT/BIC is 8 or 11 characters.",
          SWIFT_INVALID: "A SWIFT/BIC is 8 or 11 letters/digits.",
        },
        feedback: {
          saved: "Saved. This applies to eligible future checkouts only.",
          validationError: "Check the highlighted fields.",
          notCapable: "Your role is not permitted to change system configuration.",
          stale: "This record changed before your action was applied. Review its current state and try again. Nothing was changed.",
          notFound: "This record does not exist or is not readable by your role. Nothing was changed.",
          duplicate: "A row with the same key already exists. Nothing was changed.",
          referenceInvalid: "One of the referenced records does not exist. Nothing was changed.",
          valueInvalid: "The database refused a value (outside its allowed range or vocabulary). Nothing was changed.",
          failed: "The change could not be saved. Nothing was changed.",
          selfChangeRefused: "You cannot change or deactivate your own super-admin capability from this console.",
          transitionApplied: "{operation} applied — the policy is now {status}. Eligible future checkouts only.",
        },
        forms: {
          commissionPolicy: { createTitle: "New commission policy", editTitle: "Policy details", lead: "A new policy is created as Draft; it is activated from its detail page through a confirmed operation." },
          commissionTier: { createTitle: "Add a band", editTitle: "Band", lead: "Minimum is inclusive, maximum is exclusive; leave the maximum empty for the open-ended top band." },
          taxRule: { createTitle: "New tax rule", editTitle: "Tax rule details", lead: "Checkout selects the active rule for the buyer's country with the latest effective-from instant that has begun." },
          shippingRule: { createTitle: "New shipping rule", editTitle: "Shipping rule details", lead: "Stored for the shipping seam. No checkout or shipment path applies these rows yet (see the notice above)." },
          paymentAccount: { createTitle: "New payment account", editTitle: "Payment account details", lead: "High-risk change. Recorded under your identity as a single actor — there is no second approver in the approved schema." },
          roleGrant: { createTitle: "Grant an operational role", editTitle: "Operator", lead: "Grants one of the six database roles to an existing profile. The grant is recorded under your identity." },
        },
        roles: {
          title: "Platform admins",
          description: "Who holds an operational role in the console. Managed only by super administrators; refused by the database for everyone else.",
          breadcrumb: "Platform admins",
          caption: "Platform admins",
          columns: { operator: "Operator", role: "Role", active: "Active", granted: "Granted", actions: "Actions" },
          roleLabels: { ADMIN: "Admin", SUPER_ADMIN: "Super admin", COMPLIANCE: "Compliance", WAREHOUSE: "Warehouse", FINANCE: "Finance", AUDITOR: "Auditor" },
          hierarchyNote: "Admin and Super admin also satisfy the compliance, warehouse, finance and auditor checks — a fact of the database's role functions, not a console rule.",
          empty: { title: "No platform admins", description: "No operational role has been granted." },
          grant: { heading: "Grant a role", lookup: "Look up profile", notFound: "No readable profile has this id.", alreadyAdmin: "This profile already holds a role — change it in the list instead.", submit: "Grant role", target: "Granting to" },
          change: { heading: "Change role", label: "Change role", submit: "Apply role change", confirmTitle: "Change this operator's role?", confirmDescription: "{decision} will become this operator's role immediately. The change is not persisted with your identity (recorded gap)." },
          activity: { deactivate: "Deactivate", activate: "Reactivate", confirmDeactivateTitle: "Deactivate this operator?", confirmDeactivateDescription: "The operator loses every console permission immediately. The change is not persisted with your identity (recorded gap).", confirmActivateTitle: "Reactivate this operator?", confirmActivateDescription: "The operator regains their role's permissions immediately." },
          self: "This is your own capability row — it cannot be changed from here.",
          profileUnavailable: "Profile name not readable.",
        },
        commission: {
          title: "Commission",
          description: "Commission policies and their quantity bands, exactly as stored in the approved schema. Checkout reads these at the moment of checkout and snapshots the result on the order.",
          breadcrumb: "Commission",
          caption: "Commission policies",
          newPolicy: "New policy",
          columns: { policy: "Policy", status: "Status", window: "Effective window", tiers: "Bands", coverage: "Coverage", open: "Open" },
          statuses: { DRAFT: "Draft", ACTIVE: "Active", ARCHIVED: "Archived" },
          empty: { title: "No commission policy", description: "No policy exists. Until an active, in-force policy with a covering band exists, every checkout snapshots 0% commission (COMMISSION-OPEN-01)." },
          semantics: {
            heading: "How checkout applies these settings",
            totalQuantity: "The band is selected using the order's TOTAL quantity (kg) — the sum of every line.",
            minInclusive: "A band's minimum is inclusive: a total equal to the minimum is inside the band.",
            maxExclusive: "A band's maximum is exclusive: a total equal to the maximum is NOT inside the band.",
            nullMax: "An empty maximum means the band is open-ended upwards.",
            wholeBase: "The selected percentage applies to the whole order base subtotal (merchandise, before shipping and tax) — not progressively per band.",
            overlap: "If more than one ACTIVE policy is in force at checkout, the one with the latest effective-from instant wins.",
          },
          inForce: { heading: "In force right now", none: "No active policy is in force right now — checkouts snapshot 0% commission (COMMISSION-OPEN-01).", winner: "Selected by checkout", overlapping: "Also in force (older effective-from; not selected)" },
          policy: {
            tiersHeading: "Quantity bands",
            addTier: "Add a band",
            tierColumns: { band: "Band (kg)", percentage: "Percentage", edit: "Edit" },
            noTiers: "This policy has no band — every quantity is uncovered.",
            band: "{min} kg ≤ total < {max} kg",
            bandOpen: "{min} kg ≤ total (open-ended)",
          },
          transitions: {
            heading: "Status",
            lead: "Exactly one named operation, confirmed before it runs. Status moves only between Draft, Active and Archived.",
            none: "No status operation applies in the current state.",
            options: {
              activate: { label: "Activate", description: "Draft → Active. Eligible once its effective-from instant has begun." },
              deactivate: { label: "Deactivate", description: "Active → Draft. No longer selectable by checkout." },
              archive: { label: "Archive", description: "Retires the policy (Archived). Can be restored to Draft later." },
              restore: { label: "Restore to draft", description: "Archived → Draft." },
            },
            submit: "Apply",
            confirmTitle: "Apply this status change?",
            confirmDescription: "{decision} will be applied. Eligible future checkouts only — no existing order changes.",
            highImpact: "Checkout",
          },
          coverage: {
            heading: "Band coverage",
            covered: "Every total quantity from 0 kg upwards is covered by a band.",
            warning: "Coverage gap: an order whose total quantity falls in an uncovered range currently receives 0% commission at checkout (no error is raised). This console only shows the gap — it does not block checkout and applies no fallback rate.",
            gapRange: "Uncovered: {from} kg ≤ total < {to} kg",
            gapOpen: "Uncovered: total ≥ {from} kg (no open-ended band)",
            overlap: "Overlapping bands: {a} and {b} — checkout takes the band with the higher minimum.",
            openItem: "COMMISSION-OPEN-01 — whether an uncovered quantity should be 0% or a checkout error is an open Business/Finance decision owned by Feature 008. Nothing here decides it.",
          },
        },
        tax: {
          title: "Tax rules",
          description: "VAT/tax rules by country. Checkout selects the active rule for the buyer's country with the latest effective-from instant and snapshots its rate on the order.",
          breadcrumb: "Tax rules",
          caption: "Tax rules",
          newRule: "New tax rule",
          columns: { country: "Country", tax: "Tax", rate: "Rate", base: "Taxable base", active: "Active", window: "Effective window", open: "Open" },
          taxableBases: { MERCHANDISE_ONLY: "Merchandise only", MERCHANDISE_AND_SHIPPING: "Merchandise and shipping" },
          empty: { title: "No tax rule", description: "No tax rule exists. Checkouts snapshot 0% tax until an active rule covers the buyer's country." },
          inForce: "In force now for {country}: {name} {rate}% ({base})",
          notInForce: "Not currently selected for {country} (inactive, not yet effective, ended, or superseded by a later effective-from)",
        },
        shipping: {
          title: "Shipping rules",
          description: "Flat-fee shipping rules by delivery method and country, stored in the approved schema.",
          breadcrumb: "Shipping rules",
          caption: "Shipping rules",
          newRule: "New shipping rule",
          columns: { method: "Delivery method", country: "Country", fee: "Flat fee", active: "Active", window: "Effective window", open: "Open" },
          anyCountry: "Any country",
          empty: { title: "No shipping rule", description: "No shipping rule exists." },
          unconsumed: {
            title: "Not applied by any checkout or shipment path yet",
            description: "No database function and no application path reads shipping rules today: checkout takes the shipping amount from the shipment record itself. Rows saved here are stored for the shipping seam Features 007/009 may adopt; nothing is charged from them now. Existing orders are unaffected either way.",
          },
        },
        paymentAccounts: {
          title: "Payment accounts",
          description: "Hills' bank accounts for manual/bank-transfer instructions. Platform admins may view; only super administrators may change them (database policy).",
          breadcrumb: "Payment accounts",
          caption: "Payment accounts",
          newAccount: "New payment account",
          columns: { account: "Account", bank: "Bank", identifiers: "Identifiers", currency: "Currency", active: "Active", open: "Open" },
          empty: { title: "No payment account", description: "No payment account has been configured." },
          highRisk: { title: "High-risk action", description: "Bank-detail changes are a high-risk action. Every change is recorded under the acting super administrator's identity as a single actor." },
          dualControl: { title: "No dual control (OPS-01)", description: "The approved schema has no maker-checker, approval request or second-approver construct, so this console cannot require one and does not simulate one. Recorded open item OPS-01 (Business / Security). Until it is decided, treat every change here as immediately effective and reviewed by nobody else." },
          readOnlyForAdmin: "Your role may view payment accounts; creating or changing them requires a super administrator (the database policy refuses other writes).",
          masked: "Identifiers are masked in this list. Open an account to see them.",
          noMemberPath: "Members never see these accounts through this console; any bank-instruction surface for members belongs to Feature 008 and does not exist today.",
        },
      },
      /**
       * Feature 010 RUN E — Audit area (read-only by construction). Every limitation names a real,
       * verified policy fact; nothing is simulated.
       */
      audit: {
        title: "Audit evidence",
        description: "Persisted evidence the Auditor role may read under the approved database policy, rendered without any action. Nothing on these pages can change a record.",
        breadcrumb: "Audit evidence",
        readOnly: "Read-only",
        readOnlyNote: "This area is built without mutation controls — there is nothing to click that changes data, and every mutation path in the console refuses the Auditor role on the server.",
        views: { listings: "Listings", custody: "Custody", log: "Audit log" },
        scope: {
          heading: "What the Auditor role can read",
          listings: "Marketplace listings and their status history: readable.",
          custody: "Inventory positions and storage allocations across organizations: readable.",
          log: "The platform audit log: not readable under the approved policy (DB-OPEN-06).",
          kyb: "KYB applications, documents and reviews: not readable — compliance-only under the approved policy.",
          finance: "Payments, proofs and financial snapshots: readable by policy, but their read layer belongs to Feature 008 (currently per-order only); an audit view is composed once it supplies list reads.",
          disputes: "Disputes and their transition history: readable by policy through Feature 012's auditor reads; this console does not yet include an auditor dispute view.",
          shipments: "Shipments: not readable — warehouse and order parties only.",
        },
        listings: {
          caption: "Listings (read-only)",
          columns: { listing: "Listing", seller: "Seller", status: "Status", quantity: "Quantity", updated: "Updated", open: "Open" },
          empty: { title: "No listings", description: "No listing is readable right now." },
          detail: { title: "Listing evidence", breadcrumb: "Listing", identity: "Listing", history: "Status history", historyNone: "No status change has been recorded.", reviewsUnavailable: "Compliance decision rows are not readable by the Auditor role under the approved policy; the trigger-written status history above is the persisted evidence available." },
          sellerUnavailable: "Seller name not readable by your role.",
        },
        custody: {
          caption: "Inventory positions (read-only)",
          lead: "Feature 005's stored positions: on hand (gross) and reserved, exactly as stored. No figure is derived here.",
          allocationsCaption: "Storage allocations (read-only)",
        },
        log: {
          heading: "Audit log",
          unavailableTitle: "Direct audit-log access is not available to the Auditor role",
          unavailableDescription:
            "Under the approved database policy the platform audit log is readable by platform administrators only. This is a recorded open item (DB-OPEN-06) awaiting a policy decision through the approved database-change process — the console does not use a wider credential to work around it, and nothing here is broken.",
          availableNote: "Recent audit entries, newest first, exactly as stored.",
          columns: { when: "When", actor: "Actor", entity: "Entity", action: "Action" },
          empty: "No audit entry is readable.",
        },
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
      avatarFallbackHint: "Shown as your initials, unless you upload your own photo below.",
      save: "Save",
      saving: "Saving…",
    },

    /**
     * Feature 010 RUN F010-ACCOUNT-MEDIA — shared account-security copy: password change (every
     * role) and email change (ADMIN/SUPER_ADMIN only). Top-level, reused by both
     * `/dashboard/settings` and `/dashboard-admin/account`.
     */
    accountSecurity: {
      password: {
        title: "Password",
        lead: "Change the password you sign in with.",
        newLabel: "New password",
        confirmLabel: "Confirm new password",
        submit: "Change password",
        saving: "Changing…",
        success: "Your password has been changed.",
        failure: "We couldn't change your password. Please try again.",
      },
      email: {
        title: "Sign-in email",
        readOnlyLead: "Your sign-in email. Contact an administrator if this needs to change.",
        newLabel: "New email address",
        submit: "Request email change",
        saving: "Requesting…",
        requestedToast: "Confirmation email sent.",
        requestedNote: "Check your new email address for a confirmation link. Your sign-in email won't change until you confirm it.",
        pendingTitle: "Email change pending",
        pendingDescription: "A confirmation is waiting for:",
        failure: "We couldn't request that email change. Please try again.",
        forbidden: "You don't have permission to change this email address.",
      },
      avatar: {
        title: "Profile photo",
        upload: "Upload photo",
        replace: "Replace photo",
        remove: "Remove photo",
        removing: "Removing…",
        uploading: "Uploading…",
        success: "Your profile photo has been updated.",
        removed: "Your profile photo has been removed.",
        failure: "We couldn't update your profile photo. Please try again.",
        invalidFile: "Please choose a JPEG, PNG, or WebP image up to 5 MB.",
        hint: "JPEG, PNG, or WebP — up to 5 MB.",
      },
      twoFactor: {
        title: "Two-factor authentication",
        lead: "An authenticator app (such as Google Authenticator, Microsoft Authenticator or 1Password) generates a new 6-digit code every 30 seconds. Once enabled, signing in needs your password AND a current code, so a stolen password alone cannot open your account.",
        statusLabel: "Status",
        status: {
          enabled: "Enabled",
          disabled: "Disabled",
          pending: "Enrollment not finished",
          unknown: "Status unavailable",
        },
        pendingNote: "An authenticator setup was started but never confirmed. Start again to get a fresh QR code — the unfinished setup is discarded.",
        unknownNote: "The authenticator status could not be read right now. Refresh the page to try again.",
        enable: "Set up authenticator app",
        resume: "Restart setup",
        factorsTitle: "Enrolled authenticators",
        factorFallbackName: "Authenticator app",
        addedOn: "Added {date}",
        remove: "Remove",
        removeTitle: "Remove this authenticator",
        removeLead: "Enter a current 6-digit code from this authenticator to confirm. After removal, sign-in will only need your password until you set up a new one.",
        codeLabel: "Current code",
        confirmRemove: "Confirm removal",
        removing: "Removing…",
        cancel: "Cancel",
        removed: "Two-factor authentication has been removed from this authenticator.",
        invalidCode: "That code isn't correct. Please try again.",
        notFound: "That authenticator is no longer on your account. Refresh the page.",
        failure: "We couldn't remove the authenticator. Please try again.",
        recoveryNote: "Recovery codes are not available. If you lose access to your authenticator app, contact Hills Coffee support to verify your identity and reset two-factor authentication.",
      },
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
        hold: {
          title: "On hold — stock variance review",
          description: "The warehouse has flagged this position for review. It can't be listed, reserved or delivered until the warehouse resolves it.",
        },
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
          INVENTORY_HELD: "This inventory is on hold or under a stock variance review, so it can't be listed until the warehouse resolves it.",
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

      /** Feature 010 approved scope addition (Part 6, 2026-09-22) — seller-owned listing images. */
      media: {
        heading: "Photos",
        empty: "No photos added yet.",
        upload: "Add photo",
        uploading: "Uploading…",
        uploadSuccess: "Photo added.",
        removeSuccess: "Photo removed.",
        updateFailed: "That couldn't be completed. Please try again.",
        invalidFile: "Please choose a JPEG, PNG, or WebP image up to 8 MB.",
        limitReached: "You've reached the maximum of 8 photos for this listing.",
        hint: "{count} of {max} photos",
        setPrimary: "Set as cover",
        primaryBadge: "Cover",
        remove: "Remove",
        removing: "Removing…",
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
        itemEdit: {
          quantityLabel: "Quantity (kg)",
          save: "Update quantity",
          saving: "Updating…",
          saved: "Quantity updated.",
          saveFailed: "That quantity couldn't be saved. It may exceed what's available or what's planned for delivery.",
          remove: "Remove item",
          removing: "Removing…",
          removed: "Item removed from your order.",
          removeFailed: "That item couldn't be removed. Refresh the order and try again.",
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
          /** Feature 009 RUN B (T014) — withdrawing an unsubmitted DRAFT plan before it is requested. */
          cancel: {
            action: "Cancel this plan",
            cancelling: "Cancelling…",
            cancelled: "Delivery plan cancelled.",
            cancelFailed: "This plan couldn't be cancelled.",
          },
          /**
           * Feature 009 RUN B (T015) — the honest reservation disclosure spec.md/plan.md require:
           * reservation happens once the order is PAID (or immediately if it already is), never
           * merely on request/submission — this copy must never claim otherwise.
           */
          reservationDisclosure: "Once your order payment is confirmed, this planned quantity is automatically reserved from your custody — it can no longer be listed for resale or planned into another delivery.",
          statusLabel: "Shipment status",
          status: {
            DRAFT: "Draft",
            REQUESTED: "Requested",
            READY: "Ready",
            RESERVED: "Reserved",
            CANCELLED: "Cancelled",
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

      /** Feature 007 RUN C (T013) — the expired-hold state. Recovery offers only routes that genuinely work (DB-OPEN-13). */
      expired: {
        title: "Reservation expired",
        description: "The 20-minute reservation window ended before payment was arranged, so the reserved quantity has been released back to the marketplace. Items on this order can't be changed.",
        reason: "Hold window ended",
        startNewOrder: "Start a new order",
        backToMarketplace: "Back to marketplace",
      },

      /** Feature 007 RUN C (T016) — `payments.status` display labels, 1:1 with the DB vocabulary. Display only; no payment action exists here. */
      payment: {
        label: "Payment",
        note: "Payment steps arrive in a later release. No payment is collected here.",
        status: {
          PENDING: "Pending",
          PROOF_SUBMITTED: "Proof submitted",
          UNDER_REVIEW: "Under review",
          CONFIRMED: "Confirmed",
          REJECTED: "Rejected",
          EXPIRED: "Expired",
          VOID: "Void",
        },
      },

      /** Feature 007 RUN C (T016) — `order_status_history` display. */
      history: {
        heading: "Status history",
        empty: "No status changes recorded yet.",
        reasonLabel: "Reason",
      },

      /** Feature 007 RUN C (T015) — extra list columns / indications. */
      listExtra: {
        createdColumn: "Created",
        amountColumn: "Total",
        amountPending: "—",
        holdUntil: "Held until {time}",
        holdEnded: "Hold window ended",
      },

      /** Feature 007 RUN C (T018) — dashboard registration + overview cards. */
      nav: {
        orders: "Orders",
      },
      overview: {
        boughtCard: "What did I buy?",
        boughtValue: "{count} completed purchase",
        boughtValuePlural: "{count} completed purchases",
        oweCard: "What do I owe?",
        oweValue: "{count} order awaiting payment",
        oweValuePlural: "{count} orders awaiting payment",
      },
    },

    /**
     * Feature 008 Phase 1 (T002) — the finance/escrow domain's own controlled result-code copy only.
     * No payment/funding UI exists yet (Phase 5, T022–T026); this is the localization-ready text for
     * `ACTION_FEEDBACK.FINANCE_READ_FAILED`/`FINANCE_FUNDING_UNAVAILABLE` so a later Server Action or
     * page can map its result to a real message on day one, never a placeholder. The unavailable copy
     * is deliberately honest and non-actionable (run directive "UNAVAILABLE UX CONTRACT"): it never
     * claims payment success, escrow initiation, a bank instruction, or a pending provider state, and
     * mirrors the existing `orders.payment.note` precedent's tone ("Payment steps arrive in a later
     * release. No payment is collected here.") rather than inventing new phrasing conventions.
     */
    finance: {
      errors: {
        readFailed: "We couldn't load that finance information. Please try again.",
      },
      funding: {
        unavailable: {
          title: "Funding isn't available",
          description: "Funding steps for this order aren't available yet. No payment method has been set up, and nothing has been charged or reserved.",
        },
        /** Feature 008 RUN E (Stripe provider decision) T014 — the Payment Element collector's own submit button. */
        pay: {
          submit: "Pay now",
        },
      },
      /**
       * Feature 008 T022 — private payment state routes (`/dashboard/payments`,
       * `/dashboard/payments/[orderId]`). `status` is the full 7-value `payments.status` vocabulary
       * (`payments_status_check`), verbatim from `lib/finance/validation.ts`'s own `PAYMENT_STATUSES`
       * — no invented escrow/provider label.
       */
      payments: {
        status: {
          PENDING: "Pending",
          PROOF_SUBMITTED: "Proof submitted",
          UNDER_REVIEW: "Under review",
          CONFIRMED: "Confirmed",
          REJECTED: "Rejected",
          EXPIRED: "Expired",
          VOID: "Void",
        },
        list: {
          title: "Payments",
          description: "The stored payment state for each of your orders — exact amounts and currency, never recalculated.",
          breadcrumb: "Payments",
          columns: {
            order: "Order",
            status: "Status",
            amount: "Amount",
          },
          viewDetails: "View details",
          empty: {
            title: "No payments yet",
            description: "A payment record appears here once you check out an order.",
          },
          caption: "Your payments",
        },
        detail: {
          breadcrumb: "Payment",
          orderReferenceLabel: "Order reference",
          paymentSectionHeading: "Payment state",
          amountLabel: "Amount",
          correlationLabel: "Correlation reference",
          externalReferenceLabel: "Provider reference",
          notYetAssigned: "Not yet assigned",
          financialsSectionHeading: "Order financial snapshot",
          financialsNotCalculated: "This order's financial snapshot has not been calculated yet.",
          fundingSectionHeading: "Funding",
          /**
           * Feature 008 T023 — the documents (proforma + tax invoice) and payout sections added to
           * `/dashboard/payments/[orderId]`. A payout row here is always the CALLER'S OWN seller
           * record for this order (RLS `payouts_view` never returns another seller's line) — never a
           * cross-organization figure. `payoutAccountingNotice` states the FR-017 distinction
           * explicitly next to the figure itself, not only in a tooltip a reader might miss.
           */
          documentsSectionHeading: "Documents",
          proforma: {
            heading: "Proforma invoice",
            codeLabel: "Reference",
            issuedAtLabel: "Issued",
            validUntilLabel: "Valid until",
            itemsHeading: "Items",
            itemColumns: {
              description: "Description",
              quantity: "Quantity",
              unitPrice: "Unit price",
              amount: "Amount",
            },
            none: "No proforma invoice has been issued for this order yet.",
          },
          taxInvoice: {
            heading: "Tax invoice",
            numberLabel: "Invoice number",
            issuedAtLabel: "Issued",
            none: "No tax invoice has been issued for this order yet.",
          },
          payoutsSectionHeading: "Payout",
          payoutColumns: {
            amount: "Amount",
            status: "Status",
            paidAt: "Paid",
            reference: "Payment reference",
          },
          payoutAccountingNotice: "A payout record is Hills' accounting entry, not proof that money has actually been transferred.",
          noPayout: "No payout record exists for this order.",
        },
      },
      /** Feature 008 T023 — `proforma_invoices.status`'s own 3-value CHECK constraint (`proforma_invoices_status_check`), verbatim. */
      proforma: {
        status: {
          ISSUED: "Issued",
          PAID: "Paid",
          VOID: "Void",
        },
      },
      /**
       * Feature 008 T023 — the seller's own payout records at `/dashboard/payouts`. `status` is the
       * full 4-value `payouts.status` vocabulary (`payouts_status_check`), verbatim — no invented
       * provider-release label; see FR-017 and `payoutAccountingNotice` above for why "PAID" here is
       * a platform accounting state, not confirmation of an actual bank transfer.
       */
      payouts: {
        status: {
          PENDING_PAYOUT: "Pending payout",
          PROCESSING: "Processing",
          PAID: "Paid",
          VOID: "Void",
        },
        nav: {
          payouts: "Payouts",
        },
        list: {
          title: "Payouts",
          description: "The stored payout record for each order you've sold on — exact amounts and currency, never recalculated. A payout record is Hills' accounting entry, not proof that money has actually been transferred.",
          breadcrumb: "Payouts",
          columns: {
            order: "Order",
            status: "Status",
            amount: "Amount",
            paidAt: "Paid",
          },
          viewOrder: "View order",
          empty: {
            title: "No payouts yet",
            description: "A payout record appears here once one of your resale listings is settled.",
          },
          caption: "Your payouts",
        },
      },
      nav: {
        payments: "Payments",
      },
    },

    /**
     * Feature 009 RUN B (T015) — the delivery-request entry point at `/dashboard/deliveries/new`.
     * The plan editor itself is `components/orders/shipment-planner.tsx` (reused, not duplicated —
     * see `orders.detail.shipment`'s own copy for its labels); this namespace covers only the page
     * shell around it: breadcrumb, title, and the "no order chosen yet" empty state.
     */
    deliveries: {
      new: {
        title: "Plan a delivery",
        breadcrumb: "New delivery",
        noOrderSelected: {
          title: "Choose an order to deliver",
          description: "Open the order you'd like to plan a delivery for, then continue from its delivery details section.",
          action: "Go to your orders",
        },
      },
      /**
       * Feature 009 RUN C (T019/T033) — the full 13-value `order_shipments.status` vocabulary
       * (`order_shipments_status_allowed`), verbatim from the live CHECK constraint. Every rendered
       * shipment status MUST use exactly one of these labels (FR-007/SC-004) — never an invented
       * synonym, never a status this list omits.
       */
      status: {
        DRAFT: "Draft",
        REQUESTED: "Requested",
        CAPACITY_CONFIRMED: "Capacity confirmed",
        READY: "Ready",
        RESERVED: "Reserved",
        PICKING: "Picking",
        BOOKED: "Booked",
        DISPATCHED: "Dispatched",
        PARTIALLY_DELIVERED: "Partially delivered",
        DELIVERED: "Delivered",
        CANCELLED: "Cancelled",
        FAILED: "Failed",
        DISPUTED: "Disputed",
      },
      nav: {
        deliveries: "Deliveries",
      },
      /** Feature 009 RUN C (T023) — the "where is it" overview contribution: shipments genuinely in progress right now. */
      overview: {
        activeCard: "In progress",
        activeValue: "{count} delivery in progress",
        activeValuePlural: "{count} deliveries in progress",
      },
      list: {
        title: "Deliveries",
        breadcrumb: "Deliveries",
        description: "Track every shipment across your orders, from request through delivery.",
        caption: "Your deliveries",
        columns: {
          code: "Shipment",
          order: "Order",
          status: "Status",
          updated: "Updated",
        },
        viewDetails: "View details",
        empty: {
          title: "No deliveries yet",
          description: "Once you plan a delivery from one of your orders, it will appear here.",
        },
      },
      /**
       * Feature 009 RUN C (T020) — the shipment detail/tracking page. `reason` copy is deliberately
       * honest about a genuine, confirmed database gap: `order_shipments` has NO reason/cancellation-
       * note/failure-note column (confirmed against the live schema — see `lib/delivery/warehouse.ts`'s
       * own header for the same finding). `notRecorded` renders instead of fabricating one.
       */
      detail: {
        breadcrumb: "Delivery",
        itemsHeading: "Items",
        addressHeading: "Delivery address",
        contactHeading: "Contact",
        timelineHeading: "Status",
        custodyHeading: "Custody",
        custodyEmpty: "No custody record is linked to this delivery yet.",
        reason: {
          heading: "Reason",
          notRecorded: "No reason has been recorded for this status yet.",
        },
        disputed: {
          note: "This delivery is disputed. Dispute details and resolution are handled separately.",
        },
        itemsTable: {
          item: "Item",
          planned: "Planned",
          delivered: "Delivered",
          progress: "Progress",
          partial: "Partial",
          complete: "Complete",
          notStarted: "Not started",
        },
        timeline: {
          created: "Created",
          ready: "Ready since",
          current: "Current status",
        },
      },
    },

    /**
     * Feature 012 RUN A (T006) — the member dispute surfaces (`/dashboard/disputes`,
     * `/dashboard/disputes/[disputeId]`). `status` is the full six-value `disputes.status` vocabulary,
     * verbatim from the live `disputes_status_check` CHECK constraint — every rendered dispute status
     * MUST use exactly one of these labels (FR-006/SC-004).
     *
     * PRODUCT HONESTY (FR-007, SC-005, DB-OPEN-09): nothing here states or implies that raising a
     * dispute — or a dispute being `FROZEN` — holds, freezes or stops an order, payment, settlement,
     * inventory, delivery or trading. The database performs no such effect, so the copy says so.
     * No copy promises a notification (DB-BLOCK-04) or offers a file upload (DB-BLOCK-01).
     */
    disputes: {
      status: {
        OPEN: "Open",
        UNDER_REVIEW: "Under review",
        FROZEN: "Frozen",
        RESOLVED: "Resolved",
        REJECTED: "Rejected",
        CLOSED: "Closed",
      },
      statusDescription: {
        OPEN: "Your dispute is recorded and waiting for Hills Compliance to start the review.",
        UNDER_REVIEW: "Hills Compliance is reviewing this dispute.",
        FROZEN:
          "Hills Compliance has marked this dispute as frozen. This status applies to the dispute record only — it does not by itself hold or stop the order, its payment, settlement, inventory, delivery or trading.",
        RESOLVED: "Hills Compliance has resolved this dispute. The recorded resolution is shown below.",
        REJECTED: "Hills Compliance has rejected this dispute. The recorded reason is shown below.",
        CLOSED: "This dispute is closed. Its record is kept as it is and cannot be edited.",
      },
      honesty: {
        heading: "What raising a dispute does",
        body: "Raising a dispute records it for review by Hills Compliance. It does not automatically freeze or hold the order, its payment, settlement, inventory, delivery or any trading activity. Any action on the order itself is a separate decision by Hills operations.",
        tracking: "Check this page for status changes — dispute updates are not sent as notifications yet.",
        evidence: "File attachments are not available for disputes yet. Include the relevant details in your description.",
      },
      list: {
        title: "Disputes",
        breadcrumb: "Disputes",
        description: "Raise a dispute on one of your organization's orders and follow its review.",
        caption: "Your organization's disputes",
        columns: {
          order: "Order",
          status: "Status",
          opened: "Opened",
          raisedBy: "Raised by",
        },
        raisedByYou: "You",
        raisedByColleague: "A colleague",
        viewDetails: "View dispute",
        empty: {
          title: "No disputes",
          description: "Your organization has not raised any disputes. If something is wrong with an order, you can raise one above.",
        },
      },
      raise: {
        heading: "Raise a dispute",
        description: "Choose the order and describe what went wrong. Hills Compliance reviews every dispute.",
        orderLabel: "Order",
        orderPlaceholder: "Choose an order",
        reasonLabel: "What went wrong",
        reasonHint: "Between 10 and 2,000 characters. Describe the problem and what you expect to happen.",
        submit: "Raise dispute",
        submitting: "Raising…",
        raised: "Dispute raised. It is now waiting for review.",
        noOrders: {
          title: "No orders to dispute",
          description: "Disputes are raised against your organization's orders. Once your organization has an order, you can raise a dispute on it here.",
        },
        errors: {
          orderRequired: "Choose the order this dispute is about.",
          reasonTooShort: "Describe the problem in at least 10 characters.",
          reasonTooLong: "Keep the description under 2,000 characters.",
          noteRequired: "Enter a note.",
          noteTooLong: "Keep the note under 2,000 characters.",
          resolutionTooShort: "Enter at least 10 characters.",
          resolutionTooLong: "Keep this under 2,000 characters.",
          invalidReference: "This dispute reference is not valid.",
        },
        feedback: {
          orderNotFound: "That order isn't available to your organization.",
          notCapable: "Your account can't raise disputes right now.",
          validation: "Check the highlighted fields.",
          failed: "We couldn't raise the dispute. Please try again.",
        },
      },
      detail: {
        breadcrumb: "Dispute",
        titlePrefix: "Dispute on order",
        statusHeading: "Status",
        detailsHeading: "Details",
        orderLabel: "Order",
        openedLabel: "Opened",
        updatedLabel: "Last updated",
        resolvedLabel: "Decided",
        raisedByLabel: "Raised by",
        correlationLabel: "Reference",
        reasonHeading: "Your description",
        resolutionHeading: "Resolution",
        resolutionPending: "No resolution has been recorded yet.",
        viewOrder: "View order",
        affectedHeading: "Affected order",
        notFound: {
          title: "Dispute not found",
          description: "This dispute doesn't exist or isn't available to your organization.",
          backAction: "Back to disputes",
        },
        orderStatusLabel: "Order status",
        orderStatusNote: "The order's status is managed by its own workflow. Raising or reviewing this dispute did not change it.",
      },
      evidence: {
        heading: "Evidence",
        description: "Add written notes that support this dispute. Every note is kept with its time and cannot be edited or removed.",
        filesUnavailableTitle: "Evidence files can't be stored yet",
        filesUnavailableBody: "Hills Coffee cannot currently store evidence files for disputes, so there is no file upload here. Describe the evidence in a note instead — for example what a photo or document shows and who has it.",
        empty: "No evidence has been added to this dispute yet.",
        listCaption: "Evidence on this dispute",
        uploadedByYou: "You",
        uploadedByOther: "Another participant or Hills operations",
        typeNote: "Written note",
        typeFileReference: "File reference — the file itself is not available",
        addedLabel: "Added",
        byLabel: "By",
        typeLabel: "Type",
        noteLabel: "New note",
        noteHint: "Up to 2,000 characters. Notes are stored as plain text.",
        submit: "Add note",
        submitting: "Adding…",
        added: "Note added to the dispute.",
        feedback: {
          notFound: "This dispute isn't available to your organization.",
          notCapable: "Your account can't add evidence right now.",
          validation: "Check the note and try again.",
          failed: "We couldn't add the note. Please try again.",
        },
      },
      linkage: {
        heading: "Disputes on this order",
        none: "No disputes have been raised on this order.",
        raise: "Raise a dispute on this order",
        viewDispute: "View dispute",
        noEffect:
          "A dispute does not change this order's status. It does not automatically freeze or hold the order, its payment, settlement, inventory or delivery.",
        orderDisputed: "This order's own status is Disputed. That status comes from the order's workflow, not from raising a dispute.",
        shipmentHeading: "Dispute records",
        shipmentDisputed:
          "This delivery's own status is Disputed. Raising a dispute does not set or clear that status, and a dispute record does not by itself hold the delivery.",
        shipmentNone: "No dispute record on this delivery's order is visible to your organization.",
      },
    },

    /**
     * Feature 012 RUN B (T010/T011) — the honest notification surfaces. DB-BLOCK-04: notifications
     * can be neither generated nor marked read by the approved system, and no delivery channel is
     * approved. Nothing here implies otherwise — no unread count, no "mark as read", no promise that a
     * saved preference makes anything arrive.
     */
    notificationCenter: {
      title: "Notifications",
      breadcrumb: "Notifications",
      description: "Notifications that exist for your account appear here.",
      limitation: {
        heading: "How notifications work today",
        generate: "The platform does not create notifications yet, so this list is normally empty. Check each area — orders, deliveries, disputes — for current status.",
        readState: "Notifications cannot be marked as read yet, so there is no read or unread state.",
        delivery: "Nothing is sent by email, SMS or WhatsApp yet.",
      },
      empty: {
        title: "No notifications",
        description: "There are no notifications for your account.",
      },
      listCaption: "Your notifications",
      receivedLabel: "Created",
      typeLabel: "Type",
      preferencesLink: "Notification preferences",
    },
    notificationPreferences: {
      title: "Notification preferences",
      breadcrumb: "Preferences",
      description: "Choose how you'd like to hear about each kind of update.",
      honesty:
        "These choices are saved to your account only. Hills Coffee does not send notifications by email, SMS or WhatsApp yet, so saving them does not make anything arrive.",
      notSaved: "You haven't saved preferences yet. Every option starts unticked until you save.",
      channelsLegend: "Channels",
      types: {
        ORDER_UPDATES: { label: "Order updates", description: "Placed, confirmed, paid and completed orders." },
        PAYMENT_INVOICES: { label: "Payment & invoices", description: "Proforma invoices, payment confirmation and refunds." },
        SHIPMENT_UPDATES: { label: "Shipment updates", description: "Dispatch, delivery and delivery exceptions." },
        KYB_DOCUMENTS: { label: "KYB & documents", description: "Review outcomes and expiring documents." },
      },
      channels: {
        EMAIL: "Email",
        SMS: "SMS",
        WHATSAPP: "WhatsApp",
      },
      submit: "Save preferences",
      submitting: "Saving…",
      saved: "Preferences saved.",
      failed: "We couldn't save your preferences. Please try again.",
      validation: "Some preference values were not valid. Reload the page and try again.",
      notCapable: "Please sign in again to save your preferences.",
      backToNotifications: "Back to notifications",
    },

    /**
     * Feature 012 RUN C (T014/T015) — the shared read-only history timeline and the honest audit-access
     * explanation. "Not recorded" is shown ONLY where the database column is genuinely empty; nothing is
     * inferred. DB-OPEN-06: the Auditor role cannot read audit logs — stated, never shown as "no activity".
     */
    history: {
      listLabel: "History",
      empty: "No history has been recorded yet.",
      byLabel: "By",
      byYou: "You",
      byOther: "Another user or Hills operations",
      byNotRecorded: "Not recorded",
      reasonLabel: "Reason",
      correlationLabel: "Reference",
      readOnlyNote: "History is a permanent record. It cannot be edited or deleted — corrections are added as new entries.",
    },
    auditAccess: {
      heading: "Audit log access",
      auditorLimitation:
        "The Auditor role cannot read the platform audit log yet. This is a recorded database access limitation (DB-OPEN-06) — it does not mean that no activity took place.",
      notPermitted: "Your role does not include access to the platform audit log.",
      unavailable: "The audit log could not be read right now. Please try again.",
    },

} as const;
