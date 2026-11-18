# InteriorX Firestore Security Specification

## 1. Data Invariants
1. **PII Isolation**: `users/{uid}` and `technician_profiles/{uid}` (containing email, phone, national ID documents) are strictly readable only by the document owner or a verified Admin. Public technician discovery reads `technician_public_profiles/{uid}` which contains zero PII.
2. **Server-Authoritative Financial Ledger**: Clients can NEVER create, update, or delete documents in `wallets`, `transactions`, `commissions`, `invoices`, `subscriptions`, `platform_settings`, or `admin_logs`. All financial mutations run exclusively on the Node.js server via `firebase-admin` after verifying auth and payment signatures.
3. **No Self-Assigned Admin or Verification**: Users cannot set `role: "ADMIN"` or `verificationStatus: "APPROVED"` from client SDKs.
4. **Order Lifecycle Integrity**: Order creation, offer acceptance, status transitions, and price revisions are strictly validated by server endpoints and enforced in rules so terminal states (`PAID`, `CANCELLED`) cannot be altered by clients.
5. **Order Subcollection Master Gate**: Messages, offers, and status history under `/orders/{orderId}/...` verify parent order participation (`customerId == uid` or `technicianId == uid` or `isAdmin()`).
6. **Verified Email Requirement**: Standard authenticated operations require `request.auth.token.email_verified == true`.

## 2. The "Dirty Dozen" Attack Payloads
1. **Self-Promote to Admin**: `POST /users/{uid}` with `{ role: "ADMIN", status: "ACTIVE" }` -> **PERMISSION_DENIED**
2. **Read Another User's PII**: `GET /users/{otherUid}` as Customer -> **PERMISSION_DENIED**
3. **Tamper Wallet Balance**: `UPDATE /wallets/{uid}` with `{ balance: 999999 }` -> **PERMISSION_DENIED**
4. **Fake Invoice Creation**: `CREATE /invoices/{id}` from client -> **PERMISSION_DENIED**
5. **Self-Verify Technician**: `UPDATE /technician_profiles/{uid}` with `{ verificationStatus: "APPROVED" }` -> **PERMISSION_DENIED**
6. **Shadow Field Injection on Notification**: `UPDATE /notifications/{id}` adding `{ isAdmin: true }` -> **PERMISSION_DENIED**
7. **Cross-Order Chat Snooping**: `GET /orders/{orderId}/messages/{msgId}` by unrelated user -> **PERMISSION_DENIED**
8. **Mutate Terminal Order**: `UPDATE /orders/{paidOrderId}` by customer -> **PERMISSION_DENIED**
9. **Forge Admin Audit Log**: `CREATE /admin_logs/{logId}` by non-admin -> **PERMISSION_DENIED**
10. **Oversized ID Poisoning**: `GET /orders/{2000_char_id}` -> **PERMISSION_DENIED**
11. **Modify Platform Commission Rate**: `UPDATE /platform_settings/global` by technician -> **PERMISSION_DENIED**
12. **Unverified Email Write**: Client write with `email_verified: false` -> **PERMISSION_DENIED**
