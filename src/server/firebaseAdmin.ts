import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import firebaseConfig from '../../firebase-applet-config.json';

if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

export const adminAuth = getAuth();
export const adminDb = getFirestore(firebaseConfig.firestoreDatabaseId);
export const adminMessaging = getMessaging();

export const BOOTSTRAPPED_ADMIN_EMAILS = new Set<string>(
  [
    'alhawetyahmed81@gmail.com',
    ...(process.env.ADMIN_BOOTSTRAP_EMAIL || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  ].map((e) => e.toLowerCase())
);

export async function verifyBearerToken(authHeader?: string): Promise<DecodedIdToken | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;
  try {
    return await adminAuth.verifyIdToken(token);
  } catch (err) {
    console.error('Token verification failed:', err);
    return null;
  }
}

export async function isUserAdmin(uid: string, email?: string, idToken?: string): Promise<boolean> {
  if (email && BOOTSTRAPPED_ADMIN_EMAILS.has(email.toLowerCase())) {
    return true;
  }
  try {
    const { dbGetDoc } = await import('./firestoreStore.ts');
    const adminDoc = await dbGetDoc(`admins/${uid}`, idToken);
    if (adminDoc.exists) return true;
    const userDoc = await dbGetDoc<any>(`users/${uid}`, idToken);
    return Boolean(userDoc.exists && userDoc.data?.role === 'ADMIN');
  } catch {
    return false;
  }
}
