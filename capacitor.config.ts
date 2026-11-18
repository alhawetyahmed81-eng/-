import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.interiorx.app',
  appName: 'InteriorX',
  webDir: 'dist',
  backgroundColor: '#0A0A0B',
  server: {
    androidScheme: 'https',
    allowNavigation: [
      '*.firebaseapp.com',
      'accounts.google.com',
      '*.google.com',
      '*.googleapis.com',
      '*.googleusercontent.com',
      '*.run.app',
    ],
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1800,
      launchAutoHide: true,
      backgroundColor: '#0A0A0B',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0A0A0B',
      overlaysWebView: false,
    },
  },
};

export default config;
