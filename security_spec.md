# Offside Apparel — Security Specification & Threat Model (Phase 0)

## 1. Data Invariants

1. **Identity Integrity**:
   - Every `Order` and `OrderPrivateShipping` record MUST bind `userId` / `ownerId` strictly to `request.auth.uid` on creation.
   - All authenticated write operations MUST satisfy `request.auth.token.email_verified == true`.
   - Admin privileges CANNOT be self-assigned via client claims (`request.auth.token.admin`) or arbitrary profile writes. Admin verification checks the bootstrapped verified email (`blujay1809@gmail.com`) or a document in `/admins/{uid}` created solely by an existing admin.

2. **PII Isolation**:
   - Customer PII (`email`, `firstName`, `lastName`, `address`, `postalCode`, `phone`) MUST NEVER be stored in `/orders/{orderId}` or `/tracking/{orderNumber}`.
   - All PII resides exclusively in `/orders/{orderId}/private/shipping`, accessible only to the owning `userId` (verified via parent `/orders/{orderId}`) or an authorized admin.

3. **Atomic Relational Consistency**:
   - An `/orders/{orderId}` document cannot be created without atomically creating `/orders/{orderId}/private/shipping` and `/tracking/{orderNumber}` in the same Firestore `WriteBatch` (enforced via `existsAfter` and `getAfter`).

4. **Inventory & Catalog Protection**:
   - Public storefront visitors may read `/products` and `/promotions`, but only verified Admins may create, update, or delete catalog SKUs, adjust stock counts, manage `/promotions`, configure `/integrations/shopify`, or read/write `/syncLogs`.

5. **Temporal & Structural Integrity**:
   - `createdAt` and `updatedAt` MUST equal `request.time` on creation; `createdAt` is immutable on update and `updatedAt` MUST equal `request.time`.
   - Every document `create` enforces exact key allowlisting (`hasAll` + `hasOnly`) to block shadow/ghost fields.
   - Every `update` enforces `affectedKeys().hasOnly(...)` combined with full `isValid[Entity](incoming())` re-validation.
   - Every string field has explicit `.size()` bounds and every array is strictly size-bounded.

---

## 2. The "Dirty Dozen" Adversarial Test Payloads

1. **Unauthenticated Product Creation**: Anonymous client attempts `create` on `/products/fake-sku` -> `PERMISSION_DENIED`.
2. **Non-Admin Stock Tampering**: Signed-in non-admin customer attempts `update` on `/products/offside-top-01` setting `inventoryQuantity: 9999` -> `PERMISSION_DENIED`.
3. **Unverified Email Spoofing**: Attacker with `email: 'blujay1809@gmail.com'` and `email_verified: false` attempts admin write on `/integrations/shopify` -> `PERMISSION_DENIED`.
4. **Self-Assigned Admin Escalation**: Regular user attempts `create` on `/admins/{theirUid}` with `{ role: 'admin' }` -> `PERMISSION_DENIED`.
5. **Shadow / Ghost Field Injection on Order**: Authenticated user attempts `create` on `/orders/OF-999111` with an extra field `isPaidOverride: true` -> `PERMISSION_DENIED`.
6. **Identity Spoofing on Order**: User `uid-A` attempts `create` on `/orders/OF-999112` with `userId: 'uid-B'` -> `PERMISSION_DENIED`.
7. **Orphaned PII Creation**: User attempts `create` on `/orders/OF-999113/private/shipping` without creating `/orders/OF-999113` in the same batch -> `PERMISSION_DENIED`.
8. **Cross-User PII Read**: User `uid-B` attempts `get` on `/orders/OF-123456/private/shipping` owned by `uid-A` -> `PERMISSION_DENIED`.
9. **Blanket Order List Scraping**: User `uid-A` attempts unbounded `list` on `/orders` without filtering by `userId == 'uid-A'` -> `PERMISSION_DENIED`.
10. **Non-Admin Tracking Status Progression**: Customer `uid-A` attempts `update` on `/tracking/OF-123456` to set `currentStatus: 'Delivered'` -> `PERMISSION_DENIED`.
11. **Resource Exhaustion / ID Poisoning**: Attacker attempts `create` on `/orders/` with a 500-character invalid ID containing `$$$///` -> `PERMISSION_DENIED`.
12. **Client Timestamp Forgery**: Authenticated user attempts `create` on `/orders/OF-999114` with a backdated `createdAt` not equal to `request.time` -> `PERMISSION_DENIED`.
