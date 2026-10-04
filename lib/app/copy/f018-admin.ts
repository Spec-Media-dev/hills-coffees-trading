/**
 * Feature 018 — Admin copy (Coffee workflow, bank default control). Split from `en.ts`/`ar.ts` to keep those files
 * reviewable; `en.ts` composes `f018AdminEn` (the type source) and `ar.ts` overlays `f018AdminAr`.
 * Every key here exists in BOTH languages (enforced by tests/i18n/f018-admin-copy.test.ts).
 */

import type { DeepPartial } from "@/lib/public/copy/types";

const workflowEn = {
  newTitle: "New Coffee",
  newLead: "Save the identity first. Everything after that is saved step by step, so you can leave and come back to the same Coffee at any time.",
  editLead: "Each step saves on its own. Progress is read from the saved record, never from this screen.",
  stepperLabel: "Coffee setup steps",
  previewLabel: "Readiness and preview",
  steps: {
    identity: { label: "Identity", hint: "Name, slug and English story" },
    arabic: { label: "Arabic", hint: "Arabic name and description" },
    taxonomy: { label: "Origin & profile", hint: "Origin, type, variety, process" },
    media: { label: "Images", hint: "Public catalogue photography" },
    inventory: { label: "Stock", hint: "Real Hills inventory behind it" },
    offer: { label: "Offer & Featured", hint: "USD per kg, quantity, Featured" },
    readiness: { label: "Review & publish", hint: "Readiness, previews, publication" },
  },
  stepState: { done: "Complete", attention: "Needs attention", todo: "Not started", locked: "Save the identity first", current: "Current step" },
  common: {
    save: "Save", saveContinue: "Save and continue", saving: "Saving…", back: "Back", next: "Next step", retry: "Try again", reloadLatest: "Load the latest version",
    required: "Required", optional: "Optional", none: "None", revision: "Revision", loading: "Loading…", status: "Status", openPublic: "Open public page",
  },
  identity: {
    heading: "Identity", lead: "The English name, public address and description are the canonical record.",
    name: "Coffee name (English)", nameHint: "Shown on the public catalogue and in buyer views.",
    slug: "Public address", slugHint: "Lowercase letters, numbers and single hyphens. It becomes /coffee/<address>.",
    description: "Description (English)", descriptionHint: "Required before publication.", createAction: "Create Coffee",
  },
  arabic: {
    heading: "Arabic content", lead: "Saved separately from English: saving one language can never overwrite the other.",
    name: "اسم القهوة (Arabic)", description: "الوصف (Arabic)", requiredToPublish: "Arabic name and description are required before publication.",
    englishFallback: "Until Arabic is complete, visitors see the English text marked as English.",
  },
  taxonomy: {
    heading: "Origin & profile", lead: "An active origin is required before publication; the other references are optional.",
    origin: "Origin", coffeeType: "Coffee type", variety: "Variety", processing: "Processing method", packaging: "Packaging", inactive: "inactive",
  },
  media: {
    heading: "Catalogue images", lead: "The primary image represents the Coffee publicly. A recorded image whose file is missing blocks publication.",
    upload: "Add image", uploadHint: "JPEG, PNG or WebP, up to 5 MB, at most 12 images.", uploading: "Uploading…", empty: "No images yet",
    emptyBody: "Add at least one image and make it primary before publishing.", primary: "Primary", makePrimary: "Make primary", remove: "Remove",
    removeTitle: "Remove this image?", removeBody: "The image disappears from the catalogue. If it was the primary image, the next image becomes primary.",
    cancel: "Cancel", cleanupPending: "The image was saved, but its stored file could not be removed yet. It is not shown anywhere and is safe to leave.",
    noPrimary: "No primary image is set.", imageAlt: "Catalogue image {index}",
  },
  inventory: {
    heading: "Backing stock", lead: "An offer must be backed by real Hills inventory. This step only selects existing stock — it can never create or change it.",
    emptyTitle: "No stock is available for this Coffee yet",
    emptyBody: "Stock is booked by the Warehouse team against a lot of this Coffee. Your Coffee is saved; ask the Warehouse to register the lot and quantity, then return to this step.",
    handoff: "Hand off to Warehouse", lot: "Lot", warehouse: "Warehouse", location: "Location", tradable: "Tradable", held: "On hold", hasOffer: "Already has an offer",
    eligible: "Eligible", notEligible: "Not eligible", select: "Use this stock", selected: "Selected", unavailable: "Stock could not be loaded. Try again.",
    selectFirst: "Select the stock that will back the offer.",
  },
  offer: {
    heading: "Offer & Featured", lead: "Choose the price and quantity buyers will see. Compliance reviews the offer before it can be published.",
    price: "Price (USD per kg)", priceHint: "USD only.", quantity: "Offer quantity (kg)", quantityHint: "Cannot exceed the stock that backs it.", title: "Offer title (optional)",
    create: "Create offer", saveChanges: "Save offer", code: "Offer code", status: "Offer status", noOffer: "No offer yet. You can still publish the catalogue entry on its own.",
    lockedByReview: "This offer is in review or approved, so its price and quantity are locked.", rejected: "Rejected: {reason}", handoffCompliance: "Compliance reviews and approves offers.", openReview: "Open in the Compliance review queue",
    reserved: "Reserved", select: "Offer to edit",
  },
  featured: {
    heading: "Featured", lead: "Featured Coffees can appear in the homepage Featured section once published. Featuring does not publish.", on: "Featured", off: "Not featured",
    enable: "Feature this Coffee", disable: "Remove from Featured", since: "Featured since {date}",
  },
  readiness: {
    heading: "Publication readiness", lead: "Each requirement is checked on the saved record.", ready: "Ready to publish", notReady: "Not ready yet",
    items: {
      english_name: "English name", english_description: "English description", arabic_name: "Arabic name", arabic_description: "Arabic description",
      origin_missing: "An origin is selected", origin_inactive: "The selected origin is active", primary_image: "A primary image whose file exists",
    },
    done: "Done", missing: "Missing", goTo: "Go to step",
  },
  preview: {
    publicHeading: "Public preview", publicLead: "What an anonymous visitor sees. No price, quantity or stock ever appears here.",
    purchaseHeading: "Purchase preview", purchaseLead: "What an authorized buyer sees for the selected offer.",
    noOffer: "Create an offer to see the purchase view.", perKg: "per kg", available: "available", imageMissing: "No image yet", unnamed: "Untitled Coffee", englishBadge: "English",
    notPublic: "Not public yet",
  },
  publish: {
    heading: "Publication", alreadyPublished: "This Coffee is published.",
    catalogueOnlyTitle: "Publish catalogue entry", catalogueOnlyBody: "Publishes the Coffee page only. Buyers cannot purchase it until an approved offer is published.",
    coordinatedTitle: "Publish Coffee and approved offer", coordinatedBody: "Publishes the Coffee and its approved offer together — both or neither.",
    needsApproved: "Needs an approved offer. Compliance approves offers; you will see it here once approved.", handoffCompliance: "Offer publication needs Compliance authority.",
    confirmTitle: "Publish now?", confirmBodyCatalogue: "The Coffee becomes visible on the public website.", confirmBodyCoordinated: "The Coffee becomes public and its offer becomes purchasable by authorized buyers.",
    confirm: "Publish", cancel: "Cancel", blockedBy: "Resolve the missing requirements first.",
  },
  statuses: {
    coffee: { DRAFT: "Draft", PUBLISHED: "Published", ARCHIVED: "Archived" },
    offer: { DRAFT: "Draft", PENDING_REVIEW: "In review", APPROVED: "Approved", REJECTED: "Rejected", PUBLISHED: "Published", PARTIALLY_FILLED: "Partially filled", SUSPENDED: "Suspended", SOLD_OUT: "Sold out", ARCHIVED: "Archived" },
  },
  errors: {
    AUTH_REQUIRED: "Sign in to continue.", NOT_CAPABLE: "Your role cannot make this change.", MFA_REQUIRED: "Complete the extra verification step, then try again.",
    VALIDATION: "Check the highlighted fields and try again.", REVISION_CONFLICT: "Someone else changed this Coffee. Load the latest version, then re-apply your change.",
    REQUEST_CONFLICT: "This request was already used for different content. Reload and try again.", SLUG_TAKEN: "That public address is already used by another Coffee.",
    NOT_FOUND: "This record no longer exists.", ORIGIN_INACTIVE: "That origin is not active.", REFERENCE_INVALID: "One of the selected references is not valid.",
    NOT_READY: "The Coffee is not ready to publish. See the checklist.", NO_ELIGIBLE_STOCK: "That stock cannot back an offer for this Coffee.",
    STOCK_INSUFFICIENT: "The quantity is more than the available stock, or the stock is on hold.", ACTIVE_OFFER_EXISTS: "An offer already exists for this stock.",
    OFFER_INVALID: "Enter a price and quantity above zero.", OFFER_NOT_EDITABLE: "This offer can no longer be edited.", OFFER_NOT_APPROVED: "The offer must be approved by Compliance first.",
    PUBLICATION_AUTHORITY_REQUIRED: "Publishing an offer needs Compliance authority.", STATUS_INVALID: "This Coffee cannot be published from its current status.",
    MEDIA_INVALID: "Use a JPEG, PNG or WebP image up to 5 MB.", MEDIA_LIMIT: "The image limit has been reached.", MEDIA_NOT_FOUND: "That image no longer exists.",
    OUTCOME_UNKNOWN: "We could not confirm whether the change was saved. Check before trying again.", SAVE_FAILED: "The change could not be saved. Nothing was changed — try again.",
  },
  validation: {
    INVALID_REFERENCE: "Choose a valid option.", NAME_REQUIRED: "Enter a name.", NAME_TOO_LONG: "That name is too long.", SLUG_REQUIRED: "Enter a public address.",
    SLUG_TOO_LONG: "That address is too long.", SLUG_INVALID: "Use lowercase letters, numbers and single hyphens only.", DESCRIPTION_TOO_LONG: "That description is too long.",
    PRICE_INVALID: "Enter a price above zero.", QUANTITY_INVALID: "Enter a quantity above zero.", REVISION_INVALID: "Reload the page and try again.", FEATURED_INVALID: "Choose a valid option.",
    REQUIRED: "This field is required.", INVALID: "This value is not valid.",
  },
  toasts: {
    created: "Coffee created. Continue with the next step.", identitySaved: "Identity saved.", arabicSaved: "Arabic content saved.", taxonomySaved: "Origin and profile saved.",
    mediaAdded: "Image added.", mediaRemoved: "Image removed.", primarySet: "Primary image updated.", offerCreated: "Offer created as a draft.", offerSaved: "Offer saved.",
    featuredOn: "Coffee is now Featured.", featuredOff: "Coffee removed from Featured.", publishedCatalogue: "Coffee published.", publishedCoordinated: "Coffee and offer published.",
    recoveredCommitted: "That change had been saved. The page is now up to date.", recoveredNotCommitted: "That change was not saved. You can try again.",
  },
  conflict: { title: "A newer version exists", body: "Another operator saved changes first. Nothing of yours was overwritten.", action: "Load the latest version" },
  unknown: { title: "Could not confirm the result", body: "Check whether the change was saved before trying again — this avoids creating duplicates.", check: "Check now", checking: "Checking…" },
} as const;

