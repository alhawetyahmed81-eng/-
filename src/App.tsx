import React from 'react';
import { AppProvider, useApp } from './contexts/AppContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import {
  CmsDocumentPage,
  ContactPage,
  HomePage,
  HowItWorksPage,
  ServiceDetailPage,
  ServicesListPage,
} from './pages/PublicPages';
import { AdminLoginPage, AuthPage } from './pages/AuthPage';
import { CustomerPortal } from './pages/CustomerPortal';
import { TechnicianPortal } from './pages/TechnicianPortal';
import { AdminPortal } from './pages/AdminPortal';

function AppRouter() {
  const { route, authReady, firebaseUser, needsOnboarding, navigate, lang } = useApp();
  const cleanRoute = route.split('?')[0] || '/';

  // Service detail route
  const serviceDetailMatch = cleanRoute.match(/^\/services\/([a-zA-Z0-9_\-]+)$/);

  const renderPage = () => {
    if (cleanRoute === '/') return <HomePage />;
    if (cleanRoute === '/services') return <ServicesListPage />;
    if (serviceDetailMatch) return <ServiceDetailPage slug={serviceDetailMatch[1]} />;
    if (cleanRoute === '/how-it-works') return <HowItWorksPage />;
    if (cleanRoute === '/about') return <CmsDocumentPage pageType="about" />;
    if (cleanRoute === '/faq') return <CmsDocumentPage pageType="faq" />;
    if (cleanRoute === '/terms') return <CmsDocumentPage pageType="terms" />;
    if (cleanRoute === '/privacy') return <CmsDocumentPage pageType="privacy" />;
    if (cleanRoute === '/contact') return <ContactPage />;
    if (cleanRoute === '/auth') return <AuthPage />;
    if (cleanRoute === '/admin/login') return <AdminLoginPage />;

    if (cleanRoute.startsWith('/admin')) {
      if (!authReady) {
        return <div className="py-20 text-center text-sm text-neutral-500">Loading...</div>;
      }
      return <AdminPortal />;
    }

    if (cleanRoute.startsWith('/customer') || cleanRoute.startsWith('/technician')) {
      if (!authReady) {
        return <div className="py-20 text-center text-sm text-neutral-500">Loading...</div>;
      }
      if (!firebaseUser || needsOnboarding) {
        return <AuthPage />;
      }
      if (cleanRoute.startsWith('/customer')) return <CustomerPortal />;
      return <TechnicianPortal />;
    }

    // 404 Fallback
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-4">
        <p className="text-4xl font-mono-num font-bold text-[#C8A24E]">404</p>
        <p className="text-sm text-neutral-500">
          {lang === 'ar' ? 'الصفحة المطلوبة غير موجودة.' : 'The requested page was not found.'}
        </p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="px-5 py-2.5 rounded-lg bg-[#C8A24E] text-black text-xs font-bold cursor-pointer"
        >
          {lang === 'ar' ? 'العودة للرئيسية' : 'Return Home'}
        </button>
      </div>
    );
  };

  return <Layout>{renderPage()}</Layout>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <AppRouter />
      </AppProvider>
    </ErrorBoundary>
  );
}
