import type { DeepPartial } from "@/lib/public/copy/types";

import type { AppCopy } from "./types";

/**
 * Arabic sibling of `lib/app/copy/en.ts` (Phase 5.5, UIF-035/041; `CONTENT-AR-01`).
 *
 * Same honesty rule as `lib/public/copy/ar.ts`: this is interface chrome — control names,
 * landmark names, state copy, module NAMES — never a business claim, so every key here is a
 * faithful, reviewed translation, not an invented one.
 */
export const ar: DeepPartial<AppCopy> = {
    skipToContent: "تخطَّ إلى المحتوى الرئيسي",
    sidebarNavigation: "التطبيق",
    breadcrumbNavigation: "مسار التنقل",
    openMenu: "فتح القائمة",
    closeMenu: "إغلاق القائمة",
    menuTitle: "القائمة",
    menuDescription: "تنقل {workspace}",
    collapseSidebar: "طي الشريط الجانبي",
    expandSidebar: "توسيع الشريط الجانبي",
    memberWorkspace: "بوابة الأعضاء",
    adminWorkspace: "وحدة التشغيل",
    overview: "نظرة عامة",
    account: "الحساب",
    settings: "الإعدادات",
    signedInAs: "مسجّل الدخول باسم {name}",
    modulesArriveLater: "الوحدات ستُضاف مع الميزات القادمة.",
    foundationOverview: {
      foundation: {
        title: "أساس مساحة العمل جاهز",
        description:
          "هذه البوابة مهيأة لمنظمتك. تظهر وحدات التجارة والطلبات والحيازة هنا فقط عند إتاحة ميزاتها المعتمدة.",
        currentTitle: "المتاح اليوم",
        currentDescription: "تتوفر النظرة العامة وإعدادات الحساب من تنقل التطبيق.",
      },
      operations: {
        title: "أساس مساحة العمل التشغيلية جاهز",
        description:
          "هذه الوحدة مهيأة لمناطق العمل التشغيلية المصرّح بها. تتحقق كل وحدة مستقبلية من متطلب دورها على الخادم قبل عرض سجلات أو إجراءات مباشرة.",
        currentTitle: "المتاح اليوم",
        currentDescription: "تتوفر النظرة العامة الآن. تصل مناطق التشغيل الخاصة بالأدوار مع الميزة 010.",
      },
      boundaryTitle: "ما لا تعرضه هذه الصفحة",
      boundaryDescription:
        "لا تظهر أرقام نموذجية أو سجلات تجارية أو إجراءات مؤقتة. تظهر المعلومات الحية فقط عند تنفيذ وحدتها المعتمدة.",
    },
    noOrganization: {
      title: "لا توجد منظمة مرتبطة بحسابك",
      description:
        "حسابك غير مرتبط بعد بمنظمة معتمدة، لذا فإن بوابة الأعضاء غير متاحة. تُكمل عمليات هيلز كوفي هذه الخطوة كجزء من إجراءات العضوية.",
    },
    organizationSelection: {
      title: "اختر المنظمة التي تعمل نيابةً عنها",
      description: "حسابك ينتمي إلى أكثر من منظمة. اختر المنظمة التي تعمل نيابةً عنها الآن — يمكنك التبديل لاحقًا.",
      confirm: "متابعة",
    },
    emailNotVerified: {
      title: "تحقق من بريدك الإلكتروني للمتابعة",
      description: "تتطلب هذه المنطقة عنوان بريد إلكتروني مؤكدًا. تحقق من صندوق الوارد لرابط التحقق، أو اطلب رابطًا جديدًا.",
      resend: "إعادة إرسال رابط التحقق",
    },
    onboarding: {
      steps: {
        account: "إنشاء حسابك",
        verifyEmail: "تحقق من بريدك الإلكتروني",
        businessProfile: "الملف التجاري",
        kyb: "التحقق من KYB",
        review: "مراجعة الامتثال",
        access: "الوصول بعد الموافقة",
      },
      form: {
        title: "أخبرنا عن نشاطك التجاري",
        lead: "هذا يبدأ طلب عضويتك. تراجع هيلز كوفي كل طلب قبل منح صلاحية التداول.",
        buyerTitle: "شراء القهوة",
        buyerDescription: "استورد البن الأخضر من هيلز بعد الموافقة على عضويتك.",
        sellerTitle: "شراء وبيع القهوة",
        sellerDescription: "اشترِ من هيلز وأعد بيع المخزون المعتمد بعد الموافقة على عضويتك.",
        legalName: "الاسم القانوني للشركة",
        displayName: "الاسم التجاري",
        optional: "اختياري",
        country: "الدولة",
        taxNumber: "الرقم الضريبي",
        registrationNumber: "رقم تسجيل الشركة",
        contactEmail: "البريد الإلكتروني التجاري",
        contactPhone: "هاتف التواصل التجاري",
        consent: "أؤكد أن هذه المعلومات دقيقة وأنني مخوّل لتقديمها نيابةً عن هذه الشركة.",
        submit: "متابعة إلى KYB",
        submitting: "جارٍ الإرسال…",
        serverError: "تعذر بدء طلب عضويتك. يرجى المحاولة مرة أخرى.",
      },
      awaitingKyb: {
        title: "اكتمل الملف التجاري — التحقق من KYB هو الخطوة التالية",
        description:
          "تم إرسال ملف شركتك. الخطوة التالية هي التحقق من KYB (اعرف نشاطك التجاري)، تليها مراجعة الامتثال من هيلز. ستتمكن من الوصول إلى ميزات التداول بمجرد اعتماد مؤسستك.",
      },
    },
    noOperationalRole: {
      title: "الوصول التشغيلي مطلوب",
      description: "حسابك مسجّل الدخول، لكنه لا يحمل دورًا تشغيليًا في وحدة تشغيل هيلز كوفي.",
    },
    seller: {
      groupLabel: "البيع",
      note: "يظهر فقط عندما توفّر الميزة 004 القيمة can_sell = true للمنظمة الفاعلة.",
    },
    notifications: {
      label: "الإشعارات",
      unavailable: "الإشعارات غير متاحة بعد.",
    },
    dashboardAccount: {
      cardTitle: "منظمتك",
      roleLabel: "دورك",
      fallbackName: "الحساب",
    },
    dashboardOrgSwitcher: {
      label: "تبديل المنظمة الفاعلة",
    },
    dashboardOverview: {
      bought: {
        title: "ما اشتريته",
        empty: "ستظهر مشترياتك المكتملة هنا بعد تقديم طلب.",
      },
      owe: {
        title: "ما تدين به",
        empty: "سيظهر أي رصيد مستحق هنا بعد إصدار فاتورة لطلب.",
      },
      where: {
        title: "أين هو",
        empty: "ستظهر حالة التسليم والحيازة هنا عند وجود قهوة في الطريق أو التخزين.",
      },
      needsAction: {
        title: "يتطلب إجراءً منك",
        empty: "لا يوجد ما يستدعي انتباهك الآن.",
        acceptAgreements: "قبول اتفاقيات العضوية الحالية",
      },
    },
    patternsNote: "أساس بصري فقط — لا تُقرأ أي بيانات تجارية، ولا وحدة هنا مُفعّلة وظيفيًا.",
    roleVisibilityNote:
      "ظهور عنصر التنقل ليس تفويضًا أبدًا. كل وحدة حقيقية تتحقق من دورها بشكل مستقل على الخادم عند وجودها.",
    admin: {
      groups: {
        organizations: "المنظمات",
        catalogue: "الدليل",
        commercial: "الطلبات والمالية",
        logistics: "الخدمات اللوجستية",
        compliance: "الامتثال",
        audit: "التدقيق",
      },
      modules: {
        organizations: "المنظمات",
        members: "الأعضاء",
        kyb: "التحقق من المنظمة",
        catalogue: "الدليل",
        inventory: "المخزون",
        listings: "القوائم",
        orders: "الطلبات",
        paymentProofs: "إثباتات الدفع",
        finance: "المالية",
        settlement: "التسوية",
        payouts: "المدفوعات",
        pricing: "التسعير",
        commission: "العمولة",
        delivery: "التسليم",
        disputes: "النزاعات",
        audit: "التدقيق",
      },
    },

    kyb: {
      hub: {
        eyebrow: "التحقق من النشاط التجاري",
        noApplication: {
          title: "ابدأ التحقق من هويتك التجارية (KYB)",
          description:
            "التحقق من هوية النشاط التجاري (KYB) هو الخطوة التالية. يؤكد هوية شركتك وملكيتها وبياناتها المصرفية قبل أن تتمكن إدارة الامتثال في Hills من الموافقة على صلاحية التداول.",
          start: "بدء التحقق من الهوية التجارية",
        },
        draft: {
          title: "أكمل التحقق من هويتك التجارية",
          description: "طلب التحقق الخاص بك قيد الإعداد. أكمل العناصر المتبقية لإرساله للمراجعة.",
          continue: "متابعة التحقق",
        },
        submitted: {
          title: "طلب التحقق الخاص بك قيد المراجعة",
          description:
            "تم إرسال مستنداتك. ستراجعها إدارة الامتثال في Hills، وستظل صلاحيات الأعمال والتداول مقفلة حتى تتم الموافقة على منظمتك.",
        },
        underReview: {
          title: "قيد المراجعة",
          description: "تراجع إدارة الامتثال في Hills طلب التحقق الخاص بك. تظل صلاحيات الأعمال والتداول مقفلة حتى تتم الموافقة على منظمتك.",
        },
        resubmissionRequired: {
          title: "مطلوب إجراء بخصوص طلب التحقق",
          description: "طلبت إدارة الامتثال إجراء تعديلات على عناصر محددة. أصلح العناصر المذكورة أدناه للمتابعة.",
          fix: "إصلاح هذه العناصر",
          reviewedBy: "تمت المراجعة بواسطة {reviewer}",
        },
        rejected: {
          title: "لم تتم الموافقة على طلب التحقق",
          description: "لم توافق إدارة الامتثال في Hills على هذا الطلب.",
          reasonLabel: "السبب",
          noReason: "لم يُسجَّل سبب لهذا القرار.",
        },
        suspended: {
          title: "منظمتك موقوفة",
          description: "صلاحية التداول مقيدة حاليًا. تواصل مع Hills Coffee لمزيد من المعلومات.",
        },
        approved: {
          title: "تمت الموافقة على التحقق",
          description: "تمت الموافقة على منظمتك. يجري الآن تفعيل صلاحيات الأعمال لحسابك.",
        },
      },
      form: {
        title: "تفاصيل التحقق من النشاط التجاري",
        lead: "تراجع إدارة الامتثال في Hills هذه المعلومات إلى جانب المستندات المُرسَلة.",
        registeredAddress: "عنوان النشاط التجاري المسجَّل",
        businessActivity: "نشاط الأعمال",
        save: "حفظ",
        saving: "جارٍ الحفظ…",
        saved: "تم الحفظ",
      },
      documents: {
        title: "المستندات المطلوبة",
        lead: "ارفع كل مستند مطلوب أدناه. الصيغ المقبولة: PDF أو JPEG أو PNG، بحد أقصى 10 ميجابايت.",
        types: {
          TRADE_LICENSE: "الرخصة التجارية",
          PROOF_OF_INCORPORATION: "إثبات التأسيس",
          AUTHORIZED_SIGNATORY_ID: "وثيقة هوية المخوَّل بالتوقيع",
          UBO_DECLARATION: "إقرار المالك المستفيد الحقيقي",
          BANKING_EVIDENCE: "إثبات الحساب المصرفي",
        },
        status: {
          missing: "لم يُرفع بعد",
          PENDING: "مُرسَل — بانتظار المراجعة",
          ACCEPTED: "مقبول",
          REJECTED: "مرفوض — مطلوب استبدال",
        },
        upload: "رفع",
        replace: "استبدال",
        uploading: "جارٍ الرفع…",
        expiresOn: "تنتهي الصلاحية في {date}",
        expired: "انتهت الصلاحية في {date} — ارفع مستندًا ساريًا",
        rejectionReason: "السبب: {reason}",
        fileRequired: "اختر ملفًا لرفعه.",
        invalidFileType: "اختر ملف PDF أو JPEG أو PNG.",
        fileTooLarge: "اختر ملفًا حجمه 10 ميجابايت أو أقل.",
      },
      completeness: {
        title: "قبل الإرسال",
        allComplete: "كل ما هو مطلوب مكتمل.",
        registeredAddressRequired: "عنوان النشاط التجاري المسجل مطلوب.",
        businessActivityRequired: "وصف نشاطك التجاري مطلوب.",
        documentRequired: "المستند {document} مطلوب أو يحتاج إلى استبدال.",
        itemRequired: "هناك عنصر مطلوب غير مكتمل.",
      },
      submit: {
        submit: "إرسال للمراجعة",
        submitting: "جارٍ الإرسال…",
        resubmit: "إعادة الإرسال للمراجعة",
        resubmitting: "جارٍ إعادة الإرسال…",
      },
      toast: {
        startFailed: "تعذر بدء التحقق من KYB. يرجى المحاولة مرة أخرى.",
        draftSaved: "تم حفظ تفاصيل النشاط التجاري.",
        draftSaveFailed: "تعذر الحفظ — حاول مرة أخرى.",
        uploadSuccess: "تم رفع المستند.",
        uploadFailed: "فشل الرفع — حاول مرة أخرى.",
        applicationNotEditable: "لا يمكن لهذا الطلب استقبال مستندات الآن.",
        replacementStale: "تعذر استبدال هذا المستند. حدّث الصفحة ثم حاول مرة أخرى.",
        submitSuccess: "تم إرسال الطلب للمراجعة.",
        submitFailed: "تعذر الإرسال — راجع العناصر أدناه.",
        resubmitSuccess: "تمت إعادة إرسال الطلب للمراجعة.",
        resubmitFailed: "تعذر إعادة الإرسال — راجع العناصر أدناه.",
      },
    },

    feedback: {
      signInRequired: "يرجى تسجيل الدخول للمتابعة.",
      profileSaved: "تم حفظ تغييرات الملف الشخصي.",
      profileSaveFailed: "تعذر حفظ ملفك الشخصي. يرجى المحاولة مرة أخرى.",
      organizationContactSaved: "تم حفظ بيانات التواصل التجارية.",
      organizationContactSaveFailed: "تعذر حفظ بيانات التواصل التجارية. يرجى المحاولة مرة أخرى.",
      actingOrganizationSwitchFailed: "تعذر تبديل المنظمة. يرجى المحاولة مرة أخرى.",
      mfaStepUpRequired: "يرجى إكمال التحقق من تسجيل الدخول للمتابعة.",
      mfaStepUpAction: "تحقق الآن",
    },

    agreements: {
      eyebrow: "الاتفاقيات المطلوبة",
      title: "قبول الاتفاقيات المطلوبة",
      lead: "تمت الموافقة على منظمتك. راجع كل اتفاقية أدناه واقبلها للمتابعة.",
      types: {
        platform_terms: "شروط استخدام المنصة",
        purchase_terms: "شروط الشراء",
        storage_custody_terms: "شروط التخزين والحفظ",
        marketplace_terms: "شروط السوق",
        privacy_policy: "سياسة الخصوصية",
      },
      versionLabel: "الإصدار {version}",
      acceptedOn: "تم القبول في {date}",
      staleAcceptance: "قبلت الإصدار {version} في {date}. يتوفر إصدار أحدث يجب قبوله.",
      notAccepted: "لم يتم القبول بعد.",
      documentPending: "النص القانوني الكامل بانتظار اعتماد الإدارة القانونية لهيلز كوفي.",
      documentReference: "راجع مستند الاتفاقية الحالي للاطلاع على الشروط الكاملة.",
      accept: "قبول",
      accepting: "جارٍ القبول…",
      toast: {
        accepted: "تم قبول الاتفاقية.",
        acceptFailed: "تعذر تسجيل قبولك. يرجى المحاولة مرة أخرى.",
      },
    },

    settingsPage: {
      description: "أدر ملفك الشخصي وبيانات التواصل التجارية لمنظمتك.",
    },
    profile: {
      title: "الملف الشخصي",
      lead: "بيانات حسابك الشخصية. هذا منفصل عن بيانات التواصل التجارية لمنظمتك.",
      fullName: "الاسم الكامل",
      phone: "الهاتف الشخصي",
      companyName: "اسم الشركة (ملاحظة شخصية)",
      companyNameHint: "حقل شخصي قديم — ليس الاسم التجاري الرسمي أو الهوية القانونية لمنظمتك.",
      avatarFallbackHint: "يظهر كأحرف اسمك الأولى. لا يتوفر رفع صورة رمزية بعد.",
      save: "حفظ",
      saving: "جارٍ الحفظ…",
    },

    organization: {
      title: "المنظمة",
      lead: "بيانات التواصل التجارية المعروضة لهيلز كوفي، وعند الاقتضاء، لأطراف التداول.",
      displayName: "الاسم التجاري",
      email: "البريد الإلكتروني التجاري",
      phone: "الهاتف التجاري",
      save: "حفظ",
      saving: "جارٍ الحفظ…",
    },
    membership: {
      title: "أعضاء الفريق",
      lead: "أعضاء المنظمة الفاعلة حاليًا.",
      you: "أنت",
      roleOwner: "مالك",
      roleMember: "عضو",
      memberSince: "عضو منذ {date}",
      nameNotVisible: "عضو فريق",
    },
    actingOrganization: {
      title: "المنظمة الفاعلة",
      lead: "تنتمي إلى أكثر من منظمة. اختر المنظمة التي تعمل نيابةً عنها.",
      current: "الحالية",
      switchTo: "التبديل إلى {organization}",
    },

    inventory: {
      nav: {
        inventory: "المخزون",
        storage: "التخزين",
      },
      overview: {
        positionsCard: "المراكز المملوكة",
        positionsValue: "{count} مركز",
        positionsValuePlural: "{count} مراكز",
        storedCard: "في عهدة هيلز",
        storedValue: "{count} تخصيص",
        storedValuePlural: "{count} تخصيصات",
      },
      list: {
        title: "المخزون",
        description: "القهوة التي تملكها منظمتك، ومكان وجودها.",
        caption: "مراكز مخزونك",
        empty: {
          title: "لا يوجد مخزون بعد",
          description: "تظهر المراكز هنا بمجرد تسوية عملية شراء ضمن عهدة منظمتك.",
        },
        columns: {
          lot: "الدفعة",
          warehouse: "المستودع",
          ownedQuantity: "الكمية المملوكة",
          reservedQuantity: "الكمية المحجوزة",
          actions: "الإجراءات",
        },
        lotUnavailable: "تفاصيل الدفعة غير متاحة",
        warehouseUnavailable: "تفاصيل المستودع غير متاحة",
        viewDetails: "عرض المركز",
        pagination: {
          previous: "السابق",
          next: "التالي",
          pageLabel: "الصفحة {page}",
        },
      },
      detail: {
        title: "المركز",
        breadcrumb: "المخزون",
        lotHeading: "الدفعة",
        lotUnavailable: {
          title: "تفاصيل الدفعة غير متاحة",
          description: "هذا المركز مملوك لك فعليًا — لكن تفاصيل القهوة/الدفعة غير قابلة للقراءة بموجب صلاحيات الوصول الحالية.",
        },
        warehouseHeading: "موقع العهدة",
        warehouseUnavailable: "تفاصيل المستودع غير متاحة.",
        recordedSince: "مسجّل منذ {date}",
        updated: "آخر تحديث {date}",
      },
      availability: {
        title: "التوفر",
        ownedQuantity: "الكمية المملوكة",
        reservedQuantity: "الكمية المحجوزة",
        reservationCause: {
          heading: "الحجز",
          knownOrder: "محجوز مقابل الطلب {orderCode}",
          knownHoldExpires: "ينتهي الحجز في {date}",
          knownNoCode: "محجوز مقابل طلب يمكنك الاطلاع عليه.",
          unknown: "تفاصيل الحجز غير متاحة حاليًا.",
          none: "لا توجد كمية محجوزة حاليًا.",
        },
        integrityError: {
          title: "مشكلة في سلامة البيانات",
          description: "الكمية المحجوزة لهذا المركز لا تتوافق مع الكمية المملوكة. تواصل مع دعم هيلز كوفي.",
        },
      },
      storage: {
        title: "التخزين",
        description: "قهوتك في عهدة هيلز المعتمدة، بحسب التخصيص.",
        caption: "تخصيصات التخزين الخاصة بك",
        empty: {
          title: "لا يوجد شيء في التخزين بعد",
          description: "تظهر التخصيصات هنا بمجرد وضع قهوتك المشتراة في العهدة.",
        },
        columns: {
          status: "الحالة",
          allocatedQuantity: "الكمية المخصصة",
          releasedQuantity: "الكمية المفرج عنها",
          order: "الطلب",
        },
        status: {
          STORED: "مخزّن",
          RELEASED: "تم الإفراج عنه",
          DELIVERED: "تم التسليم",
        },
        orderUnavailable: "مرجع الطلب غير متاح",
      },
      history: {
        title: "سجل الملكية",
        breadcrumb: "المخزون",
        description: "سجل غير قابل للتغيير يوضح كيفية نشوء ملكية قهوتك. لا يمكن تعديل أي شيء هنا أو حذفه.",
        empty: {
          title: "لا يوجد سجل بعد",
          description: "تظهر أحداث الملكية هنا بمجرد أن تصبح منظمتك طرفًا في عملية نقل.",
        },
        eventType: {
          INITIAL_ALLOCATION: "تخصيص أولي",
          SALE: "بيع",
          RESALE: "إعادة بيع",
          ADJUSTMENT: "تسوية",
          VOID: "إبطال",
        },
        direction: {
          incoming: "إلى منظمتك",
          outgoing: "من منظمتك",
          both: "نقل داخلي",
        },
        counterpartyRedacted: "منظمة أخرى",
        reasonLabel: "السبب",
        correlationLabel: "المرجع",
        immutableNote: "هذا السجل للقراءة فقط، ولا يمكن تعديله أو تصحيحه أو إعادة ترتيبه.",
      },
      notFound: {
        title: "المركز غير موجود",
        description: "هذا المركز غير موجود أو غير متاح لمنظمتك.",
        backAction: "العودة إلى المخزون",
      },
    },

};
