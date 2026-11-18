import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  Briefcase,
  CreditCard,
  FileText,
  Heart,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  PlusCircle,
  Search,
  Star,
  Upload,
  User as UserIcon,
  Wallet as WalletIcon,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { apiFetch, uploadFileToServer } from '../lib/api';
import { requestFcmPushToken } from '../lib/firebase';
import { tStatus, translations } from '../i18n/translations';
import { LocationPickerMap, TechnicianDiscoveryMap, type Coordinates } from '../components/MapsComponents';
import { OrderDetailView } from '../components/OrderDetailView';
import type {
  CustomerProfile,
  Invoice,
  Order,
  Review,
  TechnicianPublicProfile,
  Transaction,
  Wallet,
} from '../types';

export const CustomerPortal: React.FC = () => {
  const {
    lang,
    route,
    navigate,
    userRecord,
    services,
    notifications,
    unreadCount,
    markNotificationRead,
    markAllNotificationsRead,
    integrations,
    refreshSession,
  } = useApp();
  const t = translations[lang];

  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [feedback, setFeedback] = useState('');

  // Find Technicians state
  const [techs, setTechs] = useState<TechnicianPublicProfile[]>([]);
  const [techSearch, setTechSearch] = useState('');
  const [techServiceId, setTechServiceId] = useState('');
  const [techArea, setTechArea] = useState('');
  const [customerCoords, setCustomerCoords] = useState<Coordinates | null>(null);
  const [inspectTechReviews, setInspectTechReviews] = useState<{
    tech: TechnicianPublicProfile;
    reviews: Review[];
  } | null>(null);

  // New Order Form state
  const [preselectedTechId, setPreselectedTechId] = useState('');
  const [ordServiceId, setOrdServiceId] = useState('');
  const [ordTitle, setOrdTitle] = useState('');
  const [ordDesc, setOrdDesc] = useState('');
  const [ordAddress, setOrdAddress] = useState('');
  const [ordCoords, setOrdCoords] = useState<Coordinates | null>(null);
  const [ordScheduledAt, setOrdScheduledAt] = useState(() => {
    const d = new Date(Date.now() + 86400000);
    d.setMinutes(0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [ordBudget, setOrdBudget] = useState('');
  const [ordMedia, setOrdMedia] = useState<string[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);

  // Orders filter
  const [ordersFilter, setOrdersFilter] = useState<'ALL' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'>('ALL');

  // Wallet Top-Up
  const [topupAmount, setTopupAmount] = useState('500');
  const [transferRef, setTransferRef] = useState('');
  const [transferMethod, setTransferMethod] = useState('InstaPay');
  const [topupMsg, setTopupMsg] = useState('');
  const [paymobIframe, setPaymobIframe] = useState('');
  const [fawryRef, setFawryRef] = useState('');

  // Profile Editor
  const [profName, setProfName] = useState('');
  const [profPhone, setProfPhone] = useState('');
  const [profCity, setProfCity] = useState('');
  const [profAddress, setProfAddress] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // FCM push status
  const [fcmStatus, setFcmStatus] = useState('');

  const loadDashboard = useCallback(async () => {
    try {
      const data = await apiFetch<any>('/api/customer/dashboard');
      setOrders(Array.isArray(data.orders) ? data.orders : []);
      setProfile(data.profile || null);
      setWallet(data.wallet || null);
      setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
      setInvoices(Array.isArray(data.invoices) ? data.invoices : []);

      if (data.profile) {
        setProfCity(data.profile.city || '');
        setProfAddress(data.profile.address || '');
        if (typeof data.profile.lat === 'number' && typeof data.profile.lng === 'number') {
          const coords = { lat: data.profile.lat, lng: data.profile.lng };
          setCustomerCoords(coords);
          setOrdCoords((prev) => prev || coords);
        }
      }
    } catch (err: any) {
      setFeedback(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTechnicians = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      if (techServiceId) q.set('serviceId', techServiceId);
      if (techSearch) q.set('search', techSearch);
      if (techArea) q.set('area', techArea);
      if (customerCoords) {
        q.set('lat', String(customerCoords.lat));
        q.set('lng', String(customerCoords.lng));
      }
      const list = await apiFetch<TechnicianPublicProfile[]>(`/api/technicians?${q.toString()}`);
      setTechs(Array.isArray(list) ? list : []);
    } catch {
      setTechs([]);
    }
  }, [techServiceId, techSearch, techArea, customerCoords]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (userRecord) {
      setProfName(userRecord.name || '');
      setProfPhone(userRecord.phone || '');
    }
  }, [userRecord]);

  useEffect(() => {
    if (services.length > 0 && !ordServiceId) {
      setOrdServiceId(services[0].id);
    }
  }, [services, ordServiceId]);

  useEffect(() => {
    if (route === '/customer/technicians' || route === '/customer/favorites') {
      void loadTechnicians();
    }
  }, [route, loadTechnicians]);

  if (!userRecord || userRecord.role !== 'CUSTOMER') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <p className="text-sm text-neutral-500">
          {lang === 'ar' ? 'هذه البوابة مخصصة لحسابات العملاء.' : 'This portal is restricted to Customer accounts.'}
        </p>
        <button
          type="button"
          onClick={() => navigate('/auth')}
          className="px-5 py-2.5 rounded-lg bg-[#C8A24E] text-black text-xs font-bold cursor-pointer"
        >
          {t.nav.login}
        </button>
      </div>
    );
  }

  const orderDetailMatch = route.match(/^\/customer\/orders\/([a-zA-Z0-9_\-]+)$/);
  const activeOrderId = orderDetailMatch?.[1];

  const handleToggleFavorite = async (techId: string) => {
    try {
      const res = await apiFetch<any>(`/api/customer/favorites/${techId}`, { method: 'POST' });
      setProfile((prev) =>
        prev ? { ...prev, favoriteTechnicianIds: res.favoriteTechnicianIds } : prev
      );
    } catch (err: any) {
      setFeedback(err.message);
    }
  };

  const handleInspectReviews = async (tech: TechnicianPublicProfile) => {
    try {
      const reviews = await apiFetch<Review[]>(`/api/technicians/${tech.uid}/reviews`);
      setInspectTechReviews({ tech, reviews: Array.isArray(reviews) ? reviews : [] });
    } catch {
      setInspectTechReviews({ tech, reviews: [] });
    }
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploadingMedia(true);
    try {
      const urls: string[] = [];
      for (const f of files.slice(0, 5)) {
        const up = await uploadFileToServer(f);
        urls.push(up.url);
      }
      setOrdMedia((prev) => [...prev, ...urls].slice(0, 10));
    } catch (err: any) {
      setFeedback(err.message);
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ordCoords) {
      setFeedback(
        lang === 'ar'
          ? 'يرجى تحديد موقع العمل على الخريطة أو عبر GPS.'
          : 'Please select the job site location on the map or via GPS.'
      );
      return;
    }
    setCreatingOrder(true);
    setFeedback('');
    try {
      const created = await apiFetch<Order>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          serviceId: ordServiceId,
          title: ordTitle,
          description: ordDesc,
          address: ordAddress || `${ordCoords.lat.toFixed(4)}, ${ordCoords.lng.toFixed(4)}`,
          lat: ordCoords.lat,
          lng: ordCoords.lng,
          scheduledAt: new Date(ordScheduledAt).toISOString(),
          budgetEstimate: ordBudget ? Number(ordBudget) : undefined,
          mediaUrls: ordMedia,
          preferredTechnicianId: preselectedTechId || undefined,
        }),
      });
      setOrdTitle('');
      setOrdDesc('');
      setOrdBudget('');
      setOrdMedia([]);
      setPreselectedTechId('');
      await loadDashboard();
      navigate(`/customer/orders/${created.id}`);
    } catch (err: any) {
      setFeedback(err.message);
    } finally {
      setCreatingOrder(false);
    }
  };

  const handleWalletTopup = async (provider: 'PAYMOB' | 'FAWRY') => {
    setTopupMsg('');
    setPaymobIframe('');
    setFawryRef('');
    try {
      const endpoint = provider === 'PAYMOB' ? '/api/payments/paymob/init' : '/api/payments/fawry/init';
      const res = await apiFetch<any>(endpoint, {
        method: 'POST',
        body: JSON.stringify({ purpose: 'TOPUP', amount: Number(topupAmount) }),
      });
      if (res.iframeUrl) setPaymobIframe(res.iframeUrl);
      if (res.referenceNumber) setFawryRef(res.referenceNumber);
    } catch (err: any) {
      setTopupMsg(err.message);
    }
  };

  const handleManualTopupRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setTopupMsg('');
    try {
      await apiFetch('/api/wallet/topup-request', {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(topupAmount),
          referenceNumber: transferRef,
          method: transferMethod,
        }),
      });
      setTransferRef('');
      await loadDashboard();
      setTopupMsg(
        lang === 'ar'
          ? 'تم إرسال طلب شحن المحفظة بنجاح وسيتم إضافة الرصيد فور مراجعة الإدارة.'
          : 'Top-up request submitted for Admin verification.'
      );
    } catch (err: any) {
      setTopupMsg(err.message);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setFeedback('');
    try {
      await apiFetch('/api/customer/profile', {
        method: 'PUT',
        body: JSON.stringify({
          name: profName,
          phone: profPhone,
          city: profCity,
          address: profAddress,
          lat: customerCoords?.lat,
          lng: customerCoords?.lng,
        }),
      });
      await Promise.all([loadDashboard(), refreshSession()]);
      setFeedback(lang === 'ar' ? 'تم حفظ الملف الشخصي بنجاح.' : 'Profile updated successfully.');
    } catch (err: any) {
      setFeedback(err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleEnableFcm = async () => {
    setFcmStatus('');
    const res = await requestFcmPushToken();
    if (res.token) {
      await apiFetch('/api/auth/fcm-token', {
        method: 'POST',
        body: JSON.stringify({ token: res.token }),
      });
      setFcmStatus(lang === 'ar' ? 'تم تفعيل إشعارات الدفع اللحظية بنجاح.' : 'Push notifications activated.');
    } else if (res.reason === 'NOT_CONFIGURED') {
      setFcmStatus(
        lang === 'ar'
          ? 'تنبيه: مفتاح VITE_FIREBASE_VAPID_KEY غير مهيأ بعد — الإشعارات داخل التطبيق مفعّلة بالكامل عبر WebSocket.'
          : 'VITE_FIREBASE_VAPID_KEY is not configured yet — real-time in-app WebSocket notifications remain active.'
      );
    } else {
      setFcmStatus(res.reason || 'Push notifications unavailable.');
    }
  };

  const navItems = [
    { path: '/customer', icon: LayoutDashboard, label: lang === 'ar' ? 'نظرة عامة' : 'Overview' },
    { path: '/customer/new-order', icon: PlusCircle, label: lang === 'ar' ? 'طلب خدمة جديد' : 'New Order' },
    { path: '/customer/technicians', icon: Search, label: lang === 'ar' ? 'البحث عن فنيين' : 'Find Technicians' },
    { path: '/customer/orders', icon: Briefcase, label: lang === 'ar' ? 'طلباتي' : 'My Orders' },
    { path: '/customer/chat', icon: MessageSquare, label: lang === 'ar' ? 'المحادثات' : 'Order Chats' },
    { path: '/customer/wallet', icon: WalletIcon, label: lang === 'ar' ? 'المحفظة والفواتير' : 'Wallet & Invoices' },
    { path: '/customer/favorites', icon: Heart, label: lang === 'ar' ? 'المفضلة' : 'Favorites' },
    {
      path: '/customer/notifications',
      icon: Bell,
      label: `${lang === 'ar' ? 'الإشعارات' : 'Notifications'}${unreadCount > 0 ? ` (${unreadCount})` : ''}`,
    },
    { path: '/customer/profile', icon: UserIcon, label: lang === 'ar' ? 'الملف الشخصي' : 'Profile & Settings' },
  ];

  const favoriteIds = profile?.favoriteTechnicianIds || [];
  const activeOrders = orders.filter((o) => !['PAID', 'CANCELLED'].includes(o.status));
  const completedOrders = orders.filter((o) => ['COMPLETED', 'PAID'].includes(o.status));

  const filteredOrders = orders.filter((o) => {
    if (ordersFilter === 'ACTIVE') return !['PAID', 'CANCELLED'].includes(o.status);
    if (ordersFilter === 'COMPLETED') return ['COMPLETED', 'PAID'].includes(o.status);
    if (ordersFilter === 'CANCELLED') return o.status === 'CANCELLED';
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Sidebar Navigation */}
        <aside className="lg:col-span-3 space-y-4">
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-5 space-y-1">
            <div className="pb-3 mb-3 border-b border-neutral-200 dark:border-neutral-800">
              <p className="text-xs text-[#C8A24E] font-semibold">
                {lang === 'ar' ? 'بوابة العميل' : 'Customer Portal'}
              </p>
              <p className="text-sm font-bold truncate mt-0.5">{userRecord.name}</p>
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.path === '/customer'
                  ? route === '/customer'
                  : route.startsWith(item.path);
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => navigate(item.path)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-[#C8A24E] text-black font-bold'
                      : 'text-neutral-700 dark:text-stone-300 hover:bg-neutral-100 dark:hover:bg-neutral-800/70'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Main Workspace */}
        <section className="lg:col-span-9 space-y-6">
          {feedback && (
            <div className="rounded-xl border border-[#C8A24E]/40 bg-[#C8A24E]/10 px-4 py-3 text-xs font-medium">
              {feedback}
            </div>
          )}

          {activeOrderId ? (
            <OrderDetailView orderId={activeOrderId} backPath="/customer/orders" />
          ) : loading ? (
            <div className="py-16 text-center text-sm text-neutral-500">{t.common.loading}</div>
          ) : route === '/customer' ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold">
                    {lang === 'ar' ? `مرحباً، ${userRecord.name}` : `Welcome, ${userRecord.name}`}
                  </h1>
                  <p className="text-xs text-neutral-500 mt-1">
                    {lang === 'ar'
                      ? 'أدر طلبات التشطيب والصيانة وقارن عروض الفنيين الموثقين.'
                      : 'Manage finishing & maintenance orders and review verified quotes.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/customer/new-order')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#C8A24E] text-black text-xs font-bold hover:bg-[#DFBE6F] cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  {lang === 'ar' ? 'إنشاء طلب جديد' : 'Create New Order'}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-4">
                  <p className="text-xs text-neutral-500">{lang === 'ar' ? 'طلبات جارية' : 'Active Orders'}</p>
                  <p className="text-2xl font-bold font-mono-num mt-1">{activeOrders.length}</p>
                </div>
                <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-4">
                  <p className="text-xs text-neutral-500">{lang === 'ar' ? 'طلبات مكتملة' : 'Completed'}</p>
                  <p className="text-2xl font-bold font-mono-num mt-1 text-[#C8A24E]">{completedOrders.length}</p>
                </div>
                <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-4">
                  <p className="text-xs text-neutral-500">{lang === 'ar' ? 'رصيد المحفظة' : 'Wallet Balance'}</p>
                  <p className="text-2xl font-bold font-mono-num mt-1">
                    {wallet?.balance ?? 0} <span className="text-xs">{t.common.currency}</span>
                  </p>
                </div>
                <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-4">
                  <p className="text-xs text-neutral-500">{lang === 'ar' ? 'إجمالي الإنفاق' : 'Total Spent'}</p>
                  <p className="text-2xl font-bold font-mono-num mt-1">
                    {wallet?.totalSpent ?? 0} <span className="text-xs">{t.common.currency}</span>
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold">
                    {lang === 'ar' ? 'أحدث الطلبات' : 'Recent Orders'}
                  </h2>
                  <button
                    type="button"
                    onClick={() => navigate('/customer/orders')}
                    className="text-xs text-[#C8A24E] font-semibold cursor-pointer"
                  >
                    {t.common.all}
                  </button>
                </div>

                {orders.length === 0 ? (
                  <p className="text-xs text-neutral-500 py-6 text-center">{t.common.noData}</p>
                ) : (
                  <div className="space-y-3">
                    {orders.slice(0, 5).map((o) => (
                      <div
                        key={o.id}
                        onClick={() => navigate(`/customer/orders/${o.id}`)}
                        className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 flex flex-wrap items-center justify-between gap-3 hover:border-[#C8A24E] cursor-pointer transition-colors"
                      >
                        <div>
                          <p className="text-sm font-bold">{o.title}</p>
                          <p className="text-xs text-neutral-500 mt-0.5">
                            {lang === 'ar' ? o.serviceNameAr : o.serviceNameEn} · {o.address}
                          </p>
                        </div>
                        <div className="text-end">
                          <span className="text-xs font-bold text-[#C8A24E]">{tStatus(o.status, lang)}</span>
                          {o.finalPrice && (
                            <p className="text-xs font-mono-num text-neutral-500 mt-0.5">
                              {o.finalPrice} {t.common.currency}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : route === '/customer/new-order' ? (
            <form
              onSubmit={handleCreateOrder}
              className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-6"
            >
              <div>
                <h1 className="text-xl font-bold">
                  {lang === 'ar' ? 'إنشاء طلب خدمة جديد' : 'Create New Service Order'}
                </h1>
                <p className="text-xs text-neutral-500 mt-1">
                  {lang === 'ar'
                    ? 'حدد القسم، تفاصيل العمل، الموقع الجغرافي الدقيق، وارفع صوراً للموقع لاستقبال عروض الفنيين.'
                    : 'Choose division, scope, exact map location, and upload site media to receive verified quotes.'}
                </p>
              </div>

              {preselectedTechId && (
                <div className="rounded-lg border border-[#C8A24E]/40 bg-[#C8A24E]/10 px-4 py-2.5 flex items-center justify-between text-xs">
                  <span>
                    {lang === 'ar'
                      ? 'سيتم إشعار الفني المختار مباشرة بهذا الطلب.'
                      : 'Selected technician will be directly notified of this request.'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPreselectedTechId('')}
                    className="underline cursor-pointer"
                  >
                    {t.common.cancel}
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">
                    {lang === 'ar' ? 'قسم الخدمة' : 'Service Division'}
                  </label>
                  <select
                    required
                    value={ordServiceId}
                    onChange={(e) => setOrdServiceId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#131316] text-sm"
                  >
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {lang === 'ar' ? s.nameAr : s.nameEn}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">
                    {lang === 'ar' ? 'عنوان الطلب' : 'Project / Request Title'}
                  </label>
                  <input
                    required
                    value={ordTitle}
                    onChange={(e) => setOrdTitle(e.target.value)}
                    placeholder={lang === 'ar' ? 'مثال: تأسيس كهرباء شقة 180م' : 'e.g. Full apartment electrical wiring'}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">
                  {lang === 'ar' ? 'الوصف التفصيلي والمواصفات' : 'Detailed Specifications'}
                </label>
                <textarea
                  required
                  rows={4}
                  value={ordDesc}
                  onChange={(e) => setOrdDesc(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">
                    {lang === 'ar' ? 'الموعد المفضل للمعاينة / التنفيذ' : 'Preferred Date & Time'}
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={ordScheduledAt}
                    onChange={(e) => setOrdScheduledAt(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">
                    {lang === 'ar' ? 'الميزانية التقديرية (اختياري - ج.م)' : 'Estimated Budget (Optional - EGP)'}
                  </label>
                  <input
                    type="number"
                    min={50}
                    value={ordBudget}
                    onChange={(e) => setOrdBudget(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm font-mono-num"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-xs font-medium">
                  {lang === 'ar' ? 'العنوان والموقع على الخريطة' : 'Site Address & Map Pin'}
                </label>
                <input
                  required
                  value={ordAddress}
                  onChange={(e) => setOrdAddress(e.target.value)}
                  placeholder={lang === 'ar' ? 'العنوان التفصيلي (الحي، الشارع، الدور...)' : 'Street, district, floor...'}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
                />
                <LocationPickerMap
                  value={ordCoords}
                  address={ordAddress}
                  onChange={(coords, resolvedAddr) => {
                    setOrdCoords(coords);
                    if (resolvedAddr) setOrdAddress(resolvedAddr);
                  }}
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium">
                  {lang === 'ar' ? 'رفع صور أو فيديو للموقع (JPG, PNG, MP4)' : 'Upload Site Photos or Video'}
                </label>
                <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-neutral-400 dark:border-neutral-700 text-xs font-medium cursor-pointer hover:border-[#C8A24E]">
                  <Upload className="w-4 h-4 text-[#C8A24E]" />
                  {uploadingMedia
                    ? lang === 'ar'
                      ? 'جاري الرفع...'
                      : 'Uploading...'
                    : lang === 'ar'
                    ? 'اختر ملفات للرفع'
                    : 'Choose Files to Upload'}
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,video/mp4"
                    onChange={(e) => void handleMediaUpload(e)}
                    className="hidden"
                  />
                </label>
                {ordMedia.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {ordMedia.map((u, i) => (
                      <span key={i} className="px-2.5 py-1 rounded border border-neutral-300 dark:border-neutral-700 text-[11px] font-mono-num">
                        {u.split('/').pop()}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={creatingOrder || uploadingMedia}
                className="w-full sm:w-auto px-8 py-3 rounded-lg bg-[#C8A24E] text-black text-sm font-bold hover:bg-[#DFBE6F] cursor-pointer"
              >
                {creatingOrder
                  ? lang === 'ar'
                    ? 'جاري نشر الطلب...'
                    : 'Publishing Order...'
                  : lang === 'ar'
                  ? 'نشر الطلب واستقبال العروض'
                  : 'Submit Request & Receive Quotes'}
              </button>
            </form>
          ) : route === '/customer/technicians' ? (
            <div className="space-y-6">
              <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-4">
                <h1 className="text-xl font-bold">
                  {lang === 'ar' ? 'البحث عن الفنيين الموثقين' : 'Discover Verified Technicians'}
                </h1>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    value={techSearch}
                    onChange={(e) => setTechSearch(e.target.value)}
                    placeholder={lang === 'ar' ? 'ابحث بالاسم أو الخبرة...' : 'Search by name or skill...'}
                    className="px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
                  />
                  <select
                    value={techServiceId}
                    onChange={(e) => setTechServiceId(e.target.value)}
                    className="px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#131316] text-sm"
                  >
                    <option value="">{lang === 'ar' ? 'جميع التخصصات' : 'All Specialties'}</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {lang === 'ar' ? s.nameAr : s.nameEn}
                      </option>
                    ))}
                  </select>
                  <input
                    value={techArea}
                    onChange={(e) => setTechArea(e.target.value)}
                    placeholder={lang === 'ar' ? 'المنطقة / المدينة' : 'Area / District'}
                    className="px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
                  />
                </div>
                <TechnicianDiscoveryMap
                  customerCoords={customerCoords}
                  technicians={techs}
                  onSelectTechnician={(tech) => {
                    setPreselectedTechId(tech.uid);
                    if (tech.specialtyIds?.[0]) setOrdServiceId(tech.specialtyIds[0]);
                    navigate('/customer/new-order');
                  }}
                />
              </div>

              {techs.length === 0 ? (
                <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-10 text-center text-sm text-neutral-500">
                  {lang === 'ar'
                    ? 'لا يوجد فنيون موثقون مطابقون لخيارات البحث حالياً.'
                    : 'No verified technicians match the current filters.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {techs.map((tech) => {
                    const isFav = favoriteIds.includes(tech.uid);
                    return (
                      <div
                        key={tech.uid}
                        className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-5 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-bold text-base">{tech.displayName}</p>
                            <p className="text-xs text-[#C8A24E] font-medium mt-0.5">
                              {t.common.verified} · {tech.subscriptionPlanId}
                              {typeof tech.distanceKm === 'number' ? ` · ${tech.distanceKm} ${t.common.km}` : ''}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleToggleFavorite(tech.uid)}
                            className="p-2 rounded-lg border border-neutral-200 dark:border-neutral-800 cursor-pointer"
                            aria-label="Toggle favorite"
                          >
                            <Heart className={`w-4 h-4 ${isFav ? 'fill-red-500 text-red-500' : 'text-neutral-400'}`} />
                          </button>
                        </div>

                        <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2">
                          {tech.bio || (lang === 'ar' ? 'فني معتمد على منصة InteriorX' : 'Verified InteriorX Specialist')}
                        </p>

                        <div className="flex items-center justify-between text-xs pt-2 border-t border-neutral-200 dark:border-neutral-800">
                          <span className="inline-flex items-center gap-1 font-mono-num">
                            <Star className="w-3.5 h-3.5 text-[#C8A24E] fill-[#C8A24E]" />
                            {tech.ratingAvg.toFixed(1)} ({tech.ratingCount}) · {tech.completedJobsCount}{' '}
                            {lang === 'ar' ? 'عمل' : 'jobs'}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handleInspectReviews(tech)}
                              className="px-2.5 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 text-[11px] cursor-pointer"
                            >
                              {lang === 'ar' ? 'التقييمات' : 'Reviews'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setPreselectedTechId(tech.uid);
                                if (tech.specialtyIds?.[0]) setOrdServiceId(tech.specialtyIds[0]);
                                navigate('/customer/new-order');
                              }}
                              className="px-3 py-1.5 rounded bg-[#C8A24E] text-black text-[11px] font-bold cursor-pointer"
                            >
                              {lang === 'ar' ? 'طلب عرض' : 'Request'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {inspectTechReviews && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                  <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#131316] border border-neutral-200 dark:border-neutral-800 p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-base">{inspectTechReviews.tech.displayName}</h3>
                      <button
                        type="button"
                        onClick={() => setInspectTechReviews(null)}
                        className="text-xs text-neutral-500 cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                    {inspectTechReviews.reviews.length === 0 ? (
                      <p className="text-xs text-neutral-500">
                        {lang === 'ar' ? 'لا توجد تقييمات مسجلة بعد.' : 'No reviews yet.'}
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {inspectTechReviews.reviews.map((r) => (
                          <div key={r.id} className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 text-xs space-y-1">
                            <div className="flex justify-between font-semibold">
                              <span>{r.customerName}</span>
                              <span className="text-[#C8A24E] font-mono-num">★ {r.rating}</span>
                            </div>
                            <p className="text-neutral-600 dark:text-neutral-400">{r.comment}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : route === '/customer/orders' ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-xl font-bold">{lang === 'ar' ? 'طلباتي' : 'My Service Orders'}</h1>
                <div className="flex items-center gap-2 text-xs">
                  {(['ALL', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setOrdersFilter(f)}
                      className={`px-3 py-1.5 rounded-lg border cursor-pointer ${
                        ordersFilter === f
                          ? 'border-[#C8A24E] bg-[#C8A24E] text-black font-bold'
                          : 'border-neutral-300 dark:border-neutral-700'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {filteredOrders.length === 0 ? (
                <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-10 text-center text-sm text-neutral-500">
                  {t.common.noData}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredOrders.map((o) => (
                    <div
                      key={o.id}
                      onClick={() => navigate(`/customer/orders/${o.id}`)}
                      className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-5 flex flex-wrap items-center justify-between gap-4 hover:border-[#C8A24E] cursor-pointer"
                    >
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-[#C8A24E]">
                          {lang === 'ar' ? o.serviceNameAr : o.serviceNameEn} · {tStatus(o.status, lang)}
                        </p>
                        <p className="font-bold text-base">{o.title}</p>
                        <p className="text-xs text-neutral-500 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" /> {o.address}
                        </p>
                      </div>
                      <div className="text-end space-y-1">
                        <p className="text-xs font-mono-num text-neutral-500">
                          {new Date(o.createdAt).toLocaleDateString()}
                        </p>
                        {o.finalPrice && (
                          <p className="text-sm font-bold font-mono-num text-[#C8A24E]">
                            {o.finalPrice} {t.common.currency}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : route === '/customer/chat' ? (
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-4">
              <h1 className="text-xl font-bold">{lang === 'ar' ? 'محادثات الطلبات' : 'Order Conversations'}</h1>
              {orders.filter((o) => o.technicianId).length === 0 ? (
                <p className="text-xs text-neutral-500 py-8 text-center">
                  {lang === 'ar'
                    ? 'تفتح المحادثات المباشرة فور قبولك لعرض أحد الفنيين.'
                    : 'Direct conversations open once you accept a technician quote.'}
                </p>
              ) : (
                <div className="space-y-3">
                  {orders
                    .filter((o) => o.technicianId)
                    .map((o) => (
                      <div
                        key={o.id}
                        onClick={() => navigate(`/customer/orders/${o.id}`)}
                        className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 flex items-center justify-between hover:border-[#C8A24E] cursor-pointer"
                      >
                        <div>
                          <p className="font-bold text-sm">{o.technicianName}</p>
                          <p className="text-xs text-neutral-500">{o.title} · {tStatus(o.status, lang)}</p>
                        </div>
                        <span className="text-xs text-[#C8A24E] font-semibold">
                          {lang === 'ar' ? 'فتح المحادثة' : 'Open Chat'}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ) : route === '/customer/wallet' ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-2xl border border-[#C8A24E]/40 bg-white dark:bg-[#131316] p-6">
                  <p className="text-xs text-neutral-500">{lang === 'ar' ? 'رصيد المحفظة' : 'Available Balance'}</p>
                  <p className="text-3xl font-bold font-mono-num text-[#C8A24E] mt-1">
                    {wallet?.balance ?? 0} {t.common.currency}
                  </p>
                </div>
                <div className="md:col-span-2 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-4">
                  <h2 className="text-sm font-bold">
                    {lang === 'ar' ? 'شحن رصيد المحفظة' : 'Top Up Wallet'}
                  </h2>

                  <form onSubmit={handleManualTopupRequest} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <input
                      type="number"
                      min={50}
                      required
                      value={topupAmount}
                      onChange={(e) => setTopupAmount(e.target.value)}
                      placeholder={lang === 'ar' ? 'المبلغ (ج.م)' : 'Amount (EGP)'}
                      className="px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-xs font-mono-num"
                    />
                    <select
                      value={transferMethod}
                      onChange={(e) => setTransferMethod(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#131316] text-xs"
                    >
                      <option value="InstaPay">InstaPay</option>
                      <option value="Bank Transfer">{lang === 'ar' ? 'تحويل بنكي' : 'Bank Transfer'}</option>
                      <option value="Cash Deposit">{lang === 'ar' ? 'إيداع نقدي' : 'Cash Deposit'}</option>
                    </select>
                    <input
                      required
                      value={transferRef}
                      onChange={(e) => setTransferRef(e.target.value)}
                      placeholder={lang === 'ar' ? 'رقم مرجع التحويل' : 'Transfer Reference #'}
                      className="px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-xs font-mono-num"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg bg-[#C8A24E] text-black text-xs font-bold hover:bg-[#DFBE6F] cursor-pointer"
                    >
                      {lang === 'ar' ? 'إرسال طلب الشحن' : 'Request Top-Up'}
                    </button>
                  </form>

                  {(integrations.paymobConfigured || integrations.fawryConfigured) && (
                    <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-neutral-200 dark:border-neutral-800">
                      {integrations.paymobConfigured && (
                        <button
                          type="button"
                          onClick={() => void handleWalletTopup('PAYMOB')}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#C8A24E] text-[#C8A24E] text-xs font-bold cursor-pointer"
                        >
                          <CreditCard className="w-4 h-4" />
                          Paymob
                        </button>
                      )}
                      {integrations.fawryConfigured && (
                        <button
                          type="button"
                          onClick={() => void handleWalletTopup('FAWRY')}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs font-semibold cursor-pointer"
                        >
                          <CreditCard className="w-4 h-4 text-[#C8A24E]" />
                          Fawry Pay
                        </button>
                      )}
                    </div>
                  )}

                  {topupMsg && <p className="text-xs text-[#C8A24E] font-medium">{topupMsg}</p>}
                  {paymobIframe && (
                    <iframe src={paymobIframe} title="Paymob Topup" className="w-full h-[440px] rounded-xl border bg-white" />
                  )}
                  {fawryRef && (
                    <p className="text-xs font-mono-num text-emerald-500">
                      Fawry Reference: {fawryRef}
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-4">
                <h2 className="text-base font-bold flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#C8A24E]" />
                  {lang === 'ar' ? 'الفواتير المعتمدة' : 'Issued Invoices'}
                </h2>
                {invoices.length === 0 ? (
                  <p className="text-xs text-neutral-500">{t.common.noData}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-start">
                      <thead className="border-b border-neutral-200 dark:border-neutral-800 text-neutral-500">
                        <tr>
                          <th className="py-2 text-start">#</th>
                          <th className="py-2 text-start">{lang === 'ar' ? 'الطلب' : 'Order'}</th>
                          <th className="py-2 text-start">{lang === 'ar' ? 'الإجمالي' : 'Total'}</th>
                          <th className="py-2 text-start">{lang === 'ar' ? 'الوسيلة' : 'Provider'}</th>
                          <th className="py-2 text-start">{lang === 'ar' ? 'التاريخ' : 'Date'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoices.map((inv) => (
                          <tr key={inv.id} className="border-b border-neutral-100 dark:border-neutral-800/60">
                            <td className="py-2.5 font-mono-num font-bold text-[#C8A24E]">{inv.invoiceNumber}</td>
                            <td className="py-2.5 font-mono-num">{inv.orderId}</td>
                            <td className="py-2.5 font-mono-num font-semibold">{inv.total} {t.common.currency}</td>
                            <td className="py-2.5">{inv.paymentProvider}</td>
                            <td className="py-2.5 font-mono-num">{new Date(inv.createdAt).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-4">
                <h2 className="text-base font-bold">{lang === 'ar' ? 'سجل المعاملات المالية' : 'Transactions Ledger'}</h2>
                {transactions.length === 0 ? (
                  <p className="text-xs text-neutral-500">{t.common.noData}</p>
                ) : (
                  <div className="space-y-2">
                    {transactions.map((tx) => (
                      <div key={tx.id} className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 flex items-center justify-between text-xs">
                        <div>
                          <p className="font-semibold">{tx.type} · {tx.provider}</p>
                          <p className="text-neutral-500 font-mono-num">{new Date(tx.createdAt).toLocaleString()}</p>
                        </div>
                        <div className="text-end">
                          <p className="font-bold font-mono-num">{tx.amount} {t.common.currency}</p>
                          <p className="text-[11px] text-neutral-500">{tx.status}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : route === '/customer/favorites' ? (
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-4">
              <h1 className="text-xl font-bold">{lang === 'ar' ? 'الفنيون المفضلون' : 'Saved Favorite Technicians'}</h1>
              {techs.filter((tech) => favoriteIds.includes(tech.uid)).length === 0 ? (
                <p className="text-xs text-neutral-500 py-8 text-center">{t.common.noData}</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {techs
                    .filter((tech) => favoriteIds.includes(tech.uid))
                    .map((tech) => (
                      <div key={tech.uid} className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 space-y-2">
                        <div className="flex justify-between">
                          <p className="font-bold text-sm">{tech.displayName}</p>
                          <button
                            type="button"
                            onClick={() => void handleToggleFavorite(tech.uid)}
                            className="text-xs text-red-500 cursor-pointer"
                          >
                            {t.common.delete}
                          </button>
                        </div>
                        <p className="text-xs text-neutral-500">★ {tech.ratingAvg.toFixed(1)} · {tech.completedJobsCount} {lang === 'ar' ? 'أعمال' : 'jobs'}</p>
                        <button
                          type="button"
                          onClick={() => {
                            setPreselectedTechId(tech.uid);
                            navigate('/customer/new-order');
                          }}
                          className="px-3 py-1.5 rounded bg-[#C8A24E] text-black text-xs font-bold cursor-pointer"
                        >
                          {lang === 'ar' ? 'طلب خدمة' : 'Request Service'}
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ) : route === '/customer/notifications' ? (
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-xl font-bold">{lang === 'ar' ? 'مركز الإشعارات' : 'Notification Center'}</h1>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleEnableFcm()}
                    className="px-3 py-1.5 rounded-lg border border-[#C8A24E] text-[#C8A24E] text-xs font-semibold cursor-pointer"
                  >
                    {lang === 'ar' ? 'تفعيل إشعارات المتصفح (FCM)' : 'Enable Browser Push (FCM)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void markAllNotificationsRead()}
                    className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs cursor-pointer"
                  >
                    {lang === 'ar' ? 'تحديد الكل كمقروء' : 'Mark All Read'}
                  </button>
                </div>
              </div>
              {fcmStatus && <p className="text-xs text-amber-500">{fcmStatus}</p>}

              {notifications.length === 0 ? (
                <p className="text-xs text-neutral-500 py-8 text-center">{t.common.noData}</p>
              ) : (
                <div className="space-y-2.5">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => {
                        void markNotificationRead(n.id);
                        if (n.orderId) navigate(`/customer/orders/${n.orderId}`);
                      }}
                      className={`rounded-xl border p-4 cursor-pointer transition-colors ${
                        n.isRead
                          ? 'border-neutral-200 dark:border-neutral-800 opacity-75'
                          : 'border-[#C8A24E]/60 bg-[#C8A24E]/5'
                      }`}
                    >
                      <div className="flex justify-between gap-2 text-xs">
                        <p className="font-bold">{lang === 'ar' ? n.titleAr : n.titleEn}</p>
                        <span className="font-mono-num text-neutral-500">
                          {new Date(n.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                        {lang === 'ar' ? n.bodyAr : n.bodyEn}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <form
              onSubmit={handleSaveProfile}
              className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-5"
            >
              <h1 className="text-xl font-bold">{lang === 'ar' ? 'الملف الشخصي والإعدادات' : 'Profile & Settings'}</h1>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">{lang === 'ar' ? 'الاسم' : 'Name'}</label>
                  <input
                    required
                    value={profName}
                    onChange={(e) => setProfName(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">{lang === 'ar' ? 'الهاتف' : 'Phone'}</label>
                  <input
                    value={profPhone}
                    onChange={(e) => setProfPhone(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">{lang === 'ar' ? 'المدينة' : 'City'}</label>
                  <input
                    value={profCity}
                    onChange={(e) => setProfCity(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">{lang === 'ar' ? 'العنوان' : 'Default Address'}</label>
                  <input
                    value={profAddress}
                    onChange={(e) => setProfAddress(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
                  />
                </div>
              </div>
              <LocationPickerMap
                value={customerCoords}
                address={profAddress}
                onChange={(coords, resolvedAddr) => {
                  setCustomerCoords(coords);
                  if (resolvedAddr) setProfAddress(resolvedAddr);
                }}
                heightClass="h-[260px]"
              />
              <button
                type="submit"
                disabled={savingProfile}
                className="px-6 py-2.5 rounded-lg bg-[#C8A24E] text-black text-xs font-bold cursor-pointer"
              >
                {savingProfile ? t.common.loading : t.common.save}
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
};
