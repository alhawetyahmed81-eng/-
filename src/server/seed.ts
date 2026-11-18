import { dbGetDoc, dbQueryCollection, dbSetDoc, probeAdminSdkAccess } from './firestoreStore.ts';
import type {
  ServiceCategory,
  SubscriptionPlan,
  PlatformSettings,
  PublicCMSContent,
} from '../types/index.ts';

export const INITIAL_SERVICES: Omit<ServiceCategory, 'updatedAt'>[] = [
  {
    id: 'electrical',
    slug: 'electrical',
    nameAr: 'الكهرباء',
    nameEn: 'Electrical Systems',
    descriptionAr: 'تأسيس وصيانة الشبكات الكهربائية، اللوحات الذكية، الإضاءة المعمارية المدمجة، وحماية الأحمال.',
    descriptionEn: 'Smart panel engineering, concealed architectural lighting, load balancing, and certified electrical maintenance.',
    iconName: 'Zap',
    imageUrl: '/src/assets/images/craft_electrical_lighting_1794954857631.jpg',
    basePrice: 350,
    isActive: true,
    sortOrder: 1,
  },
  {
    id: 'plumbing',
    slug: 'plumbing',
    nameAr: 'السباكة',
    nameEn: 'Plumbing & Sanitary',
    descriptionAr: 'تمديدات الصرف والمياه، تركيبات الأدوات الصحية الفاخرة، مضخات الضغط، وكشف التسربات الحراري.',
    descriptionEn: 'Pressurized water networks, luxury sanitary installations, booster pumps, and thermal leak diagnostics.',
    iconName: 'Droplets',
    imageUrl: '/src/assets/images/craft_finishing_marble_1794954856479.jpg',
    basePrice: 300,
    isActive: true,
    sortOrder: 2,
  },
  {
    id: 'painting',
    slug: 'painting',
    nameAr: 'النقاشة والدهانات',
    nameEn: 'Painting & Wall Finishes',
    descriptionAr: 'تأسيس المعجون، الدهانات الإيطالية والديكورية، التشطيبات المطفية واللامعة عالية التحمل.',
    descriptionEn: 'Architectural wall priming, decorative Italian plasters, washable luxury matte and satin coatings.',
    iconName: 'PaintRoller',
    imageUrl: '/src/assets/images/hero_interiorx_luxury_1794954856889.jpg',
    basePrice: 400,
    isActive: true,
    sortOrder: 3,
  },
  {
    id: 'carpentry',
    slug: 'carpentry',
    nameAr: 'النجارة',
    nameEn: 'Carpentry & Joinery',
    descriptionAr: 'تصنيع وتركيب الأبواب المعمارية، غرف الملابس، تجليد الجدران الخشبي، وصيانة الأثاث.',
    descriptionEn: 'Bespoke architectural doors, walk-in closets, walnut wall paneling, and precision woodwork.',
    iconName: 'Hammer',
    imageUrl: '/src/assets/images/craft_hvac_woodwork_1794954857235.jpg',
    basePrice: 450,
    isActive: true,
    sortOrder: 4,
  },
  {
    id: 'interior-decor',
    slug: 'interior-decor',
    nameAr: 'الديكور والتصميم الداخلي',
    nameEn: 'Interior Design & Decor',
    descriptionAr: 'إشراف وتنفيذ الديكورات الداخلية، تجاليد الرخام والبدائل، وحدات الإضاءة المخصصة للمنازل والشركات.',
    descriptionEn: 'End-to-end interior styling, stone cladding, custom feature walls, and commercial spatial decor.',
    iconName: 'Compass',
    imageUrl: '/src/assets/images/hero_interiorx_luxury_1794954856889.jpg',
    basePrice: 900,
    isActive: true,
    sortOrder: 5,
  },
  {
    id: 'gypsum-board',
    slug: 'gypsum-board',
    nameAr: 'الجبس بورد',
    nameEn: 'Gypsum Board & Ceilings',
    descriptionAr: 'أسقف معلقة حديثة، بيوت نور مخفية، قواطيع صوتية ومقاومة للرطوبة بأعلى دقة هندسية.',
    descriptionEn: 'Acoustic false ceilings, shadow-gap coves, moisture-resistant partitions, and architectural bulkheads.',
    iconName: 'Layers',
    imageUrl: '/src/assets/images/craft_hvac_woodwork_1794954857235.jpg',
    basePrice: 500,
    isActive: true,
    sortOrder: 6,
  },
  {
    id: 'ceramics-tiling',
    slug: 'ceramics-tiling',
    nameAr: 'السيراميك والبلاط',
    nameEn: 'Ceramics, Marble & Tiling',
    descriptionAr: 'تركيب البورسلين كبير المقاس، الرخام الطبيعي، الجرانيت، والباركيه باستخدام أنظمة التسوية بالليزر.',
    descriptionEn: 'Large-format porcelain slabs, natural marble laying, granite staircases, and laser-leveled tiling.',
    iconName: 'Grid',
    imageUrl: '/src/assets/images/craft_finishing_marble_1794954856479.jpg',
    basePrice: 450,
    isActive: true,
    sortOrder: 7,
  },
  {
    id: 'aluminum-glazing',
    slug: 'aluminum-glazing',
    nameAr: 'الألوميتال',
    nameEn: 'Aluminum & Glazing',
    descriptionAr: 'قطاعات ألومنيوم عازلة للصوت والحرارة، واجهات زجاجية سيكوريت، وشبابيك دبل جلاس.',
    descriptionEn: 'Thermal-break aluminum windows, tempered glass partitions, sliding facades, and acoustic glazing.',
    iconName: 'Maximize2',
    imageUrl: '/src/assets/images/hero_interiorx_luxury_1794954856889.jpg',
    basePrice: 500,
    isActive: true,
    sortOrder: 8,
  },
  {
    id: 'hvac-cooling',
    slug: 'hvac-cooling',
    nameAr: 'التكييف والتبريد',
    nameEn: 'HVAC & Cooling',
    descriptionAr: 'تأسيس التكييف المركزي والكونسيلد، صيانة وحدات السبليت، شحن الفريون، وتنظيف مجاري الهواء.',
    descriptionEn: 'Concealed ducted AC installation, VRF systems, split unit servicing, and duct sanitization.',
    iconName: 'Wind',
    imageUrl: '/src/assets/images/craft_hvac_woodwork_1794954857235.jpg',
    basePrice: 350,
    isActive: true,
    sortOrder: 9,
  },
  {
    id: 'appliances',
    slug: 'appliances',
    nameAr: 'الأجهزة الكهربائية',
    nameEn: 'Appliances Repair',
    descriptionAr: 'إصلاح وصيانة الغسالات، الثلاجات، الأفران المدمجة، وغسالات الأطباق بقطع غيار أصلية.',
    descriptionEn: 'Diagnostic repair for built-in ovens, refrigerators, washers, and dishwashers with genuine parts.',
    iconName: 'Cpu',
    imageUrl: '/src/assets/images/craft_electrical_lighting_1794954857631.jpg',
    basePrice: 250,
    isActive: true,
    sortOrder: 10,
  },
  {
    id: 'metalwork',
    slug: 'metalwork',
    nameAr: 'الحدادة',
    nameEn: 'Metalwork & Steel',
    descriptionAr: 'تصنيع الأبواب المصفحة، الدرابزين المعدني، الهياكل الحديدية، والليزر كات الفاخر.',
    descriptionEn: 'Architectural steel framing, custom brass-finished railings, security gates, and CNC metalwork.',
    iconName: 'Shield',
    imageUrl: '/src/assets/images/hero_interiorx_luxury_1794954856889.jpg',
    basePrice: 400,
    isActive: true,
    sortOrder: 11,
  },
  {
    id: 'full-finishing',
    slug: 'full-finishing',
    nameAr: 'التشطيبات الكاملة',
    nameEn: 'Full Turnkey Finishing',
    descriptionAr: 'باقات تسليم مفتاح متكاملة للشقق والفلل والمكاتب الإدارية بإدارة هندسية كاملة وجدول زمني ملزم.',
    descriptionEn: 'Comprehensive turnkey fit-out packages for residences, villas, and commercial spaces under engineering supervision.',
    iconName: 'Building2',
    imageUrl: '/src/assets/images/hero_interiorx_luxury_1794954856889.jpg',
    basePrice: 2500,
    isActive: true,
    sortOrder: 12,
  },
  {
    id: 'waterproofing-roofing',
    slug: 'waterproofing-roofing',
    nameAr: 'العزل والأسقف',
    nameEn: 'Waterproofing & Roofing',
    descriptionAr: 'العزل المائي والحراري للأسطح والحمامات وحمامات السباحة باستخدام مواد إيبوكسي وبولي يوريثان معتمدة.',
    descriptionEn: 'Certified thermal and moisture waterproofing for roofs, wet areas, and terraces using industrial membranes.',
    iconName: 'Umbrella',
    imageUrl: '/src/assets/images/craft_finishing_marble_1794954856479.jpg',
    basePrice: 600,
    isActive: true,
    sortOrder: 13,
  },
  {
    id: 'general-maintenance',
    slug: 'general-maintenance',
    nameAr: 'النظافة والصيانة العامة',
    nameEn: 'Cleaning & General Maintenance',
    descriptionAr: 'تنظيف ما بعد التشطيب، جلي وتلميع الرخام، وعقود الصيانة الدورية للمنشآت التجارية والسكنية.',
    descriptionEn: 'Post-construction deep detailing, marble crystallization, and scheduled commercial facility upkeep.',
    iconName: 'Sparkles',
    imageUrl: '/src/assets/images/craft_finishing_marble_1794954856479.jpg',
    basePrice: 300,
    isActive: true,
    sortOrder: 14,
  },
];

