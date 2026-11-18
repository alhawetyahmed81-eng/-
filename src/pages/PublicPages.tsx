import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  MapPin,
  Search,
  ShieldCheck,
  Star,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { apiFetch } from '../lib/api';
import { translations } from '../i18n/translations';
import { ServiceIcon } from '../components/ServiceIcon';
import { PWAInstallButton } from '../components/Layout';
import type { ServiceCategory, TechnicianPublicProfile } from '../types';

export const HomePage: React.FC = () => {
  const { lang, services, cms, stats, navigate, firebaseUser, userRecord } = useApp();
  const t = translations[lang];
  const [featuredTechs, setFeaturedTechs] = useState<TechnicianPublicProfile[]>([]);
  const ArrowIcon = lang === 'ar' ? ArrowLeft : ArrowRight;

  useEffect(() => {
    apiFetch<TechnicianPublicProfile[]>('/api/technicians')
      .then((list) => {
        if (Array.isArray(list)) setFeaturedTechs(list.slice(0, 4));
      })
      .catch(() => {});
  }, []);

  const handleRequestCta = () => {
    if (!firebaseUser) return navigate('/auth');
    if (userRecord?.role === 'CUSTOMER') return navigate('/customer/new-order');
    if (userRecord?.role === 'TECHNICIAN') return navigate('/technician');
    return navigate('/auth');
  };

  return (
    <div className="space-y-20 pb-20">
      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 lg:pt-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-between py-2 space-y-8">
            <div className="space-y-5">
              <p className="text-xs font-medium tracking-wide text-[#C8A24E]">
                {lang === 'ar'
                  ? 'InteriorX · التشطيبات المعمارية والصيانة المعتمدة'
                  : 'InteriorX · Architectural Finishing & Certified Maintenance'}
              </p>
              <h1
                className="text-3xl sm:text-5xl font-bold leading-[1.18] tracking-tight text-neutral-950 dark:text-stone-100"
                style={{ textWrap: 'balance' }}
              >
                {lang === 'ar'
                  ? cms?.heroTitleAr || 'هندسة التشطيبات الفاخرة والصيانة الدقيقة في منصة واحدة'
                  : cms?.heroTitleEn || 'Luxury Finishing & Precision Maintenance, Engineered on One Platform'}
              </h1>
              <p className="text-base text-neutral-600 dark:text-neutral-400 leading-relaxed max-w-xl">
                {lang === 'ar'
                  ? cms?.heroSubtitleAr ||
                    'تواصل مباشرة مع فنيين ومهندسين موثقين بالهوية، قارن عروض الأسعار بشفافية، وتابع التنفيذ والموقع لحظياً حتى التسليم.'
                  : cms?.heroSubtitleEn ||
                    'Connect directly with ID-verified master technicians, compare binding quotes transparently, and track execution live from dispatch to handover.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={handleRequestCta}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg bg-[#C8A24E] text-black text-sm font-bold hover:bg-[#DFBE6F] transition-colors whitespace-nowrap cursor-pointer"
              >
                <span>{t.hero.ctaPrimary}</span>
                <ArrowIcon className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => navigate('/services')}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-sm font-semibold text-neutral-800 dark:text-stone-200 hover:border-[#C8A24E] transition-colors whitespace-nowrap cursor-pointer"
              >
                {t.hero.ctaSecondary}
              </button>
              <PWAInstallButton variant="hero" />
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="h-full min-h-[320px] lg:min-h-[440px] rounded-2xl overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-neutral-900 relative">
              <img
                src="/src/assets/images/hero_interiorx_luxury_1794954856889.jpg"
                alt="InteriorX Luxury Architectural Finishing"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent flex items-end p-6">
                <div className="text-stone-100 text-xs flex items-center gap-2">
                  <span>{lang === 'ar' ? 'توثيق بالهوية' : 'ID-Verified Craftsmen'}</span>
                  <span aria-hidden="true">·</span>
                  <span>{lang === 'ar' ? 'تتبع GPS مباشر' : 'Live GPS Tracking'}</span>
                  <span aria-hidden="true">·</span>
                  <span>{lang === 'ar' ? 'محفظة وفواتير رسمية' : 'Escrow & Invoicing'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Full-Width Real Platform Metrics Strip */}
        <div className="mt-10 grid grid-cols-2 lg:grid-cols-4 gap-4 border-y border-neutral-200 dark:border-neutral-800/80 py-6">
          <div>
            <p className="text-2xl sm:text-3xl font-bold font-mono-num text-neutral-950 dark:text-stone-100">
              {stats.categoriesCount}
            </p>
            <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">{t.stats.categories}</p>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-bold font-mono-num text-[#C8A24E]">
              {stats.verifiedTechniciansCount}
            </p>
            <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">{t.stats.verifiedTechs}</p>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-bold font-mono-num text-neutral-950 dark:text-stone-100">
              {stats.completedOrdersCount}
            </p>
            <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">{t.stats.completedOrders}</p>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-bold font-mono-num text-neutral-950 dark:text-stone-100">
              {stats.activeOrdersCount}
            </p>
            <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">{t.stats.activeOrders}</p>
          </div>
        </div>
      </section>

      {/* Services Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <h2 className="text-2xl sm:text-3xl font-bold text-neutral-950 dark:text-stone-100">
              {lang === 'ar' ? 'أقسام التشطيبات والصيانة' : 'Finishing & Maintenance Divisions'}
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {lang === 'ar'
                ? '14 تخصصاً هندسياً وفنياً متكاملاً للمنازل والمنشآت التجارية'
                : '14 specialized architectural and technical trades for homes and commercial suites'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/services')}
            className="text-sm font-semibold text-[#C8A24E] hover:underline cursor-pointer whitespace-nowrap"
          >
            {lang === 'ar' ? 'عرض جميع الأقسام' : 'View All Divisions'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {services.slice(0, 8).map((svc) => (
            <button
              key={svc.id}
              type="button"
              onClick={() => navigate(`/services/${svc.slug}`)}
              className="group text-start rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] overflow-hidden hover:border-[#C8A24E]/60 transition-colors cursor-pointer"
            >
              <div className="h-36 overflow-hidden bg-neutral-900 relative">
                <img
                  src={svc.imageUrl}
                  alt={lang === 'ar' ? svc.nameAr : svc.nameEn}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                <div className="absolute bottom-3 start-3 p-2 rounded-lg bg-black/70 text-[#C8A24E]">
                  <ServiceIcon name={svc.iconName} className="w-4 h-4" />
                </div>
              </div>
              <div className="p-4 space-y-1.5">
                <h3 className="text-base font-bold text-neutral-950 dark:text-stone-100">
                  {lang === 'ar' ? svc.nameAr : svc.nameEn}
                </h3>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2">
                  {lang === 'ar' ? svc.descriptionAr : svc.descriptionEn}
                </p>
                <div className="pt-2 text-xs font-mono-num text-neutral-500 flex items-center gap-1.5">
                  <span>{lang === 'ar' ? 'تبدأ المعاينة من' : 'Starts from'}</span>
                  <span className="text-[#C8A24E] font-semibold">
                    {svc.basePrice} {t.common.currency}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Editorial 4-Step Mechanism */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#121215] p-8 sm:p-10 space-y-8">
          <div className="max-w-2xl space-y-2">
            <h2 className="text-2xl sm:text-3xl font-bold text-neutral-950 dark:text-stone-100">
              {lang === 'ar' ? 'آلية التنفيذ الموثقة على InteriorX' : 'How InteriorX Execution Works'}
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {lang === 'ar'
                ? 'دورة طلب هندسية واضحة تحفظ حقوق العميل والفني في كل مرحلة.'
                : 'A structured order lifecycle protecting both client and craftsman at every milestone.'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              {
                num: '01.',
                arT: 'تحديد الموقع والخدمة',
                enT: 'Scope & Map Location',
                arD: 'اختر القسم، حدد الموقع بدقة على الخريطة، وارفع صور أو فيديو للمعاينة.',
                enD: 'Select your division, pin exact coordinates on Google Maps, and attach site photos.',
              },
              {
                num: '02.',
                arT: 'مقارنة العروض المعتمدة',
                enT: 'Compare Verified Quotes',
                arD: 'يقدم الفنيون الموثقون عروضهم وتختار عرضاً واحداً ليُغلق الباقي تلقائياً.',
                enD: 'ID-verified technicians submit binding quotes. Accept one offer to lock pricing.',
              },
              {
                num: '03.',
                arT: 'التتبع والمحادثة المباشرة',
                enT: 'Live Tracking & Chat',
                arD: 'تابع حركة الفني عبر الخريطة وناقش التفاصيل والصور داخل المحادثة المربوطة بالطلب.',
                enD: 'Track technician arrival via live route ETA and exchange photos in order chat.',
              },
              {
                num: '04.',
                arT: 'الدفع الآمن والفاتورة',
                enT: 'Verified Payment & Invoice',
                arD: 'ادفع بعد اكتمال التنفيذ عبر المحفظة أو بوابات الدفع المعتمدة وتسلّم فاتورتك.',
                enD: 'Settle after completion through verified server payment with instant official invoicing.',
              },
            ].map((step) => (
              <div key={step.num} className="space-y-2 pt-4 border-t border-neutral-200 dark:border-neutral-800">
                <span className="text-sm font-mono-num font-bold text-[#C8A24E]">{step.num}</span>
                <h3 className="text-base font-bold text-neutral-950 dark:text-stone-100">
                  {lang === 'ar' ? step.arT : step.enT}
                </h3>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  {lang === 'ar' ? step.arD : step.enD}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Real Verified Technicians Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-neutral-950 dark:text-stone-100">
              {lang === 'ar' ? 'الفنيون الموثقون المتاحون' : 'Verified Master Technicians'}
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {lang === 'ar'
                ? 'لا يظهر أي فني هنا إلا بعد مراجعة مستندات الهوية والاعتماد من الإدارة.'
                : 'Profiles appear here strictly after identity and certification approval by Administration.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/auth')}
            className="text-sm font-semibold text-[#C8A24E] hover:underline cursor-pointer"
          >
            {t.hero.ctaTech}
          </button>
        </div>

        {featuredTechs.length === 0 ? (
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-8 text-center space-y-3">
            <ShieldCheck className="w-8 h-8 mx-auto text-[#C8A24E]" />
            <p className="text-sm font-semibold text-neutral-900 dark:text-stone-100">
              {lang === 'ar'
                ? 'لا يوجد فنيون معتمدون مسجلون في قاعدة البيانات حتى الآن'
                : 'No verified technicians registered in the database yet'}
            </p>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 max-w-md mx-auto">
              {lang === 'ar'
                ? 'سجل كفني محترف وارفع مستندات التوثيق لتكون من أوائل المعتمدين بعد موافقة الإدارة.'
                : 'Register as a technician and submit your verification documents to appear here once approved.'}
            </p>
            <button
              type="button"
              onClick={() => navigate('/auth')}
              className="mt-2 px-5 py-2.5 rounded-lg bg-[#C8A24E] text-black text-xs font-bold hover:bg-[#DFBE6F] cursor-pointer"
            >
              {t.hero.ctaTech}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {featuredTechs.map((tech) => (
              <div
                key={tech.uid}
                className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-neutral-950 dark:text-stone-100">{tech.displayName}</h3>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {tech.subscriptionPlanId} · {t.common.verified}
                    </p>
                  </div>
                  <CheckCircle2 className="w-4 h-4 text-[#C8A24E] shrink-0" />
                </div>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2">{tech.bio}</p>
                <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-xs font-mono-num">
                  <span className="inline-flex items-center gap-1 text-[#C8A24E]">
                    <Star className="w-3.5 h-3.5 fill-current" />
                    {tech.ratingAvg.toFixed(1)} ({tech.ratingCount})
                  </span>
                  <span className="text-neutral-500">
                    {tech.completedJobsCount} {lang === 'ar' ? 'عمل' : 'jobs'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export const ServicesListPage: React.FC = () => {
  const { lang, services, navigate } = useApp();
  const t = translations[lang];
  const [search, setSearch] = useState('');

  const filtered = services.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      s.nameAr.toLowerCase().includes(q) ||
      s.nameEn.toLowerCase().includes(q) ||
      s.descriptionAr.toLowerCase().includes(q) ||
      s.descriptionEn.toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-950 dark:text-stone-100">
            {t.nav.services}
          </h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            {lang === 'ar'
              ? 'تصفح جميع أقسام التشطيبات والصيانة واختر القسم لبدء طلبك.'
              : 'Browse all specialized architectural finishing and maintenance categories.'}
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-neutral-400 absolute top-1/2 -translate-y-1/2 start-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.common.search}
            className="w-full ps-9 pe-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#131316] text-sm focus:outline-none focus:border-[#C8A24E]"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((svc) => (
          <div
            key={svc.id}
            onClick={() => navigate(`/services/${svc.slug}`)}
            className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] overflow-hidden hover:border-[#C8A24E] transition-colors cursor-pointer flex flex-col"
          >
            <div className="h-44 overflow-hidden bg-neutral-900 relative">
              <img
                src={svc.imageUrl}
                alt={lang === 'ar' ? svc.nameAr : svc.nameEn}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
              <div className="absolute bottom-3 start-3 p-2.5 rounded-lg bg-black/75 text-[#C8A24E]">
                <ServiceIcon name={svc.iconName} className="w-5 h-5" />
              </div>
            </div>
            <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
              <div>
                <h2 className="text-lg font-bold text-neutral-950 dark:text-stone-100">
                  {lang === 'ar' ? svc.nameAr : svc.nameEn}
                </h2>
                <p className="mt-1.5 text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  {lang === 'ar' ? svc.descriptionAr : svc.descriptionEn}
                </p>
              </div>
              <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-xs">
                <span className="font-mono-num text-[#C8A24E] font-semibold">
                  {svc.basePrice} {t.common.currency}
                </span>
                <span className="font-semibold text-neutral-900 dark:text-stone-200">
                  {t.common.details}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const ServiceDetailPage: React.FC<{ slug: string }> = ({ slug }) => {
  const { lang, navigate, firebaseUser, userRecord } = useApp();
  const t = translations[lang];
  const [service, setService] = useState<ServiceCategory | null>(null);
  const [techs, setTechs] = useState<TechnicianPublicProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch<{ service: ServiceCategory; technicians: TechnicianPublicProfile[] }>(`/api/services/${slug}`)
      .then((res) => {
        setService(res.service);
        setTechs(res.technicians || []);
      })
      .catch(() => setService(null))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return <div className="max-w-5xl mx-auto px-4 py-16 text-sm text-neutral-500">{t.common.loading}</div>;
  }

  if (!service) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 space-y-4">
        <p className="text-lg font-bold">{lang === 'ar' ? 'القسم غير موجود' : 'Service not found'}</p>
        <button type="button" onClick={() => navigate('/services')} className="text-sm text-[#C8A24E] underline cursor-pointer">
          {t.common.back}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-10">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <div className="lg:col-span-6 h-72 lg:h-auto rounded-2xl overflow-hidden border border-neutral-200 dark:border-neutral-800">
          <img
            src={service.imageUrl}
            alt={lang === 'ar' ? service.nameAr : service.nameEn}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="lg:col-span-6 flex flex-col justify-between space-y-6 p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316]">
          <div className="space-y-4">
            <div className="inline-flex p-3 rounded-xl bg-[#C8A24E]/15 text-[#C8A24E]">
              <ServiceIcon name={service.iconName} className="w-6 h-6" />
            </div>
            <h1 className="text-3xl font-bold text-neutral-950 dark:text-stone-100">
              {lang === 'ar' ? service.nameAr : service.nameEn}
            </h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
              {lang === 'ar' ? service.descriptionAr : service.descriptionEn}
            </p>
            <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-sm">
              <span className="text-neutral-500">{lang === 'ar' ? 'تكلفة المعاينة المبدئية' : 'Base Inspection Estimate'}</span>
              <span className="font-mono-num font-bold text-[#C8A24E]">
                {service.basePrice} {t.common.currency}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (!firebaseUser) return navigate('/auth');
              if (userRecord?.role === 'CUSTOMER') return navigate(`/customer/new-order?service=${service.id}`);
              navigate('/customer/new-order');
            }}
            className="w-full py-3 rounded-lg bg-[#C8A24E] text-black text-sm font-bold hover:bg-[#DFBE6F] transition-colors cursor-pointer"
          >
            {t.hero.ctaPrimary}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-bold text-neutral-950 dark:text-stone-100">
          {lang === 'ar' ? 'الفنيون المعتمدون في هذا التخصص' : 'Verified Technicians in This Division'}
        </h2>
        {techs.length === 0 ? (
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-6 text-sm text-neutral-500">
            {lang === 'ar'
              ? 'لا يوجد فنيون معتمدون في هذا القسم حتى الآن. يمكنك إنشاء طلب ليصل إشعار للفنيين فور اعتمادهم.'
              : 'No approved technicians listed in this specialty yet. Create a request and verified pros will be notified.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {techs.map((tech) => (
              <div
                key={tech.uid}
                className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-5 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold">{tech.displayName}</span>
                  <span className="text-xs font-mono-num text-[#C8A24E]">★ {tech.ratingAvg.toFixed(1)}</span>
                </div>
                <p className="text-xs text-neutral-500">{tech.serviceAreas.join(' · ') || 'All Areas'}</p>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2">{tech.bio}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const HowItWorksPage: React.FC = () => {
  const { lang, plans } = useApp();
  const t = translations[lang];
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-12">
      <div className="space-y-3">
        <h1 className="text-3xl font-bold">{t.nav.howItWorks}</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
          {lang === 'ar'
            ? 'منظومة InteriorX تربط العملاء بالفنيين عبر دورة طلب محكومة على الخادم تضمن جودة التنفيذ والالتزام المالي.'
            : 'InteriorX orchestrates every service from site inspection to verified invoice settlement with server-enforced rules.'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-3">
          <h2 className="text-lg font-bold text-[#C8A24E]">
            {lang === 'ar' ? 'رحلة العميل' : 'Client Journey'}
          </h2>
          <ul className="space-y-2 text-sm text-neutral-700 dark:text-stone-300">
            <li>01. {lang === 'ar' ? 'اختيار القسم وتحديد الموقع عبر Google Maps ورفع الصور' : 'Select service, pin location on Google Maps, attach media'}</li>
            <li>02. {lang === 'ar' ? 'استقبال عروض الأسعار وقبول عرض واحد فقط لإغلاق الباقي' : 'Review quotes and accept exactly one binding offer'}</li>
            <li>03. {lang === 'ar' ? 'متابعة مسار الفني لحظياً والمحادثة المباشرة' : 'Track live technician route & communicate in order chat'}</li>
            <li>04. {lang === 'ar' ? 'الدفع الآمن وإصدار الفاتورة وتقييم الفني' : 'Settle verified payment, receive invoice, and rate execution'}</li>
          </ul>
        </div>
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-3">
          <h2 className="text-lg font-bold text-[#C8A24E]">
            {lang === 'ar' ? 'رحلة الفني المحترف' : 'Technician Workflow'}
          </h2>
          <ul className="space-y-2 text-sm text-neutral-700 dark:text-stone-300">
            <li>01. {lang === 'ar' ? 'التسجيل ورفع الهوية وشهادات الخبرة للاعتماد الإداري' : 'Register and upload KYC documents for Admin verification'}</li>
            <li>02. {lang === 'ar' ? 'استعراض الطلبات القريبة وإرسال عروض أسعار دقيقة' : 'Browse nearby matching requests and submit transparent quotes'}</li>
            <li>03. {lang === 'ar' ? 'تحديث حالة التنفيذ ومشاركة الموقع أثناء التوجه للعميل' : 'Progress order stages and stream GPS while en route'}</li>
            <li>04. {lang === 'ar' ? 'تحصيل صافي الأرباح بالمحفظة وطلب السحب في أي وقت' : 'Receive net earnings in wallet and request payouts anytime'}</li>
          </ul>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-2xl font-bold">{lang === 'ar' ? 'باقات اشتراك الفنيين' : 'Technician Membership Tiers'}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((p) => (
            <div key={p.id} className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg">{lang === 'ar' ? p.nameAr : p.nameEn}</h3>
                <span className="font-mono-num font-bold text-[#C8A24E]">
                  {p.monthlyPrice} {t.common.currency}
                </span>
              </div>
              <ul className="space-y-2 text-xs text-neutral-600 dark:text-neutral-400">
                {(lang === 'ar' ? p.featuresAr : p.featuresEn).map((f, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#C8A24E] shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const CmsDocumentPage: React.FC<{ pageType: 'about' | 'terms' | 'privacy' | 'faq' }> = ({ pageType }) => {
  const { lang, cms } = useApp();
  const t = translations[lang];

  const titles: Record<string, string> = {
    about: t.nav.about,
    terms: t.nav.terms,
    privacy: t.nav.privacy,
    faq: t.nav.faq,
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-6">
      <h1 className="text-3xl font-bold text-neutral-950 dark:text-stone-100">{titles[pageType]}</h1>
      {pageType === 'faq' ? (
        <div className="space-y-4">
          {(cms?.faqs || []).map((item, i) => (
            <div key={i} className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-5 space-y-2">
              <h2 className="font-bold text-base text-[#C8A24E]">{lang === 'ar' ? item.qAr : item.qEn}</h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                {lang === 'ar' ? item.aAr : item.aEn}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-8 text-sm text-neutral-700 dark:text-stone-300 leading-loose whitespace-pre-line">
          {pageType === 'about' && (lang === 'ar' ? cms?.aboutAr : cms?.aboutEn)}
          {pageType === 'terms' && (lang === 'ar' ? cms?.termsAr : cms?.termsEn)}
          {pageType === 'privacy' && (lang === 'ar' ? cms?.privacyAr : cms?.privacyEn)}
        </div>
      )}
    </div>
  );
};

export const ContactPage: React.FC = () => {
  const { lang } = useApp();
  const t = translations[lang];
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');
    setErrMsg('');
    try {
      await apiFetch('/api/contact', {
        method: 'POST',
        body: JSON.stringify({ name, email, phone, subject, message }),
      });
      setStatus('sent');
      setName('');
      setEmail('');
      setPhone('');
      setSubject('');
      setMessage('');
    } catch (err: any) {
      setStatus('error');
      setErrMsg(err.message);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">{t.nav.contact}</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          {lang === 'ar'
            ? 'أرسل استفسارك أو طلب شراكة للمشاريع التجارية وسيتواصل معك فريق InteriorX.'
            : 'Send an inquiry or commercial project request to the InteriorX concierge team.'}
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={lang === 'ar' ? 'الاسم الكامل' : 'Full Name'}
            className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
          />
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={lang === 'ar' ? 'البريد الإلكتروني' : 'Email Address'}
            className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={lang === 'ar' ? 'رقم الهاتف' : 'Phone Number'}
            className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
          />
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={lang === 'ar' ? 'الموضوع' : 'Subject'}
            className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
          />
        </div>
        <textarea
          required
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={lang === 'ar' ? 'تفاصيل الرسالة...' : 'Your message...'}
          className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
        />

        {status === 'sent' && (
          <p className="text-sm text-emerald-500 font-medium">
            {lang === 'ar' ? 'تم استلام رسالتك وحفظها بنجاح.' : 'Your inquiry has been submitted.'}
          </p>
        )}
        {status === 'error' && <p className="text-sm text-red-500">{errMsg}</p>}

        <button
          type="submit"
          disabled={status === 'sending'}
          className="px-6 py-2.5 rounded-lg bg-[#C8A24E] text-black text-sm font-bold hover:bg-[#DFBE6F] cursor-pointer"
        >
          {status === 'sending' ? t.common.loading : t.common.submit}
        </button>
      </form>
    </div>
  );
};
