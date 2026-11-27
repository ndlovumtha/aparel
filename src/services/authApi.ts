import type {
  CartItem,
  CheckoutCustomerInfo,
  ConfirmedOrder,
  CustomerOrderRecord,
  GarmentSize,
  OrderPrivateShippingInfo,
  OrderStatus,
  Product,
  RightsProfileDefinition,
  SessionAccount,
  ShipmentTrackingRecord,
  ShopifyConfig,
  StaffMemberSummary,
  StaffPermission,
  StockAlarm,
  StockAlarmType,
  SyncLogEntry,
} from '../types/store';

export interface PublicStoreOverlay {
  createdProducts: Product[];
  productPatches: Record<
    string,
    {
      sizes?: GarmentSize[];
      colors?: { name: string; hex: string }[];
      stockBySize?: Partial<Record<GarmentSize, number>>;
      stockFloor?: number;
      stockCeiling?: number;
      price?: number;
      compareAtPrice?: number;
    }
  >;
  deletedProductIds: string[];
}

export interface BootstrapStatus {
  needsSuperuserClaim: boolean;
  suggestedUsername: string;
  envConfigured: boolean;
}

async function apiJson<T>(
  url: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  if (text) {
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = {};
    }
  }
  if (!res.ok) {
    const errMsg = typeof parsed.error === 'string' ? parsed.error : `Request failed (${res.status})`;
    throw new Error(errMsg);
  }
  return parsed as T;
}

export function getAuthBootstrapStatus(): Promise<BootstrapStatus> {
  return apiJson<BootstrapStatus>('/api/auth/bootstrap-status');
}