export const INITIAL_PLANS: Omit<SubscriptionPlan, 'updatedAt'>[] = [
  {
    id: 'FREE',
    nameAr: 'الباقة الأساسية (مجانية)',
    nameEn: 'Free Tier',
    monthlyPrice: 0,
    priorityWeight: 1,
    featuresAr: [
      'حساب فني موثق قياسي',
      'استقبال الطلبات وفق نطاق التغطية',
      'تقديم عروض أسعار مباشرة للعملاء',
    ],
    featuresEn: [
      'Standard verified technician profile',
      'Receive eligible service requests in area',
      'Submit competitive quotes directly',
    ],
    isActive: true,
  },
  {
    id: 'PRO',
    nameAr: 'باقة المحترفين PRO',
    nameEn: 'Pro Tier',
    monthlyPrice: 450,
    priorityWeight: 2,
    featuresAr: [
      'أولوية ظهور متقدمة في نتائج البحث',
      'شارة المحترف المميز في عروض الأسعار',
      'إحصائيات متقدمة لمعدل القبول والأرباح',
    ],
    featuresEn: [
      'Enhanced ranking in customer search',
      'Pro priority badge on quote cards',
      'Advanced conversion and earnings analytics',
    ],
    isActive: true,
  },
  {
    id: 'PREMIUM',
    nameAr: 'الباقة النخبوية PREMIUM',
    nameEn: 'Premium Elite',
    monthlyPrice: 950,
    priorityWeight: 3,
    featuresAr: [
      'أعلى أولوية ظهور وتثبيت في صدارة القسم',
      'إبراز الحساب في الصفحة الرئيسية ومقترحات العملاء',
      'إحصائيات وتقارير أداء تفصيلية',
      'مزايا تسويقية وإشعارات فورية للطلبات الكبرى',
    ],
    featuresEn: [
      'Top-tier placement across search & categories',
      'Featured spotlight on home and customer matches',
      'Full executive performance analytics',
      'Priority dispatch alerts for turnkey projects',
    ],
    isActive: true,
  },
];

