/**
 * Firestore Security Rules Test Suite — Offside Apparel
 * Verifies the "Dirty Dozen" adversarial payloads and valid workflows against firestore.rules.
 * Designed for @firebase/rules-unit-testing when running against the Firestore Emulator.
 */

export interface RulesTestCase {
  id: string;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; email: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED' | 'ALLOW';
}

export const DIRTY_DOZEN_TESTS: RulesTestCase[] = [
  {
    id: 'DD-01',
    name: 'Unauthenticated Product Creation',
    collectionPath: '/products/fake-sku-1',
    operation: 'create',
    auth: null,
    payload: { title: 'Fake Jersey', price: 1 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-02',
    name: 'Non-Admin Stock Tampering',
    collectionPath: '/products/offside-top-01',
    operation: 'update',
    auth: { uid: 'cust-123', email: 'athlete@example.com', email_verified: true },
    payload: { inventoryQuantity: 9999 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-03',
    name: 'Unverified Email Admin Spoofing',
    collectionPath: '/integrations/shopify',
    operation: 'update',
    auth: { uid: 'spoof-999', email: 'blujay1809@gmail.com', email_verified: false },
    payload: { storeDomain: 'evil.myshopify.com' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-04',
    name: 'Self-Assigned Admin Escalation',
    collectionPath: '/admins/cust-123',
    operation: 'create',
    auth: { uid: 'cust-123', email: 'athlete@example.com', email_verified: true },
    payload: { email: 'athlete@example.com', role: 'admin' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-05',
    name: 'Shadow Ghost Field Injection on Order',
    collectionPath: '/orders/OF-999111',
    operation: 'create',
    auth: { uid: 'cust-123', email: 'athlete@example.com', email_verified: true },
    payload: { orderNumber: 'OF-999111', userId: 'cust-123', isPaidOverride: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-06',
    name: 'Identity Spoofing on Order Create',
    collectionPath: '/orders/OF-999112',
    operation: 'create',
    auth: { uid: 'cust-123', email: 'athlete@example.com', email_verified: true },
    payload: { orderNumber: 'OF-999112', userId: 'victim-456' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-07',
    name: 'Orphaned PII Subcollection Write',
    collectionPath: '/orders/OF-999113/private/shipping',
    operation: 'create',
    auth: { uid: 'cust-123', email: 'athlete@example.com', email_verified: true },
    payload: { ownerId: 'cust-123', email: 'athlete@example.com', address: '1 Track Way' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-08',
    name: 'Cross-User PII Read Attempt',
    collectionPath: '/orders/OF-123456/private/shipping',
    operation: 'get',
    auth: { uid: 'cust-999', email: 'other@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-09',
    name: 'Blanket Order List Scraping',
    collectionPath: '/orders',
    operation: 'list',
    auth: { uid: 'cust-123', email: 'athlete@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-10',
    name: 'Non-Admin Shipment Status Progression',
    collectionPath: '/tracking/OF-123456',
    operation: 'update',
    auth: { uid: 'cust-123', email: 'athlete@example.com', email_verified: true },
    payload: { currentStatus: 'Delivered' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-11',
    name: 'ID Poisoning with Invalid Characters',
    collectionPath: '/orders/INVALID$$$ID',
    operation: 'create',
    auth: { uid: 'cust-123', email: 'athlete@example.com', email_verified: true },
    payload: { orderNumber: 'OF-111' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-12',
    name: 'Client Timestamp Forgery',
    collectionPath: '/orders/OF-999114',
    operation: 'create',
    auth: { uid: 'cust-123', email: 'athlete@example.com', email_verified: true },
    payload: { orderNumber: 'OF-999114', userId: 'cust-123', createdAt: '2020-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
];
