import React, { useEffect, useState } from 'react';
import {
  Bell,
  Check,
  Copy,
  Download,
  ExternalLink,
  Globe,
  LogOut,
  Menu,
  Moon,
  ShieldCheck,
  Smartphone,
  Sun,
  User as UserIcon,
  WifiOff,
  X,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { translations } from '../i18n/translations';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const PWAInstallButton: React.FC<{
  variant?: 'full' | 'icon' | 'footer' | 'hero' | 'banner';
}> = ({ variant = 'full' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const { lang } = useApp();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // Suppress install UI when already running as an installed PWA
  if (isInstalled) return null;

  // Only show when browser allows native install prompt OR on iOS Safari
  if (!isInstallable && !isIOS) return null;

  const handleClick = async () => {
    if (isInstallable) {
      await install();
    } else if (isIOS) {
      setShowIOSGuide(true);
    }
  };

  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={() => void handleClick()}
          title={lang === 'ar' ? 'تثبيت التطبيق' : 'Install App'}
          aria-label={lang === 'ar' ? 'تثبيت التطبيق' : 'Install App'}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 border-[#C8A24E] bg-neutral-950 text-[#DFBE6F] dark:bg-[#C8A24E]/20 dark:text-[#DFBE6F] text-xs font-bold hover:bg-[#C8A24E] hover:text-black transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-xs"
        >
          <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span className="sm:hidden">{lang === 'ar' ? 'تثبيت' : 'Install'}</span>
          <span className="hidden sm:inline">
            {lang === 'ar' ? 'تثبيت التطبيق' : 'Install App'}
          </span>
        </button>
      ) : variant === 'hero' ? (
        <button
          type="button"
          onClick={() => void handleClick()}
          className="inline-flex items-center gap-2 px-5 py-3.5 rounded-lg border-2 border-[#C8A24E] bg-neutral-950 text-[#DFBE6F] dark:bg-[#C8A24E]/15 dark:text-[#DFBE6F] text-sm font-bold hover:bg-[#C8A24E] hover:text-black transition-colors whitespace-nowrap cursor-pointer shadow-sm"
        >
          <Smartphone className="w-4 h-4" />
          <span>{lang === 'ar' ? 'تثبيت التطبيق' : 'Install App'}</span>
        </button>
      ) : variant === 'banner' ? (
        <button
          type="button"
          onClick={() => void handleClick()}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#C8A24E] text-black text-xs font-bold hover:bg-[#DFBE6F] transition-colors whitespace-nowrap cursor-pointer shadow-xs"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{lang === 'ar' ? 'تثبيت الآن' : 'Install Now'}</span>
        </button>
      ) : variant === 'footer' ? (
        <button
          type="button"
          onClick={() => void handleClick()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#C8A24E] bg-neutral-950 text-[#DFBE6F] dark:bg-[#C8A24E]/20 dark:text-[#DFBE6F] text-xs font-bold hover:bg-[#C8A24E] hover:text-black transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          {lang === 'ar' ? 'تثبيت تطبيق InteriorX' : 'Install InteriorX App'}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void handleClick()}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-[#C8A24E] bg-[#C8A24E] px-4 py-2.5 text-xs font-bold text-black hover:bg-[#DFBE6F] transition-colors cursor-pointer shadow-xs"
        >
          <Download className="w-4 h-4" />
          {lang === 'ar' ? 'تثبيت تطبيق InteriorX' : 'Install InteriorX App'}
        </button>
      )}

      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#131316] border border-[#C8A24E]/40 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Download className="w-5 h-5 text-[#C8A24E]" />
                <h3 className="text-base font-bold text-neutral-900 dark:text-stone-100">
                  {lang === 'ar' ? 'تثبيت تطبيق InteriorX' : 'Install InteriorX App'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs sm:text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
              <p>
                {lang === 'ar'
                  ? 'لتثبيت التطبيق على جهاز iPhone أو iPad:'
                  : 'To install InteriorX on iPhone or iPad:'}
              </p>
              <ol className="list-decimal list-inside space-y-1.5">
                <li>
                  {lang === 'ar'
                    ? 'اضغط على زر المشاركة (Share) في شريط متصفح Safari.'
                    : 'Tap the Share button in the Safari toolbar.'}
                </li>
                <li>
                  {lang === 'ar'
                    ? 'مرّر للأسفل واختر «إضافة إلى الشاشة الرئيسية» (Add to Home Screen).'
                    : 'Scroll down and tap "Add to Home Screen".'}
                </li>
                <li>
                  {lang === 'ar'
                    ? 'اضغط «إضافة» (Add) لتثبيت التطبيق فوراً.'
                    : 'Tap "Add" to install the app.'}
                </li>
              </ol>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="px-4 py-2 rounded-lg bg-[#C8A24E] text-black text-xs font-bold hover:bg-[#DFBE6F] transition-colors cursor-pointer"
              >
                {lang === 'ar' ? 'حسناً' : 'Got it'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const PWAInstallBanner: React.FC = () => {
  const { isInstallable, isInstalled, isDismissed, install, dismiss } = usePWAInstall();
  const { lang } = useApp();

  // Display the custom notification banner ONLY when the browser fired beforeinstallprompt
  // (and the app is neither installed nor dismissed in this session).
  if (isInstalled || !isInstallable || isDismissed) return null;

  return (
    <div
      role="region"
      aria-label={lang === 'ar' ? 'إشعار تثبيت التطبيق' : 'App install notification'}
      className="bg-neutral-950 dark:bg-[#141418] text-stone-100 border-b border-[#C8A24E]/40"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="p-1.5 rounded-md bg-[#C8A24E]/20 text-[#DFBE6F] shrink-0">
            <Smartphone className="w-4 h-4" />
          </span>
          <p className="text-xs sm:text-sm font-medium truncate">
            {lang === 'ar'
              ? 'ثبّت تطبيق InteriorX على جهازك للوصول الفوري والعمل دون اتصال'
              : 'Install InteriorX App on your device for instant access & offline support'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void install()}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#C8A24E] text-black text-xs font-bold hover:bg-[#DFBE6F] transition-colors whitespace-nowrap cursor-pointer shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'تثبيت الآن' : 'Install'}</span>
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label={lang === 'ar' ? 'إغلاق إشعار التثبيت' : 'Dismiss install notification'}
            className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export const AuthInstallCard: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const { lang } = useApp();
  const [showGuide, setShowGuide] = useState(false);
  const [copied, setCopied] = useState(false);

  if (isInstalled) return null;

  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;
  const appUrl =
    typeof window !== 'undefined' ? window.location.origin : 'https://interiorx.app';

  const handleInstallClick = async () => {
    if (isInstallable) {
      const ok = await install();
      if (!ok) setShowGuide(true);
    } else {
      setShowGuide(true);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(appUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handleInstallClick()}
        className="w-full flex items-center justify-between gap-3 rounded-xl border-2 border-[#C8A24E] bg-neutral-950 dark:bg-[#1A1A1F] px-4 py-3 text-start hover:bg-neutral-900 dark:hover:bg-[#222229] transition-colors cursor-pointer group shadow-sm"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-10 h-10 rounded-xl bg-[#C8A24E] text-black flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">
              {lang === 'ar' ? 'تثبيت التطبيق على الموبايل' : 'Install App on Mobile'}
            </p>
            <p className="text-xs text-neutral-400 truncate">
              {isInstallable
                ? lang === 'ar'
                  ? 'اضغط هنا للتنزيل والتثبيت المباشر على هاتفك'
                  : 'Tap here to download & install directly on your phone'
                : lang === 'ar'
                ? 'نزّل InteriorX على شاشتك الرئيسية بضغطة واحدة'
                : 'Add InteriorX to your home screen in one tap'}
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#C8A24E] text-black text-xs font-bold shrink-0 group-hover:bg-[#DFBE6F] transition-colors">
          <Download className="w-3.5 h-3.5" />
          <span>{lang === 'ar' ? 'تثبيت' : 'Install'}</span>
        </span>
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#131316] border border-[#C8A24E]/40 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Smartphone className="w-5 h-5 text-[#C8A24E]" />
                <h3 className="text-base font-bold text-neutral-900 dark:text-stone-100">
                  {lang === 'ar' ? 'تثبيت InteriorX على الموبايل' : 'Install InteriorX on Mobile'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <div className="space-y-2 text-xs sm:text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
                <p className="font-semibold text-neutral-900 dark:text-stone-100">
                  {lang === 'ar' ? 'لأجهزة iPhone و iPad (Safari):' : 'For iPhone & iPad (Safari):'}
                </p>
                <ol className="list-decimal list-inside space-y-1.5">
                  <li>
                    {lang === 'ar'
                      ? 'اضغط على زر المشاركة (Share) في شريط متصفح Safari.'
                      : 'Tap the Share button in the Safari toolbar.'}
                  </li>
                  <li>
                    {lang === 'ar'
                      ? 'اختر «إضافة إلى الشاشة الرئيسية» (Add to Home Screen).'
                      : 'Tap "Add to Home Screen".'}
                  </li>
                  <li>
                    {lang === 'ar'
                      ? 'اضغط «إضافة» (Add) وسينزل التطبيق على شاشتك.'
                      : 'Tap "Add" to install on your home screen.'}
                  </li>
                </ol>
              </div>
            ) : (
              <div className="space-y-2 text-xs sm:text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
                {isInIframe ? (
                  <p>
                    {lang === 'ar'
                      ? 'أنت تفتح التطبيق الآن داخل نافذة معاينة. افتحه في متصفح الموبايل مباشرة بالزر التالي لتثبيته فوراً:'
                      : 'You are viewing inside an embedded frame. Open directly in your mobile browser below to install:'}
                  </p>
                ) : (
                  <p>
                    {lang === 'ar'
                      ? 'من قائمة متصفح Chrome على الموبايل (⋮)، اختر «تثبيت التطبيق» أو «الإضافة إلى الشاشة الرئيسية» لتنزيله فوراً.'
                      : 'Open your mobile browser menu (⋮) and tap "Install app" or "Add to Home screen".'}
                  </p>
                )}
              </div>
            )}

            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-stone-50 dark:bg-black/40 p-3 flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-mono-num text-neutral-600 dark:text-neutral-400" dir="ltr">
                {appUrl}
              </span>
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-700 hover:border-[#C8A24E] shrink-0 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? (lang === 'ar' ? 'تم النسخ' : 'Copied') : lang === 'ar' ? 'نسخ' : 'Copy'}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <a
                href={appUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-[#C8A24E] px-4 py-2.5 text-xs font-bold text-black hover:bg-[#DFBE6F] transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                {lang === 'ar' ? 'فتح في المتصفح للتثبيت' : 'Open in Browser to Install'}
              </a>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="px-4 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs font-semibold cursor-pointer"
              >
                {lang === 'ar' ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const { lang } = useApp();
  const [exitHint, setExitHint] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onExitHint = () => {
      setExitHint(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setExitHint(false), 2000);
    };
    window.addEventListener('ix-android-exit-hint', onExitHint);
    return () => {
      window.removeEventListener('ix-android-exit-hint', onExitHint);
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <>
      {!isOnline && (
        <div
          role="alert"
          className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:start-4 z-50 flex items-center gap-2.5 rounded-xl border border-amber-400/50 bg-amber-600 px-4 py-2.5 text-xs font-semibold text-white shadow-xl"
        >
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>
            {lang === 'ar'
              ? 'انقطع الاتصال بالإنترنت — تحقق من الشبكة، يتم عرض البيانات المحفوظة مؤقتاً'
              : 'No Internet Connection — Check your network; cached data active'}
          </span>
        </div>
      )}

      {exitHint && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 rounded-full bg-neutral-900/95 border border-[#C8A24E]/50 px-4 py-2 text-xs font-medium text-stone-100 shadow-xl whitespace-nowrap">
          {lang === 'ar' ? 'اضغط زر الرجوع مرة أخرى للخروج' : 'Press back again to exit'}
        </div>
      )}
    </>
  );
};

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    theme,
    toggleTheme,
    lang,
    setLang,
    route,
    navigate,
    firebaseUser,
    userRecord,
    isAdmin,
    unreadCount,
    logout,
    gmpQuotaExceeded,
  } = useApp();
  const t = translations[lang];
  const [drawerOpen, setDrawerOpen] = useState(false);

  const getDashboardRoute = () => {
    if (isAdmin || userRecord?.role === 'ADMIN') return '/admin';
    if (userRecord?.role === 'TECHNICIAN') return '/technician';
    return '/customer';
  };

  const handleNav = (path: string) => {
    setDrawerOpen(false);
    navigate(path);
  };

  return (
    <div className="min-h-screen flex flex-col bg-stone-50 text-neutral-900 dark:bg-[#0A0A0B] dark:text-stone-100 transition-colors duration-200">
      {/* Mandatory Case A Google Maps Quota Banner */}
      {gmpQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 border-b border-neutral-200/80 dark:border-neutral-800/80 bg-white/90 dark:bg-[#0A0A0B]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single text wordmark */}
          <button
            type="button"
            onClick={() => handleNav('/')}
            className="text-xl font-display font-bold tracking-tight text-neutral-950 dark:text-stone-100 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Interior<span className="text-[#C8A24E]">X</span>
          </button>

          {/* Zone 2: 4 concise single-line nav links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-neutral-600 dark:text-neutral-300">
            <button
              type="button"
              onClick={() => handleNav('/services')}
              className={`hover:text-[#C8A24E] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                route.startsWith('/services') ? 'text-[#C8A24E]' : ''
              }`}
            >
              {t.nav.services}
            </button>
            <button
              type="button"
              onClick={() => handleNav('/how-it-works')}
              className={`hover:text-[#C8A24E] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                route === '/how-it-works' ? 'text-[#C8A24E]' : ''
              }`}
            >
              {t.nav.howItWorks}
            </button>
            <button
              type="button"
              onClick={() => handleNav('/about')}
              className={`hover:text-[#C8A24E] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                route === '/about' ? 'text-[#C8A24E]' : ''
              }`}
            >
              {t.nav.about}
            </button>
            <button
              type="button"
              onClick={() => handleNav('/contact')}
              className={`hover:text-[#C8A24E] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                route === '/contact' ? 'text-[#C8A24E]' : ''
              }`}
            >
              {t.nav.contact}
            </button>
          </nav>

          {/* Zone 3: 1 primary action + compact install & menu triggers */}
          <div className="flex items-center gap-2.5 shrink-0">
            <PWAInstallButton variant="icon" />
            {firebaseUser ? (
              <button
                type="button"
                onClick={() => handleNav(getDashboardRoute())}
                className="px-4 py-2 rounded-lg bg-[#C8A24E] text-black text-xs font-bold hover:bg-[#DFBE6F] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {t.nav.dashboard}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleNav('/auth')}
                className="px-4 py-2 rounded-lg bg-[#C8A24E] text-black text-xs font-bold hover:bg-[#DFBE6F] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {t.nav.login}
              </button>
            )}

            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setDrawerOpen(true)}
              className="relative p-2 rounded-lg border border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-stone-200 hover:border-[#C8A24E] transition-colors cursor-pointer"
            >
              <Menu className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#C8A24E] text-[10px] font-bold text-black flex items-center justify-center font-mono-num">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <PWAInstallBanner />

      {/* Workspace / Settings / Mobile Navigation Slide-Over Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-xs h-full bg-white dark:bg-[#111114] border-s border-neutral-200 dark:border-neutral-800 p-6 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-neutral-200 dark:border-neutral-800">
                <span className="text-lg font-display font-bold">
                  Interior<span className="text-[#C8A24E]">X</span>
                </span>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {firebaseUser && (
                <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-stone-50 dark:bg-[#17171B] space-y-2">
                  <div className="flex items-center gap-2.5">
                    <UserIcon className="w-4 h-4 text-[#C8A24E] shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {userRecord?.name || firebaseUser.displayName || firebaseUser.email}
                      </p>
                      <p className="text-xs text-neutral-500 truncate">
                        {userRecord?.role || (isAdmin ? 'ADMIN' : 'ONBOARDING')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => handleNav(getDashboardRoute())}
                      className="flex-1 py-1.5 rounded-md bg-[#C8A24E] text-black text-xs font-semibold cursor-pointer"
                    >
                      {t.nav.dashboard}
                    </button>
                    {userRecord?.role === 'CUSTOMER' && (
                      <button
                        type="button"
                        onClick={() => handleNav('/customer/notifications')}
                        className="px-2.5 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-700 text-xs flex items-center gap-1 cursor-pointer"
                      >
                        <Bell className="w-3.5 h-3.5" />
                        <span className="font-mono-num">{unreadCount}</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                {[
                  { label: t.nav.home, path: '/' },
                  { label: t.nav.services, path: '/services' },
                  { label: t.nav.howItWorks, path: '/how-it-works' },
                  { label: t.nav.about, path: '/about' },
                  { label: t.nav.faq, path: '/faq' },
                  { label: t.nav.contact, path: '/contact' },
                  { label: t.nav.terms, path: '/terms' },
                  { label: t.nav.privacy, path: '/privacy' },
                ].map((item) => (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => handleNav(item.path)}
                    className={`w-full text-start px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
                      route === item.path
                        ? 'bg-[#C8A24E]/15 text-[#C8A24E] font-semibold'
                        : 'text-neutral-700 dark:text-stone-300 hover:bg-neutral-100 dark:hover:bg-neutral-800/70'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Theme & Language Preferences */}
              <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800 space-y-2.5">
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs font-medium cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    {theme === 'dark' ? <Moon className="w-4 h-4 text-[#C8A24E]" /> : <Sun className="w-4 h-4 text-[#C8A24E]" />}
                    {lang === 'ar' ? (theme === 'dark' ? 'الوضع الليلي' : 'الوضع النهاري') : theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
                  </span>
                  <span className="text-neutral-500">{theme === 'dark' ? 'Dark' : 'Light'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs font-medium cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-[#C8A24E]" />
                    {lang === 'ar' ? 'اللغة' : 'Language'}
                  </span>
                  <span className="text-neutral-500">{lang === 'ar' ? 'العربية (RTL)' : 'English (LTR)'}</span>
                </button>

                <PWAInstallButton />
              </div>
            </div>

            <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800 space-y-2">
              <button
                type="button"
                onClick={() => handleNav(isAdmin ? '/admin' : '/admin/login')}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-[#C8A24E] cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                {t.nav.adminPortal}
              </button>
              {firebaseUser && (
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    void logout();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-red-500 hover:bg-red-500/10 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  {t.nav.logout}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Viewport */}
      <main className="flex-1">{children}</main>

      {/* Quiet Luxury Footer */}
      <footer className="border-t border-neutral-200 dark:border-neutral-800/80 bg-white dark:bg-[#0A0A0B] py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-3">
            <span className="text-xl font-display font-bold">
              Interior<span className="text-[#C8A24E]">X</span>
            </span>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed max-w-xs">
              {t.tagline}
            </p>
          </div>

          <div className="space-y-2 text-xs">
            <p className="font-semibold text-neutral-900 dark:text-stone-100 mb-2">
              {lang === 'ar' ? 'المنصة' : 'Platform'}
            </p>
            <button type="button" onClick={() => navigate('/services')} className="block text-neutral-600 dark:text-neutral-400 hover:text-[#C8A24E] cursor-pointer">
              {t.nav.services}
            </button>
            <button type="button" onClick={() => navigate('/how-it-works')} className="block text-neutral-600 dark:text-neutral-400 hover:text-[#C8A24E] cursor-pointer">
              {t.nav.howItWorks}
            </button>
            <button type="button" onClick={() => navigate('/about')} className="block text-neutral-600 dark:text-neutral-400 hover:text-[#C8A24E] cursor-pointer">
              {t.nav.about}
            </button>
          </div>

          <div className="space-y-2 text-xs">
            <p className="font-semibold text-neutral-900 dark:text-stone-100 mb-2">
              {lang === 'ar' ? 'الدعم والسياسات' : 'Support & Legal'}
            </p>
            <button type="button" onClick={() => navigate('/faq')} className="block text-neutral-600 dark:text-neutral-400 hover:text-[#C8A24E] cursor-pointer">
              {t.nav.faq}
            </button>
            <button type="button" onClick={() => navigate('/terms')} className="block text-neutral-600 dark:text-neutral-400 hover:text-[#C8A24E] cursor-pointer">
              {t.nav.terms}
            </button>
            <button type="button" onClick={() => navigate('/privacy')} className="block text-neutral-600 dark:text-neutral-400 hover:text-[#C8A24E] cursor-pointer">
              {t.nav.privacy}
            </button>
            <button type="button" onClick={() => navigate('/contact')} className="block text-neutral-600 dark:text-neutral-400 hover:text-[#C8A24E] cursor-pointer">
              {t.nav.contact}
            </button>
          </div>

          <div className="space-y-3 text-xs">
            <p className="font-semibold text-neutral-900 dark:text-stone-100">
              {lang === 'ar' ? 'التفضيلات' : 'Preferences'}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleTheme}
                className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 hover:border-[#C8A24E] cursor-pointer"
              >
                {theme === 'dark' ? (lang === 'ar' ? 'نهاري' : 'Light') : lang === 'ar' ? 'ليلي' : 'Dark'}
              </button>
              <button
                type="button"
                onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
                className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 hover:border-[#C8A24E] cursor-pointer"
              >
                {lang === 'ar' ? 'English' : 'العربية'}
              </button>
            </div>
            <div className="pt-1">
              <PWAInstallButton variant="footer" />
            </div>
            <button
              type="button"
              onClick={() => navigate(isAdmin ? '/admin' : '/admin/login')}
              className="inline-flex items-center gap-1.5 text-neutral-500 hover:text-[#C8A24E] cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              {t.nav.adminPortal}
            </button>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-10 pt-6 border-t border-neutral-200 dark:border-neutral-800/60 flex flex-wrap items-center justify-between gap-4 text-xs text-neutral-500">
          <span>© {new Date().getFullYear()} InteriorX. {lang === 'ar' ? 'جميع الحقوق محفوظة.' : 'All rights reserved.'}</span>
          <span>{lang === 'ar' ? 'بوابة التشطيبات والصيانة الموثقة' : 'Verified Architectural Finishing & Maintenance'}</span>
        </div>
      </footer>

      <OfflineIndicator />
    </div>
  );
};