const workflowAr: DeepPartial<typeof workflowEn> = {
  newTitle: "قهوة جديدة",
  newLead: "احفظ الهوية أولاً. كل ما بعدها يُحفظ خطوة بخطوة، فيمكنك المغادرة والعودة إلى القهوة نفسها في أي وقت.",
  editLead: "تُحفظ كل خطوة على حدة. يُقرأ التقدّم من السجل المحفوظ لا من هذه الشاشة.",
  stepperLabel: "خطوات إعداد القهوة",
  previewLabel: "الجاهزية والمعاينة",
  steps: {
    identity: { label: "الهوية", hint: "الاسم والرابط والوصف الإنجليزي" },
    arabic: { label: "العربية", hint: "الاسم والوصف بالعربية" },
    taxonomy: { label: "المنشأ والملف", hint: "المنشأ والنوع والصنف والمعالجة" },
    media: { label: "الصور", hint: "صور الكتالوج العامة" },
    inventory: { label: "المخزون", hint: "مخزون هيلز الفعلي خلف العرض" },
    offer: { label: "العرض والتمييز", hint: "دولار للكيلوغرام والكمية والتمييز" },
    readiness: { label: "المراجعة والنشر", hint: "الجاهزية والمعاينة والنشر" },
  },
  stepState: { done: "مكتملة", attention: "تحتاج إلى انتباه", todo: "لم تبدأ", locked: "احفظ الهوية أولاً", current: "الخطوة الحالية" },
  common: {
    save: "حفظ", saveContinue: "حفظ ومتابعة", saving: "جارٍ الحفظ…", back: "رجوع", next: "الخطوة التالية", retry: "حاول مرة أخرى", reloadLatest: "تحميل أحدث نسخة",
    required: "مطلوب", optional: "اختياري", none: "لا شيء", revision: "المراجعة", loading: "جارٍ التحميل…", status: "الحالة", openPublic: "فتح الصفحة العامة",
  },
  identity: {
    heading: "الهوية", lead: "الاسم الإنجليزي والرابط العام والوصف هي السجل الأساسي.",
    name: "اسم القهوة (بالإنجليزية)", nameHint: "يظهر في الكتالوج العام وفي واجهات المشترين.",
    slug: "الرابط العام", slugHint: "أحرف إنجليزية صغيرة وأرقام وشرطات مفردة. يصبح /coffee/<الرابط>.",
    description: "الوصف (بالإنجليزية)", descriptionHint: "مطلوب قبل النشر.", createAction: "إنشاء القهوة",
  },
  arabic: {
    heading: "المحتوى العربي", lead: "يُحفظ بشكل منفصل عن الإنجليزية: حفظ إحدى اللغتين لا يستبدل الأخرى أبداً.",
    name: "اسم القهوة (بالعربية)", description: "الوصف (بالعربية)", requiredToPublish: "الاسم والوصف بالعربية مطلوبان قبل النشر.",
    englishFallback: "إلى أن يكتمل المحتوى العربي يرى الزوار النص الإنجليزي مع إشارة إلى أنه إنجليزي.",
  },
  taxonomy: {
    heading: "المنشأ والملف", lead: "يلزم منشأ نشط قبل النشر؛ بقية المراجع اختيارية.",
    origin: "المنشأ", coffeeType: "نوع القهوة", variety: "الصنف", processing: "طريقة المعالجة", packaging: "التعبئة", inactive: "غير نشط",
  },
  media: {
    heading: "صور الكتالوج", lead: "الصورة الأساسية تمثّل القهوة علناً. وجود صورة مسجّلة ملفها مفقود يمنع النشر.",
    upload: "إضافة صورة", uploadHint: "JPEG أو PNG أو WebP حتى 5 ميغابايت وبحد أقصى 12 صورة.", uploading: "جارٍ الرفع…", empty: "لا توجد صور بعد",
    emptyBody: "أضف صورة واحدة على الأقل واجعلها أساسية قبل النشر.", primary: "أساسية", makePrimary: "جعلها أساسية", remove: "إزالة",
    removeTitle: "إزالة هذه الصورة؟", removeBody: "ستختفي الصورة من الكتالوج. إن كانت أساسية فستصبح الصورة التالية أساسية.",
    cancel: "إلغاء", cleanupPending: "حُفظ التغيير لكن تعذّرت إزالة الملف المخزّن بعد. لا يظهر في أي مكان وتركه آمن.",
    noPrimary: "لا توجد صورة أساسية.", imageAlt: "صورة الكتالوج {index}",
  },
  inventory: {
    heading: "المخزون الداعم", lead: "يجب أن يستند العرض إلى مخزون فعلي لدى هيلز. تكتفي هذه الخطوة باختيار مخزون موجود ولا يمكنها إنشاؤه أو تعديله.",
    emptyTitle: "لا يوجد مخزون متاح لهذه القهوة بعد",
    emptyBody: "يسجّل فريق المستودع المخزون على دفعة من هذه القهوة. قهوتك محفوظة؛ اطلب من المستودع تسجيل الدفعة والكمية ثم عُد إلى هذه الخطوة.",
    handoff: "إحالة إلى المستودع", lot: "الدفعة", warehouse: "المستودع", location: "الموقع", tradable: "القابل للتداول", held: "محجوز", hasOffer: "لديه عرض بالفعل",
    eligible: "مؤهَّل", notEligible: "غير مؤهَّل", select: "استخدام هذا المخزون", selected: "محدَّد", unavailable: "تعذّر تحميل المخزون. حاول مرة أخرى.",
    selectFirst: "اختر المخزون الذي سيدعم العرض.",
  },
  offer: {
    heading: "العرض والتمييز", lead: "اختر السعر والكمية التي سيراها المشترون. تراجع الامتثال العرض قبل أن يمكن نشره.",
    price: "السعر (دولار أمريكي للكيلوغرام)", priceHint: "بالدولار الأمريكي فقط.", quantity: "كمية العرض (كغ)", quantityHint: "لا يمكن أن تتجاوز المخزون الداعم.", title: "عنوان العرض (اختياري)",
    create: "إنشاء العرض", saveChanges: "حفظ العرض", code: "رمز العرض", status: "حالة العرض", noOffer: "لا يوجد عرض بعد. يمكنك مع ذلك نشر صفحة الكتالوج وحدها.",
    lockedByReview: "هذا العرض قيد المراجعة أو معتمد، لذا السعر والكمية مقفلان.", rejected: "مرفوض: {reason}", handoffCompliance: "الامتثال هو من يراجع العروض ويعتمدها.", openReview: "فتح في قائمة مراجعة الامتثال",
    reserved: "المحجوز", select: "العرض المراد تعديله",
  },
  featured: {
    heading: "التمييز", lead: "يمكن أن تظهر القهوة المميّزة في قسم المميّزة بالصفحة الرئيسية بعد نشرها. التمييز لا يعني النشر.", on: "مميّزة", off: "غير مميّزة",
    enable: "تمييز هذه القهوة", disable: "إزالة من المميّزة", since: "مميّزة منذ {date}",
  },
  readiness: {
    heading: "جاهزية النشر", lead: "يُفحص كل شرط على السجل المحفوظ.", ready: "جاهزة للنشر", notReady: "غير جاهزة بعد",
    items: {
      english_name: "الاسم بالإنجليزية", english_description: "الوصف بالإنجليزية", arabic_name: "الاسم بالعربية", arabic_description: "الوصف بالعربية",
      origin_missing: "تم اختيار منشأ", origin_inactive: "المنشأ المختار نشط", primary_image: "صورة أساسية ملفها موجود",
    },
    done: "تم", missing: "ناقص", goTo: "انتقل إلى الخطوة",
  },
  preview: {
    publicHeading: "المعاينة العامة", publicLead: "ما يراه زائر مجهول. لا يظهر هنا أي سعر أو كمية أو مخزون.",
    purchaseHeading: "معاينة الشراء", purchaseLead: "ما يراه مشترٍ مخوَّل للعرض المحدَّد.",
    noOffer: "أنشئ عرضاً لرؤية واجهة الشراء.", perKg: "للكيلوغرام", available: "متاح", imageMissing: "لا توجد صورة بعد", unnamed: "قهوة بلا اسم", englishBadge: "إنجليزي",
    notPublic: "غير منشورة بعد",
  },
  publish: {
    heading: "النشر", alreadyPublished: "هذه القهوة منشورة.",
    catalogueOnlyTitle: "نشر صفحة الكتالوج", catalogueOnlyBody: "ينشر صفحة القهوة فقط. لا يستطيع المشترون شراءها قبل نشر عرض معتمد.",
    coordinatedTitle: "نشر القهوة والعرض المعتمد", coordinatedBody: "ينشر القهوة وعرضها المعتمد معاً — إما الاثنان أو لا شيء.",
    needsApproved: "يلزم عرض معتمد. الامتثال هو من يعتمد العروض وسيظهر هنا بعد الاعتماد.", handoffCompliance: "نشر العرض يتطلب صلاحية الامتثال.",
    confirmTitle: "النشر الآن؟", confirmBodyCatalogue: "ستصبح القهوة ظاهرة على الموقع العام.", confirmBodyCoordinated: "ستصبح القهوة عامة ويصبح عرضها قابلاً للشراء من المشترين المخوَّلين.",
    confirm: "نشر", cancel: "إلغاء", blockedBy: "عالج المتطلبات الناقصة أولاً.",
  },
  statuses: {
    coffee: { DRAFT: "مسودة", PUBLISHED: "منشورة", ARCHIVED: "مؤرشفة" },
    offer: { DRAFT: "مسودة", PENDING_REVIEW: "قيد المراجعة", APPROVED: "معتمد", REJECTED: "مرفوض", PUBLISHED: "منشور", PARTIALLY_FILLED: "مباع جزئياً", SUSPENDED: "معلّق", SOLD_OUT: "نفد", ARCHIVED: "مؤرشف" },
  },
  errors: {
    AUTH_REQUIRED: "سجّل الدخول للمتابعة.", NOT_CAPABLE: "دورك لا يسمح بهذا التغيير.", MFA_REQUIRED: "أكمل خطوة التحقق الإضافية ثم حاول مرة أخرى.",
    VALIDATION: "راجع الحقول المحدَّدة وحاول مرة أخرى.", REVISION_CONFLICT: "قام شخص آخر بتغيير هذه القهوة. حمّل أحدث نسخة ثم أعد تطبيق تغييرك.",
    REQUEST_CONFLICT: "استُخدم هذا الطلب سابقاً بمحتوى مختلف. أعد التحميل وحاول مرة أخرى.", SLUG_TAKEN: "هذا الرابط العام مستخدم لقهوة أخرى.",
    NOT_FOUND: "لم يعد هذا السجل موجوداً.", ORIGIN_INACTIVE: "هذا المنشأ غير نشط.", REFERENCE_INVALID: "أحد المراجع المختارة غير صالح.",
    NOT_READY: "القهوة غير جاهزة للنشر. راجع قائمة التحقق.", NO_ELIGIBLE_STOCK: "لا يمكن لهذا المخزون أن يدعم عرضاً لهذه القهوة.",
    STOCK_INSUFFICIENT: "الكمية أكبر من المخزون المتاح أو أن المخزون محجوز.", ACTIVE_OFFER_EXISTS: "يوجد عرض بالفعل لهذا المخزون.",
    OFFER_INVALID: "أدخل سعراً وكمية أكبر من صفر.", OFFER_NOT_EDITABLE: "لم يعد بالإمكان تعديل هذا العرض.", OFFER_NOT_APPROVED: "يجب أن يعتمد الامتثال العرض أولاً.",
    PUBLICATION_AUTHORITY_REQUIRED: "نشر العرض يتطلب صلاحية الامتثال.", STATUS_INVALID: "لا يمكن نشر هذه القهوة من حالتها الحالية.",
    MEDIA_INVALID: "استخدم صورة JPEG أو PNG أو WebP حتى 5 ميغابايت.", MEDIA_LIMIT: "تم بلوغ الحد الأقصى للصور.", MEDIA_NOT_FOUND: "لم تعد هذه الصورة موجودة.",
    OUTCOME_UNKNOWN: "تعذّر التأكد من حفظ التغيير. تحقّق قبل المحاولة مرة أخرى.", SAVE_FAILED: "تعذّر حفظ التغيير. لم يتغير شيء — حاول مرة أخرى.",
  },
  validation: {
    INVALID_REFERENCE: "اختر خياراً صالحاً.", NAME_REQUIRED: "أدخل اسماً.", NAME_TOO_LONG: "هذا الاسم طويل جداً.", SLUG_REQUIRED: "أدخل رابطاً عاماً.",
    SLUG_TOO_LONG: "هذا الرابط طويل جداً.", SLUG_INVALID: "استخدم أحرفاً إنجليزية صغيرة وأرقاماً وشرطات مفردة فقط.", DESCRIPTION_TOO_LONG: "هذا الوصف طويل جداً.",
    PRICE_INVALID: "أدخل سعراً أكبر من صفر.", QUANTITY_INVALID: "أدخل كمية أكبر من صفر.", REVISION_INVALID: "أعد تحميل الصفحة وحاول مرة أخرى.", FEATURED_INVALID: "اختر خياراً صالحاً.",
    REQUIRED: "هذا الحقل مطلوب.", INVALID: "هذه القيمة غير صالحة.",
  },
  toasts: {
    created: "تم إنشاء القهوة. تابع الخطوة التالية.", identitySaved: "تم حفظ الهوية.", arabicSaved: "تم حفظ المحتوى العربي.", taxonomySaved: "تم حفظ المنشأ والملف.",
    mediaAdded: "تمت إضافة الصورة.", mediaRemoved: "تمت إزالة الصورة.", primarySet: "تم تحديث الصورة الأساسية.", offerCreated: "تم إنشاء العرض كمسودة.", offerSaved: "تم حفظ العرض.",
    featuredOn: "أصبحت القهوة مميّزة.", featuredOff: "أُزيلت القهوة من المميّزة.", publishedCatalogue: "تم نشر القهوة.", publishedCoordinated: "تم نشر القهوة والعرض.",
    recoveredCommitted: "كان ذلك التغيير قد حُفظ. الصفحة الآن محدَّثة.", recoveredNotCommitted: "لم يُحفظ ذلك التغيير. يمكنك المحاولة مرة أخرى.",
  },
  conflict: { title: "توجد نسخة أحدث", body: "حفظ مشغّل آخر تغييرات أولاً. لم يُستبدل أي شيء من عملك.", action: "تحميل أحدث نسخة" },
  unknown: { title: "تعذّر تأكيد النتيجة", body: "تحقّق من حفظ التغيير قبل المحاولة مرة أخرى — فهذا يمنع إنشاء نسخ مكررة.", check: "تحقق الآن", checking: "جارٍ التحقق…" },
};

