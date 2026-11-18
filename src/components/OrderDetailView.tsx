import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  Clock,
  CreditCard,
  DollarSign,
  FileText,
  Image as ImageIcon,
  MapPin,
  MessageSquare,
  Navigation,
  Paperclip,
  Send,
  Star,
  Wallet as WalletIcon,
  XCircle,
} from 'lucide-react';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useApp } from '../contexts/AppContext';
import { apiFetch, resolveUploadUrl, uploadFileToServer } from '../lib/api';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { ORDER_LIFECYCLE_STEPS, tStatus, translations } from '../i18n/translations';
import { OrderLiveTrackingMap } from './MapsComponents';
import type {
  Invoice,
  Order,
  OrderMessage,
  OrderOffer,
  OrderStatus,
  OrderStatusHistory,
  TechnicianLocation,
} from '../types';

interface OrderDetailViewProps {
  orderId: string;
  backPath: string;
}

export const OrderDetailView: React.FC<OrderDetailViewProps> = ({ orderId, backPath }) => {
  const {
    lang,
    navigate,
    userRecord,
    isAdmin,
    wallet,
    integrations,
    refreshSession,
    subscribeOrderWs,
    unsubscribeOrderWs,
    addWsListener,
  } = useApp();
  const t = translations[lang];
  const BackArrow = lang === 'ar' ? ArrowRight : ArrowLeft;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [offers, setOffers] = useState<OrderOffer[]>([]);
  const [history, setHistory] = useState<OrderStatusHistory[]>([]);
  const [messages, setMessages] = useState<OrderMessage[]>([]);
  const [techLocation, setTechLocation] = useState<TechnicianLocation | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);

  // Technician Quote Form
  const [quoteAmount, setQuoteAmount] = useState('');
  const [quoteDays, setQuoteDays] = useState('1');
  const [quoteNotes, setQuoteNotes] = useState('');
  const [submittingQuote, setSubmittingQuote] = useState(false);

  // Price Revision Form
  const [revAmount, setRevAmount] = useState('');
  const [revReason, setRevReason] = useState('');
  const [submittingRev, setSubmittingRev] = useState(false);

  // Chat State
  const [chatText, setChatText] = useState('');
  const [chatImage, setChatImage] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [uploadingChatImg, setUploadingChatImg] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Live GPS Sharing (Technician)
  const [sharingGps, setSharingGps] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  // Payment State
  const [paying, setPaying] = useState(false);
  const [paymobIframeUrl, setPaymobIframeUrl] = useState('');
  const [fawryRef, setFawryRef] = useState<{ referenceNumber: string; expirationTime?: number } | null>(null);

  // Review & Complaint State
  const [rating, setRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [showComplaint, setShowComplaint] = useState(false);
  const [cmpSubject, setCmpSubject] = useState('');
  const [cmpDesc, setCmpDesc] = useState('');
  const [submittingCmp, setSubmittingCmp] = useState(false);

  const loadOrder = useCallback(async () => {
    try {
      const data = await apiFetch<any>(`/api/orders/${orderId}`);
      setOrder(data.order);
      setOffers(Array.isArray(data.offers) ? data.offers : []);
      setHistory(Array.isArray(data.history) ? data.history : []);
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      setTechLocation(data.technicianLocation || null);
      setInvoice(data.invoice || null);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load order.');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  // WebSocket Subscription for Real-Time Order / Chat / GPS Events
  useEffect(() => {
    subscribeOrderWs(orderId);
    const removeListener = addWsListener((event, payload, targetOrderId) => {
      if (targetOrderId && targetOrderId !== orderId) return;
      if (event === 'order:updated') {
        void loadOrder();
        void refreshSession();
      } else if (event === 'message:created' && payload?.id) {
        setMessages((prev) => (prev.some((m) => m.id === payload.id) ? prev : [...prev, payload]));
      } else if (event === 'location:updated' && payload?.lat && payload?.lng) {
        setTechLocation(payload);
      }
    });
    return () => {
      removeListener();
      unsubscribeOrderWs(orderId);
    };
  }, [orderId, subscribeOrderWs, unsubscribeOrderWs, addWsListener, loadOrder, refreshSession]);

  // Firestore Real-Time Listeners (Messages & Technician GPS Location)
  useEffect(() => {
    if (!order || !userRecord) return;
    const isParticipant = order.customerId === userRecord.uid || order.technicianId === userRecord.uid;
    if (!isParticipant) return;

    const msgQuery = query(
      collection(db, 'orders', orderId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsubMsgs = onSnapshot(
      msgQuery,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as OrderMessage);
        setMessages(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, `orders/${orderId}/messages`);
        } catch {
          // WebSocket fallback continues cleanly if client Firestore rules reject edge cases
        }
      }
    );

    let unsubLoc: (() => void) | null = null;
    if (order.technicianId) {
      unsubLoc = onSnapshot(
        doc(db, 'technician_locations', order.technicianId),
        (snap) => {
          if (snap.exists()) {
            setTechLocation(snap.data() as TechnicianLocation);
          }
        },
        (err) => {
          try {
            handleFirestoreError(err, OperationType.GET, `technician_locations/${order.technicianId}`);
          } catch {
            // non-fatal
          }
        }
      );
    }

    return () => {
      unsubMsgs();
      if (unsubLoc) unsubLoc();
    };
  }, [order?.id, order?.customerId, order?.technicianId, userRecord?.uid, orderId]);

  // Mark incoming chat messages as read
  useEffect(() => {
    if (!userRecord || !order || messages.length === 0) return;
    const hasUnread = messages.some((m) => !m.readBy?.includes(userRecord.uid));
    if (hasUnread && (order.customerId === userRecord.uid || order.technicianId === userRecord.uid)) {
      apiFetch(`/api/orders/${orderId}/messages/read`, { method: 'POST' }).catch(() => {});
    }
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, order, userRecord, orderId]);

  // Clean up GPS watch on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-neutral-500">
        {t.common.loading}
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="space-y-4 py-10">
        <button
          type="button"
          onClick={() => navigate(backPath)}
          className="inline-flex items-center gap-2 text-sm text-[#C8A24E] cursor-pointer"
        >
          <BackArrow className="w-4 h-4" />
          {t.common.back}
        </button>
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-sm text-red-500">
          {error || 'Order not found.'}
        </div>
      </div>
    );
  }

  const isCustomer = userRecord?.uid === order.customerId;
  const isAssignedTech = userRecord?.uid === order.technicianId;
  const isTechRole = userRecord?.role === 'TECHNICIAN';
  const myOffer = offers.find((o) => o.technicianId === userRecord?.uid);
  const canChat = Boolean(order.technicianId && (isCustomer || isAssignedTech));

  const handleSubmitQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingQuote(true);
    setActionMsg('');
    try {
      await apiFetch(`/api/orders/${orderId}/offers`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(quoteAmount),
          estimatedDays: Number(quoteDays),
          notes: quoteNotes,
        }),
      });
      setQuoteAmount('');
      setQuoteNotes('');
      setActionMsg(lang === 'ar' ? 'تم إرسال عرض السعر بنجاح.' : 'Quote submitted successfully.');
      await loadOrder();
    } catch (err: any) {
      setActionMsg(err.message);
    } finally {
      setSubmittingQuote(false);
    }
  };

  const handleAcceptOffer = async (offerId: string) => {
    setActionMsg('');
    try {
      await apiFetch(`/api/orders/${orderId}/offers/${offerId}/accept`, { method: 'POST' });
      setActionMsg(
        lang === 'ar'
          ? 'تم قبول عرض السعر وتعيين الفني وإغلاق بقية العروض.'
          : 'Quote accepted, technician assigned, and all other offers closed.'
      );
      await loadOrder();
    } catch (err: any) {
      setActionMsg(err.message);
    }
  };

  const handleStatusChange = async (nextStatus: OrderStatus) => {
    setActionMsg('');
    try {
      await apiFetch(`/api/orders/${orderId}/status`, {
        method: 'POST',
        body: JSON.stringify({ nextStatus }),
      });
      await loadOrder();
    } catch (err: any) {
      setActionMsg(err.message);
    }
  };

  const handleCancelOrder = async () => {
    setActionMsg('');
    try {
      await apiFetch(`/api/orders/${orderId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Cancelled by customer from order workspace' }),
      });
      await loadOrder();
    } catch (err: any) {
      setActionMsg(err.message);
    }
  };

  const handleRequestPriceRevision = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingRev(true);
    setActionMsg('');
    try {
      await apiFetch(`/api/orders/${orderId}/price-revision`, {
        method: 'POST',
        body: JSON.stringify({ requestedAmount: Number(revAmount), reason: revReason }),
      });
      setRevAmount('');
      setRevReason('');
      setActionMsg(lang === 'ar' ? 'تم إرسال طلب تعديل السعر للعميل.' : 'Price revision sent to customer.');
      await loadOrder();
    } catch (err: any) {
      setActionMsg(err.message);
    } finally {
      setSubmittingRev(false);
    }
  };

  const handleRespondPriceRevision = async (approve: boolean) => {
    setActionMsg('');
    try {
      await apiFetch(`/api/orders/${orderId}/price-revision/respond`, {
        method: 'POST',
        body: JSON.stringify({ approve }),
      });
      await loadOrder();
    } catch (err: any) {
      setActionMsg(err.message);
    }
  };

  const toggleLiveGps = () => {
    if (!navigator.geolocation) {
      setActionMsg(lang === 'ar' ? 'المتصفح لا يدعم GPS.' : 'Browser geolocation unsupported.');
      return;
    }
    if (sharingGps) {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      setSharingGps(false);
      return;
    }
    setSharingGps(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        try {
          await apiFetch('/api/technician/location', {
            method: 'POST',
            body: JSON.stringify({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              activeOrderId: orderId,
            }),
          });
        } catch {
          // ignore transient errors
        }
      },
      (err) => {
        setActionMsg(err.message);
        setSharingGps(false);
      },
      { enableHighAccuracy: true, maximumAge: 10000 }
    );
  };

  const handleChatImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingChatImg(true);
    try {
      const uploaded = await uploadFileToServer(file);
      setChatImage(uploaded.url);
    } catch (err: any) {
      setActionMsg(err.message);
    } finally {
      setUploadingChatImg(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim() && !chatImage) return;
    setSendingMsg(true);
    try {
      await apiFetch(`/api/orders/${orderId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text: chatText.trim(), imageUrl: chatImage || undefined }),
      });
      setChatText('');
      setChatImage('');
    } catch (err: any) {
      setActionMsg(err.message);
    } finally {
      setSendingMsg(false);
    }
  };

  const handlePayWallet = async () => {
    setPaying(true);
    setActionMsg('');
    try {
      await apiFetch(`/api/orders/${orderId}/pay-wallet`, { method: 'POST' });
      await Promise.all([loadOrder(), refreshSession()]);
      setActionMsg(lang === 'ar' ? 'تم السداد من المحفظة وإصدار الفاتورة.' : 'Paid via wallet & invoice issued.');
    } catch (err: any) {
      setActionMsg(err.message);
    } finally {
      setPaying(false);
    }
  };

  const handlePayCashRequest = async () => {
    setPaying(true);
    setActionMsg('');
    try {
      await apiFetch(`/api/orders/${orderId}/pay-cash-request`, { method: 'POST' });
      await loadOrder();
      setActionMsg(
        lang === 'ar'
          ? 'تم إرسال طلب تأكيد الدفع النقدي للفني. ستصدر الفاتورة فور تأكيد الفني استلام المبلغ.'
          : 'Cash on-site payment request sent to technician. Invoice will issue once confirmed.'
      );
    } catch (err: any) {
      setActionMsg(err.message);
    } finally {
      setPaying(false);
    }
  };

  const handleConfirmCashReceived = async () => {
    setPaying(true);
    setActionMsg('');
    try {
      await apiFetch(`/api/orders/${orderId}/confirm-cash`, { method: 'POST' });
      await Promise.all([loadOrder(), refreshSession()]);
      setActionMsg(
        lang === 'ar'
          ? 'تم تأكيد استلام المبلغ نقداً وإصدار الفاتورة الرسمية.'
          : 'Cash receipt confirmed and official invoice issued.'
      );
    } catch (err: any) {
      setActionMsg(err.message);
    } finally {
      setPaying(false);
    }
  };

  const handlePaymobInit = async () => {
    setPaying(true);
    setActionMsg('');
    try {
      const res = await apiFetch<any>('/api/payments/paymob/init', {
        method: 'POST',
        body: JSON.stringify({ purpose: 'ORDER', orderId, amount: order.finalPrice }),
      });
      if (res.iframeUrl) setPaymobIframeUrl(res.iframeUrl);
    } catch (err: any) {
      setActionMsg(err.message);
    } finally {
      setPaying(false);
    }
  };

  const handleFawryInit = async () => {
    setPaying(true);
    setActionMsg('');
    try {
      const res = await apiFetch<any>('/api/payments/fawry/init', {
        method: 'POST',
        body: JSON.stringify({ purpose: 'ORDER', orderId, amount: order.finalPrice }),
      });
      setFawryRef({ referenceNumber: res.referenceNumber, expirationTime: res.expirationTime });
    } catch (err: any) {
      setActionMsg(err.message);
    } finally {
      setPaying(false);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingReview(true);
    try {
      await apiFetch(`/api/orders/${orderId}/reviews`, {
        method: 'POST',
        body: JSON.stringify({ rating, comment: reviewComment }),
      });
      await loadOrder();
      setActionMsg(lang === 'ar' ? 'شكراً لتقييمك! تم تسجيله بنجاح.' : 'Thank you! Your review has been published.');
    } catch (err: any) {
      setActionMsg(err.message);
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleSubmitComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingCmp(true);
    try {
      await apiFetch('/api/complaints', {
        method: 'POST',
        body: JSON.stringify({ orderId, subject: cmpSubject, description: cmpDesc }),
      });
      setShowComplaint(false);
      setCmpSubject('');
      setCmpDesc('');
      setActionMsg(lang === 'ar' ? 'تم رفع الشكوى للإدارة بنجاح.' : 'Complaint submitted to platform administration.');
    } catch (err: any) {
      setActionMsg(err.message);
    } finally {
      setSubmittingCmp(false);
    }
  };

  const activeLifecycleIndex = ORDER_LIFECYCLE_STEPS.indexOf(order.status);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => navigate(backPath)}
          className="inline-flex items-center gap-2 text-xs font-semibold text-neutral-600 dark:text-neutral-300 hover:text-[#C8A24E] cursor-pointer"
        >
          <BackArrow className="w-4 h-4" />
          {t.common.back}
        </button>

        <div className="flex items-center gap-3">
          <span className="text-xs font-mono-num text-neutral-500">#{order.id}</span>
          <span className="px-3 py-1 rounded-md text-xs font-bold bg-[#C8A24E]/15 text-[#C8A24E]">
            {tStatus(order.status, lang)}
          </span>
        </div>
      </div>

      {actionMsg && (
        <div className="rounded-xl border border-[#C8A24E]/40 bg-[#C8A24E]/10 px-4 py-3 text-xs font-medium text-neutral-900 dark:text-stone-100">
          {actionMsg}
        </div>
      )}

      {/* Order Summary & Lifecycle Stepper */}
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#C8A24E]">
              {lang === 'ar' ? order.serviceNameAr : order.serviceNameEn}
            </p>
            <h1 className="text-xl sm:text-2xl font-bold text-neutral-950 dark:text-stone-100">
              {order.title}
            </h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed max-w-2xl">
              {order.description}
            </p>
          </div>

          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 min-w-[210px] space-y-2 text-xs">
            <div className="flex justify-between gap-4">
              <span className="text-neutral-500">{lang === 'ar' ? 'العميل' : 'Customer'}</span>
              <span className="font-semibold">{order.customerName}</span>
            </div>
            {order.technicianName && (
              <div className="flex justify-between gap-4">
                <span className="text-neutral-500">{lang === 'ar' ? 'الفني المعين' : 'Technician'}</span>
                <span className="font-semibold text-[#C8A24E]">{order.technicianName}</span>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <span className="text-neutral-500">{lang === 'ar' ? 'الموعد' : 'Schedule'}</span>
              <span className="font-mono-num">{new Date(order.scheduledAt).toLocaleString()}</span>
            </div>
            {order.budgetEstimate ? (
              <div className="flex justify-between gap-4">
                <span className="text-neutral-500">{lang === 'ar' ? 'الميزانية التقديرية' : 'Est. Budget'}</span>
                <span className="font-mono-num">{order.budgetEstimate} {t.common.currency}</span>
              </div>
            ) : null}
            {order.finalPrice ? (
              <div className="flex justify-between gap-4 pt-1 border-t border-neutral-200 dark:border-neutral-800">
                <span className="font-semibold">{lang === 'ar' ? 'السعر المعتمد' : 'Agreed Price'}</span>
                <span className="font-mono-num font-bold text-[#C8A24E]">
                  {order.finalPrice} {t.common.currency}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-600 dark:text-neutral-400">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-[#C8A24E]" />
            {order.address} ({order.lat.toFixed(4)}, {order.lng.toFixed(4)})
          </span>
        </div>

        {/* Uploaded Media */}
        {Array.isArray(order.mediaUrls) && order.mediaUrls.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-neutral-500">
              {lang === 'ar' ? 'المرفقات المرفوعة' : 'Uploaded Site Media'}
            </p>
            <div className="flex flex-wrap gap-3">
              {order.mediaUrls.map((rawUrl, idx) => {
                const url = resolveUploadUrl(rawUrl);
                return url.endsWith('.mp4') ? (
                  <video key={idx} src={url} controls className="h-28 w-44 rounded-lg border border-neutral-200 dark:border-neutral-800 object-cover" />
                ) : (
                  <a key={idx} href={url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={url}
                      alt={`Attachment ${idx + 1}`}
                      className="h-28 w-36 rounded-lg border border-neutral-200 dark:border-neutral-800 object-cover"
                    />
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* Lifecycle Progress Bar */}
        {order.status !== 'CANCELLED' ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 pt-2">
            {ORDER_LIFECYCLE_STEPS.map((step, i) => {
              const reached = activeLifecycleIndex >= i;
              return (
                <div
                  key={step}
                  className={`rounded-lg border px-2.5 py-2 text-[11px] font-medium transition-colors ${
                    reached
                      ? 'border-[#C8A24E] bg-[#C8A24E]/10 text-[#C8A24E]'
                      : 'border-neutral-200 dark:border-neutral-800 text-neutral-400'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono-num">{i + 1}</span>
                    {reached && <Check className="w-3.5 h-3.5" />}
                  </div>
                  <p className="mt-1 truncate">{tStatus(step, lang)}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs font-semibold text-red-500">
            {tStatus('CANCELLED', lang)}
          </div>
        )}

        {/* Action Controls Strip */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-neutral-200 dark:border-neutral-800">
          {isCustomer && ['NEW', 'PENDING', 'ACCEPTED'].includes(order.status) && (
            <button
              type="button"
              onClick={() => void handleCancelOrder()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-red-500/40 text-red-500 text-xs font-semibold hover:bg-red-500/10 cursor-pointer"
            >
              <XCircle className="w-4 h-4" />
              {lang === 'ar' ? 'إلغاء الطلب' : 'Cancel Order'}
            </button>
          )}

          {isAssignedTech && order.status === 'ACCEPTED' && (
            <button
              type="button"
              onClick={() => void handleStatusChange('TECHNICIAN_ON_THE_WAY')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#C8A24E] text-black text-xs font-bold hover:bg-[#DFBE6F] cursor-pointer"
            >
              <Navigation className="w-4 h-4" />
              {lang === 'ar' ? 'بدء التحرك إلى موقع العميل' : 'Mark On The Way'}
            </button>
          )}

          {isAssignedTech && order.status === 'TECHNICIAN_ON_THE_WAY' && (
            <button
              type="button"
              onClick={() => void handleStatusChange('IN_PROGRESS')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#C8A24E] text-black text-xs font-bold hover:bg-[#DFBE6F] cursor-pointer"
            >
              {lang === 'ar' ? 'بدء تنفيذ العمل' : 'Start Work (In Progress)'}
            </button>
          )}

          {isAssignedTech && order.status === 'IN_PROGRESS' && (
            <button
              type="button"
              onClick={() => void handleStatusChange('COMPLETED')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-black text-xs font-bold hover:bg-emerald-400 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              {lang === 'ar' ? 'تأكيد إتمام العمل' : 'Mark Work Completed'}
            </button>
          )}

          {isAssignedTech && ['ACCEPTED', 'TECHNICIAN_ON_THE_WAY', 'IN_PROGRESS'].includes(order.status) && (
            <button
              type="button"
              onClick={toggleLiveGps}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-xs font-semibold cursor-pointer ${
                sharingGps
                  ? 'border-emerald-500 bg-emerald-500/15 text-emerald-500'
                  : 'border-neutral-300 dark:border-neutral-700'
              }`}
            >
              <MapPin className="w-4 h-4" />
              {sharingGps
                ? lang === 'ar'
                  ? 'جاري بث الموقع الحي (إيقاف)'
                  : 'Live GPS Active (Stop)'
                : lang === 'ar'
                ? 'مشاركة موقعي الحي للعميل'
                : 'Share Live GPS Location'}
            </button>
          )}

          {(isCustomer || isAssignedTech) && (
            <button
              type="button"
              onClick={() => setShowComplaint((p) => !p)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs font-medium hover:border-[#C8A24E] cursor-pointer"
            >
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              {lang === 'ar' ? 'تقديم شكوى / نزاع' : 'Report Issue / Complaint'}
            </button>
          )}
        </div>
      </div>

      {/* Complaint Drawer/Form */}
      {showComplaint && (
        <form
          onSubmit={handleSubmitComplaint}
          className="rounded-2xl border border-amber-500/30 bg-white dark:bg-[#131316] p-6 space-y-4"
        >
          <h3 className="font-bold text-sm">
            {lang === 'ar' ? 'تقديم شكوى رسمية لإدارة InteriorX' : 'Submit Formal Complaint to Admin'}
          </h3>
          <input
            required
            value={cmpSubject}
            onChange={(e) => setCmpSubject(e.target.value)}
            placeholder={lang === 'ar' ? 'عنوان الشكوى' : 'Complaint Subject'}
            className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
          />
          <textarea
            required
            rows={3}
            value={cmpDesc}
            onChange={(e) => setCmpDesc(e.target.value)}
            placeholder={lang === 'ar' ? 'تفاصيل المشكلة...' : 'Detailed description...'}
            className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
          />
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submittingCmp}
              className="px-5 py-2 rounded-lg bg-[#C8A24E] text-black text-xs font-bold cursor-pointer"
            >
              {t.common.submit}
            </button>
            <button
              type="button"
              onClick={() => setShowComplaint(false)}
              className="px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs cursor-pointer"
            >
              {t.common.cancel}
            </button>
          </div>
        </form>
      )}

      {/* Pending Price Revision Approval (Customer) */}
      {order.pendingPriceRevision?.status === 'PENDING' && (
        <div className="rounded-2xl border border-[#C8A24E] bg-[#C8A24E]/10 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-bold text-[#C8A24E]">
              {lang === 'ar' ? 'طلب تعديل السعر النهائي' : 'Technician Requested Price Revision'}
            </p>
            <p className="text-xs text-neutral-800 dark:text-stone-200">
              {lang === 'ar' ? 'السعر المقترح:' : 'Proposed Amount:'}{' '}
              <span className="font-mono-num font-bold">
                {order.pendingPriceRevision.requestedAmount} {t.common.currency}
              </span>{' '}
              — {order.pendingPriceRevision.reason}
            </p>
          </div>
          {isCustomer && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void handleRespondPriceRevision(true)}
                className="px-4 py-2 rounded-lg bg-[#C8A24E] text-black text-xs font-bold cursor-pointer"
              >
                {t.common.approve}
              </button>
              <button
                type="button"
                onClick={() => void handleRespondPriceRevision(false)}
                className="px-4 py-2 rounded-lg border border-neutral-400 text-xs font-semibold cursor-pointer"
              >
                {t.common.reject}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Technician Price Revision Request Form */}
      {isAssignedTech &&
        ['ACCEPTED', 'TECHNICIAN_ON_THE_WAY', 'IN_PROGRESS'].includes(order.status) &&
        order.pendingPriceRevision?.status !== 'PENDING' && (
          <form
            onSubmit={handleRequestPriceRevision}
            className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-5 space-y-3"
          >
            <h3 className="text-sm font-bold flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-[#C8A24E]" />
              {lang === 'ar' ? 'طلب تعديل السعر (يتطلب موافقة العميل)' : 'Request Price Revision (Requires Customer Approval)'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="number"
                min={1}
                required
                value={revAmount}
                onChange={(e) => setRevAmount(e.target.value)}
                placeholder={lang === 'ar' ? 'السعر الجديد (ج.م)' : 'New Price (EGP)'}
                className="px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
              />
              <input
                required
                value={revReason}
                onChange={(e) => setRevReason(e.target.value)}
                placeholder={lang === 'ar' ? 'السبب (مثال: خامات إضافية)' : 'Reason (e.g. extra materials)'}
                className="sm:col-span-2 px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={submittingRev}
              className="px-4 py-2 rounded-lg border border-[#C8A24E] text-[#C8A24E] text-xs font-bold hover:bg-[#C8A24E]/10 cursor-pointer"
            >
              {lang === 'ar' ? 'إرسال طلب التعديل' : 'Send Revision Request'}
            </button>
          </form>
        )}

      {/* Live Map Route Tracking */}
      {order.technicianId && ['ACCEPTED', 'TECHNICIAN_ON_THE_WAY', 'IN_PROGRESS'].includes(order.status) && (
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold flex items-center gap-2">
              <Navigation className="w-4 h-4 text-[#C8A24E]" />
              {lang === 'ar' ? 'التتبع الحي لموقع الفني ومسار الوصول' : 'Live Technician Tracking & Route ETA'}
            </h2>
            {techLocation && (
              <span className="text-xs font-mono-num text-neutral-500">
                {lang === 'ar' ? 'آخر تحديث:' : 'Updated:'}{' '}
                {new Date(techLocation.updatedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
          <OrderLiveTrackingMap
            destination={{ lat: order.lat, lng: order.lng }}
            technicianCoords={
              techLocation ? { lat: techLocation.lat, lng: techLocation.lng } : null
            }
          />
        </div>
      )}

      {/* Technician Submit Quote Form (for NEW / PENDING orders) */}
      {isTechRole && !order.technicianId && ['NEW', 'PENDING'].includes(order.status) && (
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-4">
          <h2 className="text-base font-bold">
            {lang === 'ar' ? 'تقديم عرض سعر للعميل' : 'Submit Binding Quote'}
          </h2>
          {myOffer ? (
            <div className="rounded-xl border border-[#C8A24E]/40 bg-[#C8A24E]/5 p-4 text-xs space-y-1">
              <p className="font-bold text-[#C8A24E]">
                {lang === 'ar' ? 'عرضك المقدم:' : 'Your Submitted Quote:'}{' '}
                <span className="font-mono-num">{myOffer.amount} {t.common.currency}</span>
              </p>
              <p className="text-neutral-500">
                {lang === 'ar' ? 'المدة المقدرة:' : 'Est. Days:'} {myOffer.estimatedDays} · {myOffer.status}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmitQuote} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">
                    {lang === 'ar' ? 'قيمة العرض (ج.م)' : 'Quote Amount (EGP)'}
                  </label>
                  <input
                    type="number"
                    min={50}
                    required
                    value={quoteAmount}
                    onChange={(e) => setQuoteAmount(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">
                    {lang === 'ar' ? 'مدة التنفيذ المتوقعة (أيام)' : 'Estimated Duration (Days)'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={quoteDays}
                    onChange={(e) => setQuoteDays(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
                  />
                </div>
              </div>
              <textarea
                rows={3}
                value={quoteNotes}
                onChange={(e) => setQuoteNotes(e.target.value)}
                placeholder={lang === 'ar' ? 'تفاصيل العرض والخامات والملاحظات الفنية...' : 'Scope of work, materials included, notes...'}
                className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
              />
              <button
                type="submit"
                disabled={submittingQuote}
                className="px-6 py-2.5 rounded-lg bg-[#C8A24E] text-black text-xs font-bold hover:bg-[#DFBE6F] cursor-pointer"
              >
                {submittingQuote ? t.common.loading : lang === 'ar' ? 'إرسال عرض السعر' : 'Submit Quote'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Offers Comparison List (Customer View) */}
      {(isCustomer || offers.length > 0) && (
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">
              {lang === 'ar' ? 'عروض الأسعار المستلمة' : 'Received Technician Quotes'}
            </h2>
            <span className="text-xs font-mono-num text-neutral-500">{offers.length}</span>
          </div>

          {offers.length === 0 ? (
            <p className="text-xs text-neutral-500">
              {lang === 'ar' ? 'لم يقم الفنيون بتقديم عروض بعد.' : 'No technician quotes received yet.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {offers.map((off) => (
                <div
                  key={off.id}
                  className={`rounded-xl border p-4 space-y-3 ${
                    off.status === 'ACCEPTED'
                      ? 'border-[#C8A24E] bg-[#C8A24E]/10'
                      : 'border-neutral-200 dark:border-neutral-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-sm">{off.technicianName}</p>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        ★ {(off.technicianRating || 0).toFixed(1)} · {off.technicianPlan || 'FREE'} ·{' '}
                        <span className="font-mono-num">{off.estimatedDays}</span>{' '}
                        {lang === 'ar' ? 'أيام' : 'days'}
                      </p>
                    </div>
                    <p className="text-base font-bold font-mono-num text-[#C8A24E]">
                      {off.amount} {t.common.currency}
                    </p>
                  </div>
                  {off.notes && (
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                      {off.notes}
                    </p>
                  )}
                  <div className="flex items-center justify-between pt-2 border-t border-neutral-200/70 dark:border-neutral-800">
                    <span className="text-[11px] font-semibold text-neutral-500">{off.status}</span>
                    {isCustomer && ['NEW', 'PENDING'].includes(order.status) && off.status === 'PENDING' && (
                      <button
                        type="button"
                        onClick={() => void handleAcceptOffer(off.id)}
                        className="px-4 py-1.5 rounded-lg bg-[#C8A24E] text-black text-xs font-bold hover:bg-[#DFBE6F] cursor-pointer"
                      >
                        {lang === 'ar' ? 'قبول العرض' : 'Accept Quote'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Technician / Admin Cash Receipt Confirmation */}
      {(isAssignedTech || isAdmin) && order.status === 'COMPLETED' && (
        <div className="rounded-2xl border border-[#C8A24E]/50 bg-[#C8A24E]/10 p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1 text-xs">
            <p className="font-bold text-[#C8A24E]">
              {order.cashPaymentPending
                ? lang === 'ar'
                  ? 'طلب العميل تأكيد الدفع نقداً في الموقع'
                  : 'Customer Requested Cash On-Site Confirmation'
                : lang === 'ar'
                ? 'تسوية نقدية في الموقع'
                : 'On-Site Cash Settlement'}
            </p>
            <p className="text-neutral-700 dark:text-stone-300">
              {lang === 'ar'
                ? `المبلغ المتفق عليه: ${order.finalPrice} ج.م. عند استلامك المبلغ نقداً من العميل اضغط لتأكيد التسوية وإصدار الفاتورة.`
                : `Agreed amount: ${order.finalPrice} EGP. Confirm once you receive cash directly from the customer.`}
            </p>
          </div>
          <button
            type="button"
            disabled={paying}
            onClick={() => void handleConfirmCashReceived()}
            className="px-5 py-2.5 rounded-lg bg-[#C8A24E] text-black text-xs font-bold hover:bg-[#DFBE6F] cursor-pointer"
          >
            {paying
              ? t.common.loading
              : lang === 'ar'
              ? 'تأكيد استلام المبلغ نقداً'
              : 'Confirm Cash Received'}
          </button>
        </div>
      )}

      {/* Payment Settlement Panel (when COMPLETED and awaiting payment) */}
      {isCustomer && order.status === 'COMPLETED' && (
        <div className="rounded-2xl border border-[#C8A24E]/50 bg-white dark:bg-[#131316] p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold">
                {lang === 'ar' ? 'تسوية الدفع وإصدار الفاتورة الرسمية' : 'Payment Settlement & Invoicing'}
              </h2>
              <p className="text-xs text-neutral-500 mt-1">
                {lang === 'ar'
                  ? `المبلغ المستحق: ${order.finalPrice} ج.م · رصيد محفظتك الحالي: ${wallet?.balance ?? 0} ج.م`
                  : `Amount Due: ${order.finalPrice} EGP · Current Wallet Balance: ${wallet?.balance ?? 0} EGP`}
              </p>
            </div>
          </div>

          {order.cashPaymentPending && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs">
              <p className="font-bold text-amber-500">
                {lang === 'ar'
                  ? 'بانتظار تأكيد الفني استلام المبلغ نقداً في الموقع...'
                  : 'Awaiting technician confirmation of on-site cash receipt...'}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <button
              type="button"
              disabled={paying}
              onClick={() => void handlePayWallet()}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#C8A24E] text-black text-xs font-bold hover:bg-[#DFBE6F] cursor-pointer"
            >
              <WalletIcon className="w-4 h-4" />
              {lang === 'ar' ? 'الدفع من رصيد المحفظة' : 'Pay via Wallet'}
            </button>

            <button
              type="button"
              disabled={paying}
              onClick={() => void handlePayCashRequest()}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-[#C8A24E] text-[#C8A24E] text-xs font-bold hover:bg-[#C8A24E]/10 cursor-pointer"
            >
              <DollarSign className="w-4 h-4" />
              {lang === 'ar' ? 'الدفع نقداً للفني في الموقع' : 'Pay Cash On-Site'}
            </button>

            {integrations.paymobConfigured && (
              <button
                type="button"
                disabled={paying}
                onClick={() => void handlePaymobInit()}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-neutral-300 dark:border-neutral-700 hover:border-[#C8A24E] text-xs font-semibold cursor-pointer"
              >
                <CreditCard className="w-4 h-4 text-[#C8A24E]" />
                {lang === 'ar' ? 'الدفع عبر Paymob' : 'Pay via Paymob'}
              </button>
            )}

            {integrations.fawryConfigured && (
              <button
                type="button"
                disabled={paying}
                onClick={() => void handleFawryInit()}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-neutral-300 dark:border-neutral-700 hover:border-[#C8A24E] text-xs font-semibold cursor-pointer"
              >
                <CreditCard className="w-4 h-4 text-[#C8A24E]" />
                {lang === 'ar' ? 'الدفع عبر فوري Fawry' : 'Pay via Fawry'}
              </button>
            )}
          </div>

          {paymobIframeUrl && (
            <div className="rounded-xl overflow-hidden border border-neutral-300 dark:border-neutral-700">
              <iframe src={paymobIframeUrl} title="Paymob Checkout" className="w-full h-[520px] bg-white" />
            </div>
          )}

          {fawryRef && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-xs space-y-1">
              <p className="font-bold">
                {lang === 'ar' ? 'رقم مرجع فوري (PayAtFawry):' : 'Fawry Reference Number:'}{' '}
                <span className="font-mono-num text-base">{fawryRef.referenceNumber}</span>
              </p>
              <p className="text-neutral-600 dark:text-neutral-300">
                {lang === 'ar'
                  ? 'يتم تأكيد الطلب تلقائياً فور سداد المرجع عبر أقرب منفذ فوري.'
                  : 'Order will automatically settle upon payment at any Fawry terminal.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Official Invoice Card */}
      {invoice && (
        <div className="rounded-2xl border border-emerald-500/40 bg-white dark:bg-[#131316] p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold flex items-center gap-2 text-emerald-500">
              <FileText className="w-4 h-4" />
              {lang === 'ar' ? 'فاتورة معتمدة ومدفوعة' : 'Verified Paid Invoice'}
            </h3>
            <span className="font-mono-num text-xs font-bold">{invoice.invoiceNumber}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2 border-t border-neutral-200 dark:border-neutral-800">
            <div>
              <p className="text-neutral-500">{lang === 'ar' ? 'قيمة الخدمة' : 'Subtotal'}</p>
              <p className="font-mono-num font-bold mt-0.5">{invoice.subtotal} {t.common.currency}</p>
            </div>
            <div>
              <p className="text-neutral-500">{lang === 'ar' ? 'عمولة المنصة' : 'Platform Fee'}</p>
              <p className="font-mono-num font-bold mt-0.5">{invoice.platformFee} {t.common.currency}</p>
            </div>
            <div>
              <p className="text-neutral-500">{lang === 'ar' ? 'الإجمالي المدفوع' : 'Total Paid'}</p>
              <p className="font-mono-num font-bold text-[#C8A24E] mt-0.5">{invoice.total} {t.common.currency}</p>
            </div>
            <div>
              <p className="text-neutral-500">{lang === 'ar' ? 'بوابة الدفع' : 'Provider'}</p>
              <p className="font-semibold mt-0.5">{invoice.paymentProvider}</p>
            </div>
          </div>
        </div>
      )}

      {/* Customer Review Form */}
      {isCustomer && (order.status === 'COMPLETED' || order.status === 'PAID') && !order.reviewed && (
        <form
          onSubmit={handleSubmitReview}
          className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-4"
        >
          <h3 className="text-sm font-bold">
            {lang === 'ar' ? 'تقييم أداء الفني' : 'Rate Technician Performance'}
          </h3>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                className="p-1 cursor-pointer"
              >
                <Star
                  className={`w-6 h-6 ${
                    n <= rating ? 'text-[#C8A24E] fill-[#C8A24E]' : 'text-neutral-400'
                  }`}
                />
              </button>
            ))}
          </div>
          <textarea
            rows={2}
            value={reviewComment}
            onChange={(e) => setReviewComment(e.target.value)}
            placeholder={lang === 'ar' ? 'اكتب تقييمك لجودة التنفيذ والالتزام بالمواعيد...' : 'Share feedback on quality and punctuality...'}
            className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
          />
          <button
            type="submit"
            disabled={submittingReview}
            className="px-5 py-2 rounded-lg bg-[#C8A24E] text-black text-xs font-bold cursor-pointer"
          >
            {lang === 'ar' ? 'نشر التقييم' : 'Publish Review'}
          </button>
        </form>
      )}

      {/* Real-Time Order Chat & Status Audit Log */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 flex flex-col h-[460px]">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-800">
            <h2 className="text-sm font-bold flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#C8A24E]" />
              {lang === 'ar' ? 'المحادثة المباشرة مع الطرف الآخر' : 'Direct Real-Time Order Chat'}
            </h2>
            <span className="text-[11px] text-neutral-500">
              {canChat
                ? lang === 'ar'
                  ? 'متصل لحظياً'
                  : 'Real-Time Active'
                : lang === 'ar'
                ? 'تُفتح المحادثة بعد قبول العرض'
                : 'Unlocks upon quote acceptance'}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto py-4 space-y-3">
            {messages.length === 0 ? (
              <p className="text-xs text-neutral-500 text-center pt-10">
                {canChat
                  ? lang === 'ar'
                    ? 'لا توجد رسائل بعد. ابدأ المحادثة هنا.'
                    : 'No messages yet. Start the conversation below.'
                  : lang === 'ar'
                  ? 'المحادثة ستكون متاحة فور تعيين الفني.'
                  : 'Chat becomes available once a technician is assigned.'}
              </p>
            ) : (
              messages.map((m) => {
                const isMine = m.senderId === userRecord?.uid;
                const isReadByOther = Array.isArray(m.readBy) && m.readBy.length > 1;
                return (
                  <div key={m.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`max-w-[82%] rounded-xl px-3.5 py-2.5 text-xs space-y-1.5 ${
                        isMine
                          ? 'bg-[#C8A24E] text-black'
                          : 'bg-neutral-100 dark:bg-[#1C1C21] text-neutral-900 dark:text-stone-100'
                      }`}
                    >
                      <p className="font-bold text-[10px] opacity-75">{m.senderName}</p>
                      {m.imageUrl && (
                        <a href={resolveUploadUrl(m.imageUrl)} target="_blank" rel="noopener noreferrer">
                          <img src={resolveUploadUrl(m.imageUrl)} alt="Chat attachment" className="max-h-44 rounded-lg object-cover" />
                        </a>
                      )}
                      {m.text && <p className="leading-relaxed whitespace-pre-wrap">{m.text}</p>}
                      <div className="flex items-center justify-end gap-1 text-[10px] opacity-70 font-mono-num">
                        <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {isMine && (isReadByOther ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          {canChat && (
            <form onSubmit={handleSendMessage} className="pt-3 border-t border-neutral-200 dark:border-neutral-800 space-y-2">
              {chatImage && (
                <div className="flex items-center gap-2 text-xs text-[#C8A24E]">
                  <ImageIcon className="w-4 h-4" />
                  <span>{lang === 'ar' ? 'صورة مرفقة جاهزة للإرسال' : 'Image attached'}</span>
                  <button type="button" onClick={() => setChatImage('')} className="text-red-500 underline cursor-pointer">
                    {t.common.delete}
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <label className="p-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:border-[#C8A24E] cursor-pointer shrink-0">
                  <Paperclip className="w-4 h-4" />
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => void handleChatImageUpload(e)}
                    className="hidden"
                  />
                </label>
                <input
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  placeholder={
                    uploadingChatImg
                      ? lang === 'ar'
                        ? 'جاري رفع الصورة...'
                        : 'Uploading image...'
                      : lang === 'ar'
                      ? 'اكتب رسالتك هنا...'
                      : 'Write a message...'
                  }
                  className="flex-1 px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
                />
                <button
                  type="submit"
                  disabled={sendingMsg || uploadingChatImg}
                  className="p-2.5 rounded-lg bg-[#C8A24E] text-black hover:bg-[#DFBE6F] cursor-pointer shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Status History Audit Log */}
        <div className="lg:col-span-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-6 space-y-4 h-[460px] overflow-y-auto">
          <h2 className="text-sm font-bold flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#C8A24E]" />
            {lang === 'ar' ? 'السجل الزمني لتغييرات حالة الطلب' : 'Order Status Audit History'}
          </h2>
          <div className="space-y-3">
            {history.map((h) => (
              <div key={h.id} className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-[#C8A24E]">{tStatus(h.toStatus, lang)}</span>
                  <span className="font-mono-num text-[11px] text-neutral-500">
                    {new Date(h.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-neutral-600 dark:text-neutral-400">{h.note}</p>
                <p className="text-[11px] text-neutral-500">Role: {h.changedByRole}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
