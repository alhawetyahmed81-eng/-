import { useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISS_STORAGE_KEY = 'ix_pwa_banner_dismissed';

interface PWAInstallSnapshot {
  deferredPrompt: BeforeInstallPromptEvent | null;
  isInstalled: boolean;
  isIOS: boolean;
  isDismissed: boolean;
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function detectIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua);
}

function readDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(DISMISS_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

let state: PWAInstallSnapshot = {
  deferredPrompt: null,
  isInstalled: detectStandalone(),
  isIOS: detectIOS(),
  isDismissed: readDismissed(),
};

const listeners = new Set<() => void>();
let initialized = false;

function emit() {
  listeners.forEach((fn) => fn());
}

function ensureGlobalListeners() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  state = {
    ...state,
    isInstalled: detectStandalone(),
    isIOS: detectIOS(),
  };

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    // Prevent the browser's default mini-infobar so our custom banner controls the UX
    e.preventDefault();
    state = {
      ...state,
      deferredPrompt: e as BeforeInstallPromptEvent,
    };
    emit();
  });

  window.addEventListener('appinstalled', () => {
    state = {
      ...state,
      deferredPrompt: null,
      isInstalled: true,
    };
    emit();
  });

  const mediaQuery = window.matchMedia('(display-mode: standalone)');
  const onDisplayModeChange = (evt: MediaQueryListEvent) => {
    state = {
      ...state,
      isInstalled: evt.matches || detectStandalone(),
      deferredPrompt: evt.matches ? null : state.deferredPrompt,
    };
    emit();
  };
  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', onDisplayModeChange);
  }
}

// Register immediately at module load so an early beforeinstallprompt event is never missed
ensureGlobalListeners();

export function usePWAInstall() {
  const [snapshot, setSnapshot] = useState<PWAInstallSnapshot>(() => state);

  useEffect(() => {
    ensureGlobalListeners();
    setSnapshot(state);
    const onChange = () => setSnapshot(state);
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  const install = async (): Promise<boolean> => {
    const promptEvent = state.deferredPrompt;
    if (!promptEvent) return false;

    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      // BeforeInstallPromptEvent can only be invoked once
      state = {
        ...state,
        deferredPrompt: null,
        isInstalled: outcome === 'accepted' ? true : state.isInstalled,
      };
      emit();
      return outcome === 'accepted';
    } catch {
      state = { ...state, deferredPrompt: null };
      emit();
      return false;
    }
  };

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(DISMISS_STORAGE_KEY, '1');
    } catch {
      // ignore storage failures
    }
    state = { ...state, isDismissed: true };
    emit();
  };

  return {
    isInstallable: !snapshot.isInstalled && snapshot.deferredPrompt !== null,
    isInstalled: snapshot.isInstalled,
    isIOS: snapshot.isIOS,
    isDismissed: snapshot.isDismissed,
    install,
    dismiss,
  };
}
