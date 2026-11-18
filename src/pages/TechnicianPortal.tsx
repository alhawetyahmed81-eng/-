import React, { useCallback, useEffect, useState } from 'react';
import {
  Award,
  Bell,
  Briefcase,
  CheckCircle2,
  ClipboardList,
  Crown,
  DollarSign,
  LayoutDashboard,
  MapPin,
  Settings,
  ShieldAlert,
  Star,
  Upload,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { apiFetch, uploadFileToServer } from '../lib/api';
import { requestFcmPushToken } from '../lib/firebase';
import { tStatus, translations } from '../i18n/translations';
import { LocationPickerMap, type Coordinates } from '../components/MapsComponents';
import { OrderDetailView } from '../components/OrderDetailView';
import type {
  Commission,
  Order,
  Review,
  SubscriptionPlan,
  TechnicianPrivateProfile,
  TechnicianPublicProfile,
  Transaction,
  Wallet,
} from '../types';

const ALL_DAYS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export const TechnicianPortal: React.FC = () => {
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
    refreshSession,
  } = useApp();
  const t = translations[lang];

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<TechnicianPrivateProfile | null>(null);
  const [publicProfile, setPublicProfile] = useState<TechnicianPublicProfile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [availableOrders, setAvailableOrders] = useState<any[]>([]);
  const [availableVerified, setAvailableVerified] = useState(false);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [feedback, setFeedback] = useState('');

  // KYC & Settings Shared Form State
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [nationalIdNumber, setNationalIdNumber] = useState('');
  const [nationalIdDocUrl, setNationalIdDocUrl] = useState('');
  const [certificateDocUrl, setCertificateDocUrl] = useState('');
  const [specialtyIds, setSpecialtyIds] = useState<string[]>([]);
  const [areasText, setAreasText] = useState('');
  const [workDays, setWorkDays] = useState<string[]>(['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu']);
  const [workFrom, setWorkFrom] = useState('09:00');
  const [workTo, setWorkTo] = useState('21:00');
  const [isAvailable, setIsAvailable] = useState(true);
  const [baseCoords, setBaseCoords] = useState<Coordinates | null>(null);
  const [uploadingIdDoc, setUploadingIdDoc] = useState(false);
  const [uploadingCertDoc, setUploadingCertDoc] = useState(false);
  const [submittingKyc, setSubmittingKyc] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // Withdrawal & Top-Up Forms
  const [withdrawAmount, setWithdrawAmount] = useState('200');
  const [withdrawDest, setWithdrawDest] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [topupAmount, setTopupAmount] = useState('300');
  const [topupRef, setTopupRef] = useState('');
  const [toppingUp, setToppingUp] = useState(false);

  // Push Notification status
  const [fcmStatus, setFcmStatus] = useState('');

  const loadDashboard = useCallback(async () => {
    try {
      const [dash, avail] = await Promise.all([
        apiFetch<any>('/api/technician/dashboard'),
        apiFetch<any>('/api/technician/available-orders'),
      ]);
      setProfile(dash.profile || null);
      setPublicProfile(dash.publicProfile || null);
      setOrders(Array.isArray(dash.orders) ? dash.orders : []);
      setWallet(dash.wallet || null);
      setTransactions(Array.isArray(dash.transactions) ? dash.transactions : []);
      setCommissions(Array.isArray(dash.commissions) ? dash.commissions : []);
      setReviews(Array.isArray(dash.reviews) ? dash.reviews : []);
      setPlans(Array.isArray(dash.plans) ? dash.plans : []);
      setAvailableVerified(Boolean(avail?.verified));
      setAvailableOrders(Array.isArray(avail?.orders) ? avail.orders : []);

      if (dash.profile) {
        const p: TechnicianPrivateProfile = dash.profile;
        setDisplayName(p.displayName || '');
        setBio(p.bio || '');
        setNationalIdNumber(p.nationalIdNumber || '');
        setNationalIdDocUrl(p.nationalIdDocUrl || '');
        setCertificateDocUrl(p.certificateDocUrl || '');
        setSpecialtyIds(Array.isArray(p.specialtyIds) ? p.specialtyIds : []);
        setAreasText(Array.isArray(p.serviceAreas) ? p.serviceAreas.join(', ') : '');
        if (p.workingHours) {
          setWorkDays(p.workingHours.days || []);
          setWorkFrom(p.workingHours.from || '09:00');
          setWorkTo(p.workingHours.to || '21:00');
        }
        setIsAvailable(Boolean(p.isAvailable));
        if (typeof p.baseLat === 'number' && typeof p.baseLng === 'number') {
          setBaseCoords({ lat: p.baseLat, lng: p.baseLng });
        }
      }
    } catch (err: any) {
      setFeedback(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (userRecord) setPhone(userRecord.phone || '');
  }, [userRecord]);

  if (!userRecord || userRecord.role !== 'TECHNICIAN') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <p className="text-sm text-neutral-500">
          {lang === 'ar' ? 'هذه البوابة مخصصة لحسابات الفنيين المحترفين.' : 'This portal is restricted to Technician accounts.'}
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

  const orderDetailMatch = route.match(/^\/technician\/orders\/([a-zA-Z0-9_\-]+)$/);
  const activeOrderId = orderDetailMatch?.[1];

  const toggleSpec = (id: string) => {
    setSpecialtyIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleDay = (day: string) => {
    setWorkDays((prev) => (prev.includes(day) ? prev.filter((x) => x !== day) : [...prev, day]));
  };

  const handleUploadDoc = async (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: 'id' | 'cert'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (kind === 'id') setUploadingIdDoc(true);
    else setUploadingCertDoc(true);
    try {
      const up = await uploadFileToServer(file);
      if (kind === 'id') setNationalIdDocUrl(up.url);
      else setCertificateDocUrl(up.url);
    } catch (err: any) {
      setFeedback(err.message);
    } finally {
      if (kind === 'id') setUploadingIdDoc(false);
      else setUploadingCertDoc(false);
    }
  };

  const handleSubmitKyc = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingKyc(true);
    setFeedback('');
    try {
      await apiFetch('/api/technician/kyc', {
        method: 'POST',
        body: JSON.stringify({
          displayName,
          bio,
          nationalIdNumber,
          nationalIdDocUrl,
          certificateDocUrl,
          specialtyIds,
          serviceAreas: areasText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          workingHours: { days: workDays, from: workFrom, to: workTo },
          baseLat: baseCoords?.lat,
          baseLng: baseCoords?.lng,
        }),
      });
      await loadDashboard();
      setFeedback(
        lang === 'ar'
          ? 'تم إرسال مستندات التوثيق للمراجعة الإدارية بنجاح.'
          : 'KYC verification documents submitted for Admin review.'
      );
    } catch (err: any) {
      setFeedback(err.message);
    } finally {
      setSubmittingKyc(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setFeedback('');
    try {
      await apiFetch('/api/technician/settings', {
        method: 'PUT',
        body: JSON.stringify({
          displayName,
          phone,
          bio,
          specialtyIds,
          serviceAreas: areasText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          workingHours: { days: workDays, from: workFrom, to: workTo },
          isAvailable,
          baseLat: baseCoords?.lat,
          baseLng: baseCoords?.lng,
        }),
      });
      await Promise.all([loadDashboard(), refreshSession()]);
      setFeedback(lang === 'ar' ? 'تم تحديث إعدادات الفني.' : 'Technician settings saved.');
    } catch (err: any) {
      setFeedback(err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setWithdrawing(true);
    setFeedback('');
    try {
      await apiFetch('/api/technician/withdraw', {
        method: 'POST',
        body: JSON.stringify({ amount: Number(withdrawAmount), destination: withdrawDest }),
      });
      setWithdrawDest('');
      await loadDashboard();
      setFeedback(
        lang === 'ar' ? 'تم إرسال طلب السحب للمراجعة المالية.' : 'Withdrawal request submitted for Admin processing.'
      );
    } catch (err: any) {
      setFeedback(err.message);
    } finally {
      setWithdrawing(false);
    }
  };

  const handleTechTopupRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setToppingUp(true);
    setFeedback('');
    try {
      await apiFetch('/api/wallet/topup-request', {
        method: 'POST',
        body: JSON.stringify({ amount: Number(topupAmount), referenceNumber: topupRef, method: 'InstaPay / Bank Transfer' }),
      });
      setTopupRef('');
      await loadDashboard();
      setFeedback(
        lang === 'ar'
          ? 'تم إرسال طلب شحن المحفظة بنجاح وبانتظار اعتماد الإدارة.'
          : 'Wallet top-up request submitted for Admin approval.'
      );
    } catch (err: any) {
      setFeedback(err.message);
    } finally {
      setToppingUp(false);
    }
  };

  const handleSubscribe = async (planId: string) => {
    setFeedback('');
    try {
      await apiFetch('/api/technician/subscribe', {
        method: 'POST',
        body: JSON.stringify({ planId }),
      });
      await loadDashboard();
      setFeedback(lang === 'ar' ? `تم تفعيل باقة ${planId} بنجاح.` : `Plan ${planId} activated.`);
    } catch (err: any) {
      setFeedback(err.message);
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
      setFcmStatus(lang === 'ar' ? 'تم تفعيل إشعارات الطلبات الفورية.' : 'Instant order alerts activated.');
    } else if (res.reason === 'NOT_CONFIGURED') {
      setFcmStatus(
        lang === 'ar'
          ? 'مفتاح VITE_FIREBASE_VAPID_KEY غير مهيأ — إشعارات WebSocket المباشرة داخل المنصة مفعّلة.'
          : 'VITE_FIREBASE_VAPID_KEY not configured — live in-app WebSocket notifications active.'
      );
    } else {
      setFcmStatus(res.reason || 'Push notifications unavailable.');
    }
  };

  const navItems = [
    { path: '/technician', icon: LayoutDashboard, label: lang === 'ar' ? 'لوحة الفني' : 'Overview' },
    { path: '/technician/verification', icon: ShieldAlert, label: lang === 'ar' ? 'التوثيق والمستندات' : 'KYC Verification' },
    { path: '/technician/available-orders', icon: ClipboardList, label: lang === 'ar' ? 'الطلبات المتاحة' : 'Available Orders' },
    { path: '/technician/orders', icon: Briefcase, label: lang === 'ar' ? 'طلباتي المعينة' : 'Assigned Orders' },
    { path: '/technician/portfolio', icon: Award, label: lang === 'ar' ? 'سجل الأعمال' : 'Portfolio' },
    { path: '/technician/earnings', icon: DollarSign, label: lang === 'ar' ? 'المحفظة والأرباح' : 'Earnings & Wallet' },
    { path: '/technician/subscriptions', icon: Crown, label: lang === 'ar' ? 'باقات الاشتراك' : 'Subscriptions' },
    { path: '/technician/reviews', icon: Star, label: lang === 'ar' ? 'التقييمات' : 'Reviews' },
    {
      path: '/technician/notifications',
      icon: Bell,
      label: `${lang === 'ar' ? 'الإشعارات' : 'Notifications'}${unreadCount > 0 ? ` (${unreadCount})` : ''}`,
    },
    { path: '/technician/settings', icon: Settings, label: lang === 'ar' ? 'المناطق وساعات العمل' : 'Work Settings' },
  ];

  const verStatus = profile?.verificationStatus || 'UNSUBMITTED';
  const activeJobs = orders.filter((o) => !['PAID', 'CANCELLED'].includes(o.status));
  const completedJobs = orders.filter((o) => ['COMPLETED', 'PAID'].includes(o.status));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <aside className="lg:col-span-3 space-y-4">
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-5 space-y-1">
            <div className="pb-3 mb-3 border-b border-neutral-200 dark:border-neutral-800">
              <p className="text-xs text-[#C8A24E] font-semibold">
                {lang === 'ar' ? 'بوابة الفني المحترف' : 'Technician Portal'}
              </p>
              <p className="text-sm font-bold truncate mt-0.5">{profile?.displayName || userRecord.name}</p>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                {verStatus === 'APPROVED' ? t.common.verified : verStatus} · {profile?.subscriptionPlanId || 'FREE'}
              </p>
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.path === '/technician' ? route === '/technician' : route.startsWith(item.path);
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

        <section className="lg:col-span-9 space-y-6">
          {verStatus !== 'APPROVED' && !activeOrderId && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs space-y-1">
                <p className="font-bold text-amber-500">
                  {verStatus === 'PENDING'
                    ? lang === 'ar'
                      ? 'مستنداتك قيد المراجعة من قبل الإدارة'
                      : 'KYC Verification Under Admin Review'
                    : verStatus === 'REJECTED'
                    ? lang === 'ar'
                      ? `تم رفض التوثيق: ${profile?.rejectionReason || ''}`
                      : `Verification Rejected: ${profile?.rejectionReason || ''}`
                    : lang === 'ar'
                    ? 'حسابك غير موثق بعد — لن تظهر في نتائج البحث أو تستطيع تقديم عروض حتى اعتماد الإدارة.'
                    : 'Account Unverified — You remain hidden from verified search and cannot submit quotes until Admin approval.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/technician/verification')}
                className="px-4 py-2 rounded-lg bg-[#C8A24E] text-black text-xs font-bold cursor-pointer"
              >
                {lang === 'ar' ? 'رفع / تحديث مستندات التوثيق' : 'Complete KYC Verification'}
              </button>
            </div>
          )}

          {feedback && (
            <div className="rounded-xl border border-[#C8A24E]/40 bg-[#C8A24E]/10 px-4 py-3 text-xs font-medium">
              {feedback}
            </div>
          )}

          {activeOrderId ? (
            <OrderDetailView orderId={activeOrderId} backPath="/technician/orders" />
          ) : loading ? (
            <div className="py-16 text-center text-sm text-neutral-500">{t.common.loading}</div>
          ) : route === '/technician' ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-4">
                  <p className="text-xs text-neutral-500">{lang === 'ar' ? 'طلبات جارية' : 'Active Jobs'}</p>
                  <p className="text-2xl font-bold font-mono-num mt-1">{activeJobs.length}</p>
                </div>
                <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-4">
                  <p className="text-xs text-neutral-500">{lang === 'ar' ? 'طلبات متاحة للعروض' : 'Open Requests'}</p>
                  <p className="text-2xl font-bold font-mono-num mt-1 text-[#C8A24E]">{availableOrders.length}</p>
                </div>
                <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-4">
                  <p className="text-xs text-neutral-500">{lang === 'ar' ? 'الرصيد المتاح' : 'Wallet Balance'}</p>
                  <p className="text-2xl font-bold font-mono-num mt-1">
                    {wallet?.balance ?? 0} <span className="text-xs">{t.common.currency}</span>
                  </p>
                </div>
                <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-4">
                  <p className="text-xs text-neutral-500">{lang === 'ar' ? 'التقييم العام' : 'Rating'}</p>
                  <p className="text-2xl font-bold font-mono-num mt-1">
                    ★ {(publicProfile?.ratingAvg ?? 0).toFixed(1)}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold">{lang === 'ar' ? 'أحدث الطلبات المعينة لك' : 'Assigned Orders'}</h2>
                  <button
                    type="button"
                    onClick={() => navigate('/technician/available-orders')}
                    className="text-xs font-semibold text-[#C8A24E] cursor-pointer"
                  >
                    {lang === 'ar' ? 'تصفح الطلبات المتاحة' : 'Browse Open Requests'}
                  </button>
                </div>
                {orders.length === 0 ? (
                  <p className="text-xs text-neutral-500 py-6 text-center">{t.common.noData}</p>
                ) : (
                  <div className="space-y-3">
                    {orders.slice(0, 5).map((o) => (
                      <div
                        key={o.id}
                        onClick={() => navigate(`/technician/orders/${o.id}`)}
                        className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 flex items-center justify-between hover:border-[#C8A24E] cursor-pointer"
                      >
                        <div>
                          <p className="font-bold text-sm">{o.title}</p>
                          <p className="text-xs text-neutral-500">{o.customerName} · {o.address}</p>
                        </div>
                        <span className="text-xs font-bold text-[#C8A24E]">{tStatus(o.status, lang)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : route === '/technician/verification' ? (
            <form
              onSubmit={handleSubmitKyc}
              className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-5"
            >
              <div>
                <h1 className="text-xl font-bold">{lang === 'ar' ? 'توثيق الهوية والمستندات (KYC)' : 'Technician KYC Verification'}</h1>
                <p className="text-xs text-neutral-500 mt-1">
                  {lang === 'ar'
                    ? 'ارفع صورة الهوية الوطنية وشهادات الخبرة وحدد تخصصاتك ليتم مراجعتها واعتمادك من الإدارة.'
                    : 'Upload your National ID and certifications for Admin approval before appearing in verified search.'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">{lang === 'ar' ? 'الاسم المهني' : 'Professional Display Name'}</label>
                  <input
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">{lang === 'ar' ? 'الرقم القومي / الهوية' : 'National ID Number'}</label>
                  <input
                    required
                    value={nationalIdNumber}
                    onChange={(e) => setNationalIdNumber(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm font-mono-num"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 space-y-2">
                  <p className="text-xs font-semibold">{lang === 'ar' ? 'صورة البطاقة الشخصية / الهوية (مطلوب)' : 'National ID Document (Required)'}</p>
                  <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-neutral-400 text-xs cursor-pointer">
                    <Upload className="w-4 h-4 text-[#C8A24E]" />
                    {uploadingIdDoc ? t.common.loading : lang === 'ar' ? 'رفع مستند الهوية' : 'Upload ID File'}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,application/pdf"
                      onChange={(e) => void handleUploadDoc(e, 'id')}
                      className="hidden"
                    />
                  </label>
                  {nationalIdDocUrl && (
                    <p className="text-[11px] text-emerald-500 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {nationalIdDocUrl.split('/').pop()}
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 space-y-2">
                  <p className="text-xs font-semibold">{lang === 'ar' ? 'شهادات الخبرة / السجل (اختياري)' : 'Certificate / Trade License (Optional)'}</p>
                  <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-neutral-400 text-xs cursor-pointer">
                    <Upload className="w-4 h-4 text-[#C8A24E]" />
                    {uploadingCertDoc ? t.common.loading : lang === 'ar' ? 'رفع الشهادة' : 'Upload Certificate'}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,application/pdf"
                      onChange={(e) => void handleUploadDoc(e, 'cert')}
                      className="hidden"
                    />
                  </label>
                  {certificateDocUrl && (
                    <p className="text-[11px] text-emerald-500 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {certificateDocUrl.split('/').pop()}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-2">{lang === 'ar' ? 'التخصصات' : 'Specialties'}</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {services.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleSpec(s.id)}
                      className={`px-3 py-2 rounded-lg border text-xs text-start cursor-pointer ${
                        specialtyIds.includes(s.id)
                          ? 'border-[#C8A24E] bg-[#C8A24E]/15 text-[#C8A24E] font-bold'
                          : 'border-neutral-200 dark:border-neutral-800'
                      }`}
                    >
                      {lang === 'ar' ? s.nameAr : s.nameEn}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">{lang === 'ar' ? 'مناطق التغطية (افصل بفاصلة)' : 'Service Areas (comma-separated)'}</label>
                <input
                  value={areasText}
                  onChange={(e) => setAreasText(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-2">{lang === 'ar' ? 'نقطة الانطلاق الرئيسية على الخريطة (لحساب المسافات)' : 'Base Location Pin (for distance matching)'}</label>
                <LocationPickerMap
                  value={baseCoords}
                  address=""
                  onChange={(coords) => setBaseCoords(coords)}
                  heightClass="h-[240px]"
                />
              </div>

              <button
                type="submit"
                disabled={submittingKyc || uploadingIdDoc || uploadingCertDoc}
                className="px-7 py-3 rounded-lg bg-[#C8A24E] text-black text-xs font-bold hover:bg-[#DFBE6F] cursor-pointer"
              >
                {submittingKyc ? t.common.loading : lang === 'ar' ? 'إرسال طلب التوثيق للإدارة' : 'Submit KYC for Approval'}
              </button>
            </form>
          ) : route === '/technician/available-orders' ? (
            <div className="space-y-4">
              <h1 className="text-xl font-bold">{lang === 'ar' ? 'الطلبات المتاحة لتقديم العروض' : 'Available Orders for Quoting'}</h1>
              {!availableVerified ? (
                <div className="rounded-2xl border border-amber-500/30 bg-white dark:bg-[#131316] p-8 text-center text-sm text-amber-500">
                  {lang === 'ar'
                    ? 'يجب اعتماد توثيق الهوية من الإدارة أولاً قبل عرض أو تسعير طلبات العملاء.'
                    : 'Admin KYC verification approval is required before viewing or quoting open orders.'}
                </div>
              ) : availableOrders.length === 0 ? (
                <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-10 text-center text-sm text-neutral-500">
                  {t.common.noData}
                </div>
              ) : (
                <div className="space-y-3">
                  {availableOrders.map((o) => (
                    <div
                      key={o.id}
                      onClick={() => navigate(`/technician/orders/${o.id}`)}
                      className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-5 flex flex-wrap items-center justify-between gap-4 hover:border-[#C8A24E] cursor-pointer"
                    >
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-[#C8A24E]">
                          {lang === 'ar' ? o.serviceNameAr : o.serviceNameEn}
                          {typeof o.distanceKm === 'number' ? ` · ${o.distanceKm} ${t.common.km}` : ''}
                          {o.matchesSpecialty ? ` · ${lang === 'ar' ? 'يطابق تخصصك' : 'Matches Specialty'}` : ''}
                        </p>
                        <p className="font-bold text-base">{o.title}</p>
                        <p className="text-xs text-neutral-500 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" /> {o.address}
                        </p>
                      </div>
                      <div className="text-end">
                        {o.myOffer ? (
                          <span className="text-xs font-bold text-emerald-500 font-mono-num">
                            {lang === 'ar' ? 'تم تقديم عرض:' : 'Quoted:'} {o.myOffer.amount} {t.common.currency}
                          </span>
                        ) : (
                          <span className="px-4 py-2 rounded-lg bg-[#C8A24E] text-black text-xs font-bold">
                            {lang === 'ar' ? 'معاينة وتقديم عرض' : 'Inspect & Quote'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : route === '/technician/orders' ? (
            <div className="space-y-4">
              <h1 className="text-xl font-bold">{lang === 'ar' ? 'طلباتي المعينة' : 'Assigned Technician Orders'}</h1>
              {orders.length === 0 ? (
                <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-10 text-center text-sm text-neutral-500">
                  {t.common.noData}
                </div>
              ) : (
                <div className="space-y-3">
                  {orders.map((o) => (
                    <div
                      key={o.id}
                      onClick={() => navigate(`/technician/orders/${o.id}`)}
                      className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-5 flex flex-wrap items-center justify-between gap-4 hover:border-[#C8A24E] cursor-pointer"
                    >
                      <div>
                        <p className="text-xs text-[#C8A24E] font-semibold">{tStatus(o.status, lang)}</p>
                        <p className="font-bold text-base mt-0.5">{o.title}</p>
                        <p className="text-xs text-neutral-500 mt-0.5">{o.customerName} · {o.address}</p>
                      </div>
                      <p className="font-mono-num font-bold text-sm text-[#C8A24E]">
                        {o.finalPrice || o.budgetEstimate || 0} {t.common.currency}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : route === '/technician/portfolio' ? (
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-4">
              <h1 className="text-xl font-bold">{lang === 'ar' ? 'سجل الأعمال المنجزة' : 'Completed Work Portfolio'}</h1>
              {completedJobs.length === 0 ? (
                <p className="text-xs text-neutral-500 py-8 text-center">{t.common.noData}</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {completedJobs.map((o) => (
                    <div
                      key={o.id}
                      onClick={() => navigate(`/technician/orders/${o.id}`)}
                      className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 space-y-2 hover:border-[#C8A24E] cursor-pointer"
                    >
                      <p className="text-xs text-[#C8A24E] font-semibold">
                        {lang === 'ar' ? o.serviceNameAr : o.serviceNameEn} · {tStatus(o.status, lang)}
                      </p>
                      <p className="font-bold text-sm">{o.title}</p>
                      <p className="text-xs text-neutral-500 font-mono-num">
                        {o.finalPrice} {t.common.currency} · {new Date(o.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : route === '/technician/earnings' ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-2xl border border-[#C8A24E]/40 bg-white dark:bg-[#131316] p-5">
                  <p className="text-xs text-neutral-500">{lang === 'ar' ? 'الرصيد القابل للسحب' : 'Available Balance'}</p>
                  <p className="text-2xl font-bold font-mono-num text-[#C8A24E] mt-1">
                    {wallet?.balance ?? 0} {t.common.currency}
                  </p>
                </div>
                <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-5">
                  <p className="text-xs text-neutral-500">{lang === 'ar' ? 'سحوبات قيد المراجعة' : 'Pending Withdrawals'}</p>
                  <p className="text-2xl font-bold font-mono-num mt-1">
                    {wallet?.pendingBalance ?? 0} {t.common.currency}
                  </p>
                </div>
                <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-5">
                  <p className="text-xs text-neutral-500">{lang === 'ar' ? 'إجمالي صافي الأرباح' : 'Total Net Earned'}</p>
                  <p className="text-2xl font-bold font-mono-num mt-1">
                    {wallet?.totalEarned ?? 0} {t.common.currency}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <form
                  onSubmit={handleWithdraw}
                  className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-4"
                >
                  <h2 className="text-base font-bold">{lang === 'ar' ? 'طلب سحب أرباح' : 'Request Payout / Withdrawal'}</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      type="number"
                      min={50}
                      required
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      placeholder={lang === 'ar' ? 'المبلغ' : 'Amount'}
                      className="px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm font-mono-num"
                    />
                    <input
                      required
                      value={withdrawDest}
                      onChange={(e) => setWithdrawDest(e.target.value)}
                      placeholder={lang === 'ar' ? 'حساب بنكي / InstaPay' : 'IBAN / InstaPay'}
                      className="sm:col-span-2 px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={withdrawing}
                    className="px-5 py-2.5 rounded-lg bg-[#C8A24E] text-black text-xs font-bold cursor-pointer"
                  >
                    {withdrawing ? t.common.loading : lang === 'ar' ? 'إرسال طلب السحب' : 'Submit Withdrawal Request'}
                  </button>
                </form>

                <form
                  onSubmit={handleTechTopupRequest}
                  className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-4"
                >
                  <h2 className="text-base font-bold">
                    {lang === 'ar' ? 'شحن المحفظة (لتفعيل الباقات)' : 'Top Up Wallet (Subscriptions)'}
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      type="number"
                      min={50}
                      required
                      value={topupAmount}
                      onChange={(e) => setTopupAmount(e.target.value)}
                      placeholder={lang === 'ar' ? 'المبلغ' : 'Amount'}
                      className="px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm font-mono-num"
                    />
                    <input
                      required
                      value={topupRef}
                      onChange={(e) => setTopupRef(e.target.value)}
                      placeholder={lang === 'ar' ? 'رقم مرجع التحويل / InstaPay' : 'InstaPay / Transfer Ref'}
                      className="sm:col-span-2 px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm font-mono-num"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={toppingUp}
                    className="px-5 py-2.5 rounded-lg border border-[#C8A24E] text-[#C8A24E] text-xs font-bold hover:bg-[#C8A24E]/10 cursor-pointer"
                  >
                    {toppingUp ? t.common.loading : lang === 'ar' ? 'إرسال طلب الشحن' : 'Submit Top-Up Request'}
                  </button>
                </form>
              </div>

              <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-3">
                <h2 className="text-base font-bold">{lang === 'ar' ? 'تفاصيل العمولات والخصومات' : 'Platform Commissions Ledger'}</h2>
                {commissions.length === 0 ? (
                  <p className="text-xs text-neutral-500">{t.common.noData}</p>
                ) : (
                  <div className="space-y-2">
                    {commissions.map((c) => (
                      <div key={c.id} className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 flex justify-between text-xs">
                        <span className="font-mono-num">Order #{c.orderId} ({c.ratePercent}%)</span>
                        <span className="font-mono-num">
                          Net: <strong className="text-emerald-500">{c.technicianNetAmount}</strong> · Fee: {c.commissionAmount} {t.common.currency}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-3">
                <h2 className="text-base font-bold">{lang === 'ar' ? 'كشف حساب المحفظة' : 'Transactions History'}</h2>
                {transactions.length === 0 ? (
                  <p className="text-xs text-neutral-500">{t.common.noData}</p>
                ) : (
                  <div className="space-y-2">
                    {transactions.map((tx) => (
                      <div key={tx.id} className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 flex justify-between text-xs">
                        <div>
                          <p className="font-semibold">{tx.type} · {tx.provider}</p>
                          <p className="text-neutral-500">{tx.notes || tx.status}</p>
                        </div>
                        <span className="font-mono-num font-bold">{tx.amount} {t.common.currency}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : route === '/technician/subscriptions' ? (
            <div className="space-y-5">
              <h1 className="text-xl font-bold">{lang === 'ar' ? 'باقات اشتراك الفنيين' : 'Technician Subscription Plans'}</h1>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {plans.map((p) => {
                  const isCurrent = profile?.subscriptionPlanId === p.id;
                  return (
                    <div
                      key={p.id}
                      className={`rounded-2xl border p-6 flex flex-col justify-between space-y-5 ${
                        isCurrent
                          ? 'border-[#C8A24E] bg-[#C8A24E]/5'
                          : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316]'
                      }`}
                    >
                      <div className="space-y-3">
                        <p className="text-xs font-bold text-[#C8A24E]">{p.id}</p>
                        <h3 className="text-lg font-bold">{lang === 'ar' ? p.nameAr : p.nameEn}</h3>
                        <p className="text-2xl font-bold font-mono-num">
                          {p.monthlyPrice} <span className="text-xs font-normal">{t.common.currency} / {lang === 'ar' ? 'شهر' : 'mo'}</span>
                        </p>
                        <ul className="space-y-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                          {(lang === 'ar' ? p.featuresAr : p.featuresEn).map((f, idx) => (
                            <li key={idx}>· {f}</li>
                          ))}
                        </ul>
                      </div>
                      <button
                        type="button"
                        disabled={isCurrent}
                        onClick={() => void handleSubscribe(p.id)}
                        className={`w-full py-2.5 rounded-lg text-xs font-bold cursor-pointer ${
                          isCurrent
                            ? 'border border-[#C8A24E] text-[#C8A24E]'
                            : 'bg-[#C8A24E] text-black hover:bg-[#DFBE6F]'
                        }`}
                      >
                        {isCurrent
                          ? lang === 'ar'
                            ? 'الباقة الحالية'
                            : 'Active Plan'
                          : lang === 'ar'
                          ? 'تفعيل من رصيد المحفظة'
                          : 'Activate via Wallet'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : route === '/technician/reviews' ? (
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-4">
              <h1 className="text-xl font-bold">{lang === 'ar' ? 'تقييمات العملاء' : 'Customer Reviews'}</h1>
              {reviews.length === 0 ? (
                <p className="text-xs text-neutral-500 py-8 text-center">{t.common.noData}</p>
              ) : (
                <div className="space-y-3">
                  {reviews.map((r) => (
                    <div key={r.id} className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 space-y-1.5 text-xs">
                      <div className="flex justify-between font-bold">
                        <span>{r.customerName}</span>
                        <span className="text-[#C8A24E] font-mono-num">★ {r.rating} / 5</span>
                      </div>
                      <p className="text-neutral-600 dark:text-neutral-400">{r.comment}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : route === '/technician/notifications' ? (
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-xl font-bold">{lang === 'ar' ? 'الإشعارات' : 'Notifications'}</h1>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleEnableFcm()}
                    className="px-3 py-1.5 rounded-lg border border-[#C8A24E] text-[#C8A24E] text-xs font-semibold cursor-pointer"
                  >
                    {lang === 'ar' ? 'تفعيل FCM Push' : 'Enable Push Alerts'}
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
                        if (n.orderId) navigate(`/technician/orders/${n.orderId}`);
                      }}
                      className={`rounded-xl border p-4 cursor-pointer ${
                        n.isRead ? 'border-neutral-200 dark:border-neutral-800 opacity-75' : 'border-[#C8A24E]/60 bg-[#C8A24E]/5'
                      }`}
                    >
                      <p className="text-xs font-bold">{lang === 'ar' ? n.titleAr : n.titleEn}</p>
                      <p className="text-xs text-neutral-500 mt-1">{lang === 'ar' ? n.bodyAr : n.bodyEn}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <form
              onSubmit={handleSaveSettings}
              className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-5"
            >
              <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold">{lang === 'ar' ? 'إعدادات العمل والتغطية' : 'Work Areas & Schedule Settings'}</h1>
                <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAvailable}
                    onChange={(e) => setIsAvailable(e.target.checked)}
                    className="accent-[#C8A24E]"
                  />
                  {lang === 'ar' ? 'متاح لاستقبال الطلبات' : 'Available for Work'}
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">{lang === 'ar' ? 'الاسم المعروض' : 'Display Name'}</label>
                  <input
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">{lang === 'ar' ? 'رقم الهاتف' : 'Phone'}</label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">{lang === 'ar' ? 'النبذة المهنية' : 'Bio'}</label>
                <textarea
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-2">{lang === 'ar' ? 'أيام وساعات العمل' : 'Working Days & Hours'}</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {ALL_DAYS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDay(d)}
                      className={`px-3 py-1.5 rounded-lg border text-xs cursor-pointer ${
                        workDays.includes(d)
                          ? 'border-[#C8A24E] bg-[#C8A24E] text-black font-bold'
                          : 'border-neutral-300 dark:border-neutral-700'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3 max-w-xs">
                  <input
                    type="time"
                    value={workFrom}
                    onChange={(e) => setWorkFrom(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-xs font-mono-num"
                  />
                  <input
                    type="time"
                    value={workTo}
                    onChange={(e) => setWorkTo(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-xs font-mono-num"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">{lang === 'ar' ? 'مناطق العمل' : 'Service Areas'}</label>
                <input
                  value={areasText}
                  onChange={(e) => setAreasText(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
                />
              </div>

              <LocationPickerMap
                value={baseCoords}
                address=""
                onChange={(coords) => setBaseCoords(coords)}
                heightClass="h-[240px]"
              />

              <button
                type="submit"
                disabled={savingSettings}
                className="px-6 py-2.5 rounded-lg bg-[#C8A24E] text-black text-xs font-bold cursor-pointer"
              >
                {savingSettings ? t.common.loading : t.common.save}
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
};
