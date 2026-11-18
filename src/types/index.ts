export type UserRole = 'CUSTOMER' | 'TECHNICIAN' | 'ADMIN';
export type AccountStatus = 'ACTIVE' | 'SUSPENDED';
export type VerificationStatus = 'UNSUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED';
export type SubscriptionPlanId = 'FREE' | 'PRO' | 'PREMIUM';

export type OrderStatus =
  | 'NEW'
  | 'PENDING'
  | 'ACCEPTED'
  | 'TECHNICIAN_ON_THE_WAY'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'PAID'
  | 'CANCELLED';

export type OfferStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CLOSED';
export type Language = 'ar' | 'en';
export type ThemeMode = 'light' | 'dark';

export interface UserRecord {
  uid: string;
  email: string;
  name: string;
  phone?: string;
  role: UserRole;
  status: AccountStatus;
  fcmToken?: string;
  preferredLang?: Language;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerProfile {
  uid: string;
  address?: string;
  city?: string;
  lat?: number;
  lng?: number;
  favoriteTechnicianIds: string[];
  updatedAt: string;
}

export interface WorkingHours {
  days: string[];
  from: string;
  to: string;
}

export interface TechnicianPrivateProfile {
  uid: string;
  displayName: string;
  bio: string;
  nationalIdNumber: string;
  nationalIdDocUrl: string;
  certificateDocUrl: string;
  verificationStatus: VerificationStatus;
  rejectionReason?: string;
  specialtyIds: string[];
  serviceAreas: string[];
  workingHours: WorkingHours;
  subscriptionPlanId: SubscriptionPlanId;
  isAvailable: boolean;
  baseLat?: number;
  baseLng?: number;
  updatedAt: string;
}

export interface TechnicianPublicProfile {
  uid: string;
  displayName: string;
  bio: string;
  specialtyIds: string[];
  serviceAreas: string[];
  workingHours: WorkingHours;
  verificationStatus: 'APPROVED';
  subscriptionPlanId: SubscriptionPlanId;
  ratingAvg: number;
  ratingCount: number;
  completedJobsCount: number;
  isAvailable: boolean;
  baseLat?: number;
  baseLng?: number;
  updatedAt: string;
  distanceKm?: number;
}

export interface ServiceCategory {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  iconName: string;
  imageUrl: string;
  basePrice: number;
  isActive: boolean;
  sortOrder: number;
  updatedAt: string;
}

export interface PriceRevisionRequest {
  requestedAmount: number;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
}

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  technicianId?: string;
  technicianName?: string;
  serviceId: string;
  serviceNameAr: string;
  serviceNameEn: string;
  title: string;
  description: string;
  address: string;
  lat: number;
  lng: number;
  scheduledAt: string;
  budgetEstimate?: number;
  finalPrice?: number;
  pendingPriceRevision?: PriceRevisionRequest | null;
  mediaUrls: string[];
  status: OrderStatus;
  acceptedOfferId?: string;
  cashPaymentPending?: {
    requestedByUid: string;
    requestedAt: string;
    amount: number;
  } | null;
  reviewed?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OrderOffer {
  id: string;
  orderId: string;
  customerId: string;
  technicianId: string;
  technicianName: string;
  technicianRating?: number;
  technicianPlan?: SubscriptionPlanId;
  amount: number;
  estimatedDays: number;
  notes: string;
  status: OfferStatus;
  createdAt: string;
}

export interface OrderStatusHistory {
  id: string;
  orderId: string;
  customerId: string;
  technicianId?: string;
  fromStatus: OrderStatus | 'NONE';
  toStatus: OrderStatus;
  changedByUid: string;
  changedByRole: UserRole | 'SYSTEM';
  note: string;
  createdAt: string;
}

export interface OrderMessage {
  id: string;
  orderId: string;
  customerId: string;
  technicianId?: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  text: string;
  imageUrl?: string;
  readBy: string[];
  createdAt: string;
}

export interface TechnicianLocation {
  uid: string;
  activeOrderId?: string;
  customerId?: string;
  lat: number;
  lng: number;
  updatedAt: string;
}

export interface Wallet {
  uid: string;
  balance: number;
  pendingBalance: number;
  totalEarned: number;
  totalSpent: number;
  currency: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  uid: string;
  orderId?: string;
  type: 'TOPUP' | 'PAYMENT' | 'EARNING' | 'COMMISSION' | 'WITHDRAWAL' | 'SUBSCRIPTION';
  amount: number;
  provider: 'PAYMOB' | 'FAWRY' | 'WALLET' | 'CASH' | 'BANK_TRANSFER' | 'SYSTEM';
  status: 'PENDING' | 'VERIFIED' | 'FAILED' | 'REJECTED';
  externalRef?: string;
  notes?: string;
  createdAt: string;
}

export interface Commission {
  id: string;
  orderId: string;
  technicianId: string;
  grossAmount: number;
  ratePercent: number;
  commissionAmount: number;
  technicianNetAmount: number;
  createdAt: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  orderId: string;
  customerId: string;
  technicianId: string;
  subtotal: number;
  platformFee: number;
  total: number;
  paymentProvider: string;
  status: 'ISSUED' | 'PAID';
  createdAt: string;
}

export interface SubscriptionPlan {
  id: SubscriptionPlanId;
  nameAr: string;
  nameEn: string;
  monthlyPrice: number;
  priorityWeight: number;
  featuresAr: string[];
  featuresEn: string[];
  isActive: boolean;
  updatedAt: string;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  type: string;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  orderId?: string;
  isRead: boolean;
  createdAt: string;
}

export interface Review {
  id: string;
  orderId: string;
  customerId: string;
  customerName: string;
  technicianId: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface Complaint {
  id: string;
  orderId: string;
  reporterId: string;
  reporterName: string;
  reporterRole: 'CUSTOMER' | 'TECHNICIAN';
  subject: string;
  description: string;
  status: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'DISMISSED';
  adminResolution?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminLog {
  id: string;
  adminUid: string;
  adminEmail: string;
  action: string;
  targetCollection: string;
  targetId: string;
  details: string;
  createdAt: string;
}

export interface PlatformSettings {
  id: 'global';
  commissionRatePercent: number;
  currency: string;
  supportEmail: string;
  supportPhone: string;
  updatedAt: string;
}

export interface PublicCMSContent {
  id: 'public_cms';
  heroTitleAr: string;
  heroTitleEn: string;
  heroSubtitleAr: string;
  heroSubtitleEn: string;
  aboutAr: string;
  aboutEn: string;
  termsAr: string;
  termsEn: string;
  privacyAr: string;
  privacyEn: string;
  faqs: Array<{
    qAr: string;
    qEn: string;
    aAr: string;
    aEn: string;
  }>;
  updatedAt: string;
}

export interface IntegrationsStatus {
  googleMapsConfigured: boolean;
  paymobConfigured: boolean;
  fawryConfigured: boolean;
  fcmVapidConfigured: boolean;
  firebaseAdminConfigured: boolean;
}