export const INITIAL_CMS: Omit<PublicCMSContent, 'updatedAt'> = {
  id: 'public_cms',
  heroTitleAr: 'هندسة التشطيبات الفاخرة والصيانة الدقيقة في منصة واحدة',
  heroTitleEn: 'Luxury Finishing & Precision Maintenance, Engineered on One Platform',
  heroSubtitleAr:
    'تواصل مباشرة مع فنيين ومهندسين موثقين بالهوية، قارن عروض الأسعار بشفافية، وتابع التنفيذ والموقع لحظياً حتى التسليم.',
  heroSubtitleEn:
    'Connect directly with ID-verified master technicians, compare binding quotes transparently, and track execution live from dispatch to handover.',
  aboutAr:
    'InteriorX منصة تقنية متخصصة في إدارة وتنفيذ أعمال التشطيبات المعمارية والصيانة السكنية والتجارية. نعتمد نظام توثيق صارم للفنيين، وحماية مالية كاملة عبر المحفظة والفواتير الموثقة، وتتبع جغرافي فوري لضمان أعلى معايير الجودة والانضباط.',
  aboutEn:
    'InteriorX is an architectural finishing and facility maintenance platform built for residential estates and commercial spaces. Every technician undergoes document verification before appearing in search, while orders are protected by structured state transitions, verified quotes, and transparent invoicing.',
  termsAr:
    'تخضع جميع الطلبات على منصة InteriorX لدورة الحالة المعتمدة. لا يظهر أي فني كحساب موثق إلا بعد مراجعة المستندات من الإدارة. تُحسب عمولة المنصة بنسبة يحددها النظام (افتراضياً 10%) وتُصدر فاتورة إلكترونية بعد التحقق من الدفع.',
  termsEn:
    'All service orders on InteriorX follow the verified order lifecycle. Technicians appear as verified only after administrative document review. Platform commissions (default 10%) and official invoices are calculated server-side upon verified payment settlement.',
  privacyAr:
    'نحافظ على خصوصية بيانات العملاء والفنيين ومستندات الهوية وفق أعلى معايير العزل الأمني. لا تُستخدم بيانات الموقع الجغرافي إلا لحساب المسافات وتتبع الفني أثناء تنفيذ الطلب وبموافقة المستخدم الصريحة، كما يخضع استخدام الخرائط لشروط Google Maps Platform.',
  privacyEn:
    'Client contact details and technician KYC documents are strictly isolated per account permissions. Location coordinates are processed solely for service distance estimation and active order dispatch tracking with user consent, integrating Google Maps Platform under its Terms of Service.',
  faqs: [
    {
      qAr: 'كيف يتم توثيق الفنيين على InteriorX؟',
      qEn: 'How are technicians verified on InteriorX?',
      aAr: 'يقوم الفني برفع صورة الهوية الوطنية وشهادات الخبرة وتحديد التخصصات ومناطق العمل، ولا يظهر كفني موثق في نتائج البحث إلا بعد موافقة فريق الإدارة.',
      aEn: 'Technicians submit their national ID, trade certifications, specialties, and coverage areas. Profiles remain unlisted until reviewed and approved by the Admin console.',
    },
    {
      qAr: 'كيف يعمل نظام عروض الأسعار وتعديل التكلفة؟',
      qEn: 'How do price quotes and revisions work?',
      aAr: 'يستقبل العميل عروض الأسعار من الفنيين ويختار عرضاً واحداً فقط، ليتم إغلاق باقي العروض تلقائياً. ولا يمكن للفني تعديل السعر النهائي بعد القبول إلا بموافقة جديدة من العميل.',
      aEn: 'Customers review quotes and accept exactly one offer, automatically closing all others. Once accepted, final pricing cannot be changed without an explicit customer-approved revision request.',
    },
    {
      qAr: 'ما هي نسبة عمولة المنصة وكيف يتم الدفع؟',
      qEn: 'What is the platform commission and how are payments processed?',
      aAr: 'العمولة الافتراضية 10% (قابلة للتعديل من الإدارة). تتم جميع المعاملات المالية والتحقق من بوابات الدفع (Paymob وFawry) والمحفظة حصراً عبر الخادم مع إصدار فاتورة معتمدة.',
      aEn: 'The default platform fee is 10% (configurable by Admin). All wallet balances, Paymob/Fawry webhook verifications, commissions, and invoices are processed strictly server-side.',
    },
  ],
};

