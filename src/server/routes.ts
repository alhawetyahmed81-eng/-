import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  adminMessaging,
  verifyBearerToken,
  isUserAdmin,
  BOOTSTRAPPED_ADMIN_EMAILS,
} from './firebaseAdmin.ts';
import {
  dbGetDoc,
  dbQueryCollection,
  dbSetDoc,
  dbUpdateDoc,
  dbDeleteDoc,
  incrementVal,
  arrayUnionVal,
  probeAdminSdkAccess,
} from './firestoreStore.ts';
import {
  ensureSystemSeedData,
  INITIAL_CMS,
  INITIAL_GLOBAL_SETTINGS,
  INITIAL_PLANS,
  INITIAL_SERVICES,
} from './seed.ts';
import { broadcastToUser, broadcastToOrder, broadcastToAdmins } from './ws.ts';
import type {
  OrderStatus,
  UserRecord,
  Order,
  PlatformSettings,
  ServiceCategory,
  SubscriptionPlanId,
} from '../types/index.ts';

interface AuthedRequest extends Request {
  uid?: string;
  idToken?: string;
  userEmail?: string;
  emailVerified?: boolean;
  userRecord?: UserRecord;
}

const VALID_ID_REGEX = /^[a-zA-Z0-9_\-]+$/;

const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(maxPerMin: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip || 'unknown'}:${req.baseUrl}${req.path}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
      return next();
    }
    if (bucket.count >= maxPerMin) {
      return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }
    bucket.count += 1;
    return next();
  };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function getIntegrationsStatus() {
  const mapsKey = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
  const paymobConfigured = Boolean(
    process.env.PAYMOB_API_KEY &&
      process.env.PAYMOB_INTEGRATION_ID &&
      process.env.PAYMOB_IFRAME_ID &&
      process.env.PAYMOB_HMAC_SECRET
  );
  const fawryConfigured = Boolean(
    process.env.FAWRY_MERCHANT_CODE && process.env.FAWRY_SECURITY_KEY
  );
  const fcmVapidConfigured = Boolean(process.env.VITE_FIREBASE_VAPID_KEY);
  return {
    googleMapsConfigured: Boolean(mapsKey),
    paymobConfigured,
    fawryConfigured,
    fcmVapidConfigured,
    firebaseAdminConfigured: true,
  };
}

async function dispatchNotification(
  params: {
    userId: string;
    type: string;
    titleAr: string;
    titleEn: string;
    bodyAr: string;
    bodyEn: string;
    orderId?: string;
  },
  idToken?: string
) {
  const id = `notif_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const now = new Date().toISOString();
  const doc = {
    id,
    userId: params.userId,
    type: params.type,
    titleAr: params.titleAr,
    titleEn: params.titleEn,
    bodyAr: params.bodyAr,
    bodyEn: params.bodyEn,
    ...(params.orderId ? { orderId: params.orderId } : {}),
    isRead: false,
    createdAt: now,
  };
  await dbSetDoc(`notifications/${id}`, doc, {}, idToken);
  broadcastToUser(params.userId, 'notification:created', doc);

  try {
    const userSnap = await dbGetDoc<any>(`users/${params.userId}`, idToken);
    const fcmToken = userSnap.data?.fcmToken;
    if (fcmToken && typeof fcmToken === 'string') {
      await adminMessaging.send({
        token: fcmToken,
        notification: { title: params.titleAr, body: params.bodyAr },
        data: { type: params.type, orderId: params.orderId || '' },
      });
    }
  } catch {
    // Non-fatal if messaging is unconfigured or token expired
  }
}

async function recordAdminLog(
  adminUid: string,
  adminEmail: string,
  action: string,
  targetCollection: string,
  targetId: string,
  details: string,
  idToken?: string
) {
  const id = `log_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const entry = {
    id,
    adminUid,
    adminEmail,
    action,
    targetCollection,
    targetId,
    details,
    createdAt: new Date().toISOString(),
  };
  await dbSetDoc(`admin_logs/${id}`, entry, {}, idToken);
  broadcastToAdmins('admin:log', entry);
}

async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const decoded = await verifyBearerToken(authHeader);
  if (!decoded) {
    return res.status(401).json({ error: 'Unauthorized: Valid session token required.' });
  }
  const rawToken = authHeader!.slice('Bearer '.length).trim();
  req.uid = decoded.uid;
  req.idToken = rawToken;
  req.userEmail = decoded.email || '';
  req.emailVerified = Boolean(decoded.email_verified);

  try {
    const userSnap = await dbGetDoc<UserRecord>(`users/${decoded.uid}`, rawToken);
    if (userSnap.exists && userSnap.data) {
      const userData = userSnap.data;
      if (userData.status === 'SUSPENDED' && !BOOTSTRAPPED_ADMIN_EMAILS.has(req.userEmail.toLowerCase())) {
        return res.status(403).json({ error: 'Account is suspended. Contact platform administration.' });
      }
      req.userRecord = userData;
    }
  } catch {
    // New user before onboarding doc exists
  }
  return next();
}

async function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.uid) return res.status(401).json({ error: 'Unauthorized' });
  const ok = await isUserAdmin(req.uid, req.userEmail, req.idToken);
  if (!ok) {
    return res.status(403).json({ error: 'Forbidden: Administrator privileges required.' });
  }
  await ensureSystemSeedData(req.idToken);
  return next();
}

const ALLOWED_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEW: ['PENDING', 'CANCELLED'],
  PENDING: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['TECHNICIAN_ON_THE_WAY', 'CANCELLED'],
  TECHNICIAN_ON_THE_WAY: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['PAID'],
  PAID: [],
  CANCELLED: [],
};

