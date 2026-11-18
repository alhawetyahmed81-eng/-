import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { auth, consumeGoogleRedirectResult, signOutFirebase } from '../lib/firebase';
import { apiFetch, resolveWebSocketUrl } from '../lib/api';
import {
  hideNativeSplash,
  registerAndroidBackHandler,
  syncNativeStatusBar,
} from '../lib/capacitor';
import type {
  IntegrationsStatus,
  Language,
  NotificationRecord,
  PublicCMSContent,
  ServiceCategory,
  SubscriptionPlan,
  ThemeMode,
  UserRecord,
  Wallet,
} from '../types';

interface PlatformStats {
  categoriesCount: number;
  verifiedTechniciansCount: number;
  completedOrdersCount: number;
  activeOrdersCount: number;
}

type WsListener = (event: string, payload: any, orderId?: string) => void;

interface AppContextValue {
  theme: ThemeMode;
  toggleTheme: () => void;
  lang: Language;
  setLang: (lang: Language) => void;
  route: string;
  navigate: (to: string) => void;
  firebaseUser: FirebaseUser | null;
  authReady: boolean;
  userRecord: UserRecord | null;
  profile: any;
  wallet: Wallet | null;
  isAdmin: boolean;
  needsOnboarding: boolean;
  refreshSession: () => Promise<void>;
  refreshBootstrap: () => Promise<void>;
  logout: () => Promise<void>;
  services: ServiceCategory[];
  plans: SubscriptionPlan[];
  cms: PublicCMSContent | null;
  stats: PlatformStats;
  integrations: IntegrationsStatus;
  mapsApiKey: string;
  gmpQuotaExceeded: boolean;
  notifications: NotificationRecord[];
  unreadCount: number;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  subscribeOrderWs: (orderId: string) => void;
  unsubscribeOrderWs: (orderId: string) => void;
  addWsListener: (fn: WsListener) => () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('ix_theme');
    return saved === 'light' ? 'light' : 'dark';
  });
  const [lang, setLangState] = useState<Language>(() => {
    const saved = localStorage.getItem('ix_lang');
    return saved === 'en' ? 'en' : 'ar';
  });
  const [route, setRoute] = useState<string>(() => window.location.pathname || '/');

  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [userRecord, setUserRecord] = useState<UserRecord | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  const [services, setServices] = useState<ServiceCategory[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [cms, setCms] = useState<PublicCMSContent | null>(null);
  const [stats, setStats] = useState<PlatformStats>({
    categoriesCount: 14,
    verifiedTechniciansCount: 0,
    completedOrdersCount: 0,
    activeOrdersCount: 0,
  });
  const [integrations, setIntegrations] = useState<IntegrationsStatus>({
    googleMapsConfigured: false,
    paymobConfigured: false,
    fawryConfigured: false,
    fcmVapidConfigured: false,
    firebaseAdminConfigured: true,
  });
  const [mapsApiKey, setMapsApiKey] = useState('');
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const wsListenersRef = useRef<Set<WsListener>>(new Set());
  const routeRef = useRef<string>(route);
  routeRef.current = route;

  // Sync theme to <html> & Android StatusBar
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('ix_theme', theme);
    void syncNativeStatusBar(theme);
  }, [theme]);

  // Sync language & direction to <html>
  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = lang === 'ar' ? 'rtl' : 'ltr';
    localStorage.setItem('ix_lang', lang);
  }, [lang]);

  // Listen for Google Maps quota exceeded event
  useEffect(() => {
    const handler = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handler);
    return () => window.removeEventListener('gmp-quota-exceeded', handler);
  }, []);

  // Browser history navigation
  useEffect(() => {
    const onPop = () => setRoute(window.location.pathname || '/');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: string) => {
    if (to !== window.location.pathname) {
      window.history.pushState({}, '', to);
    }
    setRoute(to);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Android hardware back button handling
  useEffect(() => {
    return registerAndroidBackHandler(() => routeRef.current, navigate);
  }, [navigate]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
  }, []);

  const refreshBootstrap = useCallback(async () => {
    try {
      const [boot, cfg] = await Promise.all([
        apiFetch<any>('/api/public/bootstrap'),
        apiFetch<any>('/api/config/public'),
      ]);
      if (Array.isArray(boot?.services)) setServices(boot.services);
      if (Array.isArray(boot?.plans)) setPlans(boot.plans);
      if (boot?.cms) setCms(boot.cms);
      if (boot?.stats) setStats(boot.stats);
      if (boot?.integrations) setIntegrations(boot.integrations);
      const envKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
      setMapsApiKey(envKey || cfg?.mapsApiKey || '');
    } catch (err) {
      console.error('Failed to load bootstrap data:', err);
    }
  }, []);

  useEffect(() => {
    void refreshBootstrap();
  }, [refreshBootstrap]);

  const refreshSession = useCallback(async () => {
    const current = auth.currentUser;
    if (!current) {
      setUserRecord(null);
      setProfile(null);
      setWallet(null);
      setIsAdmin(false);
      setNeedsOnboarding(false);
      setNotifications([]);
      return;
    }

    try {
      const me = await apiFetch<any>('/api/auth/me');
      if (me?.registered) {
        setUserRecord(me.user);
        setProfile(me.profile || null);
        setWallet(me.wallet || null);
        setIsAdmin(Boolean(me.isAdmin));
        setNeedsOnboarding(false);
        const notifs = await apiFetch<NotificationRecord[]>('/api/notifications');
        if (Array.isArray(notifs)) setNotifications(notifs);
      } else {
        setUserRecord(null);
        setProfile(null);
        setWallet(null);
        setIsAdmin(Boolean(me?.isAdmin));
        setNeedsOnboarding(true);
      }
    } catch (err) {
      console.error('Session load failed:', err);
    }
  }, []);

  useEffect(() => {
    void consumeGoogleRedirectResult();
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        await refreshSession();
      } else {
        setUserRecord(null);
        setProfile(null);
        setWallet(null);
        setIsAdmin(false);
        setNeedsOnboarding(false);
        setNotifications([]);
      }
      setAuthReady(true);
      void hideNativeSplash();
    });
    return () => unsub();
  }, [refreshSession]);

  // Real WebSocket lifecycle bound to authenticated session
  useEffect(() => {
    let active = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    async function connectWs() {
      if (!active || !firebaseUser) return;
      try {
        const token = await firebaseUser.getIdToken();
        const ws = new WebSocket(resolveWebSocketUrl(token));
        wsRef.current = ws;

        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data);
            if (msg.event === 'notification:created' && msg.payload) {
              setNotifications((prev) => {
                if (prev.some((n) => n.id === msg.payload.id)) return prev;
                return [msg.payload, ...prev];
              });
            }
            wsListenersRef.current.forEach((fn) => fn(msg.event, msg.payload, msg.orderId));
          } catch {
            // ignore
          }
        };

        ws.onclose = () => {
          if (active && firebaseUser) {
            reconnectTimer = setTimeout(connectWs, 4000);
          }
        };
      } catch {
        // ignore
      }
    }

    if (firebaseUser) {
      void connectWs();
    }

    return () => {
      active = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [firebaseUser]);

  const subscribeOrderWs = useCallback((orderId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe_order', orderId }));
    }
  }, []);

  const unsubscribeOrderWs = useCallback((orderId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'unsubscribe_order', orderId }));
    }
  }, []);

  const addWsListener = useCallback((fn: WsListener) => {
    wsListenersRef.current.add(fn);
    return () => {
      wsListenersRef.current.delete(fn);
    };
  }, []);

  const markNotificationRead = useCallback(async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: 'POST' });
    } catch {
      // ignore
    }
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    try {
      await apiFetch('/api/notifications/read-all', { method: 'POST' });
    } catch {
      // ignore
    }
  }, []);

  const logout = useCallback(async () => {
    await signOutFirebase();
    setUserRecord(null);
    setProfile(null);
    setWallet(null);
    setIsAdmin(false);
    setNeedsOnboarding(false);
    setNotifications([]);
    navigate('/');
  }, [navigate]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <AppContext.Provider
      value={{
        theme,
        toggleTheme,
        lang,
        setLang,
        route,
        navigate,
        firebaseUser,
        authReady,
        userRecord,
        profile,
        wallet,
        isAdmin,
        needsOnboarding,
        refreshSession,
        refreshBootstrap,
        logout,
        services,
        plans,
        cms,
        stats,
        integrations,
        mapsApiKey,
        gmpQuotaExceeded,
        notifications,
        unreadCount,
        markNotificationRead,
        markAllNotificationsRead,
        subscribeOrderWs,
        unsubscribeOrderWs,
        addWsListener,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