const accountsEn = {
  columns: { default: "Default" },
  defaultBadge: "Default for USD", notDefault: "Not default", setDefault: "Set as default", settingDefault: "Setting…", currentDefault: "Current default",
  readiness: {
    heading: "Checkout bank readiness", readyTitle: "Checkout can issue bank instructions", readyBody: "{bank} is the active default USD account. New proformas freeze its details; issued documents never change.",
    missingTitle: "No active default USD account", missingBody: "Until an active USD account is the default, checkout cannot issue bank transfer instructions. Choose one below.",
    incompleteTitle: "The default account has no account number or IBAN", incompleteBody: "Checkout needs an account number or an IBAN. Ask a Super Admin to complete the account.",
    retiredDefault: "The default account was deactivated. Choose another active account.",
  },
  confirm: { title: "Set this account as the USD default?", body: "New proformas will show this account. Already issued proformas keep the bank details they were issued with.", confirm: "Set as default", cancel: "Cancel" },
  feedback: {
    defaultSet: "Default USD account updated. New proformas use it; issued ones are unchanged.", alreadyDefault: "That account is already the default.",
    notCapable: "Only Platform Admins can choose the default account.", mfa: "Complete the extra verification step, then try again.", notFound: "That account is inactive or no longer exists.",
    conflict: "Another change to the default happened at the same time. Reload and try again.", requestConflict: "This request was already used for a different account. Reload and try again.", signIn: "Sign in to continue.", failed: "The default could not be changed. Nothing was changed — try again.", unknown: "We could not confirm the change. Reload to see the current default before trying again.",
  },
  readOnlyDefault: "Super Admins manage accounts; Platform Admins choose the default.", usdOnly: "Only an active USD account can be the default.", openAccount: "Open account {name}",
  empty: "No payment accounts yet", emptyBody: "Create a USD account (Super Admin) and set it as the default so checkout can issue bank instructions.",
} as const;

