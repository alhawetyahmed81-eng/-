import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Bell,
  Briefcase,
  CreditCard,
  Crown,
  Download,
  FileEdit,
  Layers,
  LayoutDashboard,
  Percent,
  ShieldCheck,
  Star,
  UserCheck,
  Users,
  Wrench,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { apiFetch, resolveUploadUrl } from '../lib/api';
import { tStatus, translations } from '../i18n/translations';
import type {
  AdminLog,
  Commission,
  Complaint,
  Invoice,
  Order,
  OrderStatus,
  Review,
  ServiceCategory,
  SubscriptionPlan,
  Transaction,
  UserRecord,
} from '../types';

export const AdminPortal: React.FC = () => {
  const { lang, route, navigate, isAdmin, authReady, refreshBootstrap, cms } = useApp();
  const t = translations[lang];

  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');

  // Overview & Reports
  const [overview, setOverview] = useState<any>(null);
  const [reportPeriod, setReportPeriod] = useState<'daily' | 'monthly' | 'yearly'>('monthly');
  const [reportRows, setReportRows] = useState<Array<{ bucket: string; orders: number; revenue: number; commissions: number }>>([]);

  // Collections
  const [customers, setCustomers] = useState<UserRecord[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [adminServices, setAdminServices] = useState<ServiceCategory[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [contactMsgs, setContactMsgs] = useState<any[]>([]);
  const [logs, setLogs] = useState<AdminLog[]>([]);

  // Verification rejection input per uid
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});

  // New Service Form
  const [newSvc, setNewSvc] = useState({
    nameAr: '',
    nameEn: '',
    descriptionAr: '',
    descriptionEn: '',
    iconName: 'Wrench',
    basePrice: '350',
    sortOrder: '15',
  });
  const [editingSvc, setEditingSvc] = useState<ServiceCategory | null>(null);

  // Commission Rate Editor
  const [commRateInput, setCommRateInput] = useState('10');

  // Broadcast Form
  const [bcTarget, setBcTarget] = useState<'ALL' | 'CUSTOMER' | 'TECHNICIAN'>('ALL');
  const [bcTitleAr, setBcTitleAr] = useState('');
  const [bcTitleEn, setBcTitleEn] = useState('');
  const [bcBodyAr, setBcBodyAr] = useState('');
  const [bcBodyEn, setBcBodyEn] = useState('');

  // Complaint resolution notes
  const [resNotes, setResNotes] = useState<Record<string, string>>({});

  // CMS Editor
  const [cmsDraft, setCmsDraft] = useState({
    heroTitleAr: '',
    heroTitleEn: '',
    heroSubtitleAr: '',
    heroSubtitleEn: '',
    aboutAr: '',
    aboutEn: '',
    termsAr: '',
    termsEn: '',
    privacyAr: '',
    privacyEn: '',
  });

  // Subscription plans editor
  const [plansDraft, setPlansDraft] = useState<SubscriptionPlan[]>([]);

  const loadOverviewAndReports = useCallback(async () => {
    try {
      const [ov, rep] = await Promise.all([
        apiFetch<any>('/api/admin/overview'),
        apiFetch<any>(`/api/admin/reports?period=${reportPeriod}`),
      ]);
      setOverview(ov);
      setCommRateInput(String(ov?.commissionRatePercent ?? 10));
      setReportRows(Array.isArray(rep?.rows) ? rep.rows : []);
    } catch (err: any) {
      setFeedback(err.message);
    } finally {
      setLoading(false);
    }
  }, [reportPeriod]);

  const loadSectionData = useCallback(async () => {
    try {
      if (route === '/admin/customers') {
        setCustomers(await apiFetch('/api/admin/customers'));
      } else if (route === '/admin/technicians' || route === '/admin/verifications') {
        setTechnicians(await apiFetch('/api/admin/technicians'));
      } else if (route === '/admin/services') {
        setAdminServices(await apiFetch('/api/admin/services'));
      } else if (route === '/admin/orders') {
        setOrders(await apiFetch('/api/admin/orders'));
      } else if (route === '/admin/payments' || route === '/admin/commissions') {
        const p = await apiFetch<any>('/api/admin/payments');
        setTransactions(p.transactions || []);
        setCommissions(p.commissions || []);
        setInvoices(p.invoices || []);
      } else if (route === '/admin/complaints') {
        setComplaints(await apiFetch('/api/admin/complaints'));
      } else if (route === '/admin/reviews') {
        setReviews(await apiFetch('/api/admin/reviews'));
      } else if (route === '/admin/content') {
        setContactMsgs(await apiFetch('/api/admin/contact-messages'));
      } else if (route === '/admin/logs') {
        setLogs(await apiFetch('/api/admin/logs'));
      } else if (route === '/admin/subscriptions') {
        const boot = await apiFetch<any>('/api/public/bootstrap');
        setPlansDraft(boot.plans || []);
      }
    } catch (err: any) {
      setFeedback(err.message);
    }
  }, [route]);

  useEffect(() => {
    if (isAdmin) {
      void loadOverviewAndReports();
      void loadSectionData();
    } else if (authReady) {
      setLoading(false);
    }
  }, [isAdmin, authReady, loadOverviewAndReports, loadSectionData]);

  useEffect(() => {
    if (cms) {
      setCmsDraft({
        heroTitleAr: cms.heroTitleAr || '',
        heroTitleEn: cms.heroTitleEn || '',
        heroSubtitleAr: cms.heroSubtitleAr || '',
        heroSubtitleEn: cms.heroSubtitleEn || '',
        aboutAr: cms.aboutAr || '',
        aboutEn: cms.aboutEn || '',
        termsAr: cms.termsAr || '',
        termsEn: cms.termsEn || '',
        privacyAr: cms.privacyAr || '',
        privacyEn: cms.privacyEn || '',
      });
    }
  }, [cms]);

  if (authReady && !isAdmin) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <ShieldCheck className="w-10 h-10 text-[#C8A24E] mx-auto" />
        <h1 className="text-xl font-bold">
          {lang === 'ar' ? 'وصول محظور — بوابة الإدارة المستقلة' : 'Restricted Admin Portal'}
        </h1>
        <p className="text-xs text-neutral-500">
          {lang === 'ar'
            ? 'يتطلب دخول هذه اللوحة التحقق من صلاحيات الإدارة العليا.'
            : 'Independent administrator authentication is required.'}
        </p>
        <button
          type="button"
          onClick={() => navigate('/admin/login')}
          className="px-6 py-2.5 rounded-lg bg-[#C8A24E] text-black text-xs font-bold cursor-pointer"
        >
          {lang === 'ar' ? 'تسجيل دخول الإدارة' : 'Go to Admin Gate'}
        </button>
      </div>
    );
  }

  const exportReportsCsv = () => {
    const header = 'PeriodBucket,Orders,RevenueEGP,CommissionsEGP\n';
    const body = reportRows.map((r) => `${r.bucket},${r.orders},${r.revenue},${r.commissions}`).join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interiorx-${reportPeriod}-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleToggleUserStatus = async (uid: string, nextStatus: 'ACTIVE' | 'SUSPENDED') => {
    try {
      await apiFetch(`/api/admin/users/${uid}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadSectionData();
      setFeedback(`User ${uid} set to ${nextStatus}`);
    } catch (err: any) {
      setFeedback(err.message);
    }
  };

  const handleVerifyTech = async (uid: string, decision: 'APPROVED' | 'REJECTED') => {
    try {
      await apiFetch(`/api/admin/technicians/${uid}/verify`, {
        method: 'POST',
        body: JSON.stringify({ decision, rejectionReason: rejectReasons[uid] || '' }),
      });
      await Promise.all([loadSectionData(), loadOverviewAndReports(), refreshBootstrap()]);
      setFeedback(`Technician ${decision}`);
    } catch (err: any) {
      setFeedback(err.message);
    }
  };

  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/services', {
        method: 'POST',
        body: JSON.stringify({
          ...newSvc,
          basePrice: Number(newSvc.basePrice),
          sortOrder: Number(newSvc.sortOrder),
        }),
      });
      setNewSvc({
        nameAr: '',
        nameEn: '',
        descriptionAr: '',
        descriptionEn: '',
        iconName: 'Wrench',
        basePrice: '350',
        sortOrder: '15',
      });
      await Promise.all([loadSectionData(), refreshBootstrap()]);
      setFeedback(lang === 'ar' ? 'تم إضافة القسم بنجاح.' : 'Service category added.');
    } catch (err: any) {
      setFeedback(err.message);
    }
  };

  const handleUpdateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSvc) return;
    try {
      await apiFetch(`/api/admin/services/${editingSvc.id}`, {
        method: 'PUT',
        body: JSON.stringify(editingSvc),
      });
      setEditingSvc(null);
      await Promise.all([loadSectionData(), refreshBootstrap()]);
      setFeedback(lang === 'ar' ? 'تم تحديث القسم.' : 'Service updated.');
    } catch (err: any) {
      setFeedback(err.message);
    }
  };

  const handleDeleteService = async (id: string) => {
    try {
      await apiFetch(`/api/admin/services/${id}`, { method: 'DELETE' });
      await Promise.all([loadSectionData(), refreshBootstrap()]);
      setFeedback(lang === 'ar' ? 'تم حذف القسم.' : 'Service deleted.');
    } catch (err: any) {
      setFeedback(err.message);
    }
  };

  const handleOverrideOrderStatus = async (orderId: string, status: OrderStatus) => {
    try {
      await apiFetch(`/api/admin/orders/${orderId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      await loadSectionData();
      setFeedback(`Order ${orderId} updated to ${status}`);
    } catch (err: any) {
      setFeedback(err.message);
    }
  };

  const handleProcessWithdrawal = async (txId: string, approve: boolean) => {
    try {
      await apiFetch(`/api/admin/withdrawals/${txId}/process`, {
        method: 'POST',
        body: JSON.stringify({ approve }),
      });
      await loadSectionData();
      setFeedback(`Withdrawal ${txId} ${approve ? 'approved' : 'rejected'}.`);
    } catch (err: any) {
      setFeedback(err.message);
    }
  };

  const handleProcessTopup = async (txId: string, approve: boolean) => {
    try {
      await apiFetch(`/api/admin/topups/${txId}/process`, {
        method: 'POST',
        body: JSON.stringify({ approve }),
      });
      await loadSectionData();
      setFeedback(`Top-up ${txId} ${approve ? 'approved & credited' : 'rejected'}.`);
    } catch (err: any) {
      setFeedback(err.message);
    }
  };

  const handleSaveCommissionRate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/settings/commission', {
        method: 'PUT',
        body: JSON.stringify({ commissionRatePercent: Number(commRateInput) }),
      });
      await loadOverviewAndReports();
      setFeedback(lang === 'ar' ? 'تم تحديث نسبة العمولة.' : 'Commission rate updated.');
    } catch (err: any) {
      setFeedback(err.message);
    }
  };

  const handleSavePlan = async (plan: SubscriptionPlan) => {
    try {
      await apiFetch(`/api/admin/plans/${plan.id}`, {
        method: 'PUT',
        body: JSON.stringify(plan),
      });
      await Promise.all([loadSectionData(), refreshBootstrap()]);
      setFeedback(`Plan ${plan.id} updated.`);
    } catch (err: any) {
      setFeedback(err.message);
    }
  };

  const handleResolveComplaint = async (id: string, status: 'IN_REVIEW' | 'RESOLVED' | 'DISMISSED') => {
    try {
      await apiFetch(`/api/admin/complaints/${id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ status, adminResolution: resNotes[id] || '' }),
      });
      await loadSectionData();
      setFeedback(`Complaint ${id} updated.`);
    } catch (err: any) {
      setFeedback(err.message);
    }
  };

  const handleDeleteReview = async (id: string) => {
    try {
      await apiFetch(`/api/admin/reviews/${id}`, { method: 'DELETE' });
      await loadSectionData();
      setFeedback('Review deleted.');
    } catch (err: any) {
      setFeedback(err.message);
    }
  };

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<any>('/api/admin/notifications/broadcast', {
        method: 'POST',
        body: JSON.stringify({
          targetRole: bcTarget,
          titleAr: bcTitleAr,
          titleEn: bcTitleEn || bcTitleAr,
          bodyAr: bcBodyAr,
          bodyEn: bcBodyEn || bcBodyAr,
        }),
      });
      setBcTitleAr('');
      setBcTitleEn('');
      setBcBodyAr('');
      setBcBodyEn('');
      setFeedback(`Broadcast sent to ${res.count} users.`);
    } catch (err: any) {
      setFeedback(err.message);
    }
  };

  const handleSaveCms = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/cms', {
        method: 'PUT',
        body: JSON.stringify(cmsDraft),
      });
      await refreshBootstrap();
      setFeedback(lang === 'ar' ? 'تم تحديث محتوى الصفحات العامة.' : 'CMS content saved.');
    } catch (err: any) {
      setFeedback(err.message);
    }
  };

  const navItems = [
    { path: '/admin', icon: LayoutDashboard, label: lang === 'ar' ? 'الإحصائيات والتقارير' : 'Overview & Reports' },
    { path: '/admin/verifications', icon: UserCheck, label: lang === 'ar' ? 'طلبات توثيق الفنيين' : 'KYC Verifications' },
    { path: '/admin/customers', icon: Users, label: lang === 'ar' ? 'إدارة العملاء' : 'Customers' },
    { path: '/admin/technicians', icon: Wrench, label: lang === 'ar' ? 'إدارة الفنيين' : 'Technicians' },
    { path: '/admin/services', icon: Layers, label: lang === 'ar' ? 'الأقسام والخدمات' : 'Services & Categories' },
    { path: '/admin/orders', icon: Briefcase, label: lang === 'ar' ? 'إدارة الطلبات' : 'Orders Monitor' },
    { path: '/admin/payments', icon: CreditCard, label: lang === 'ar' ? 'المدفوعات والسحوبات' : 'Payments & Payouts' },
    { path: '/admin/commissions', icon: Percent, label: lang === 'ar' ? 'العمولات' : 'Commissions' },
    { path: '/admin/subscriptions', icon: Crown, label: lang === 'ar' ? 'الاشتراكات' : 'Subscriptions' },
    { path: '/admin/complaints', icon: AlertCircle, label: lang === 'ar' ? 'الشكاوى' : 'Complaints' },
    { path: '/admin/reviews', icon: Star, label: lang === 'ar' ? 'التقييمات' : 'Reviews' },
    { path: '/admin/notifications', icon: Bell, label: lang === 'ar' ? 'إرسال إشعارات' : 'Broadcast Alerts' },
    { path: '/admin/content', icon: FileEdit, label: lang === 'ar' ? 'إدارة المحتوى والرسائل' : 'CMS & Contact' },
    { path: '/admin/logs', icon: Activity, label: lang === 'ar' ? 'سجل عمليات الإدارة' : 'Audit Logs' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <aside className="lg:col-span-3">
          <div className="rounded-2xl border border-[#C8A24E]/30 bg-white dark:bg-[#131316] p-4 space-y-1">
            <div className="px-2 pb-3 mb-2 border-b border-neutral-200 dark:border-neutral-800">
              <p className="text-xs font-bold text-[#C8A24E]">
                {lang === 'ar' ? 'لوحة الإدارة العليا' : 'InteriorX Admin Console'}
              </p>
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.path === '/admin' ? route === '/admin' : route === item.path;
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => navigate(item.path)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
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
          {feedback && (
            <div className="rounded-xl border border-[#C8A24E]/40 bg-[#C8A24E]/10 px-4 py-3 text-xs font-medium">
              {feedback}
            </div>
          )}

          {loading ? (
            <div className="py-16 text-center text-sm text-neutral-500">{t.common.loading}</div>
          ) : route === '/admin' ? (
            <div className="space-y-6">
              <h1 className="text-2xl font-bold">{lang === 'ar' ? 'إحصائيات المنصة والتقارير' : 'Executive Overview & Reports'}</h1>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: lang === 'ar' ? 'إجمالي العملاء' : 'Customers', value: overview?.customersCount ?? 0 },
                  { label: lang === 'ar' ? 'إجمالي الفنيين' : 'Technicians', value: overview?.techniciansCount ?? 0 },
                  { label: lang === 'ar' ? 'بانتظار التوثيق' : 'Pending KYC', value: overview?.pendingVerificationsCount ?? 0, gold: true },
                  { label: lang === 'ar' ? 'الطلبات الجديدة' : 'New Orders', value: overview?.newOrdersCount ?? 0 },
                  { label: lang === 'ar' ? 'الطلبات المكتملة' : 'Completed Orders', value: overview?.completedOrdersCount ?? 0 },
                  { label: lang === 'ar' ? 'إجمالي الإيرادات' : 'Gross Revenue', value: `${overview?.totalRevenue ?? 0} ${t.common.currency}` },
                  { label: lang === 'ar' ? 'عمولات المنصة' : 'Commissions', value: `${overview?.totalCommissions ?? 0} ${t.common.currency}`, gold: true },
                  { label: lang === 'ar' ? 'شكاوى مفتوحة' : 'Open Complaints', value: overview?.openComplaintsCount ?? 0 },
                ].map((k, idx) => (
                  <div key={idx} className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-4">
                    <p className="text-xs text-neutral-500">{k.label}</p>
                    <p className={`text-xl font-bold font-mono-num mt-1 ${k.gold ? 'text-[#C8A24E]' : ''}`}>
                      {k.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-base font-bold">
                    {lang === 'ar' ? 'التقارير المالية والتشغيلية' : 'Daily / Monthly / Yearly Reports'}
                  </h2>
                  <div className="flex items-center gap-2">
                    {(['daily', 'monthly', 'yearly'] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setReportPeriod(p)}
                        className={`px-3 py-1.5 rounded-lg border text-xs cursor-pointer ${
                          reportPeriod === p
                            ? 'border-[#C8A24E] bg-[#C8A24E] text-black font-bold'
                            : 'border-neutral-300 dark:border-neutral-700'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={exportReportsCsv}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#C8A24E] text-[#C8A24E] text-xs font-semibold cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      {t.common.exportCsv}
                    </button>
                  </div>
                </div>

                {reportRows.length === 0 ? (
                  <p className="text-xs text-neutral-500 py-4">{t.common.noData}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-start">
                      <thead className="border-b border-neutral-200 dark:border-neutral-800 text-neutral-500">
                        <tr>
                          <th className="py-2 text-start">{lang === 'ar' ? 'الفترة' : 'Period'}</th>
                          <th className="py-2 text-start">{lang === 'ar' ? 'الطلبات' : 'Orders'}</th>
                          <th className="py-2 text-start">{lang === 'ar' ? 'الإيرادات' : 'Revenue'}</th>
                          <th className="py-2 text-start">{lang === 'ar' ? 'العمولات' : 'Commissions'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportRows.map((r) => (
                          <tr key={r.bucket} className="border-b border-neutral-100 dark:border-neutral-800/60">
                            <td className="py-2.5 font-mono-num font-bold">{r.bucket}</td>
                            <td className="py-2.5 font-mono-num">{r.orders}</td>
                            <td className="py-2.5 font-mono-num">{r.revenue} {t.common.currency}</td>
                            <td className="py-2.5 font-mono-num text-[#C8A24E]">{r.commissions} {t.common.currency}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : route === '/admin/verifications' ? (
            <div className="space-y-4">
              <h1 className="text-xl font-bold">{lang === 'ar' ? 'توثيق مستندات الفنيين' : 'Technician KYC Verification Queue'}</h1>
              {technicians.length === 0 ? (
                <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-8 text-center text-sm text-neutral-500">
                  {t.common.noData}
                </div>
              ) : (
                <div className="space-y-4">
                  {technicians.map(({ user, privateProfile }) => (
                    <div key={user.uid} className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-5 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-bold text-base">{privateProfile?.displayName || user.name}</p>
                          <p className="text-xs text-neutral-500">
                            {user.email} · ID: <span className="font-mono-num">{privateProfile?.nationalIdNumber || '—'}</span>
                          </p>
                        </div>
                        <span className="px-2.5 py-1 rounded text-xs font-bold bg-[#C8A24E]/15 text-[#C8A24E]">
                          {privateProfile?.verificationStatus || 'UNSUBMITTED'}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-3 text-xs">
                        {privateProfile?.nationalIdDocUrl && (
                          <a
                            href={resolveUploadUrl(privateProfile.nationalIdDocUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline text-[#C8A24E]"
                          >
                            {lang === 'ar' ? 'عرض مستند الهوية' : 'View National ID Doc'}
                          </a>
                        )}
                        {privateProfile?.certificateDocUrl && (
                          <a
                            href={resolveUploadUrl(privateProfile.certificateDocUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline text-[#C8A24E]"
                          >
                            {lang === 'ar' ? 'عرض الشهادات' : 'View Certificate'}
                          </a>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        <input
                          value={rejectReasons[user.uid] || ''}
                          onChange={(e) => setRejectReasons((p) => ({ ...p, [user.uid]: e.target.value }))}
                          placeholder={lang === 'ar' ? 'سبب الرفض (عند الرفض)...' : 'Rejection reason (optional)...'}
                          className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => void handleVerifyTech(user.uid, 'APPROVED')}
                          className="px-4 py-1.5 rounded-lg bg-emerald-500 text-black text-xs font-bold cursor-pointer"
                        >
                          {t.common.approve}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleVerifyTech(user.uid, 'REJECTED')}
                          className="px-4 py-1.5 rounded-lg border border-red-500/40 text-red-500 text-xs font-bold cursor-pointer"
                        >
                          {t.common.reject}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : route === '/admin/customers' ? (
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-4">
              <h1 className="text-xl font-bold">{lang === 'ar' ? 'إدارة العملاء' : 'Customers Management'}</h1>
              {customers.length === 0 ? (
                <p className="text-xs text-neutral-500">{t.common.noData}</p>
              ) : (
                <div className="space-y-2.5">
                  {customers.map((u) => (
                    <div key={u.uid} className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div>
                        <p className="font-bold text-sm">{u.name}</p>
                        <p className="text-neutral-500">{u.email} · {u.phone || '—'} · {u.status}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleToggleUserStatus(u.uid, u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE')}
                        className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 font-semibold cursor-pointer"
                      >
                        {u.status === 'ACTIVE'
                          ? lang === 'ar'
                            ? 'إيقاف الحساب'
                            : 'Suspend'
                          : lang === 'ar'
                          ? 'تفعيل الحساب'
                          : 'Activate'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : route === '/admin/technicians' ? (
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-4">
              <h1 className="text-xl font-bold">{lang === 'ar' ? 'إدارة الفنيين' : 'Technicians Management'}</h1>
              {technicians.length === 0 ? (
                <p className="text-xs text-neutral-500">{t.common.noData}</p>
              ) : (
                <div className="space-y-2.5">
                  {technicians.map(({ user, privateProfile, publicProfile }) => (
                    <div key={user.uid} className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div>
                        <p className="font-bold text-sm">{privateProfile?.displayName || user.name}</p>
                        <p className="text-neutral-500">
                          {user.email} · {privateProfile?.verificationStatus} · {privateProfile?.subscriptionPlanId} · ★ {(publicProfile?.ratingAvg || 0).toFixed(1)} · {user.status}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleToggleUserStatus(user.uid, user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE')}
                        className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 font-semibold cursor-pointer"
                      >
                        {user.status === 'ACTIVE' ? (lang === 'ar' ? 'إيقاف' : 'Suspend') : (lang === 'ar' ? 'تفعيل' : 'Activate')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : route === '/admin/services' ? (
            <div className="space-y-6">
              <form onSubmit={handleCreateService} className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-4">
                <h2 className="text-base font-bold">{lang === 'ar' ? 'إضافة قسم خدمة جديد' : 'Add Service Division'}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input required placeholder="الاسم بالعربية" value={newSvc.nameAr} onChange={(e) => setNewSvc((p) => ({ ...p, nameAr: e.target.value }))} className="px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-xs" />
                  <input required placeholder="English Name" value={newSvc.nameEn} onChange={(e) => setNewSvc((p) => ({ ...p, nameEn: e.target.value }))} className="px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-xs" />
                  <input placeholder="الوصف بالعربية" value={newSvc.descriptionAr} onChange={(e) => setNewSvc((p) => ({ ...p, descriptionAr: e.target.value }))} className="px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-xs" />
                  <input placeholder="English Description" value={newSvc.descriptionEn} onChange={(e) => setNewSvc((p) => ({ ...p, descriptionEn: e.target.value }))} className="px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-xs" />
                  <input type="number" placeholder="Base Price" value={newSvc.basePrice} onChange={(e) => setNewSvc((p) => ({ ...p, basePrice: e.target.value }))} className="px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-xs font-mono-num" />
                  <input type="number" placeholder="Sort Order" value={newSvc.sortOrder} onChange={(e) => setNewSvc((p) => ({ ...p, sortOrder: e.target.value }))} className="px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-xs font-mono-num" />
                </div>
                <button type="submit" className="px-5 py-2 rounded-lg bg-[#C8A24E] text-black text-xs font-bold cursor-pointer">
                  {lang === 'ar' ? 'إضافة القسم' : 'Add Service'}
                </button>
              </form>

              {editingSvc && (
                <form onSubmit={handleUpdateService} className="rounded-2xl border border-[#C8A24E] bg-white dark:bg-[#131316] p-6 space-y-3">
                  <h3 className="text-sm font-bold">{lang === 'ar' ? 'تعديل القسم:' : 'Editing:'} {editingSvc.nameEn}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input value={editingSvc.nameAr} onChange={(e) => setEditingSvc({ ...editingSvc, nameAr: e.target.value })} className="px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-xs" />
                    <input value={editingSvc.nameEn} onChange={(e) => setEditingSvc({ ...editingSvc, nameEn: e.target.value })} className="px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-xs" />
                    <input type="number" value={editingSvc.basePrice} onChange={(e) => setEditingSvc({ ...editingSvc, basePrice: Number(e.target.value) })} className="px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-xs font-mono-num" />
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={editingSvc.isActive} onChange={(e) => setEditingSvc({ ...editingSvc, isActive: e.target.checked })} />
                      Active
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className="px-4 py-1.5 rounded-lg bg-[#C8A24E] text-black text-xs font-bold cursor-pointer">{t.common.save}</button>
                    <button type="button" onClick={() => setEditingSvc(null)} className="px-4 py-1.5 rounded-lg border border-neutral-300 text-xs cursor-pointer">{t.common.cancel}</button>
                  </div>
                </form>
              )}

              <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-3">
                <h2 className="text-base font-bold">{lang === 'ar' ? 'الأقسام الحالية' : 'Existing Service Divisions'} ({adminServices.length})</h2>
                <div className="space-y-2">
                  {adminServices.map((s) => (
                    <div key={s.id} className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div>
                        <p className="font-bold">{s.nameAr} · {s.nameEn}</p>
                        <p className="text-neutral-500 font-mono-num">{s.basePrice} {t.common.currency} · Order #{s.sortOrder} · {s.isActive ? 'Active' : 'Hidden'}</p>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setEditingSvc(s)} className="px-3 py-1 rounded border border-neutral-300 dark:border-neutral-700 cursor-pointer">{t.common.edit}</button>
                        <button type="button" onClick={() => void handleDeleteService(s.id)} className="px-3 py-1 rounded border border-red-500/40 text-red-500 cursor-pointer">{t.common.delete}</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : route === '/admin/orders' ? (
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-4">
              <h1 className="text-xl font-bold">{lang === 'ar' ? 'إدارة الطلبات' : 'Orders Monitor'}</h1>
              {orders.length === 0 ? (
                <p className="text-xs text-neutral-500">{t.common.noData}</p>
              ) : (
                <div className="space-y-3">
                  {orders.map((o) => (
                    <div key={o.id} className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div>
                        <p className="font-bold text-sm">{o.title} <span className="font-mono-num text-neutral-500">#{o.id}</span></p>
                        <p className="text-neutral-500">
                          {o.customerName} → {o.technicianName || 'Unassigned'} · {tStatus(o.status, lang)}
                        </p>
                      </div>
                      <select
                        value={o.status}
                        onChange={(e) => void handleOverrideOrderStatus(o.id, e.target.value as OrderStatus)}
                        className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#131316] text-xs"
                      >
                        {(['NEW', 'PENDING', 'ACCEPTED', 'TECHNICIAN_ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED', 'PAID', 'CANCELLED'] as OrderStatus[]).map((st) => (
                          <option key={st} value={st}>{st}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : route === '/admin/payments' ? (
            <div className="space-y-6">
              <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-4">
                <h2 className="text-base font-bold">
                  {lang === 'ar' ? 'طلبات شحن المحفظة بالتحويل (بانتظار الاعتماد)' : 'Wallet Top-Up Requests (Bank / InstaPay)'}
                </h2>
                {transactions.filter((tx) => tx.type === 'TOPUP' && tx.provider === 'BANK_TRANSFER').length === 0 ? (
                  <p className="text-xs text-neutral-500">{t.common.noData}</p>
                ) : (
                  <div className="space-y-2.5">
                    {transactions
                      .filter((tx) => tx.type === 'TOPUP' && tx.provider === 'BANK_TRANSFER')
                      .map((tx) => (
                        <div key={tx.id} className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                          <div>
                            <p className="font-bold font-mono-num">{tx.amount} {t.common.currency} · {tx.status}</p>
                            <p className="text-neutral-500">UID: {tx.uid} · {tx.notes}</p>
                          </div>
                          {tx.status === 'PENDING' && (
                            <div className="flex gap-2">
                              <button type="button" onClick={() => void handleProcessTopup(tx.id, true)} className="px-3 py-1.5 rounded bg-emerald-500 text-black font-bold cursor-pointer">{t.common.approve}</button>
                              <button type="button" onClick={() => void handleProcessTopup(tx.id, false)} className="px-3 py-1.5 rounded border border-red-500/40 text-red-500 font-bold cursor-pointer">{t.common.reject}</button>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-4">
                <h2 className="text-base font-bold">{lang === 'ar' ? 'طلبات سحب أرباح الفنيين' : 'Technician Withdrawal Requests'}</h2>
                {transactions.filter((tx) => tx.type === 'WITHDRAWAL').length === 0 ? (
                  <p className="text-xs text-neutral-500">{t.common.noData}</p>
                ) : (
                  <div className="space-y-2.5">
                    {transactions
                      .filter((tx) => tx.type === 'WITHDRAWAL')
                      .map((tx) => (
                        <div key={tx.id} className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                          <div>
                            <p className="font-bold font-mono-num">{tx.amount} {t.common.currency} · {tx.status}</p>
                            <p className="text-neutral-500">UID: {tx.uid} · {tx.notes}</p>
                          </div>
                          {tx.status === 'PENDING' && (
                            <div className="flex gap-2">
                              <button type="button" onClick={() => void handleProcessWithdrawal(tx.id, true)} className="px-3 py-1.5 rounded bg-emerald-500 text-black font-bold cursor-pointer">{t.common.approve}</button>
                              <button type="button" onClick={() => void handleProcessWithdrawal(tx.id, false)} className="px-3 py-1.5 rounded border border-red-500/40 text-red-500 font-bold cursor-pointer">{t.common.reject}</button>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-3">
                <h2 className="text-base font-bold">{lang === 'ar' ? 'الفواتير والمعاملات' : 'Invoices & Transactions'}</h2>
                <p className="text-xs text-neutral-500 font-mono-num">
                  Invoices: {invoices.length} · All Transactions: {transactions.length}
                </p>
                <div className="space-y-2">
                  {transactions.slice(0, 25).map((tx) => (
                    <div key={tx.id} className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 flex justify-between text-xs">
                      <span>{tx.type} · {tx.provider} · {tx.status}</span>
                      <span className="font-mono-num font-bold">{tx.amount} {t.common.currency}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : route === '/admin/commissions' ? (
            <div className="space-y-6">
              <form onSubmit={handleSaveCommissionRate} className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-4">
                <h1 className="text-xl font-bold">{lang === 'ar' ? 'إعداد نسبة عمولة المنصة' : 'Platform Commission Rate'}</h1>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={0}
                    max={50}
                    step={0.5}
                    value={commRateInput}
                    onChange={(e) => setCommRateInput(e.target.value)}
                    className="w-32 px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm font-mono-num"
                  />
                  <span className="text-sm font-bold">%</span>
                  <button type="submit" className="px-5 py-2 rounded-lg bg-[#C8A24E] text-black text-xs font-bold cursor-pointer">
                    {t.common.save}
                  </button>
                </div>
              </form>

              <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-3">
                <h2 className="text-base font-bold">{lang === 'ar' ? 'سجل العمولات المحصلة' : 'Collected Commissions'}</h2>
                {commissions.length === 0 ? (
                  <p className="text-xs text-neutral-500">{t.common.noData}</p>
                ) : (
                  <div className="space-y-2">
                    {commissions.map((c) => (
                      <div key={c.id} className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 flex justify-between text-xs font-mono-num">
                        <span>Order #{c.orderId} ({c.ratePercent}%)</span>
                        <span className="font-bold text-[#C8A24E]">{c.commissionAmount} {t.common.currency}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : route === '/admin/subscriptions' ? (
            <div className="space-y-4">
              <h1 className="text-xl font-bold">{lang === 'ar' ? 'إدارة باقات الاشتراك' : 'Subscription Plans Editor'}</h1>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {plansDraft.map((p, idx) => (
                  <div key={p.id} className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-5 space-y-3 text-xs">
                    <p className="font-bold text-[#C8A24E]">{p.id}</p>
                    <input
                      value={p.nameAr}
                      onChange={(e) => {
                        const copy = [...plansDraft];
                        copy[idx] = { ...p, nameAr: e.target.value };
                        setPlansDraft(copy);
                      }}
                      className="w-full px-3 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent"
                    />
                    <input
                      value={p.nameEn}
                      onChange={(e) => {
                        const copy = [...plansDraft];
                        copy[idx] = { ...p, nameEn: e.target.value };
                        setPlansDraft(copy);
                      }}
                      className="w-full px-3 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent"
                    />
                    <input
                      type="number"
                      value={p.monthlyPrice}
                      onChange={(e) => {
                        const copy = [...plansDraft];
                        copy[idx] = { ...p, monthlyPrice: Number(e.target.value) };
                        setPlansDraft(copy);
                      }}
                      className="w-full px-3 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent font-mono-num"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSavePlan(plansDraft[idx])}
                      className="w-full py-2 rounded-lg bg-[#C8A24E] text-black font-bold cursor-pointer"
                    >
                      {t.common.save}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : route === '/admin/complaints' ? (
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-4">
              <h1 className="text-xl font-bold">{lang === 'ar' ? 'إدارة الشكاوى والنزاعات' : 'Complaints & Disputes'}</h1>
              {complaints.length === 0 ? (
                <p className="text-xs text-neutral-500">{t.common.noData}</p>
              ) : (
                <div className="space-y-3">
                  {complaints.map((c) => (
                    <div key={c.id} className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 space-y-2 text-xs">
                      <div className="flex justify-between">
                        <p className="font-bold text-sm">{c.subject}</p>
                        <span className="font-bold text-[#C8A24E]">{c.status}</span>
                      </div>
                      <p className="text-neutral-500">{c.reporterName} ({c.reporterRole}) · Order #{c.orderId || '—'}</p>
                      <p className="text-neutral-700 dark:text-stone-300">{c.description}</p>
                      <div className="flex flex-wrap gap-2 pt-2">
                        <input
                          value={resNotes[c.id] || c.adminResolution || ''}
                          onChange={(e) => setResNotes((p) => ({ ...p, [c.id]: e.target.value }))}
                          placeholder="Resolution note..."
                          className="flex-1 min-w-[200px] px-3 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent"
                        />
                        <button type="button" onClick={() => void handleResolveComplaint(c.id, 'RESOLVED')} className="px-3 py-1.5 rounded bg-emerald-500 text-black font-bold cursor-pointer">Resolve</button>
                        <button type="button" onClick={() => void handleResolveComplaint(c.id, 'DISMISSED')} className="px-3 py-1.5 rounded border border-neutral-400 cursor-pointer">Dismiss</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : route === '/admin/reviews' ? (
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-4">
              <h1 className="text-xl font-bold">{lang === 'ar' ? 'إدارة التقييمات' : 'Reviews Moderation'}</h1>
              {reviews.length === 0 ? (
                <p className="text-xs text-neutral-500">{t.common.noData}</p>
              ) : (
                <div className="space-y-3">
                  {reviews.map((r) => (
                    <div key={r.id} className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 flex justify-between gap-4 text-xs">
                      <div>
                        <p className="font-bold">{r.customerName} · ★ {r.rating}</p>
                        <p className="text-neutral-500 mt-1">{r.comment}</p>
                      </div>
                      <button type="button" onClick={() => void handleDeleteReview(r.id)} className="text-red-500 cursor-pointer shrink-0">{t.common.delete}</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : route === '/admin/notifications' ? (
            <form onSubmit={handleBroadcast} className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-4">
              <h1 className="text-xl font-bold">{lang === 'ar' ? 'إرسال إشعار جماعي' : 'Broadcast Notification'}</h1>
              <select
                value={bcTarget}
                onChange={(e) => setBcTarget(e.target.value as any)}
                className="px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#131316] text-xs"
              >
                <option value="ALL">ALL USERS</option>
                <option value="CUSTOMER">CUSTOMERS ONLY</option>
                <option value="TECHNICIAN">TECHNICIANS ONLY</option>
              </select>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input required placeholder="العنوان بالعربية" value={bcTitleAr} onChange={(e) => setBcTitleAr(e.target.value)} className="px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-xs" />
                <input placeholder="Title (English)" value={bcTitleEn} onChange={(e) => setBcTitleEn(e.target.value)} className="px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-xs" />
              </div>
              <textarea required rows={3} placeholder="نص الإشعار بالعربية" value={bcBodyAr} onChange={(e) => setBcBodyAr(e.target.value)} className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-xs" />
              <textarea rows={2} placeholder="Body (English)" value={bcBodyEn} onChange={(e) => setBcBodyEn(e.target.value)} className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-xs" />
              <button type="submit" className="px-6 py-2.5 rounded-lg bg-[#C8A24E] text-black text-xs font-bold cursor-pointer">
                {lang === 'ar' ? 'إرسال الإشعار' : 'Dispatch Broadcast'}
              </button>
            </form>
          ) : route === '/admin/content' ? (
            <div className="space-y-6">
              <form onSubmit={handleSaveCms} className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-4">
                <h1 className="text-xl font-bold">{lang === 'ar' ? 'إدارة محتوى الصفحات' : 'CMS Public Content Editor'}</h1>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <input value={cmsDraft.heroTitleAr} onChange={(e) => setCmsDraft((p) => ({ ...p, heroTitleAr: e.target.value }))} placeholder="Hero Title AR" className="px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent" />
                  <input value={cmsDraft.heroTitleEn} onChange={(e) => setCmsDraft((p) => ({ ...p, heroTitleEn: e.target.value }))} placeholder="Hero Title EN" className="px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent" />
                  <textarea rows={3} value={cmsDraft.aboutAr} onChange={(e) => setCmsDraft((p) => ({ ...p, aboutAr: e.target.value }))} placeholder="About AR" className="px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent" />
                  <textarea rows={3} value={cmsDraft.aboutEn} onChange={(e) => setCmsDraft((p) => ({ ...p, aboutEn: e.target.value }))} placeholder="About EN" className="px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent" />
                  <textarea rows={3} value={cmsDraft.termsAr} onChange={(e) => setCmsDraft((p) => ({ ...p, termsAr: e.target.value }))} placeholder="Terms AR" className="px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent" />
                  <textarea rows={3} value={cmsDraft.termsEn} onChange={(e) => setCmsDraft((p) => ({ ...p, termsEn: e.target.value }))} placeholder="Terms EN" className="px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent" />
                </div>
                <button type="submit" className="px-5 py-2 rounded-lg bg-[#C8A24E] text-black text-xs font-bold cursor-pointer">{t.common.save}</button>
              </form>

              <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-3">
                <h2 className="text-base font-bold">{lang === 'ar' ? 'رسائل تواصل العملاء' : 'Contact Form Inquiries'}</h2>
                {contactMsgs.length === 0 ? (
                  <p className="text-xs text-neutral-500">{t.common.noData}</p>
                ) : (
                  <div className="space-y-2">
                    {contactMsgs.map((m) => (
                      <div key={m.id} className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 text-xs space-y-1">
                        <p className="font-bold">{m.name} ({m.email}) — {m.subject}</p>
                        <p className="text-neutral-500">{m.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-4">
              <h1 className="text-xl font-bold">{lang === 'ar' ? 'سجل جميع عمليات الإدارة' : 'Immutable Admin Audit Logs'}</h1>
              {logs.length === 0 ? (
                <p className="text-xs text-neutral-500">{t.common.noData}</p>
              ) : (
                <div className="space-y-2">
                  {logs.map((l) => (
                    <div key={l.id} className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 flex flex-wrap justify-between gap-2 text-xs">
                      <div>
                        <p className="font-bold text-[#C8A24E]">{l.action}</p>
                        <p className="text-neutral-500">{l.targetCollection}/{l.targetId} — {l.details}</p>
                      </div>
                      <div className="text-end font-mono-num text-[11px] text-neutral-500">
                        <p>{l.adminEmail}</p>
                        <p>{new Date(l.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
