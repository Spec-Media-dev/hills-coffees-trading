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

};