export const INITIAL_GLOBAL_SETTINGS: Omit<PlatformSettings, 'updatedAt'> = {
  id: 'global',
  commissionRatePercent: 10,
  currency: 'EGP',
  supportEmail: 'concierge@interiorx.app',
  supportPhone: '+20 100 000 0000',
};

let seeded = false;

export async function ensureSystemSeedData(adminIdToken?: string): Promise<void> {
  if (seeded) return;
  const hasAdminSdk = await probeAdminSdkAccess();
  if (!hasAdminSdk && !adminIdToken) {
    // Wait for Admin login or Admin SDK credentials before writing Firestore seed docs
    return;
  }

  try {
    const now = new Date().toISOString();

    await dbSetDoc('test/connection', { ok: true, updatedAt: now }, { merge: true }, adminIdToken);

    const existingServices = await dbQueryCollection(
      'services',
      { where: [{ field: 'isActive', op: '==', value: true }], limit: 1 },
      adminIdToken
    );
    if (existingServices.length === 0) {
      for (const svc of INITIAL_SERVICES) {
        await dbSetDoc(`services/${svc.id}`, { ...svc, updatedAt: now }, {}, adminIdToken);
      }
    }

    const existingPlans = await dbQueryCollection(
      'subscription_plans',
      { where: [{ field: 'isActive', op: '==', value: true }], limit: 1 },
      adminIdToken
    );
    if (existingPlans.length === 0) {
      for (const plan of INITIAL_PLANS) {
        await dbSetDoc(`subscription_plans/${plan.id}`, { ...plan, updatedAt: now }, {}, adminIdToken);
      }
    }

    const globalSnap = await dbGetDoc('platform_settings/global', adminIdToken);
    if (!globalSnap.exists) {
      await dbSetDoc('platform_settings/global', { ...INITIAL_GLOBAL_SETTINGS, updatedAt: now }, {}, adminIdToken);
    }

    const cmsSnap = await dbGetDoc('platform_settings/public_cms', adminIdToken);
    if (!cmsSnap.exists) {
      await dbSetDoc('platform_settings/public_cms', { ...INITIAL_CMS, updatedAt: now }, {}, adminIdToken);
    }

    seeded = true;
    console.log('[InteriorX] Base services, subscription plans, and settings persisted to Firestore.');
  } catch (err) {
    console.error('[InteriorX] Seed check error:', err);
  }
}
