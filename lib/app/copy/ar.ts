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
