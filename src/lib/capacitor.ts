import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';

export function isCapacitorNative(): boolean {
  return Capacitor.isNativePlatform();
}

export async function syncNativeStatusBar(theme: 'dark' | 'light'): Promise<void> {
  if (!isCapacitorNative()) return;
  try {
    await StatusBar.setStyle({
      style: theme === 'dark' ? Style.Dark : Style.Light,
    });
    await StatusBar.setBackgroundColor({
      color: theme === 'dark' ? '#0A0A0B' : '#FAFAF9',
    });
  } catch {
    // Ignore on platforms where StatusBar API is unavailable
  }
}

export async function hideNativeSplash(): Promise<void> {
  if (!isCapacitorNative()) return;
  try {
    await SplashScreen.hide({ fadeOutDuration: 300 });
  } catch {
    // Ignore
  }
}

export function registerAndroidBackHandler(
  getCurrentRoute: () => string,
  navigateBackOrHome: (to: string) => void
): () => void {
  if (!isCapacitorNative()) {
    return () => {};
  }

  let removeListener: (() => Promise<void>) | null = null;
  let lastBackPressedAt = 0;

  void CapApp.addListener('backButton', ({ canGoBack }) => {
    const current = getCurrentRoute();

    if (canGoBack && window.history.length > 1 && current !== '/') {
      window.history.back();
      return;
    }

    if (current !== '/') {
      navigateBackOrHome('/');
      return;
    }

    const now = Date.now();
    if (now - lastBackPressedAt < 2000) {
      void CapApp.exitApp();
    } else {
      lastBackPressedAt = now;
      window.dispatchEvent(new CustomEvent('ix-android-exit-hint'));
    }
  }).then((handle) => {
    removeListener = () => handle.remove();
  });

  return () => {
    if (removeListener) {
      void removeListener();
    }
  };
}