export function createApiRouter(uploadsDir: string): Router {
  const router = Router();
  router.use(rateLimit(180));

  // Best-effort seed when Admin SDK credentials exist
  router.use(async (_req, _res, next) => {
    await ensureSystemSeedData();
    next();
  });

  // --- Health & Public Config ---
  router.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'InteriorX API', timestamp: new Date().toISOString() });
  });

  router.get('/config/public', (_req, res) => {
    const mapsApiKey = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
    res.json({
      mapsApiKey,
      integrations: getIntegrationsStatus(),
    });
  });

  router.get('/system/integrations-status', (_req, res) => {
    res.json(getIntegrationsStatus());
  });

  router.get('/public/bootstrap', async (_req, res) => {
    try {
      const now = new Date().toISOString();
      const [servicesRows, plansRows, cmsSnap, techPubRows] = await Promise.all([
        dbQueryCollection<ServiceCategory>('services', {
          where: [{ field: 'isActive', op: '==', value: true }],
        }).catch(() => []),
        dbQueryCollection<any>('subscription_plans', {
          where: [{ field: 'isActive', op: '==', value: true }],
        }).catch(() => []),
        dbGetDoc<any>('platform_settings/public_cms').catch(() => ({ exists: false, id: 'public_cms', data: null })),
        dbQueryCollection<any>('technician_public_profiles', {
          where: [{ field: 'verificationStatus', op: '==', value: 'APPROVED' }],
        }).catch(() => []),
      ]);

      const services =
        servicesRows.length > 0
          ? servicesRows.map((d) => d.data).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
          : INITIAL_SERVICES.map((s) => ({ ...s, updatedAt: now }));

      const plans =
        plansRows.length > 0
          ? plansRows.map((d) => d.data).sort((a, b) => (a.priorityWeight || 0) - (b.priorityWeight || 0))
          : INITIAL_PLANS.map((p) => ({ ...p, updatedAt: now }));

      const cms = cmsSnap.exists && cmsSnap.data ? cmsSnap.data : { ...INITIAL_CMS, updatedAt: now };

      let completedOrders = 0;
      let activeOrders = 0;
      if (await probeAdminSdkAccess()) {
        const ordersRows = await dbQueryCollection<Order>('orders').catch(() => []);
        for (const r of ordersRows) {
          const st = r.data.status;
          if (st === 'COMPLETED' || st === 'PAID') completedOrders += 1;
          else if (st !== 'CANCELLED') activeOrders += 1;
        }
      }

      res.json({
        services,
        allServicesCount: services.length,
        plans,
        cms,
        stats: {
          categoriesCount: services.length,
          verifiedTechniciansCount: techPubRows.length,
          completedOrdersCount: completedOrders,
          activeOrdersCount: activeOrders,
        },
        integrations: getIntegrationsStatus(),
      });
    } catch (err) {
      console.error('Bootstrap error:', err);
      res.status(500).json({ error: 'Failed to load platform data.' });
    }
  });

  // --- Public Services & Technicians ---
  router.get('/services', async (_req, res) => {
    try {
      const rows = await dbQueryCollection<ServiceCategory>('services', {
        where: [{ field: 'isActive', op: '==', value: true }],
      }).catch(() => []);
      const list =
        rows.length > 0
          ? rows.map((r) => r.data).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
          : INITIAL_SERVICES.map((s) => ({ ...s, updatedAt: new Date().toISOString() }));
      res.json(list);
    } catch {
      res.status(500).json({ error: 'Failed to fetch services.' });
    }
  });

  router.get('/services/:slug', async (req, res) => {
    try {
      const slug = req.params.slug;
      if (!VALID_ID_REGEX.test(slug)) return res.status(400).json({ error: 'Invalid service identifier.' });

      let service: ServiceCategory | null = null;
      const docSnap = await dbGetDoc<ServiceCategory>(`services/${slug}`).catch(() => ({
        exists: false,
        id: slug,
        data: null,
      }));
      if (docSnap.exists && docSnap.data) {
        service = docSnap.data;
      } else {
        const fallback = INITIAL_SERVICES.find((s) => s.slug === slug);
        if (fallback) service = { ...fallback, updatedAt: new Date().toISOString() };
      }
      if (!service) return res.status(404).json({ error: 'Service not found.' });

      const techRows = await dbQueryCollection<any>('technician_public_profiles', {
        where: [{ field: 'verificationStatus', op: '==', value: 'APPROVED' }],
      }).catch(() => []);
      const technicians = techRows
        .map((d) => d.data)
        .filter((t) => Array.isArray(t.specialtyIds) && t.specialtyIds.includes(service!.id));

      res.json({ service, technicians });
    } catch {
      res.status(500).json({ error: 'Failed to load service details.' });
    }
  });

  router.get('/technicians', async (req, res) => {
    try {
      const serviceId = typeof req.query.serviceId === 'string' ? req.query.serviceId : '';
      const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
      const area = typeof req.query.area === 'string' ? req.query.area.trim().toLowerCase() : '';
      const lat = req.query.lat ? Number(req.query.lat) : NaN;
      const lng = req.query.lng ? Number(req.query.lng) : NaN;

      const rows = await dbQueryCollection<any>('technician_public_profiles', {
        where: [{ field: 'verificationStatus', op: '==', value: 'APPROVED' }],
      }).catch(() => []);

      const planWeight: Record<string, number> = { PREMIUM: 3, PRO: 2, FREE: 1 };

      let list = rows.map((d) => {
        const t = d.data;
        let distanceKm: number | undefined;
        if (!Number.isNaN(lat) && !Number.isNaN(lng) && typeof t.baseLat === 'number' && typeof t.baseLng === 'number') {
          distanceKm = haversineKm(lat, lng, t.baseLat, t.baseLng);
        }
        return { ...t, distanceKm };
      });

      if (serviceId) {
        list = list.filter((t: any) => Array.isArray(t.specialtyIds) && t.specialtyIds.includes(serviceId));
      }
      if (area) {
        list = list.filter(
          (t: any) =>
            Array.isArray(t.serviceAreas) &&
            t.serviceAreas.some((a: string) => a.toLowerCase().includes(area))
        );
      }
      if (search) {
        list = list.filter(
          (t: any) =>
            (t.displayName || '').toLowerCase().includes(search) ||
            (t.bio || '').toLowerCase().includes(search)
        );
      }

      list.sort((a: any, b: any) => {
        const pDiff = (planWeight[b.subscriptionPlanId] || 1) - (planWeight[a.subscriptionPlanId] || 1);
        if (pDiff !== 0) return pDiff;
        if (typeof a.distanceKm === 'number' && typeof b.distanceKm === 'number') {
          return a.distanceKm - b.distanceKm;
        }
        return (b.ratingAvg || 0) - (a.ratingAvg || 0);
      });

      res.json(list);
    } catch {
      res.status(500).json({ error: 'Failed to search technicians.' });
    }
  });

  router.get('/technicians/:uid/reviews', async (req, res) => {
    try {
      const uid = req.params.uid;
      if (!VALID_ID_REGEX.test(uid)) return res.status(400).json({ error: 'Invalid ID' });
      const rows = await dbQueryCollection<any>('reviews', {
        where: [{ field: 'technicianId', op: '==', value: uid }],
      }).catch(() => []);
      const reviews = rows
        .map((d) => d.data)
        .sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt)));
      res.json(reviews);
    } catch {
      res.status(500).json({ error: 'Failed to load reviews.' });
    }
  });

  router.post('/contact', rateLimit(15), async (req, res) => {
    try {
      const { name, email, phone, subject, message } = req.body || {};
      if (!name || !email || !message) {
        return res.status(400).json({ error: 'Name, email, and message are required.' });
      }
      const id = `msg_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      await dbSetDoc(`contact_messages/${id}`, {
        id,
        name: String(name).slice(0, 120),
        email: String(email).slice(0, 200),
        phone: String(phone || '').slice(0, 32),
        subject: String(subject || 'General Inquiry').slice(0, 200),
        message: String(message).slice(0, 3000),
        status: 'NEW',
        createdAt: new Date().toISOString(),
      });
      res.json({ ok: true, id });
    } catch {
      res.status(500).json({ error: 'Failed to submit inquiry.' });
    }
  });

  // --- Google Maps Server Proxy (CORS-safe Geocoding) ---
  router.get('/maps/geocode', requireAuth, async (req, res) => {
    const key = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || '';
    if (!key) {
      return res.status(503).json({
        configured: false,
        error: 'Google Maps Geocoding key is not configured on the server.',
      });
    }
    const address = typeof req.query.address === 'string' ? req.query.address.trim() : '';
    const latlng = typeof req.query.latlng === 'string' ? req.query.latlng.trim() : '';
    if (!address && !latlng) {
      return res.status(400).json({ error: 'Provide address or latlng parameter.' });
    }
    try {
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      if (address) url.searchParams.set('address', address);
      if (latlng) url.searchParams.set('latlng', latlng);
      url.searchParams.set('key', key);
      const r = await fetch(url.toString());
      const data = await r.json();
      res.json(data);
    } catch {
      res.status(502).json({ error: 'Failed to reach Google Maps Geocoding API.' });
    }
  });

  // --- Secure File Uploads ---
  router.post('/uploads', requireAuth, rateLimit(30), async (req: AuthedRequest, res) => {
    try {
      const { filename, mimeType, dataBase64 } = req.body || {};
      const allowedMimes: Record<string, string> = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp',
        'video/mp4': '.mp4',
        'application/pdf': '.pdf',
      };
      const ext = allowedMimes[String(mimeType)];
      if (!ext || typeof dataBase64 !== 'string') {
        return res.status(400).json({ error: 'Unsupported file type. Allowed: JPG, PNG, WEBP, MP4, PDF.' });
      }
      const cleanBase64 = dataBase64.includes(',') ? dataBase64.split(',')[1] : dataBase64;
      const buf = Buffer.from(cleanBase64, 'base64');
      if (buf.length === 0 || buf.length > 10 * 1024 * 1024) {
        return res.status(400).json({ error: 'File size must be between 1 byte and 10 MB.' });
      }
      const safeName = `${req.uid}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}${ext}`;
      const targetPath = path.join(uploadsDir, path.basename(safeName));
      await fs.promises.writeFile(targetPath, buf);
      res.json({
        url: `/uploads/${safeName}`,
        originalName: path.basename(String(filename || safeName)),
        mimeType,
        sizeBytes: buf.length,
      });
    } catch {
      res.status(500).json({ error: 'File upload failed.' });
    }
  });

  // --- Auth & Profile Onboarding ---
  router.get('/auth/me', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const uid = req.uid!;
      const userSnap = await dbGetDoc<UserRecord>(`users/${uid}`, req.idToken);
      const isAdmin = await isUserAdmin(uid, req.userEmail, req.idToken);

      if (isAdmin) {
        await ensureSystemSeedData(req.idToken);
      }

      if (!userSnap.exists || !userSnap.data) {
        if (isAdmin && req.emailVerified) {
          const now = new Date().toISOString();
          const adminUser: UserRecord = {
            uid,
            email: req.userEmail || '',
            name: 'InteriorX Administrator',
            role: 'ADMIN',
            status: 'ACTIVE',
            preferredLang: 'ar',
            createdAt: now,
            updatedAt: now,
          };
          await dbSetDoc(`users/${uid}`, adminUser, {}, req.idToken);
          await dbSetDoc(`admins/${uid}`, { uid, email: req.userEmail, createdAt: now }, {}, req.idToken);
          return res.json({ registered: true, user: adminUser, isAdmin: true });
        }
        return res.json({ registered: false, isAdmin: false });
      }

      const user = userSnap.data;
      const walletSnap = await dbGetDoc<any>(`wallets/${uid}`, req.idToken);
      let profile: any = null;
      if (user.role === 'CUSTOMER') {
        const p = await dbGetDoc(`customer_profiles/${uid}`, req.idToken);
        profile = p.exists ? p.data : null;
      } else if (user.role === 'TECHNICIAN') {
        const p = await dbGetDoc(`technician_profiles/${uid}`, req.idToken);
        profile = p.exists ? p.data : null;
      }
      return res.json({
        registered: true,
        user,
        profile,
        wallet: walletSnap.exists ? walletSnap.data : null,
        isAdmin: isAdmin || user.role === 'ADMIN',
      });
    } catch (err) {
      console.error('/auth/me error:', err);
      res.status(500).json({ error: 'Failed to load profile.' });
    }
  });

  router.post('/auth/register-profile', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const uid = req.uid!;
      const email = req.userEmail || '';
      const { role, name, phone, preferredLang, bio, specialtyIds, serviceAreas } = req.body || {};

      if (role !== 'CUSTOMER' && role !== 'TECHNICIAN') {
        return res.status(400).json({ error: 'Role must be CUSTOMER or TECHNICIAN.' });
      }
      if (!name || String(name).trim().length < 2) {
        return res.status(400).json({ error: 'Valid display name is required.' });
      }

      const existingUser = await dbGetDoc(`users/${uid}`, req.idToken);
      if (existingUser.exists) {
        return res.status(409).json({ error: 'Account profile already registered.' });
      }

      const now = new Date().toISOString();
      const cleanName = String(name).trim().slice(0, 120);
      const userDoc: UserRecord = {
        uid,
        email,
        name: cleanName,
        phone: String(phone || '').slice(0, 32),
        role,
        status: 'ACTIVE',
        preferredLang: preferredLang === 'en' ? 'en' : 'ar',
        createdAt: now,
        updatedAt: now,
      };

      await dbSetDoc(`users/${uid}`, userDoc, {}, req.idToken);
      await dbSetDoc(
        `wallets/${uid}`,
        {
          uid,
          balance: 0,
          pendingBalance: 0,
          totalEarned: 0,
          totalSpent: 0,
          currency: 'EGP',
          updatedAt: now,
        },
        {},
        req.idToken
      );

      if (role === 'CUSTOMER') {
        await dbSetDoc(
          `customer_profiles/${uid}`,
          {
            uid,
            address: '',
            city: '',
            favoriteTechnicianIds: [],
            updatedAt: now,
          },
          {},
          req.idToken
        );
      } else {
        await dbSetDoc(
          `technician_profiles/${uid}`,
          {
            uid,
            displayName: cleanName,
            bio: String(bio || '').slice(0, 1500),
            nationalIdNumber: '',
            nationalIdDocUrl: '',
            certificateDocUrl: '',
            verificationStatus: 'UNSUBMITTED',
            specialtyIds: Array.isArray(specialtyIds) ? specialtyIds.slice(0, 14) : [],
            serviceAreas: Array.isArray(serviceAreas) ? serviceAreas.slice(0, 20) : [],
            workingHours: { days: ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'], from: '09:00', to: '21:00' },
            subscriptionPlanId: 'FREE',
            isAvailable: true,
            updatedAt: now,
          },
          {},
          req.idToken
        );
        await dbSetDoc(
          `technician_public_profiles/${uid}`,
          {
            uid,
            displayName: cleanName,
            bio: String(bio || '').slice(0, 1500),
            specialtyIds: Array.isArray(specialtyIds) ? specialtyIds.slice(0, 14) : [],
            serviceAreas: Array.isArray(serviceAreas) ? serviceAreas.slice(0, 20) : [],
            workingHours: { days: ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'], from: '09:00', to: '21:00' },
            verificationStatus: 'UNSUBMITTED',
            subscriptionPlanId: 'FREE',
            ratingAvg: 0,
            ratingCount: 0,
            completedJobsCount: 0,
            isAvailable: true,
            updatedAt: now,
          },
          {},
          req.idToken
        );
      }

      res.json({ ok: true, user: userDoc });
    } catch (err) {
      console.error('Register profile error:', err);
      res.status(500).json({ error: 'Registration failed.' });
    }
  });

  router.post('/auth/admin-verify', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const uid = req.uid!;
      const email = (req.userEmail || '').toLowerCase();
      const ok = await isUserAdmin(uid, email, req.idToken);
      if (!ok) {
        return res.status(403).json({
          error: 'Access Denied: This Google account does not have InteriorX Admin authorization.',
        });
      }
      const now = new Date().toISOString();
      await dbSetDoc(`admins/${uid}`, { uid, email, updatedAt: now }, { merge: true }, req.idToken);
      const userSnap = await dbGetDoc(`users/${uid}`, req.idToken);
      if (!userSnap.exists) {
        await dbSetDoc(
          `users/${uid}`,
          {
            uid,
            email,
            name: 'InteriorX Administrator',
            role: 'ADMIN',
            status: 'ACTIVE',
            preferredLang: 'ar',
            createdAt: now,
            updatedAt: now,
          },
          {},
          req.idToken
        );
      }
      await ensureSystemSeedData(req.idToken);
      res.json({ ok: true, isAdmin: true });
    } catch (err) {
      console.error('admin-verify error:', err);
      res.status(500).json({ error: 'Admin verification failed.' });
    }
  });

  router.post('/auth/fcm-token', requireAuth, async (req: AuthedRequest, res) => {
    const { token } = req.body || {};
    if (!token || typeof token !== 'string') return res.status(400).json({ error: 'Invalid token' });
    await dbSetDoc(`users/${req.uid!}`, { fcmToken: token.slice(0, 512) }, { merge: true }, req.idToken);
    res.json({ ok: true });
  });

  // --- Customer Endpoints ---
  router.get('/customer/dashboard', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const uid = req.uid!;
      const [ordersRows, profileSnap, walletSnap, txRows, invRows] = await Promise.all([
        dbQueryCollection<Order>('orders', { where: [{ field: 'customerId', op: '==', value: uid }] }, req.idToken),
        dbGetDoc(`customer_profiles/${uid}`, req.idToken),
        dbGetDoc(`wallets/${uid}`, req.idToken),
        dbQueryCollection<any>('transactions', { where: [{ field: 'uid', op: '==', value: uid }] }, req.idToken),
        dbQueryCollection<any>('invoices', { where: [{ field: 'customerId', op: '==', value: uid }] }, req.idToken),
      ]);

      const orders = ordersRows.map((d) => d.data).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      const transactions = txRows.map((d) => d.data).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      const invoices = invRows.map((d) => d.data).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

      res.json({
        orders,
        profile: profileSnap.exists ? profileSnap.data : null,
        wallet: walletSnap.exists ? walletSnap.data : null,
        transactions,
        invoices,
      });
    } catch (err) {
      console.error('customer dashboard error:', err);
      res.status(500).json({ error: 'Failed to load customer dashboard.' });
    }
  });

  router.put('/customer/profile', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const uid = req.uid!;
      const { name, phone, address, city, lat, lng, preferredLang } = req.body || {};
      const now = new Date().toISOString();
      if (name || phone !== undefined || preferredLang) {
        await dbSetDoc(
          `users/${uid}`,
          {
            ...(name ? { name: String(name).slice(0, 120) } : {}),
            ...(phone !== undefined ? { phone: String(phone).slice(0, 32) } : {}),
            ...(preferredLang ? { preferredLang: preferredLang === 'en' ? 'en' : 'ar' } : {}),
            updatedAt: now,
          },
          { merge: true },
          req.idToken
        );
      }
      await dbSetDoc(
        `customer_profiles/${uid}`,
        {
          uid,
          ...(address !== undefined ? { address: String(address).slice(0, 300) } : {}),
          ...(city !== undefined ? { city: String(city).slice(0, 100) } : {}),
          ...(typeof lat === 'number' ? { lat } : {}),
          ...(typeof lng === 'number' ? { lng } : {}),
          updatedAt: now,
        },
        { merge: true },
        req.idToken
      );
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Failed to update profile.' });
    }
  });

  router.post('/customer/favorites/:techId', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const uid = req.uid!;
      const techId = req.params.techId;
      if (!VALID_ID_REGEX.test(techId)) return res.status(400).json({ error: 'Invalid technician ID' });
      const snap = await dbGetDoc<any>(`customer_profiles/${uid}`, req.idToken);
      const current: string[] = snap.exists && Array.isArray(snap.data?.favoriteTechnicianIds)
        ? snap.data.favoriteTechnicianIds
        : [];
      const exists = current.includes(techId);
      const next = exists ? current.filter((id) => id !== techId) : [...current, techId].slice(0, 100);
      await dbSetDoc(`customer_profiles/${uid}`, { uid, favoriteTechnicianIds: next, updatedAt: new Date().toISOString() }, { merge: true }, req.idToken);
      res.json({ ok: true, favoriteTechnicianIds: next, added: !exists });
    } catch {
      res.status(500).json({ error: 'Failed to toggle favorite.' });
    }
  });

  // --- Orders & Lifecycle ---
  router.post('/orders', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const uid = req.uid!;
      const userSnap = await dbGetDoc<UserRecord>(`users/${uid}`, req.idToken);
      const user = userSnap.data;
      if (!user || user.role !== 'CUSTOMER') {
        return res.status(403).json({ error: 'Only customers can create service orders.' });
      }

      const {
        serviceId,
        title,
        description,
        address,
        lat,
        lng,
        scheduledAt,
        budgetEstimate,
        mediaUrls,
        preferredTechnicianId,
      } = req.body || {};

      if (!serviceId || !title || !description || !address || typeof lat !== 'number' || typeof lng !== 'number' || !scheduledAt) {
        return res.status(400).json({ error: 'Missing required order fields (service, title, description, map location, schedule).' });
      }

      let svc: ServiceCategory | null = null;
      const svcSnap = await dbGetDoc<ServiceCategory>(`services/${String(serviceId)}`, req.idToken).catch(() => ({
        exists: false,
        id: String(serviceId),
        data: null,
      }));
      if (svcSnap.exists && svcSnap.data) svc = svcSnap.data;
      else {
        const fb = INITIAL_SERVICES.find((s) => s.id === String(serviceId));
        if (fb) svc = { ...fb, updatedAt: new Date().toISOString() };
      }
      if (!svc) return res.status(404).json({ error: 'Selected service not found.' });

      const orderId = `ord_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const now = new Date().toISOString();
      const orderDoc: Order = {
        id: orderId,
        customerId: uid,
        customerName: user.name,
        serviceId: svc.id,
        serviceNameAr: svc.nameAr,
        serviceNameEn: svc.nameEn,
        title: String(title).slice(0, 200),
        description: String(description).slice(0, 3000),
        address: String(address).slice(0, 300),
        lat,
        lng,
        scheduledAt: String(scheduledAt),
        ...(budgetEstimate ? { budgetEstimate: Number(budgetEstimate) } : {}),
        mediaUrls: Array.isArray(mediaUrls) ? mediaUrls.slice(0, 10) : [],
        status: 'NEW',
        createdAt: now,
        updatedAt: now,
      };

      const histId = `hist_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
      await dbSetDoc(`orders/${orderId}`, orderDoc, {}, req.idToken);
      await dbSetDoc(
        `orders/${orderId}/status_history/${histId}`,
        {
          id: histId,
          orderId,
          customerId: uid,
          fromStatus: 'NONE',
          toStatus: 'NEW',
          changedByUid: uid,
          changedByRole: 'CUSTOMER',
          note: 'Order created by customer',
          createdAt: now,
        },
        {},
        req.idToken
      );

      const techsRows = await dbQueryCollection<any>(
        'technician_public_profiles',
        { where: [{ field: 'verificationStatus', op: '==', value: 'APPROVED' }] },
        req.idToken
      ).catch(() => []);
      for (const tRow of techsRows) {
        const t = tRow.data;
        const matchesService = Array.isArray(t.specialtyIds) && t.specialtyIds.includes(svc.id);
        const isPreferred = preferredTechnicianId && t.uid === preferredTechnicianId;
        if (matchesService || isPreferred) {
          await dispatchNotification(
            {
              userId: t.uid,
              type: 'NEW_ORDER',
              titleAr: `طلب جديد: ${svc.nameAr}`,
              titleEn: `New Order: ${svc.nameEn}`,
              bodyAr: `${orderDoc.title} — ${orderDoc.address}`,
              bodyEn: `${orderDoc.title} — ${orderDoc.address}`,
              orderId,
            },
            req.idToken
          );
        }
      }

      broadcastToAdmins('order:created', orderDoc);
      res.status(201).json(orderDoc);
    } catch (err) {
      console.error('Create order error:', err);
      res.status(500).json({ error: 'Failed to create order.' });
    }
  });

  router.get('/orders/:id', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const uid = req.uid!;
      const id = req.params.id;
      if (!VALID_ID_REGEX.test(id)) return res.status(400).json({ error: 'Invalid order ID' });

      const orderSnap = await dbGetDoc<Order>(`orders/${id}`, req.idToken);
      if (!orderSnap.exists || !orderSnap.data) return res.status(404).json({ error: 'Order not found.' });
      const order = orderSnap.data;
      const isAdmin = await isUserAdmin(uid, req.userEmail, req.idToken);

      let isApprovedTech = false;
      if (!isAdmin && order.customerId !== uid && order.technicianId !== uid) {
        const techSnap = await dbGetDoc<any>(`technician_profiles/${uid}`, req.idToken);
        if (
          techSnap.exists &&
          techSnap.data?.verificationStatus === 'APPROVED' &&
          (order.status === 'NEW' || order.status === 'PENDING')
        ) {
          isApprovedTech = true;
        }
        if (!isApprovedTech) {
          return res.status(403).json({ error: 'Forbidden: You do not have access to this order.' });
        }
      }

      const [offersRows, historyRows, messagesRows, invoiceRows] = await Promise.all([
        isApprovedTech && order.customerId !== uid && !isAdmin
          ? dbQueryCollection<any>(
              `orders/${id}/offers`,
              { where: [{ field: 'technicianId', op: '==', value: uid }] },
              req.idToken
            )
          : dbQueryCollection<any>(`orders/${id}/offers`, {}, req.idToken),
        order.customerId === uid || order.technicianId === uid || isAdmin
          ? dbQueryCollection<any>(`orders/${id}/status_history`, {}, req.idToken)
          : Promise.resolve([]),
        order.customerId === uid || order.technicianId === uid || isAdmin
          ? dbQueryCollection<any>(`orders/${id}/messages`, {}, req.idToken)
          : Promise.resolve([]),
        order.customerId === uid || order.technicianId === uid || isAdmin
          ? dbQueryCollection<any>('invoices', { where: [{ field: 'orderId', op: '==', value: id }], limit: 1 }, req.idToken)
          : Promise.resolve([]),
      ]);

      const offers = offersRows.map((d) => d.data);
      const history = historyRows
        .map((d) => d.data)
        .sort((a: any, b: any) => String(a.createdAt).localeCompare(String(b.createdAt)));
      const messages = messagesRows
        .map((d) => d.data)
        .sort((a: any, b: any) => String(a.createdAt).localeCompare(String(b.createdAt)));

      let technicianLocation = null;
      if (order.technicianId && ['ACCEPTED', 'TECHNICIAN_ON_THE_WAY', 'IN_PROGRESS'].includes(order.status)) {
        const locSnap = await dbGetDoc(`technician_locations/${order.technicianId}`, req.idToken).catch(() => ({
          exists: false,
          id: '',
          data: null,
        }));
        if (locSnap.exists) technicianLocation = locSnap.data;
      }

      res.json({
        order,
        offers,
        history,
        messages,
        technicianLocation,
        invoice: invoiceRows.length === 0 ? null : invoiceRows[0].data,
      });
    } catch (err) {
      console.error('Get order detail error:', err);
      res.status(500).json({ error: 'Failed to load order details.' });
    }
  });

  // Technician submits offer
  router.post('/orders/:id/offers', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const uid = req.uid!;
      const orderId = req.params.id;
      const { amount, estimatedDays, notes } = req.body || {};
      const numAmount = Number(amount);
      if (!numAmount || numAmount <= 0) {
        return res.status(400).json({ error: 'Valid quote amount is required.' });
      }

      const techSnap = await dbGetDoc<any>(`technician_profiles/${uid}`, req.idToken);
      if (!techSnap.exists || techSnap.data?.verificationStatus !== 'APPROVED') {
        return res.status(403).json({ error: 'Only admin-verified technicians can submit quotes.' });
      }
      const techPubSnap = await dbGetDoc<any>(`technician_public_profiles/${uid}`, req.idToken);
      const techPub = techPubSnap.data;
      const tech = techSnap.data;

      const orderSnap = await dbGetDoc<Order>(`orders/${orderId}`, req.idToken);
      if (!orderSnap.exists || !orderSnap.data) return res.status(404).json({ error: 'Order not found.' });
      const order = orderSnap.data;
      if (order.status !== 'NEW' && order.status !== 'PENDING') {
        return res.status(400).json({ error: 'This order is no longer accepting quotes.' });
      }

      const offerId = `off_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
      const now = new Date().toISOString();
      const offerDoc = {
        id: offerId,
        orderId,
        customerId: order.customerId,
        technicianId: uid,
        technicianName: tech.displayName,
        technicianRating: techPub?.ratingAvg || 0,
        technicianPlan: tech.subscriptionPlanId || 'FREE',
        amount: round2(numAmount),
        estimatedDays: Math.max(1, Math.round(Number(estimatedDays || 1))),
        notes: String(notes || '').slice(0, 1000),
        status: 'PENDING',
        createdAt: now,
      };
      await dbSetDoc(`orders/${orderId}/offers/${offerId}`, offerDoc, {}, req.idToken);

      if (order.status === 'NEW') {
        const histId = `hist_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
        await dbUpdateDoc(`orders/${orderId}`, { status: 'PENDING', updatedAt: now }, req.idToken);
        await dbSetDoc(
          `orders/${orderId}/status_history/${histId}`,
          {
            id: histId,
            orderId,
            customerId: order.customerId,
            fromStatus: 'NEW',
            toStatus: 'PENDING',
            changedByUid: uid,
            changedByRole: 'TECHNICIAN',
            note: 'First quote received; order moved to PENDING',
            createdAt: now,
          },
          {},
          req.idToken
        );
      }

      await dispatchNotification(
        {
          userId: order.customerId,
          type: 'NEW_OFFER',
          titleAr: 'عرض سعر جديد لطلبك',
          titleEn: 'New Quote Received',
          bodyAr: `قدم ${tech.displayName} عرض سعر بقيمة ${round2(numAmount)} ج.م على "${order.title}"`,
          bodyEn: `${tech.displayName} submitted a quote of ${round2(numAmount)} EGP for "${order.title}"`,
          orderId,
        },
        req.idToken
      );

      broadcastToOrder(orderId, 'order:updated', { orderId });
      res.status(201).json({ ok: true, offerId });
    } catch (err) {
      console.error('Submit quote error:', err);
      res.status(500).json({ error: 'Failed to submit quote.' });
    }
  });

  // Customer accepts ONE offer (closes all others)
  router.post('/orders/:id/offers/:offerId/accept', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const uid = req.uid!;
      const { id: orderId, offerId } = req.params;
      const now = new Date().toISOString();

      const orderSnap = await dbGetDoc<Order>(`orders/${orderId}`, req.idToken);
      if (!orderSnap.exists || !orderSnap.data) return res.status(404).json({ error: 'Order not found.' });
      const order = orderSnap.data;
      if (order.customerId !== uid) return res.status(403).json({ error: 'Only the order owner can accept quotes.' });
      if (order.status !== 'NEW' && order.status !== 'PENDING') {
        return res.status(400).json({ error: 'Order already has an accepted offer or is closed.' });
      }

      const offerRows = await dbQueryCollection<any>(`orders/${orderId}/offers`, {}, req.idToken);
      const target = offerRows.find((o) => o.id === offerId);
      if (!target) return res.status(404).json({ error: 'Offer not found.' });

      const acceptedTechId = target.data.technicianId;
      const finalPrice = Number(target.data.amount);
      const rejectedTechIds: string[] = [];

      for (const row of offerRows) {
        if (row.id === offerId) {
          await dbUpdateDoc(`orders/${orderId}/offers/${row.id}`, { status: 'ACCEPTED' }, req.idToken);
        } else {
          await dbUpdateDoc(`orders/${orderId}/offers/${row.id}`, { status: 'CLOSED' }, req.idToken);
          if (row.data.technicianId !== acceptedTechId) rejectedTechIds.push(row.data.technicianId);
        }
      }

      const histId = `hist_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
      await dbUpdateDoc(
        `orders/${orderId}`,
        {
          status: 'ACCEPTED',
          technicianId: acceptedTechId,
          technicianName: target.data.technicianName,
          acceptedOfferId: offerId,
          finalPrice,
          updatedAt: now,
        },
        req.idToken
      );
      await dbSetDoc(
        `orders/${orderId}/status_history/${histId}`,
        {
          id: histId,
          orderId,
          customerId: order.customerId,
          technicianId: acceptedTechId,
          fromStatus: order.status,
          toStatus: 'ACCEPTED',
          changedByUid: uid,
          changedByRole: 'CUSTOMER',
          note: `Accepted quote of ${finalPrice} EGP from ${target.data.technicianName}`,
          createdAt: now,
        },
        {},
        req.idToken
      );

      await dispatchNotification(
        {
          userId: acceptedTechId,
          type: 'ORDER_ACCEPTED',
          titleAr: 'تم قبول عرض السعر الخاص بك',
          titleEn: 'Your Quote Was Accepted',
          bodyAr: `وافق العميل على عرضك (${finalPrice} ج.م) للطلب "${order.title}".`,
          bodyEn: `Customer accepted your quote (${finalPrice} EGP) for "${order.title}".`,
          orderId,
        },
        req.idToken
      );

      for (const rTechId of new Set(rejectedTechIds)) {
        await dispatchNotification(
          {
            userId: rTechId,
            type: 'ORDER_REJECTED',
            titleAr: 'تم إغلاق عرض السعر',
            titleEn: 'Quote Closed',
            bodyAr: `تم اختيار فني آخر للطلب "${order.title}".`,
            bodyEn: `Another technician was selected for "${order.title}".`,
            orderId,
          },
          req.idToken
        );
      }

      broadcastToOrder(orderId, 'order:updated', { orderId, status: 'ACCEPTED' });
      res.json({ ok: true, status: 'ACCEPTED', finalPrice });
    } catch (err) {
      console.error('Accept offer error:', err);
      res.status(500).json({ error: 'Failed to accept quote.' });
    }
  });

  // Technician transitions order status
  router.post('/orders/:id/status', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const uid = req.uid!;
      const orderId = req.params.id;
      const { nextStatus, note } = req.body || {};
      const now = new Date().toISOString();

      const snap = await dbGetDoc<Order>(`orders/${orderId}`, req.idToken);
      if (!snap.exists || !snap.data) return res.status(404).json({ error: 'Order not found.' });
      const order = snap.data;

      if (order.technicianId !== uid) return res.status(403).json({ error: 'Forbidden' });
      if (nextStatus === 'PAID') return res.status(400).json({ error: 'PAID status requires verified payment.' });

      const allowed = ALLOWED_ORDER_TRANSITIONS[order.status] || [];
      if (!allowed.includes(nextStatus)) {
        return res.status(400).json({ error: `Illegal transition: ${order.status} -> ${nextStatus}` });
      }

      const histId = `hist_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
      await dbUpdateDoc(`orders/${orderId}`, { status: nextStatus, updatedAt: now }, req.idToken);
      await dbSetDoc(
        `orders/${orderId}/status_history/${histId}`,
        {
          id: histId,
          orderId,
          customerId: order.customerId,
          technicianId: uid,
          fromStatus: order.status,
          toStatus: nextStatus,
          changedByUid: uid,
          changedByRole: 'TECHNICIAN',
          note: String(note || `Status updated to ${nextStatus}`).slice(0, 400),
          createdAt: now,
        },
        {},
        req.idToken
      );

      const notifMap: Record<string, { type: string; tAr: string; tEn: string; bAr: string; bEn: string }> = {
        TECHNICIAN_ON_THE_WAY: {
          type: 'TECHNICIAN_ON_THE_WAY',
          tAr: 'الفني في طريقه إليك',
          tEn: 'Technician Is En Route',
          bAr: `تحرك الفني نحو موقع تنفيذ الطلب "${order.title}".`,
          bEn: `Technician is heading to your site for "${order.title}".`,
        },
        IN_PROGRESS: {
          type: 'ORDER_IN_PROGRESS',
          tAr: 'بدأ تنفيذ العمل',
          tEn: 'Work Started',
          bAr: `بدأ الفني العمل على "${order.title}".`,
          bEn: `Technician started work on "${order.title}".`,
        },
        COMPLETED: {
          type: 'ORDER_COMPLETED',
          tAr: 'تم إكمال العمل — بانتظار الدفع',
          tEn: 'Work Completed — Payment Due',
          bAr: `أتم الفني العمل على "${order.title}". يرجى إتمام السداد.`,
          bEn: `Work finished for "${order.title}". Please complete payment.`,
        },
      };

      const msg = notifMap[nextStatus];
      if (msg) {
        await dispatchNotification(
          {
            userId: order.customerId,
            type: msg.type,
            titleAr: msg.tAr,
            titleEn: msg.tEn,
            bodyAr: msg.bAr,
            bodyEn: msg.bEn,
            orderId,
          },
          req.idToken
        );
      }

      broadcastToOrder(orderId, 'order:updated', { orderId, status: nextStatus });
      res.json({ ok: true, fromStatus: order.status, status: nextStatus });
    } catch {
      res.status(500).json({ error: 'Failed to update order status.' });
    }
  });

  router.post('/orders/:id/cancel', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const uid = req.uid!;
      const orderId = req.params.id;
      const { reason } = req.body || {};
      const now = new Date().toISOString();

      const snap = await dbGetDoc<Order>(`orders/${orderId}`, req.idToken);
      if (!snap.exists || !snap.data) return res.status(404).json({ error: 'Order not found.' });
      const order = snap.data;
      if (order.customerId !== uid) return res.status(403).json({ error: 'Forbidden' });
      if (!['NEW', 'PENDING', 'ACCEPTED'].includes(order.status)) {
        return res.status(400).json({ error: 'Cannot cancel order in current stage.' });
      }

      const histId = `hist_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
      await dbUpdateDoc(`orders/${orderId}`, { status: 'CANCELLED', updatedAt: now }, req.idToken);
      await dbSetDoc(
        `orders/${orderId}/status_history/${histId}`,
        {
          id: histId,
          orderId,
          customerId: order.customerId,
          ...(order.technicianId ? { technicianId: order.technicianId } : {}),
          fromStatus: order.status,
          toStatus: 'CANCELLED',
          changedByUid: uid,
          changedByRole: 'CUSTOMER',
          note: String(reason || 'Cancelled by customer').slice(0, 400),
          createdAt: now,
        },
        {},
        req.idToken
      );

      if (order.technicianId) {
        await dispatchNotification(
          {
            userId: order.technicianId,
            type: 'ORDER_CANCELLED',
            titleAr: 'تم إلغاء الطلب',
            titleEn: 'Order Cancelled',
            bodyAr: 'قام العميل بإلغاء الطلب قبل بدء التنفيذ.',
            bodyEn: 'Customer cancelled the order prior to execution.',
            orderId,
          },
          req.idToken
        );
      }

      broadcastToOrder(orderId, 'order:updated', { orderId, status: 'CANCELLED' });
      res.json({ ok: true, status: 'CANCELLED' });
    } catch {
      res.status(500).json({ error: 'Failed to cancel order.' });
    }
  });

  // Price revision workflow
  router.post('/orders/:id/price-revision', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const uid = req.uid!;
      const orderId = req.params.id;
      const { requestedAmount, reason } = req.body || {};
      const amount = Number(requestedAmount);
      if (!amount || amount <= 0 || !reason) {
        return res.status(400).json({ error: 'Valid requestedAmount and reason are required.' });
      }

      const snap = await dbGetDoc<Order>(`orders/${orderId}`, req.idToken);
      if (!snap.exists || !snap.data) return res.status(404).json({ error: 'Order not found.' });
      const order = snap.data;
      if (order.technicianId !== uid) return res.status(403).json({ error: 'Only assigned technician can request a price revision.' });
      if (!['ACCEPTED', 'TECHNICIAN_ON_THE_WAY', 'IN_PROGRESS'].includes(order.status)) {
        return res.status(400).json({ error: 'Price revision not permitted in current status.' });
      }

      const revision = {
        requestedAmount: round2(amount),
        reason: String(reason).slice(0, 500),
        status: 'PENDING' as const,
        requestedAt: new Date().toISOString(),
      };
      await dbUpdateDoc(`orders/${orderId}`, { pendingPriceRevision: revision, updatedAt: revision.requestedAt }, req.idToken);

      await dispatchNotification(
        {
          userId: order.customerId,
          type: 'PRICE_REVISION_REQUEST',
          titleAr: 'طلب تعديل السعر النهائي',
          titleEn: 'Price Revision Request',
          bodyAr: `طلب الفني تعديل السعر إلى ${revision.requestedAmount} ج.م: ${revision.reason}`,
          bodyEn: `Technician requested price change to ${revision.requestedAmount} EGP: ${revision.reason}`,
          orderId,
        },
        req.idToken
      );

      broadcastToOrder(orderId, 'order:updated', { orderId });
      res.json({ ok: true, revision });
    } catch {
      res.status(500).json({ error: 'Failed to request price revision.' });
    }
  });

  router.post('/orders/:id/price-revision/respond', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const uid = req.uid!;
      const orderId = req.params.id;
      const { approve } = req.body || {};
      const now = new Date().toISOString();

      const snap = await dbGetDoc<Order>(`orders/${orderId}`, req.idToken);
      if (!snap.exists || !snap.data) return res.status(404).json({ error: 'Order not found.' });
      const order = snap.data;
      if (order.customerId !== uid) return res.status(403).json({ error: 'Forbidden' });
      if (!order.pendingPriceRevision || order.pendingPriceRevision.status !== 'PENDING') {
        return res.status(400).json({ error: 'No pending price revision.' });
      }

      const newRev = {
        ...order.pendingPriceRevision,
        status: approve ? 'APPROVED' : 'REJECTED',
      };
      const updates: any = { pendingPriceRevision: newRev, updatedAt: now };
      if (approve) updates.finalPrice = order.pendingPriceRevision.requestedAmount;
      await dbUpdateDoc(`orders/${orderId}`, updates, req.idToken);

      if (order.technicianId) {
        await dispatchNotification(
          {
            userId: order.technicianId,
            type: 'PRICE_REVISION_RESPONSE',
            titleAr: approve ? 'تمت الموافقة على تعديل السعر' : 'تم رفض تعديل السعر',
            titleEn: approve ? 'Price Revision Approved' : 'Price Revision Declined',
            bodyAr: approve ? 'وافق العميل على السعر المحدّث للطلب.' : 'أبقى العميل على السعر المتفق عليه مسبقاً.',
            bodyEn: approve ? 'Customer approved the updated price.' : 'Customer kept the original agreed price.',
            orderId,
          },
          req.idToken
        );
      }

      broadcastToOrder(orderId, 'order:updated', { orderId });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Failed to respond to price revision.' });
    }
  });

  // --- Wallet Payment Settlement + Commission + Invoice ---
  async function settleOrderPaymentServerSide(params: {
    orderId: string;
    payerUid: string;
    provider: 'WALLET' | 'PAYMOB' | 'FAWRY' | 'CASH';
    externalRef?: string;
    deductFromWallet: boolean;
    cashCollectedDirectByTech?: boolean;
    changedByUid?: string;
    changedByRole?: 'CUSTOMER' | 'TECHNICIAN' | 'ADMIN';
    idToken?: string;
  }) {
    const now = new Date().toISOString();
    const orderSnap = await dbGetDoc<Order>(`orders/${params.orderId}`, params.idToken);
    if (!orderSnap.exists || !orderSnap.data) throw new Error('ORDER_NOT_FOUND');
    const order = orderSnap.data;
    if (order.status !== 'COMPLETED') throw new Error('ORDER_NOT_COMPLETED');
    if (!order.technicianId || !order.finalPrice || order.finalPrice <= 0) {
      throw new Error('INVALID_ORDER_AMOUNT');
    }

    const settingsSnap = await dbGetDoc<PlatformSettings>('platform_settings/global', params.idToken).catch(() => ({
      exists: false,
      id: 'global',
      data: null,
    }));
    const commissionRate = settingsSnap.exists && settingsSnap.data ? Number(settingsSnap.data.commissionRatePercent || 10) : 10;

    const gross = round2(order.finalPrice);
    const commissionAmount = round2((gross * commissionRate) / 100);
    const techNet = round2(gross - commissionAmount);

    if (!params.cashCollectedDirectByTech) {
      const cWalletSnap = await dbGetDoc<any>(`wallets/${order.customerId}`, params.idToken);
      const cBalance = cWalletSnap.exists && cWalletSnap.data ? Number(cWalletSnap.data.balance || 0) : 0;

      if (params.deductFromWallet && cBalance < gross) {
        throw new Error('INSUFFICIENT_WALLET_BALANCE');
      }

      if (params.deductFromWallet) {
        await dbSetDoc(
          `wallets/${order.customerId}`,
          {
            uid: order.customerId,
            balance: round2(cBalance - gross),
            totalSpent: incrementVal(gross),
            currency: 'EGP',
            updatedAt: now,
          },
          { merge: true },
          params.idToken
        );
      } else if (params.payerUid === order.customerId || !params.idToken) {
        await dbSetDoc(
          `wallets/${order.customerId}`,
          {
            uid: order.customerId,
            totalSpent: incrementVal(gross),
            currency: 'EGP',
            updatedAt: now,
          },
          { merge: true },
          params.idToken
        );
      }

      await dbUpdateDoc(
        `wallets/${order.technicianId}`,
        {
          balance: incrementVal(techNet),
          totalEarned: incrementVal(techNet),
          currency: 'EGP',
          updatedAt: now,
        },
        params.idToken
      );
    } else {
      // Cash collected directly on-site by the technician: track net earned without inflating digital withdrawable balance
      await dbUpdateDoc(
        `wallets/${order.technicianId}`,
        {
          totalEarned: incrementVal(techNet),
          currency: 'EGP',
          updatedAt: now,
        },
        params.idToken
      );
    }

    await dbUpdateDoc(
      `technician_public_profiles/${order.technicianId}`,
      {
        completedJobsCount: incrementVal(1),
        updatedAt: now,
      },
      params.idToken
    );

    const txPayId = `tx_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const txEarnId = `tx_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const commId = `com_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const invId = `inv_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const histId = `hist_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const invNum = `IX-${now.slice(0, 10).replace(/-/g, '')}-${invId.slice(-4).toUpperCase()}`;

    await dbSetDoc(
      `transactions/${txPayId}`,
      {
        id: txPayId,
        uid: order.customerId,
        orderId: order.id,
        type: 'PAYMENT',
        amount: gross,
        provider: params.provider,
        status: 'VERIFIED',
        externalRef: params.externalRef || txPayId,
        notes: params.cashCollectedDirectByTech ? 'On-site cash payment confirmed' : `Order ${order.id} settlement`,
        createdAt: now,
      },
      {},
      params.idToken
    );

    await dbSetDoc(
      `transactions/${txEarnId}`,
      {
        id: txEarnId,
        uid: order.technicianId,
        orderId: order.id,
        type: 'EARNING',
        amount: techNet,
        provider: params.provider,
        status: 'VERIFIED',
        externalRef: params.externalRef || txEarnId,
        notes: params.cashCollectedDirectByTech
          ? `Cash collected directly on-site (Platform commission: ${commissionAmount} EGP)`
          : `Credited from order ${order.id}`,
        createdAt: now,
      },
      {},
      params.idToken
    );

    await dbSetDoc(
      `commissions/${commId}`,
      {
        id: commId,
        orderId: order.id,
        technicianId: order.technicianId,
        grossAmount: gross,
        ratePercent: commissionRate,
        commissionAmount,
        technicianNetAmount: techNet,
        createdAt: now,
      },
      {},
      params.idToken
    );

    const invoice = {
      id: invId,
      invoiceNumber: invNum,
      orderId: order.id,
      customerId: order.customerId,
      technicianId: order.technicianId,
      subtotal: gross,
      platformFee: commissionAmount,
      total: gross,
      paymentProvider: params.provider,
      status: 'PAID',
      createdAt: now,
    };
    await dbSetDoc(`invoices/${invId}`, invoice, {}, params.idToken);
    await dbUpdateDoc(
      `orders/${order.id}`,
      { status: 'PAID', cashPaymentPending: null, updatedAt: now },
      params.idToken
    );
    await dbSetDoc(
      `orders/${order.id}/status_history/${histId}`,
      {
        id: histId,
        orderId: order.id,
        customerId: order.customerId,
        technicianId: order.technicianId,
        fromStatus: 'COMPLETED',
        toStatus: 'PAID',
        changedByUid: params.changedByUid || params.payerUid,
        changedByRole: params.changedByRole || 'CUSTOMER',
        note: `Verified ${params.provider} settlement (${gross} EGP). Invoice ${invNum}.`,
        createdAt: now,
      },
      {},
      params.idToken
    );

    await Promise.all([
      dispatchNotification(
        {
          userId: order.customerId,
          type: 'PAYMENT_CONFIRMED',
          titleAr: 'تم تأكيد الدفع وإصدار الفاتورة',
          titleEn: 'Payment Confirmed & Invoice Issued',
          bodyAr: `تم سداد ${invoice.total} ج.م وإصدار الفاتورة ${invoice.invoiceNumber}.`,
          bodyEn: `Paid ${invoice.total} EGP. Invoice ${invoice.invoiceNumber} issued.`,
          orderId: params.orderId,
        },
        params.idToken
      ),
      dispatchNotification(
        {
          userId: order.technicianId,
          type: 'PAYMENT_CONFIRMED',
          titleAr: params.cashCollectedDirectByTech ? 'تم تأكيد استلام الدفع النقدي' : 'تم إضافة أرباح الطلب لمحفظتك',
          titleEn: params.cashCollectedDirectByTech ? 'Cash Settlement Recorded' : 'Order Earnings Credited',
          bodyAr: params.cashCollectedDirectByTech
            ? `تم تأكيد استلام ${gross} ج.م نقداً وإصدار الفاتورة (صافي ${techNet} ج.م بعد عمولة ${commissionAmount} ج.م).`
            : `تم إيداع صافي ${techNet} ج.م (بعد عمولة ${commissionAmount} ج.م) في محفظتك.`,
          bodyEn: params.cashCollectedDirectByTech
            ? `Confirmed ${gross} EGP cash receipt (net ${techNet} EGP after ${commissionAmount} EGP platform fee).`
            : `Credited net ${techNet} EGP (after ${commissionAmount} EGP fee) to your wallet.`,
          orderId: params.orderId,
        },
        params.idToken
      ),
    ]);

    broadcastToOrder(params.orderId, 'order:updated', { orderId: params.orderId, status: 'PAID' });
    return { order, invoice, commissionAmount, techNet };
  }

  router.post('/orders/:id/pay-wallet', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const uid = req.uid!;
      const orderId = req.params.id;
      const orderSnap = await dbGetDoc<Order>(`orders/${orderId}`, req.idToken);
      if (!orderSnap.exists || !orderSnap.data) return res.status(404).json({ error: 'Order not found.' });
      if (orderSnap.data.customerId !== uid) return res.status(403).json({ error: 'Forbidden' });

      const settled = await settleOrderPaymentServerSide({
        orderId,
        payerUid: uid,
        provider: 'WALLET',
        deductFromWallet: true,
        idToken: req.idToken,
      });
      res.json({ ok: true, invoice: settled.invoice });
    } catch (err: any) {
      if (err.message === 'INSUFFICIENT_WALLET_BALANCE') {
        return res.status(400).json({ error: 'Insufficient wallet balance. Top up via Bank Transfer / InstaPay or pay cash on-site.' });
      }
      if (err.message === 'ORDER_NOT_COMPLETED') {
        return res.status(400).json({ error: 'Order must be COMPLETED before payment.' });
      }
      res.status(500).json({ error: 'Wallet payment failed.' });
    }
  });

  router.post('/orders/:id/pay-cash-request', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const uid = req.uid!;
      const orderId = req.params.id;
      const orderSnap = await dbGetDoc<Order>(`orders/${orderId}`, req.idToken);
      if (!orderSnap.exists || !orderSnap.data) return res.status(404).json({ error: 'Order not found.' });
      const order = orderSnap.data;
      if (order.customerId !== uid) return res.status(403).json({ error: 'Forbidden' });
      if (order.status !== 'COMPLETED') return res.status(400).json({ error: 'Order must be COMPLETED before payment.' });
      if (!order.technicianId || !order.finalPrice) return res.status(400).json({ error: 'Order missing technician or final price.' });

      const now = new Date().toISOString();
      const pending = {
        requestedByUid: uid,
        requestedAt: now,
        amount: round2(order.finalPrice),
      };
      await dbUpdateDoc(`orders/${orderId}`, { cashPaymentPending: pending, updatedAt: now }, req.idToken);
      await dispatchNotification(
        {
          userId: order.technicianId,
          type: 'CASH_PAYMENT_REQUESTED',
          titleAr: 'طلب تأكيد دفع نقدي في الموقع',
          titleEn: 'Customer Requested Cash On-Site Confirmation',
          bodyAr: `طلب العميل تسوية ${pending.amount} ج.م نقداً للطلب "${order.title}". يرجى تأكيد الاستلام.`,
          bodyEn: `Customer selected cash payment (${pending.amount} EGP) for "${order.title}". Confirm once received.`,
          orderId,
        },
        req.idToken
      );
      broadcastToOrder(orderId, 'order:updated', { orderId });
      res.json({ ok: true, cashPaymentPending: pending });
    } catch {
      res.status(500).json({ error: 'Failed to submit cash payment request.' });
    }
  });

  router.post('/orders/:id/confirm-cash', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const uid = req.uid!;
      const orderId = req.params.id;
      const adminOk = await isUserAdmin(uid, req.userEmail, req.idToken);
      const orderSnap = await dbGetDoc<Order>(`orders/${orderId}`, req.idToken);
      if (!orderSnap.exists || !orderSnap.data) return res.status(404).json({ error: 'Order not found.' });
      const order = orderSnap.data;
      if (order.technicianId !== uid && !adminOk) {
        return res.status(403).json({ error: 'Only the assigned technician or an admin can confirm cash receipt.' });
      }
      if (order.status !== 'COMPLETED') {
        return res.status(400).json({ error: 'Order must be COMPLETED before confirming cash payment.' });
      }

      const settled = await settleOrderPaymentServerSide({
        orderId,
        payerUid: order.customerId,
        provider: 'CASH',
        externalRef: `CASH-${orderId}`,
        deductFromWallet: false,
        cashCollectedDirectByTech: true,
        changedByUid: uid,
        changedByRole: adminOk ? 'ADMIN' : 'TECHNICIAN',
        idToken: req.idToken,
      });
      res.json({ ok: true, invoice: settled.invoice });
    } catch (err: any) {
      if (err.message === 'ORDER_NOT_COMPLETED') {
        return res.status(400).json({ error: 'Order must be COMPLETED before payment.' });
      }
      res.status(500).json({ error: 'Cash confirmation failed.' });
    }
  });

  router.post('/wallet/topup-request', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const uid = req.uid!;
      const { amount, referenceNumber, method } = req.body || {};
      const numAmount = round2(Number(amount));
      const cleanRef = String(referenceNumber || '').trim().slice(0, 120);
      if (!numAmount || numAmount < 50 || cleanRef.length < 3) {
        return res.status(400).json({ error: 'Minimum top-up is 50 EGP and a valid transfer reference is required.' });
      }
      const now = new Date().toISOString();
      const txId = `tx_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
      await dbSetDoc(
        `transactions/${txId}`,
        {
          id: txId,
          uid,
          type: 'TOPUP',
          amount: numAmount,
          provider: 'BANK_TRANSFER',
          status: 'PENDING',
          externalRef: cleanRef,
          notes: `${String(method || 'Bank Transfer / InstaPay').slice(0, 80)} · Ref: ${cleanRef}`,
          createdAt: now,
        },
        {},
        req.idToken
      );
      broadcastToAdmins('topup:requested', { txId, uid, amount: numAmount });
      res.json({ ok: true, txId });
    } catch {
      res.status(500).json({ error: 'Failed to submit wallet top-up request.' });
    }
  });

  // --- Paymob & Fawry Official Gateways ---
  router.post('/payments/paymob/init', requireAuth, async (req: AuthedRequest, res) => {
    const apiKey = process.env.PAYMOB_API_KEY;
    const integrationId = process.env.PAYMOB_INTEGRATION_ID;
    const iframeId = process.env.PAYMOB_IFRAME_ID;
    if (!apiKey || !integrationId || !iframeId || !process.env.PAYMOB_HMAC_SECRET) {
      return res.status(503).json({
        configured: false,
        provider: 'PAYMOB',
        error:
          'Paymob gateway is not activated yet. Configure PAYMOB_API_KEY, PAYMOB_INTEGRATION_ID, PAYMOB_IFRAME_ID, and PAYMOB_HMAC_SECRET in server environment variables.',
      });
    }

    try {
      const { purpose, orderId, amount } = req.body || {};
      const amountCents = Math.round(Number(amount) * 100);
      if (!amountCents || amountCents < 100) return res.status(400).json({ error: 'Invalid payment amount.' });

      const authRes = await fetch('https://accept.paymob.com/api/auth/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey }),
      });
      const authJson: any = await authRes.json();
      if (!authJson.token) return res.status(502).json({ error: 'Paymob authentication failed.' });

      const merchantOrderId = `${purpose || 'TOPUP'}:${req.uid}:${orderId || 'WALLET'}:${Date.now()}`;
      const orderRes = await fetch('https://accept.paymob.com/api/ecommerce/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auth_token: authJson.token,
          delivery_needed: 'false',
          amount_cents: amountCents,
          currency: 'EGP',
          merchant_order_id: merchantOrderId,
          items: [],
        }),
      });
      const orderJson: any = await orderRes.json();
      if (!orderJson.id) return res.status(502).json({ error: 'Paymob order registration failed.' });

      const userSnap = await dbGetDoc<any>(`users/${req.uid!}`, req.idToken);
      const user = userSnap.data || {};
      const keyRes = await fetch('https://accept.paymob.com/api/acceptance/payment_keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auth_token: authJson.token,
          amount_cents: amountCents,
          expiration: 3600,
          order_id: orderJson.id,
          billing_data: {
            email: req.userEmail || 'client@interiorx.app',
            first_name: (user.name || 'InteriorX').split(' ')[0],
            last_name: (user.name || 'Client').split(' ').slice(1).join(' ') || 'User',
            phone_number: user.phone || '+201000000000',
            apartment: 'NA',
            floor: 'NA',
            street: 'NA',
            building: 'NA',
            shipping_method: 'NA',
            postal_code: 'NA',
            city: 'Cairo',
            country: 'EG',
            state: 'Cairo',
          },
          currency: 'EGP',
          integration_id: Number(integrationId),
        }),
      });
      const keyJson: any = await keyRes.json();
      if (!keyJson.token) return res.status(502).json({ error: 'Paymob payment key generation failed.' });

      const txId = `tx_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
      await dbSetDoc(
        `transactions/${txId}`,
        {
          id: txId,
          uid: req.uid!,
          orderId: orderId || undefined,
          type: purpose === 'ORDER' ? 'PAYMENT' : 'TOPUP',
          amount: round2(amountCents / 100),
          provider: 'PAYMOB',
          status: 'PENDING',
          externalRef: String(orderJson.id),
          createdAt: new Date().toISOString(),
        },
        {},
        req.idToken
      );

      res.json({
        configured: true,
        iframeUrl: `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${keyJson.token}`,
        paymobOrderId: orderJson.id,
      });
    } catch {
      res.status(500).json({ error: 'Failed to initiate Paymob transaction.' });
    }
  });

  router.post('/payments/paymob/webhook', async (req, res) => {
    const hmacSecret = process.env.PAYMOB_HMAC_SECRET;
    if (!hmacSecret) return res.status(503).json({ error: 'Paymob HMAC secret not configured.' });
    try {
      const obj = req.body?.obj;
      const receivedHmac = String(req.query.hmac || req.body?.hmac || '');
      if (!obj || !receivedHmac) return res.status(400).json({ error: 'Missing Paymob payload or HMAC.' });

      const fields = [
        obj.amount_cents, obj.created_at, obj.currency, obj.error_occured,
        obj.has_parent_transaction, obj.id, obj.integration_id, obj.is_3d_secure,
        obj.is_auth, obj.is_capture, obj.is_refunded, obj.is_standalone_payment,
        obj.is_voided, obj.order?.id, obj.owner, obj.pending,
        obj.source_data?.pan, obj.source_data?.sub_type, obj.source_data?.type, obj.success,
      ].map((v) => String(v ?? '')).join('');

      const expectedHmac = crypto.createHmac('sha512', hmacSecret).update(fields).digest('hex');
      if (expectedHmac !== receivedHmac) return res.status(401).json({ error: 'Invalid Paymob HMAC signature.' });

      if (obj.success === true) {
        const merchantOrderId = String(obj.order?.merchant_order_id || '');
        const [purpose, uid, orderId] = merchantOrderId.split(':');
        const amount = round2(Number(obj.amount_cents || 0) / 100);
        if (purpose === 'ORDER' && orderId && orderId !== 'WALLET') {
          await settleOrderPaymentServerSide({
            orderId,
            payerUid: uid,
            provider: 'PAYMOB',
            externalRef: String(obj.id),
            deductFromWallet: false,
          });
        } else if (uid && amount > 0) {
          await dbSetDoc(`wallets/${uid}`, { uid, balance: incrementVal(amount), updatedAt: new Date().toISOString() }, { merge: true });
          const txId = `tx_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
          await dbSetDoc(`transactions/${txId}`, {
            id: txId,
            uid,
            type: 'TOPUP',
            amount,
            provider: 'PAYMOB',
            status: 'VERIFIED',
            externalRef: String(obj.id),
            createdAt: new Date().toISOString(),
          });
        }
      }
      res.json({ received: true });
    } catch {
      res.status(500).json({ error: 'Webhook processing failed.' });
    }
  });

  router.post('/payments/fawry/init', requireAuth, async (req: AuthedRequest, res) => {
    const merchantCode = process.env.FAWRY_MERCHANT_CODE;
    const securityKey = process.env.FAWRY_SECURITY_KEY;
    if (!merchantCode || !securityKey) {
      return res.status(503).json({
        configured: false,
        provider: 'FAWRY',
        error:
          'Fawry Pay gateway is not activated yet. Configure FAWRY_MERCHANT_CODE and FAWRY_SECURITY_KEY in server environment variables.',
      });
    }

    try {
      const { purpose, orderId, amount } = req.body || {};
      const numAmount = round2(Number(amount));
      if (!numAmount || numAmount <= 0) return res.status(400).json({ error: 'Invalid payment amount.' });

      const merchantRefNum = `FW-${purpose || 'TOPUP'}-${req.uid}-${orderId || 'WALLET'}-${Date.now()}`;
      const signature = crypto
        .createHash('sha256')
        .update(`${merchantCode}${merchantRefNum}${req.uid}${numAmount.toFixed(2)}${securityKey}`)
        .digest('hex');

      const baseUrl =
        process.env.FAWRY_IS_SANDBOX === 'false' ? 'https://www.atfawry.com' : 'https://atfawry.fawrystaging.com';

      const fwRes = await fetch(`${baseUrl}/ECommerceWeb/Fawry/payments/charge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantCode,
          merchantRefNum,
          customerProfileId: req.uid,
          customerEmail: req.userEmail || 'client@interiorx.app',
          amount: numAmount,
          currencyCode: 'EGP',
          chargeItems: [{ itemId: orderId || 'WALLET_TOPUP', description: `InteriorX ${purpose || 'Topup'}`, price: numAmount, quantity: 1 }],
          paymentMethod: 'PAYATFAWRY',
          signature,
        }),
      });
      const fwJson: any = await fwRes.json();
      if (fwJson.statusCode !== 200) return res.status(502).json({ error: fwJson.statusDescription || 'Fawry charge initialization failed.' });

      const txId = `tx_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
      await dbSetDoc(
        `transactions/${txId}`,
        {
          id: txId,
          uid: req.uid!,
          orderId: orderId || undefined,
          type: purpose === 'ORDER' ? 'PAYMENT' : 'TOPUP',
          amount: numAmount,
          provider: 'FAWRY',
          status: 'PENDING',
          externalRef: fwJson.referenceNumber || merchantRefNum,
          createdAt: new Date().toISOString(),
        },
        {},
        req.idToken
      );

      res.json({
        configured: true,
        referenceNumber: fwJson.referenceNumber,
        merchantRefNum,
        expirationTime: fwJson.expirationTime,
      });
    } catch {
      res.status(500).json({ error: 'Failed to initiate Fawry payment.' });
    }
  });

  router.post('/payments/fawry/webhook', async (req, res) => {
    const securityKey = process.env.FAWRY_SECURITY_KEY;
    if (!securityKey) return res.status(503).json({ error: 'Fawry security key not configured.' });
    try {
      const { fawryRefNumber, merchantRefNumber, paymentAmount, orderAmount, orderStatus, paymentMethod, messageSignature } = req.body || {};
      const expectedSig = crypto
        .createHash('sha256')
        .update(`${fawryRefNumber}${merchantRefNumber}${Number(paymentAmount).toFixed(2)}${Number(orderAmount).toFixed(2)}${orderStatus}${paymentMethod}${securityKey}`)
        .digest('hex');

      if (expectedSig !== messageSignature) return res.status(401).json({ error: 'Invalid Fawry callback signature.' });

      if (orderStatus === 'PAID') {
        const [, purpose, uid, orderId] = String(merchantRefNumber || '').split('-');
        const amount = round2(Number(paymentAmount));
        if (purpose === 'ORDER' && orderId && orderId !== 'WALLET') {
          await settleOrderPaymentServerSide({
            orderId,
            payerUid: uid,
            provider: 'FAWRY',
            externalRef: String(fawryRefNumber),
            deductFromWallet: false,
          });
        } else if (uid && amount > 0) {
          await dbSetDoc(`wallets/${uid}`, { uid, balance: incrementVal(amount), updatedAt: new Date().toISOString() }, { merge: true });
          const txId = `tx_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
          await dbSetDoc(`transactions/${txId}`, {
            id: txId,
            uid,
            type: 'TOPUP',
            amount,
            provider: 'FAWRY',
            status: 'VERIFIED',
            externalRef: String(fawryRefNumber),
            createdAt: new Date().toISOString(),
          });
        }
      }
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Fawry webhook processing failed.' });
    }
  });

  // --- Reviews & Complaints ---
  router.post('/orders/:id/reviews', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const uid = req.uid!;
      const orderId = req.params.id;
      const { rating, comment } = req.body || {};
      const numRating = Math.round(Number(rating));
      if (!numRating || numRating < 1 || numRating > 5) {
        return res.status(400).json({ error: 'Rating must be between 1 and 5.' });
      }

      const orderSnap = await dbGetDoc<Order>(`orders/${orderId}`, req.idToken);
      if (!orderSnap.exists || !orderSnap.data) return res.status(404).json({ error: 'Order not found.' });
      const order = orderSnap.data;
      if (order.customerId !== uid) return res.status(403).json({ error: 'Forbidden' });
      if (order.status !== 'PAID' && order.status !== 'COMPLETED') return res.status(400).json({ error: 'Review allowed after completion.' });
      if (order.reviewed) return res.status(409).json({ error: 'Order already reviewed.' });
      if (!order.technicianId) return res.status(400).json({ error: 'No technician assigned.' });

      const revId = `rev_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
      const now = new Date().toISOString();

      const techPubSnap = await dbGetDoc<any>(`technician_public_profiles/${order.technicianId}`, req.idToken);
      const currAvg = Number(techPubSnap.data?.ratingAvg || 0);
      const currCount = Number(techPubSnap.data?.ratingCount || 0);
      const nextCount = currCount + 1;
      const nextAvg = round2((currAvg * currCount + numRating) / nextCount);

      await dbSetDoc(
        `reviews/${revId}`,
        {
          id: revId,
          orderId,
          customerId: uid,
          customerName: order.customerName,
          technicianId: order.technicianId,
          rating: numRating,
          comment: String(comment || '').slice(0, 1500),
          createdAt: now,
        },
        {},
        req.idToken
      );
      await dbUpdateDoc(`orders/${orderId}`, { reviewed: true, updatedAt: now }, req.idToken);
      await dbSetDoc(
        `technician_public_profiles/${order.technicianId}`,
        { uid: order.technicianId, ratingAvg: nextAvg, ratingCount: nextCount, updatedAt: now },
        { merge: true },
        req.idToken
      );

      res.status(201).json({ ok: true, id: revId });
    } catch {
      res.status(500).json({ error: 'Failed to submit review.' });
    }
  });

  router.post('/complaints', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const uid = req.uid!;
      const { orderId, subject, description } = req.body || {};
      if (!subject || !description) return res.status(400).json({ error: 'Subject and description are required.' });
      const userSnap = await dbGetDoc<UserRecord>(`users/${uid}`, req.idToken);
      const user = userSnap.data;
      const id = `cmp_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
      const now = new Date().toISOString();
      const doc = {
        id,
        orderId: String(orderId || ''),
        reporterId: uid,
        reporterName: user?.name || 'User',
        reporterRole: user?.role === 'TECHNICIAN' ? 'TECHNICIAN' : 'CUSTOMER',
        subject: String(subject).slice(0, 200),
        description: String(description).slice(0, 2000),
        status: 'OPEN',
        createdAt: now,
        updatedAt: now,
      };
      await dbSetDoc(`complaints/${id}`, doc, {}, req.idToken);
      broadcastToAdmins('complaint:created', doc);
      res.status(201).json(doc);
    } catch {
      res.status(500).json({ error: 'Failed to submit complaint.' });
    }
  });

  // --- Order Chat Messages ---
  router.post('/orders/:id/messages', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const uid = req.uid!;
      const orderId = req.params.id;
      const { text, imageUrl } = req.body || {};
      if (!text && !imageUrl) return res.status(400).json({ error: 'Message text or image is required.' });

      const orderSnap = await dbGetDoc<Order>(`orders/${orderId}`, req.idToken);
      if (!orderSnap.exists || !orderSnap.data) return res.status(404).json({ error: 'Order not found.' });
      const order = orderSnap.data;
      const isAdmin = await isUserAdmin(uid, req.userEmail, req.idToken);

      if (order.customerId !== uid && order.technicianId !== uid && !isAdmin) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const userSnap = await dbGetDoc<UserRecord>(`users/${uid}`, req.idToken);
      const user = userSnap.data;
      const msgId = `msg_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
      const now = new Date().toISOString();
      const msgDoc = {
        id: msgId,
        orderId,
        customerId: order.customerId,
        ...(order.technicianId ? { technicianId: order.technicianId } : {}),
        senderId: uid,
        senderName: user?.name || 'User',
        senderRole: user?.role || 'CUSTOMER',
        text: String(text || '').slice(0, 2000),
        ...(imageUrl ? { imageUrl: String(imageUrl).slice(0, 512) } : {}),
        readBy: [uid],
        createdAt: now,
      };
      await dbSetDoc(`orders/${orderId}/messages/${msgId}`, msgDoc, {}, req.idToken);
      broadcastToOrder(orderId, 'message:created', msgDoc);

      const recipientId = uid === order.customerId ? order.technicianId : order.customerId;
      if (recipientId) {
        await dispatchNotification(
          {
            userId: recipientId,
            type: 'NEW_MESSAGE',
            titleAr: `رسالة جديدة من ${msgDoc.senderName}`,
            titleEn: `New Message from ${msgDoc.senderName}`,
            bodyAr: msgDoc.text || 'أرسل صورة مرفقة',
            bodyEn: msgDoc.text || 'Sent an image attachment',
            orderId,
          },
          req.idToken
        );
      }

      res.status(201).json(msgDoc);
    } catch {
      res.status(500).json({ error: 'Failed to send message.' });
    }
  });

  router.post('/orders/:id/messages/read', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const uid = req.uid!;
      const orderId = req.params.id;
      const rows = await dbQueryCollection<any>(`orders/${orderId}/messages`, {}, req.idToken);
      let updated = 0;
      for (const r of rows) {
        const readBy: string[] = Array.isArray(r.data.readBy) ? r.data.readBy : [];
        if (!readBy.includes(uid)) {
          await dbUpdateDoc(`orders/${orderId}/messages/${r.id}`, { readBy: arrayUnionVal(uid) }, req.idToken);
          updated += 1;
        }
      }
      res.json({ ok: true, updated });
    } catch {
      res.status(500).json({ error: 'Failed to mark messages as read.' });
    }
  });

  // --- Notifications ---
  router.get('/notifications', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const rows = await dbQueryCollection<any>(
        'notifications',
        { where: [{ field: 'userId', op: '==', value: req.uid! }] },
        req.idToken
      );
      const list = rows
        .map((d) => d.data)
        .sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, 60);
      res.json(list);
    } catch {
      res.status(500).json({ error: 'Failed to fetch notifications.' });
    }
  });

  router.post('/notifications/:id/read', requireAuth, async (req: AuthedRequest, res) => {
    const snap = await dbGetDoc<any>(`notifications/${req.params.id}`, req.idToken);
    if (!snap.exists || snap.data?.userId !== req.uid) return res.status(403).json({ error: 'Forbidden' });
    await dbUpdateDoc(`notifications/${req.params.id}`, { isRead: true }, req.idToken);
    res.json({ ok: true });
  });

  router.post('/notifications/read-all', requireAuth, async (req: AuthedRequest, res) => {
    const rows = await dbQueryCollection<any>(
      'notifications',
      { where: [{ field: 'userId', op: '==', value: req.uid! }, { field: 'isRead', op: '==', value: false }] },
      req.idToken
    );
    for (const d of rows) {
      await dbUpdateDoc(`notifications/${d.id}`, { isRead: true }, req.idToken);
    }
    res.json({ ok: true });
  });

  // --- Technician Endpoints ---
  router.get('/technician/dashboard', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const uid = req.uid!;
      const [privSnap, pubSnap, ordersRows, walletSnap, txRows, commRows, revRows, plansRows] = await Promise.all([
        dbGetDoc(`technician_profiles/${uid}`, req.idToken),
        dbGetDoc(`technician_public_profiles/${uid}`, req.idToken),
        dbQueryCollection<Order>('orders', { where: [{ field: 'technicianId', op: '==', value: uid }] }, req.idToken),
        dbGetDoc(`wallets/${uid}`, req.idToken),
        dbQueryCollection<any>('transactions', { where: [{ field: 'uid', op: '==', value: uid }] }, req.idToken),
        dbQueryCollection<any>('commissions', { where: [{ field: 'technicianId', op: '==', value: uid }] }, req.idToken),
        dbQueryCollection<any>('reviews', { where: [{ field: 'technicianId', op: '==', value: uid }] }, req.idToken),
        dbQueryCollection<any>('subscription_plans', { where: [{ field: 'isActive', op: '==', value: true }] }, req.idToken).catch(() => []),
      ]);

      const plans =
        plansRows.length > 0
          ? plansRows.map((d) => d.data).sort((a, b) => (a.priorityWeight || 0) - (b.priorityWeight || 0))
          : INITIAL_PLANS.map((p) => ({ ...p, updatedAt: new Date().toISOString() }));

      res.json({
        profile: privSnap.exists ? privSnap.data : null,
        publicProfile: pubSnap.exists ? pubSnap.data : null,
        orders: ordersRows.map((d) => d.data).sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt))),
        wallet: walletSnap.exists ? walletSnap.data : null,
        transactions: txRows.map((d) => d.data).sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt))),
        commissions: commRows.map((d) => d.data).sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt))),
        reviews: revRows.map((d) => d.data).sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt))),
        plans,
      });
    } catch {
      res.status(500).json({ error: 'Failed to load technician dashboard.' });
    }
  });

  router.get('/technician/available-orders', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const uid = req.uid!;
      const techSnap = await dbGetDoc<any>(`technician_profiles/${uid}`, req.idToken);
      if (!techSnap.exists || !techSnap.data) return res.status(403).json({ error: 'Technician profile required.' });
      const tech = techSnap.data;
      if (tech.verificationStatus !== 'APPROVED') {
        return res.json({ verified: false, orders: [] });
      }

      const ordersRows = await dbQueryCollection<Order>(
        'orders',
        { where: [{ field: 'status', op: 'in', value: ['NEW', 'PENDING'] }] },
        req.idToken
      );
      const specialties: string[] = Array.isArray(tech.specialtyIds) ? tech.specialtyIds : [];

      const available = await Promise.all(
        ordersRows.map(async (d) => {
          const o = d.data;
          const myOfferRows = await dbQueryCollection<any>(
            `orders/${d.id}/offers`,
            { where: [{ field: 'technicianId', op: '==', value: uid }], limit: 1 },
            req.idToken
          );
          let distanceKm: number | undefined;
          if (typeof tech.baseLat === 'number' && typeof tech.baseLng === 'number') {
            distanceKm = haversineKm(tech.baseLat, tech.baseLng, o.lat, o.lng);
          }
          return {
            ...o,
            distanceKm,
            matchesSpecialty: specialties.length === 0 || specialties.includes(o.serviceId),
            myOffer: myOfferRows.length === 0 ? null : myOfferRows[0].data,
          };
        })
      );

      available.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      res.json({ verified: true, orders: available });
    } catch {
      res.status(500).json({ error: 'Failed to load available orders.' });
    }
  });

  router.post('/technician/kyc', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const uid = req.uid!;
      const {
        displayName, bio, nationalIdNumber, nationalIdDocUrl, certificateDocUrl,
        specialtyIds, serviceAreas, workingHours, baseLat, baseLng,
      } = req.body || {};

      if (!displayName || !nationalIdNumber || !nationalIdDocUrl || !Array.isArray(specialtyIds) || specialtyIds.length === 0) {
        return res.status(400).json({
          error: 'Display name, national ID number, ID document upload, and at least one specialty are required.',
        });
      }

      const now = new Date().toISOString();
      const updatePriv = {
        uid,
        displayName: String(displayName).slice(0, 120),
        bio: String(bio || '').slice(0, 1500),
        nationalIdNumber: String(nationalIdNumber).slice(0, 64),
        nationalIdDocUrl: String(nationalIdDocUrl).slice(0, 512),
        certificateDocUrl: String(certificateDocUrl || '').slice(0, 512),
        verificationStatus: 'PENDING',
        specialtyIds: specialtyIds.slice(0, 14),
        serviceAreas: Array.isArray(serviceAreas) ? serviceAreas.slice(0, 20) : [],
        ...(workingHours ? { workingHours } : {}),
        ...(typeof baseLat === 'number' ? { baseLat } : {}),
        ...(typeof baseLng === 'number' ? { baseLng } : {}),
        updatedAt: now,
      };

      await dbSetDoc(`technician_profiles/${uid}`, updatePriv, { merge: true }, req.idToken);
      await dbSetDoc(
        `technician_public_profiles/${uid}`,
        {
          uid,
          displayName: updatePriv.displayName,
          bio: updatePriv.bio,
          specialtyIds: updatePriv.specialtyIds,
          serviceAreas: updatePriv.serviceAreas,
          ...(workingHours ? { workingHours } : {}),
          ...(typeof baseLat === 'number' ? { baseLat } : {}),
          ...(typeof baseLng === 'number' ? { baseLng } : {}),
          verificationStatus: 'PENDING',
          updatedAt: now,
        },
        { merge: true },
        req.idToken
      );

      broadcastToAdmins('verification:submitted', { uid, displayName: updatePriv.displayName });
      res.json({ ok: true, verificationStatus: 'PENDING' });
    } catch {
      res.status(500).json({ error: 'Failed to submit verification documents.' });
    }
  });

  router.put('/technician/settings', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const uid = req.uid!;
      const { displayName, bio, specialtyIds, serviceAreas, workingHours, isAvailable, baseLat, baseLng, phone } = req.body || {};
      const now = new Date().toISOString();
      const shared: any = {
        uid,
        ...(displayName ? { displayName: String(displayName).slice(0, 120) } : {}),
        ...(bio !== undefined ? { bio: String(bio).slice(0, 1500) } : {}),
        ...(Array.isArray(specialtyIds) ? { specialtyIds: specialtyIds.slice(0, 14) } : {}),
        ...(Array.isArray(serviceAreas) ? { serviceAreas: serviceAreas.slice(0, 20) } : {}),
        ...(workingHours ? { workingHours } : {}),
        ...(typeof isAvailable === 'boolean' ? { isAvailable } : {}),
        ...(typeof baseLat === 'number' ? { baseLat } : {}),
        ...(typeof baseLng === 'number' ? { baseLng } : {}),
        updatedAt: now,
      };

      await dbSetDoc(`technician_profiles/${uid}`, shared, { merge: true }, req.idToken);
      await dbSetDoc(`technician_public_profiles/${uid}`, shared, { merge: true }, req.idToken);
      if (phone !== undefined || displayName) {
        await dbSetDoc(
          `users/${uid}`,
          {
            ...(displayName ? { name: String(displayName).slice(0, 120) } : {}),
            ...(phone !== undefined ? { phone: String(phone).slice(0, 32) } : {}),
            updatedAt: now,
          },
          { merge: true },
          req.idToken
        );
      }
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Failed to update technician settings.' });
    }
  });

  router.post('/technician/location', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const uid = req.uid!;
      const { lat, lng, activeOrderId } = req.body || {};
      if (typeof lat !== 'number' || typeof lng !== 'number') {
        return res.status(400).json({ error: 'Valid lat/lng required.' });
      }
      const now = new Date().toISOString();
      let customerId = '';
      if (activeOrderId) {
        const ordSnap = await dbGetDoc<Order>(`orders/${String(activeOrderId)}`, req.idToken);
        if (ordSnap.exists && ordSnap.data?.technicianId === uid) {
          customerId = ordSnap.data.customerId;
        }
      }
      const locDoc = {
        uid,
        ...(activeOrderId ? { activeOrderId: String(activeOrderId) } : {}),
        ...(customerId ? { customerId } : {}),
        lat,
        lng,
        updatedAt: now,
      };
      await dbSetDoc(`technician_locations/${uid}`, locDoc, { merge: true }, req.idToken);
      if (activeOrderId) {
        broadcastToOrder(String(activeOrderId), 'location:updated', locDoc);
      }
      res.json({ ok: true, location: locDoc });
    } catch {
      res.status(500).json({ error: 'Failed to update GPS location.' });
    }
  });

  router.post('/technician/withdraw', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const uid = req.uid!;
      const { amount, destination } = req.body || {};
      const numAmount = round2(Number(amount));
      if (!numAmount || numAmount < 50 || !destination) {
        return res.status(400).json({ error: 'Minimum withdrawal is 50 EGP and destination details are required.' });
      }
      const now = new Date().toISOString();
      const txId = `tx_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;

      const wSnap = await dbGetDoc<any>(`wallets/${uid}`, req.idToken);
      const bal = wSnap.exists && wSnap.data ? Number(wSnap.data.balance || 0) : 0;
      if (bal < numAmount) return res.status(400).json({ error: 'Insufficient wallet balance.' });

      await dbUpdateDoc(
        `wallets/${uid}`,
        {
          balance: round2(bal - numAmount),
          pendingBalance: incrementVal(numAmount),
          updatedAt: now,
        },
        req.idToken
      );
      await dbSetDoc(
        `transactions/${txId}`,
        {
          id: txId,
          uid,
          type: 'WITHDRAWAL',
          amount: numAmount,
          provider: 'SYSTEM',
          status: 'PENDING',
          notes: String(destination).slice(0, 200),
          createdAt: now,
        },
        {},
        req.idToken
      );

      broadcastToAdmins('withdrawal:requested', { txId, uid, amount: numAmount });
      res.json({ ok: true, txId });
    } catch {
      res.status(500).json({ error: 'Failed to request withdrawal.' });
    }
  });

  router.post('/technician/subscribe', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const uid = req.uid!;
      const { planId } = req.body || {};
      if (!['FREE', 'PRO', 'PREMIUM'].includes(planId)) return res.status(400).json({ error: 'Invalid plan.' });

      let plan: any = null;
      const planSnap = await dbGetDoc<any>(`subscription_plans/${planId}`, req.idToken).catch(() => ({
        exists: false,
        id: planId,
        data: null,
      }));
      if (planSnap.exists && planSnap.data) plan = planSnap.data;
      else plan = INITIAL_PLANS.find((p) => p.id === planId);
      if (!plan) return res.status(404).json({ error: 'Plan not found.' });

      const price = round2(Number(plan.monthlyPrice || 0));
      const now = new Date().toISOString();

      if (price > 0) {
        const wSnap = await dbGetDoc<any>(`wallets/${uid}`, req.idToken);
        const bal = wSnap.exists && wSnap.data ? Number(wSnap.data.balance || 0) : 0;
        if (bal < price) {
          return res.status(400).json({ error: 'Insufficient wallet balance to activate paid tier. Top up your wallet first.' });
        }
        await dbUpdateDoc(`wallets/${uid}`, { balance: round2(bal - price), updatedAt: now }, req.idToken);
        const txId = `tx_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
        await dbSetDoc(
          `transactions/${txId}`,
          {
            id: txId,
            uid,
            type: 'SUBSCRIPTION',
            amount: price,
            provider: 'WALLET',
            status: 'VERIFIED',
            notes: `Subscription upgrade to ${planId}`,
            createdAt: now,
          },
          {},
          req.idToken
        );
      }

      await dbSetDoc(`technician_profiles/${uid}`, { uid, subscriptionPlanId: planId, updatedAt: now }, { merge: true }, req.idToken);
      await dbSetDoc(`technician_public_profiles/${uid}`, { uid, subscriptionPlanId: planId, updatedAt: now }, { merge: true }, req.idToken);
      res.json({ ok: true, planId });
    } catch {
      res.status(500).json({ error: 'Subscription update failed.' });
    }
  });

  // --- Admin Console Endpoints (Strictly Protected) ---
  router.get('/admin/overview', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    try {
      const [usersRows, techPrivRows, ordersRows, commRows, invRows, cmpRows, settingsSnap] = await Promise.all([
        dbQueryCollection<UserRecord>('users', {}, req.idToken),
        dbQueryCollection<any>('technician_profiles', {}, req.idToken),
        dbQueryCollection<Order>('orders', {}, req.idToken),
        dbQueryCollection<any>('commissions', {}, req.idToken),
        dbQueryCollection<any>('invoices', {}, req.idToken),
        dbQueryCollection<any>('complaints', {}, req.idToken),
        dbGetDoc<PlatformSettings>('platform_settings/global', req.idToken),
      ]);

      let customersCount = 0;
      let techniciansCount = 0;
      for (const u of usersRows) {
        if (u.data.role === 'CUSTOMER') customersCount += 1;
        if (u.data.role === 'TECHNICIAN') techniciansCount += 1;
      }

      const pendingVerificationsCount = techPrivRows.filter((t) => t.data.verificationStatus === 'PENDING').length;
      let newOrdersCount = 0;
      let completedOrdersCount = 0;
      for (const o of ordersRows) {
        if (o.data.status === 'NEW' || o.data.status === 'PENDING') newOrdersCount += 1;
        if (o.data.status === 'COMPLETED' || o.data.status === 'PAID') completedOrdersCount += 1;
      }

      const totalRevenue = invRows.reduce((s, inv) => s + Number(inv.data.total || 0), 0);
      const totalCommissions = commRows.reduce((s, c) => s + Number(c.data.commissionAmount || 0), 0);
      const openComplaintsCount = cmpRows.filter((d) => d.data.status === 'OPEN').length;

      res.json({
        customersCount,
        techniciansCount,
        pendingVerificationsCount,
        newOrdersCount,
        completedOrdersCount,
        totalOrdersCount: ordersRows.length,
        totalRevenue: round2(totalRevenue),
        totalCommissions: round2(totalCommissions),
        openComplaintsCount,
        commissionRatePercent: settingsSnap.exists && settingsSnap.data ? settingsSnap.data.commissionRatePercent : 10,
      });
    } catch {
      res.status(500).json({ error: 'Failed to load admin overview.' });
    }
  });

  router.get('/admin/reports', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    try {
      const period = typeof req.query.period === 'string' ? req.query.period : 'monthly';
      const [ordersRows, commRows, invRows] = await Promise.all([
        dbQueryCollection<Order>('orders', {}, req.idToken),
        dbQueryCollection<any>('commissions', {}, req.idToken),
        dbQueryCollection<any>('invoices', {}, req.idToken),
      ]);

      const sliceLen = period === 'daily' ? 10 : period === 'yearly' ? 4 : 7;
      const buckets: Record<string, { bucket: string; orders: number; revenue: number; commissions: number }> = {};

      for (const d of ordersRows) {
        const key = String(d.data.createdAt || '').slice(0, sliceLen) || 'unknown';
        if (!buckets[key]) buckets[key] = { bucket: key, orders: 0, revenue: 0, commissions: 0 };
        buckets[key].orders += 1;
      }
      for (const d of invRows) {
        const key = String(d.data.createdAt || '').slice(0, sliceLen) || 'unknown';
        if (!buckets[key]) buckets[key] = { bucket: key, orders: 0, revenue: 0, commissions: 0 };
        buckets[key].revenue = round2(buckets[key].revenue + Number(d.data.total || 0));
      }
      for (const d of commRows) {
        const key = String(d.data.createdAt || '').slice(0, sliceLen) || 'unknown';
        if (!buckets[key]) buckets[key] = { bucket: key, orders: 0, revenue: 0, commissions: 0 };
        buckets[key].commissions = round2(buckets[key].commissions + Number(d.data.commissionAmount || 0));
      }

      const rows = Object.values(buckets).sort((a, b) => b.bucket.localeCompare(a.bucket));
      res.json({ period, rows });
    } catch {
      res.status(500).json({ error: 'Failed to generate reports.' });
    }
  });

  router.get('/admin/customers', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const rows = await dbQueryCollection<UserRecord>('users', { where: [{ field: 'role', op: '==', value: 'CUSTOMER' }] }, req.idToken);
    res.json(rows.map((d) => d.data));
  });

  router.get('/admin/technicians', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const [usersRows, privRows, pubRows] = await Promise.all([
      dbQueryCollection<UserRecord>('users', { where: [{ field: 'role', op: '==', value: 'TECHNICIAN' }] }, req.idToken),
      dbQueryCollection<any>('technician_profiles', {}, req.idToken),
      dbQueryCollection<any>('technician_public_profiles', {}, req.idToken),
    ]);
    const privMap: Record<string, any> = {};
    privRows.forEach((d) => (privMap[d.id] = d.data));
    const pubMap: Record<string, any> = {};
    pubRows.forEach((d) => (pubMap[d.id] = d.data));

    res.json(
      usersRows.map((d) => ({
        user: d.data,
        privateProfile: privMap[d.id] || null,
        publicProfile: pubMap[d.id] || null,
      }))
    );
  });

  router.post('/admin/users/:uid/status', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const { status } = req.body || {};
    if (status !== 'ACTIVE' && status !== 'SUSPENDED') return res.status(400).json({ error: 'Invalid status' });
    await dbUpdateDoc(`users/${req.params.uid}`, { status, updatedAt: new Date().toISOString() }, req.idToken);
    await recordAdminLog(req.uid!, req.userEmail || '', `SET_USER_${status}`, 'users', req.params.uid, `Status changed to ${status}`, req.idToken);
    res.json({ ok: true });
  });

  router.post('/admin/technicians/:uid/verify', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    try {
      const targetUid = req.params.uid;
      const { decision, rejectionReason } = req.body || {};
      if (decision !== 'APPROVED' && decision !== 'REJECTED') {
        return res.status(400).json({ error: 'Decision must be APPROVED or REJECTED.' });
      }
      const now = new Date().toISOString();
      await dbSetDoc(
        `technician_profiles/${targetUid}`,
        {
          verificationStatus: decision,
          rejectionReason: decision === 'REJECTED' ? String(rejectionReason || 'Documents incomplete').slice(0, 500) : '',
          updatedAt: now,
        },
        { merge: true },
        req.idToken
      );
      await dbSetDoc(
        `technician_public_profiles/${targetUid}`,
        { verificationStatus: decision, updatedAt: now },
        { merge: true },
        req.idToken
      );

      await dispatchNotification(
        {
          userId: targetUid,
          type: 'VERIFICATION_UPDATED',
          titleAr: decision === 'APPROVED' ? 'تم توثيق حسابك كفني معتمد' : 'تحديث بخصوص توثيق الحساب',
          titleEn: decision === 'APPROVED' ? 'Your Technician Account Is Approved' : 'Verification Update',
          bodyAr:
            decision === 'APPROVED'
              ? 'أصبح ملفك الآن ظاهراً للعملاء ويمكنك تقديم عروض الأسعار.'
              : `تم رفض التوثيق: ${rejectionReason || 'يرجى استكمال المستندات.'}`,
          bodyEn:
            decision === 'APPROVED'
              ? 'Your profile is now live in customer search and eligible to quote orders.'
              : `Verification declined: ${rejectionReason || 'Please re-submit clear documents.'}`,
        },
        req.idToken
      );

      await recordAdminLog(
        req.uid!,
        req.userEmail || '',
        `TECHNICIAN_${decision}`,
        'technician_profiles',
        targetUid,
        decision === 'REJECTED' ? String(rejectionReason || '') : 'Approved technician KYC',
        req.idToken
      );
      res.json({ ok: true, decision });
    } catch {
      res.status(500).json({ error: 'Failed to process technician verification.' });
    }
  });

  // Services CRUD
  router.get('/admin/services', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const rows = await dbQueryCollection<ServiceCategory>('services', {}, req.idToken);
    res.json(rows.map((d) => d.data).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)));
  });

  router.post('/admin/services', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const { nameAr, nameEn, descriptionAr, descriptionEn, iconName, imageUrl, basePrice, sortOrder } = req.body || {};
    if (!nameAr || !nameEn) return res.status(400).json({ error: 'Arabic and English names are required.' });
    const slug = String(nameEn).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `svc-${Date.now()}`;
    const id = slug;
    const svc = {
      id,
      slug,
      nameAr: String(nameAr).slice(0, 120),
      nameEn: String(nameEn).slice(0, 120),
      descriptionAr: String(descriptionAr || '').slice(0, 1000),
      descriptionEn: String(descriptionEn || '').slice(0, 1000),
      iconName: String(iconName || 'Wrench'),
      imageUrl: String(imageUrl || '/src/assets/images/hero_interiorx_luxury_1794954856889.jpg'),
      basePrice: Number(basePrice || 300),
      isActive: true,
      sortOrder: Number(sortOrder || 99),
      updatedAt: new Date().toISOString(),
    };
    await dbSetDoc(`services/${id}`, svc, {}, req.idToken);
    await recordAdminLog(req.uid!, req.userEmail || '', 'CREATE_SERVICE', 'services', id, `Created ${nameEn}`, req.idToken);
    res.status(201).json(svc);
  });

  router.put('/admin/services/:id', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const id = req.params.id;
    const updates = { ...req.body, updatedAt: new Date().toISOString() };
    delete updates.id;
    await dbSetDoc(`services/${id}`, updates, { merge: true }, req.idToken);
    await recordAdminLog(req.uid!, req.userEmail || '', 'UPDATE_SERVICE', 'services', id, 'Updated service category', req.idToken);
    res.json({ ok: true });
  });

  router.delete('/admin/services/:id', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const id = req.params.id;
    await dbDeleteDoc(`services/${id}`, req.idToken);
    await recordAdminLog(req.uid!, req.userEmail || '', 'DELETE_SERVICE', 'services', id, 'Deleted service category', req.idToken);
    res.json({ ok: true });
  });

  // Orders Monitor
  router.get('/admin/orders', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const rows = await dbQueryCollection<Order>('orders', {}, req.idToken);
    res.json(rows.map((d) => d.data).sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt))));
  });

  router.post('/admin/orders/:id/status', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const { status, note } = req.body || {};
    const snap = await dbGetDoc<Order>(`orders/${req.params.id}`, req.idToken);
    if (!snap.exists || !snap.data) return res.status(404).json({ error: 'Order not found.' });
    const now = new Date().toISOString();
    const histId = `hist_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await dbUpdateDoc(`orders/${req.params.id}`, { status, updatedAt: now }, req.idToken);
    await dbSetDoc(
      `orders/${req.params.id}/status_history/${histId}`,
      {
        id: histId,
        orderId: req.params.id,
        customerId: snap.data.customerId,
        fromStatus: snap.data.status,
        toStatus: status,
        changedByUid: req.uid!,
        changedByRole: 'ADMIN',
        note: String(note || `Admin override to ${status}`),
        createdAt: now,
      },
      {},
      req.idToken
    );
    await recordAdminLog(req.uid!, req.userEmail || '', 'OVERRIDE_ORDER_STATUS', 'orders', req.params.id, `Set status to ${status}`, req.idToken);
    res.json({ ok: true });
  });

  // Payments, Withdrawals & Commissions
  router.get('/admin/payments', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const [txRows, commRows, invRows] = await Promise.all([
      dbQueryCollection<any>('transactions', {}, req.idToken),
      dbQueryCollection<any>('commissions', {}, req.idToken),
      dbQueryCollection<any>('invoices', {}, req.idToken),
    ]);
    res.json({
      transactions: txRows.map((d) => d.data).sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt))),
      commissions: commRows.map((d) => d.data).sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt))),
      invoices: invRows.map((d) => d.data).sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt))),
    });
  });

  router.post('/admin/withdrawals/:txId/process', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const { approve } = req.body || {};
    const txSnap = await dbGetDoc<any>(`transactions/${req.params.txId}`, req.idToken);
    if (!txSnap.exists || !txSnap.data) return res.status(404).json({ error: 'Transaction not found.' });
    const t = txSnap.data;
    if (t.type !== 'WITHDRAWAL' || t.status !== 'PENDING') return res.status(400).json({ error: 'Invalid withdrawal transaction.' });

    const now = new Date().toISOString();
    await dbUpdateDoc(`transactions/${req.params.txId}`, { status: approve ? 'VERIFIED' : 'REJECTED' }, req.idToken);
    if (approve) {
      await dbUpdateDoc(`wallets/${t.uid}`, { pendingBalance: incrementVal(-t.amount), updatedAt: now }, req.idToken);
    } else {
      await dbUpdateDoc(
        `wallets/${t.uid}`,
        { pendingBalance: incrementVal(-t.amount), balance: incrementVal(t.amount), updatedAt: now },
        req.idToken
      );
    }

    await recordAdminLog(
      req.uid!,
      req.userEmail || '',
      approve ? 'APPROVE_WITHDRAWAL' : 'REJECT_WITHDRAWAL',
      'transactions',
      req.params.txId,
      approve ? 'Approved technician payout' : 'Rejected and refunded to wallet',
      req.idToken
    );
    res.json({ ok: true });
  });

  router.post('/admin/topups/:txId/process', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const { approve } = req.body || {};
    const txSnap = await dbGetDoc<any>(`transactions/${req.params.txId}`, req.idToken);
    if (!txSnap.exists || !txSnap.data) return res.status(404).json({ error: 'Transaction not found.' });
    const t = txSnap.data;
    if (t.type !== 'TOPUP' || t.status !== 'PENDING') return res.status(400).json({ error: 'Invalid top-up transaction.' });

    const now = new Date().toISOString();
    await dbUpdateDoc(`transactions/${req.params.txId}`, { status: approve ? 'VERIFIED' : 'REJECTED' }, req.idToken);
    if (approve) {
      await dbSetDoc(
        `wallets/${t.uid}`,
        { uid: t.uid, balance: incrementVal(Number(t.amount)), currency: 'EGP', updatedAt: now },
        { merge: true },
        req.idToken
      );
    }

    await dispatchNotification(
      {
        userId: t.uid,
        type: 'TOPUP_PROCESSED',
        titleAr: approve ? 'تم اعتماد شحن المحفظة' : 'تم رفض طلب شحن المحفظة',
        titleEn: approve ? 'Wallet Top-Up Approved' : 'Wallet Top-Up Rejected',
        bodyAr: approve
          ? `تم إضافة ${t.amount} ج.م إلى رصيد محفظتك بنجاح.`
          : `لم يتم اعتماد طلب شحن المحفظة بمبلغ ${t.amount} ج.م.`,
        bodyEn: approve
          ? `${t.amount} EGP has been credited to your wallet.`
          : `Your wallet top-up request of ${t.amount} EGP was declined.`,
      },
      req.idToken
    );

    await recordAdminLog(
      req.uid!,
      req.userEmail || '',
      approve ? 'APPROVE_TOPUP' : 'REJECT_TOPUP',
      'transactions',
      req.params.txId,
      approve ? `Credited ${t.amount} EGP to wallet ${t.uid}` : `Rejected top-up ${t.amount} EGP`,
      req.idToken
    );
    res.json({ ok: true });
  });

  router.put('/admin/settings/commission', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const rate = Number(req.body?.commissionRatePercent);
    if (Number.isNaN(rate) || rate < 0 || rate > 50) {
      return res.status(400).json({ error: 'Commission rate must be between 0% and 50%.' });
    }
    await dbSetDoc('platform_settings/global', { commissionRatePercent: rate, updatedAt: new Date().toISOString() }, { merge: true }, req.idToken);
    await recordAdminLog(req.uid!, req.userEmail || '', 'UPDATE_COMMISSION_RATE', 'platform_settings', 'global', `Set to ${rate}%`, req.idToken);
    res.json({ ok: true, commissionRatePercent: rate });
  });

  router.put('/admin/plans/:planId', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const planId = req.params.planId as SubscriptionPlanId;
    if (!['FREE', 'PRO', 'PREMIUM'].includes(planId)) return res.status(400).json({ error: 'Invalid plan ID' });
    const { nameAr, nameEn, monthlyPrice, featuresAr, featuresEn, isActive } = req.body || {};
    await dbSetDoc(
      `subscription_plans/${planId}`,
      {
        ...(nameAr ? { nameAr } : {}),
        ...(nameEn ? { nameEn } : {}),
        ...(monthlyPrice !== undefined ? { monthlyPrice: Number(monthlyPrice) } : {}),
        ...(Array.isArray(featuresAr) ? { featuresAr } : {}),
        ...(Array.isArray(featuresEn) ? { featuresEn } : {}),
        ...(typeof isActive === 'boolean' ? { isActive } : {}),
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
      req.idToken
    );
    await recordAdminLog(req.uid!, req.userEmail || '', 'UPDATE_PLAN', 'subscription_plans', planId, `Updated ${planId} tier`, req.idToken);
    res.json({ ok: true });
  });

  // Complaints & Reviews
  router.get('/admin/complaints', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const rows = await dbQueryCollection<any>('complaints', {}, req.idToken);
    res.json(rows.map((d) => d.data).sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt))));
  });

  router.post('/admin/complaints/:id/resolve', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const { status, adminResolution } = req.body || {};
    if (!['IN_REVIEW', 'RESOLVED', 'DISMISSED'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const snap = await dbGetDoc<any>(`complaints/${req.params.id}`, req.idToken);
    if (!snap.exists || !snap.data) return res.status(404).json({ error: 'Complaint not found' });

    await dbUpdateDoc(`complaints/${req.params.id}`, { status, adminResolution: String(adminResolution || ''), updatedAt: new Date().toISOString() }, req.idToken);
    await dispatchNotification(
      {
        userId: snap.data.reporterId,
        type: 'COMPLAINT_UPDATED',
        titleAr: 'تحديث بخصوص الشكوى',
        titleEn: 'Complaint Status Updated',
        bodyAr: `الحالة: ${status} — ${adminResolution || ''}`,
        bodyEn: `Status: ${status} — ${adminResolution || ''}`,
      },
      req.idToken
    );
    await recordAdminLog(req.uid!, req.userEmail || '', 'RESOLVE_COMPLAINT', 'complaints', req.params.id, `Status: ${status}`, req.idToken);
    res.json({ ok: true });
  });

  router.get('/admin/reviews', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const rows = await dbQueryCollection<any>('reviews', {}, req.idToken);
    res.json(rows.map((d) => d.data).sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt))));
  });

  router.delete('/admin/reviews/:id', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    await dbDeleteDoc(`reviews/${req.params.id}`, req.idToken);
    await recordAdminLog(req.uid!, req.userEmail || '', 'DELETE_REVIEW', 'reviews', req.params.id, 'Removed review', req.idToken);
    res.json({ ok: true });
  });

  router.post('/admin/notifications/broadcast', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const { targetRole, titleAr, titleEn, bodyAr, bodyEn } = req.body || {};
    if (!titleAr || !bodyAr) return res.status(400).json({ error: 'Title and body required.' });
    const usersRows = await dbQueryCollection<UserRecord>('users', {}, req.idToken);
    let count = 0;
    for (const u of usersRows) {
      if (targetRole === 'ALL' || targetRole === u.data.role) {
        await dispatchNotification(
          {
            userId: u.id,
            type: 'ADMIN_BROADCAST',
            titleAr,
            titleEn: titleEn || titleAr,
            bodyAr,
            bodyEn: bodyEn || bodyAr,
          },
          req.idToken
        );
        count += 1;
      }
    }
    await recordAdminLog(req.uid!, req.userEmail || '', 'BROADCAST_NOTIFICATION', 'notifications', targetRole || 'ALL', `Sent to ${count} users`, req.idToken);
    res.json({ ok: true, count });
  });

  router.put('/admin/cms', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const updates = { ...req.body, id: 'public_cms', updatedAt: new Date().toISOString() };
    await dbSetDoc('platform_settings/public_cms', updates, { merge: true }, req.idToken);
    await recordAdminLog(req.uid!, req.userEmail || '', 'UPDATE_CMS', 'platform_settings', 'public_cms', 'Updated public CMS pages', req.idToken);
    res.json({ ok: true });
  });

  router.get('/admin/contact-messages', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const rows = await dbQueryCollection<any>('contact_messages', {}, req.idToken);
    res.json(rows.map((d) => d.data).sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt))));
  });

  router.get('/admin/logs', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const rows = await dbQueryCollection<any>('admin_logs', {}, req.idToken);
    res.json(rows.map((d) => d.data).sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 150));
  });

  return router;
}
