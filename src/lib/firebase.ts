import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { Capacitor } from '@capacitor/core';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.setCustomParameters({ prompt: 'select_account' });

// Preserve authenticated session persistently across app closes & updates
void setPersistence(auth, indexedDBLocalPersistence).catch(() =>
  setPersistence(auth, browserLocalPersistence).catch(() => {})
);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Firebase client appears offline. Verify configuration.');
    }
    return false;
  }
}

void testConnection();

export async function signInWithGoogle() {
  try {
    return await signInWithPopup(auth, googleAuthProvider);
  } catch (err: any) {
    const code = String(err?.code || '');
    if (
      Capacitor.isNativePlatform() ||
      code === 'auth/popup-blocked' ||
      code === 'auth/operation-not-supported-in-this-environment'
    ) {
      await signInWithRedirect(auth, googleAuthProvider);
      return null;
    }
    throw err;
  }
}

export async function consumeGoogleRedirectResult() {
  try {
    return await getRedirectResult(auth);
  } catch {
    return null;
  }
}

export async function signOutFirebase() {
  return signOut(auth);
}

export async function requestFcmPushToken(): Promise<{ token?: string; reason?: string }> {
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!vapidKey) {
    return { reason: 'NOT_CONFIGURED' };
  }
  const supported = await isSupported();
  if (!supported || typeof Notification === 'undefined') {
    return { reason: 'BROWSER_UNSUPPORTED' };
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { reason: 'PERMISSION_DENIED' };
  }
  const messaging = getMessaging(app);
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
  return { token };
}