export function claimSuperuser(params: {
  username: string;
  password: string;
  fullName?: string;
  email?: string;
}): Promise<{ user: SessionAccount; token: string }> {
  return apiJson('/api/auth/bootstrap-superuser', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export function signupCustomer(params: {
  fullName: string;
  username: string;
  email: string;
  password: string;
}): Promise<{ user: SessionAccount; token: string }> {
  return apiJson('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export function loginWithCredentials(params: {
  identifier: string;
  password: string;
}): Promise<{ user: SessionAccount; token: string }> {
  return apiJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export function logoutSession(token: string): Promise<{ ok: boolean }> {
  return apiJson('/api/auth/logout', { method: 'POST' }, token);
}

// ================= STAFF & USER RIGHTS PROFILES (SUPERUSER ONLY) =================

export function fetchStaffList(token: string): Promise<{ staff: StaffMemberSummary[] }> {
  return apiJson('/api/staff', {}, token);
}

export function createStaffAccountApi(
  token: string,
  params: {
    fullName: string;
    username: string;
    email: string;
    password: string;
    permissions: StaffPermission[];
    rightsProfileName?: string;
  }
): Promise<{ staff: StaffMemberSummary }> {
  return apiJson('/api/staff', { method: 'POST', body: JSON.stringify(params) }, token);
}

export function updateStaffAccountApi(
  token: string,
  staffId: string,
  updates: {
    active?: boolean;
    password?: string;
    fullName?: string;
    permissions?: StaffPermission[];
    rightsProfileName?: string;
  }
): Promise<{ staff: StaffMemberSummary }> {
  return apiJson(
    `/api/staff/${encodeURIComponent(staffId)}`,
    { method: 'PATCH', body: JSON.stringify(updates) },
    token
  );
}

export function deleteStaffAccountApi(
  token: string,
  staffId: string
): Promise<{ ok: boolean }> {
  return apiJson(`/api/staff/${encodeURIComponent(staffId)}`, { method: 'DELETE' }, token);
}

export function fetchRightsProfiles(
  token: string
): Promise<{ profiles: RightsProfileDefinition[] }> {
  return apiJson('/api/staff/profiles', {}, token);
}

export function createRightsProfileApi(
  token: string,
  params: { name: string; description?: string; permissions: StaffPermission[] }
): Promise<{ profile: RightsProfileDefinition }> {
  return apiJson('/api/staff/profiles', { method: 'POST', body: JSON.stringify(params) }, token);
}

export function deleteRightsProfileApi(
  token: string,
  profileId: string
): Promise<{ ok: boolean }> {
  return apiJson(`/api/staff/profiles/${encodeURIComponent(profileId)}`, { method: 'DELETE' }, token);
}

// ================= STORE OVERLAY, OPERATIONS & ORDERS =================

export function fetchPublicStoreOverlay(): Promise<PublicStoreOverlay> {
  return apiJson('/api/store/public');
}

export function fetchOperationsSnapshot(token: string): Promise<{
  orders: CustomerOrderRecord[];
  stockAlarms: StockAlarm[];
  shopifyConfig: ShopifyConfig | null;
  syncLogs: SyncLogEntry[];
}> {
  return apiJson('/api/store/operations', {}, token);
}

export function createProductOnServerApi(
  token: string,
  productInput: Omit<Product, 'id' | 'shopifyId' | 'handle'>
): Promise<{ product: Product; overlay: PublicStoreOverlay }> {
  return apiJson('/api/store/products', { method: 'POST', body: JSON.stringify(productInput) }, token);
}

export function updateProductVariantsOnServerApi(
  token: string,
  productId: string,
  baseProduct: Product,
  updates: {
    category?: Product['category'];
    sizingType?: Product['sizingType'];
    sizes?: GarmentSize[];
    colors?: { name: string; hex: string }[];
    stockBySize?: Partial<Record<GarmentSize, number>>;
    stockFloor?: number;
    stockCeiling?: number;
    price?: number;
    compareAtPrice?: number;
  }
): Promise<{ ok: boolean; overlay: PublicStoreOverlay }> {
  return apiJson(
    `/api/store/products/${encodeURIComponent(productId)}`,
    { method: 'PATCH', body: JSON.stringify({ baseProduct, updates }) },
    token
  );
}

export function deleteProductOnServerApi(
  token: string,
  productId: string
): Promise<{ ok: boolean; overlay: PublicStoreOverlay }> {
  return apiJson(`/api/store/products/${encodeURIComponent(productId)}`, { method: 'DELETE' }, token);
}

export function sendStockAlarmOnServerApi(
  token: string,
  params: {
    productId: string;
    productTitle: string;
    alarmType: StockAlarmType;
    triggerScope: 'total' | 'size';
    size?: GarmentSize;
    currentQuantity: number;
    threshold: number;
    recipientEmail: string;
    message: string;
  }
): Promise<{ alarm: StockAlarm }> {
  return apiJson('/api/store/alarms', { method: 'POST', body: JSON.stringify(params) }, token);
}

export function acknowledgeAlarmOnServerApi(token: string, alarmId: string): Promise<{ ok: boolean }> {
  return apiJson(`/api/store/alarms/${encodeURIComponent(alarmId)}/ack`, { method: 'PATCH' }, token);
}

export function deleteAlarmOnServerApi(token: string, alarmId: string): Promise<{ ok: boolean }> {
  return apiJson(`/api/store/alarms/${encodeURIComponent(alarmId)}`, { method: 'DELETE' }, token);
}

export function saveShopifyConfigOnServerApi(
  token: string,
  cfg: ShopifyConfig
): Promise<{ ok: boolean }> {
  return apiJson('/api/store/integrations/shopify', { method: 'PUT', body: JSON.stringify(cfg) }, token);
}

export function appendSyncLogOnServerApi(
  token: string,
  event: string,
  details: string,
  status: 'success' | 'info' | 'warning'
): Promise<{ ok: boolean }> {
  return apiJson(
    '/api/store/integrations/log',
    { method: 'POST', body: JSON.stringify({ event, details, status }) },
    token
  );
}

export function createOrderOnServerApi(
  token: string,
  params: {
    items: CartItem[];
    customer: CheckoutCustomerInfo;
    discountPercentage: number;
    currentProducts: Product[];
  }
): Promise<{ order: ConfirmedOrder; overlay: PublicStoreOverlay }> {
  return apiJson('/api/orders', { method: 'POST', body: JSON.stringify(params) }, token);
}

export function fetchMyServerOrdersApi(token: string): Promise<{ orders: CustomerOrderRecord[] }> {
  return apiJson('/api/orders/mine', {}, token);
}

export function fetchOrderShippingOnServerApi(
  token: string,
  orderNumber: string
): Promise<{ shipping: OrderPrivateShippingInfo | null }> {
  return apiJson(`/api/orders/${encodeURIComponent(orderNumber)}/shipping`, {}, token);
}

export async function fetchOrderTrackingOnServerApi(
  orderNumber: string
): Promise<ShipmentTrackingRecord | null> {
  const clean = orderNumber.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,32}$/.test(clean)) return null;
  const res = await fetch(`/api/orders/${encodeURIComponent(clean)}/tracking`);
  if (!res.ok) return null;
  const data = (await res.json()) as { tracking?: ShipmentTrackingRecord };
  return data.tracking || null;
}

export function dispatchOrderOnServerApi(
  token: string,
  params: {
    orderNumber: string;
    nextStatus: OrderStatus;
    courier: string;
    trackingNumber: string;
    dispatchNotes?: string;
    deductStock?: boolean;
    products?: Product[];
  }
): Promise<{ order: CustomerOrderRecord }> {
  return apiJson(
    `/api/orders/${encodeURIComponent(params.orderNumber)}/dispatch`,
    { method: 'PATCH', body: JSON.stringify(params) },
    token
  );
}