const accountsAr: DeepPartial<typeof accountsEn> = {
  columns: { default: "الافتراضي" },
  defaultBadge: "الافتراضي للدولار", notDefault: "غير افتراضي", setDefault: "تعيين كافتراضي", settingDefault: "جارٍ التعيين…", currentDefault: "الافتراضي الحالي",
  readiness: {
    heading: "جاهزية بنك الدفع", readyTitle: "يمكن للدفع إصدار تعليمات التحويل البنكي", readyBody: "{bank} هو حساب الدولار الافتراضي النشط. تجمّد الفواتير المبدئية الجديدة بياناته، ولا تتغير المستندات الصادرة.",
    missingTitle: "لا يوجد حساب دولار افتراضي نشط", missingBody: "إلى أن يصبح حساب دولار نشط هو الافتراضي لا يستطيع الدفع إصدار تعليمات التحويل البنكي. اختر حساباً أدناه.",
    incompleteTitle: "الحساب الافتراضي بلا رقم حساب أو IBAN", incompleteBody: "يحتاج الدفع إلى رقم حساب أو IBAN. اطلب من المسؤول الأعلى إكمال الحساب.",
    retiredDefault: "تم تعطيل الحساب الافتراضي. اختر حساباً نشطاً آخر.",
  },
  confirm: { title: "تعيين هذا الحساب كافتراضي للدولار؟", body: "ستعرض الفواتير المبدئية الجديدة هذا الحساب. أما الفواتير الصادرة فتحتفظ بالبيانات البنكية التي صدرت بها.", confirm: "تعيين كافتراضي", cancel: "إلغاء" },
  feedback: {
    defaultSet: "تم تحديث حساب الدولار الافتراضي. تستخدمه الفواتير الجديدة ولا تتغير الصادرة.", alreadyDefault: "هذا الحساب هو الافتراضي بالفعل.",
    notCapable: "يستطيع مسؤولو المنصة فقط اختيار الحساب الافتراضي.", mfa: "أكمل خطوة التحقق الإضافية ثم حاول مرة أخرى.", notFound: "هذا الحساب غير نشط أو لم يعد موجوداً.",
    conflict: "حدث تغيير آخر على الافتراضي في الوقت نفسه. أعد التحميل وحاول مرة أخرى.", requestConflict: "استُخدم هذا الطلب سابقاً لحساب مختلف. أعد التحميل وحاول مرة أخرى.", signIn: "سجّل الدخول للمتابعة.", failed: "تعذّر تغيير الافتراضي. لم يتغير شيء — حاول مرة أخرى.", unknown: "تعذّر تأكيد التغيير. أعد التحميل لرؤية الافتراضي الحالي قبل المحاولة مرة أخرى.",
  },
  readOnlyDefault: "يدير المسؤولون الأعلى الحسابات، ويختار مسؤولو المنصة الافتراضي.", usdOnly: "يمكن فقط لحساب دولار نشط أن يكون الافتراضي.", openAccount: "فتح الحساب {name}",
  empty: "لا توجد حسابات دفع بعد", emptyBody: "أنشئ حساباً بالدولار (مسؤول أعلى) وعيّنه افتراضياً ليستطيع الدفع إصدار التعليمات البنكية.",
};

export const f018AdminEn = { catalogueWorkflow: workflowEn, paymentAccountsDefault: accountsEn } as const;
export const f018AdminAr = { catalogueWorkflow: workflowAr, paymentAccountsDefault: accountsAr } as const;
