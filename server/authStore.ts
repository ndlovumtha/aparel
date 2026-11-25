import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  ALL_STAFF_PERMISSIONS,
  DEFAULT_RIGHTS_PROFILES,
  type AccountRole,
  type CartItem,
  type CheckoutCustomerInfo,
  type ConfirmedOrder,
  type CustomerOrderRecord,
  type GarmentSize,
  type OrderPrivateShippingInfo,
  type OrderStatus,
  type Product,
  type RightsProfileDefinition,
  type SessionAccount,
  type ShipmentStatus,
  type ShipmentTrackingRecord,
  type ShopifyConfig,
  type StaffMemberSummary,
  type StaffPermission,
  type StockAlarm,
  type StockAlarmType,
  type SyncLogEntry,
  type TrackingCheckpoint,
} from '../src/types/store.ts';

export interface StoredUserRecord {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: 'staff' | 'customer';
  passwordHash: string;
  salt: string;
  active: boolean;
  createdAt: string;
  createdBy?: string;
  permissions?: StaffPermission[];
  rightsProfileName?: string;
}

export interface StoredSuperuserRecord {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: 'superuser';
  passwordHash: string;
  salt: string;
  active: boolean;
  createdAt: string;
}

export interface ProductVariantPatch {
  sizes?: GarmentSize[];
  colors?: { name: string; hex: string }[];
  stockBySize?: Partial<Record<GarmentSize, number>>;
  stockFloor?: number;
  stockCeiling?: number;
  price?: number;
  compareAtPrice?: number;
}

export interface PersistedOrderEntry {
  order: CustomerOrderRecord;
  shipping: OrderPrivateShippingInfo;
  tracking: ShipmentTrackingRecord;
}

interface StoreData {
  superuser: StoredSuperuserRecord | null;
  users: StoredUserRecord[];
  customRightsProfiles: RightsProfileDefinition[];
  createdProducts: Product[];
  productPatches: Record<string, ProductVariantPatch>;
  deletedProductIds: string[];
  stockAlarms: StockAlarm[];
  orders: PersistedOrderEntry[];
  shopifyConfig: ShopifyConfig;
  syncLogs: SyncLogEntry[];
}

export interface VerifiedTokenPayload {
  sub: string;
  role: AccountRole;
  username: string;
  jti: string;
  exp: number;
}

const ALL_SIZES: GarmentSize[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const DATA_DIR = path.resolve(process.cwd(), '.data');
const STORE_FILE = path.resolve(DATA_DIR, 'store.json');

// Ephemeral high-entropy key when AUTH_SESSION_SECRET is not provided in environment
const SESSION_SECRET =
  process.env.AUTH_SESSION_SECRET?.trim() || crypto.randomBytes(32).toString('hex');

const revokedTokenIds = new Set<string>();

function ensureConfinedPath(targetPath: string): string {
  const resolved = path.resolve(targetPath);
  if (!resolved.startsWith(DATA_DIR + path.sep)) {
    throw new Error('Unsafe storage path rejected');
  }
  return resolved;
}

function getDefaultShopifyConfig(): ShopifyConfig {
  return {
    storeDomain: 'offside-apparel.myshopify.com',
    storefrontAccessToken: 'shpat_08f9a91c7849e7019d5b0012b',
    apiVersion: '2024-01',
    syncStatus: 'synced',
    lastSyncedAt: new Date().toISOString(),
    mode: 'synced-cache',
    autoSync: true,
    itemsCount: 6,
  };
}

function createInitialStore(): StoreData {
  return {
    superuser: null,
    users: [],
    customRightsProfiles: [],
    createdProducts: [],
    productPatches: {},
    deletedProductIds: [],
    stockAlarms: [],
    orders: [],
    shopifyConfig: getDefaultShopifyConfig(),
    syncLogs: [],
  };
}

function readStore(): StoreData {
  const target = ensureConfinedPath(STORE_FILE);
  if (!fs.existsSync(target)) {
    return createInitialStore();
  }
  try {
    const raw = fs.readFileSync(target, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreData>;
    return {
      superuser: parsed.superuser ?? null,
      users: Array.isArray(parsed.users) ? parsed.users : [],
      customRightsProfiles: Array.isArray(parsed.customRightsProfiles)
        ? parsed.customRightsProfiles
        : [],
      createdProducts: Array.isArray(parsed.createdProducts) ? parsed.createdProducts : [],
      productPatches:
        parsed.productPatches && typeof parsed.productPatches === 'object'
          ? parsed.productPatches
          : {},
      deletedProductIds: Array.isArray(parsed.deletedProductIds) ? parsed.deletedProductIds : [],
      stockAlarms: Array.isArray(parsed.stockAlarms) ? parsed.stockAlarms : [],
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      shopifyConfig: parsed.shopifyConfig ?? getDefaultShopifyConfig(),
      syncLogs: Array.isArray(parsed.syncLogs) ? parsed.syncLogs : [],
    };
  } catch {
    return createInitialStore();
  }
}

function writeStore(data: StoreData): void {
  const target = ensureConfinedPath(STORE_FILE);
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
  const tmpFile = ensureConfinedPath(path.join(DATA_DIR, `store.${process.pid}.tmp`));
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmpFile, target);
}

export function hashPassword(password: string): { salt: string; passwordHash: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, passwordHash };
}

export function verifyPassword(password: string, salt: string, expectedHashHex: string): boolean {
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHashHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function verifySecretConstantTime(input: string, secret: string): boolean {
  const digestA = crypto.createHash('sha256').update(input).digest();
  const digestB = crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

export function getConfiguredSuperuserUsername(): string {
  const raw = (process.env.SUPERUSER_USERNAME || 'ndlovumtha').trim().toLowerCase();
  return /^[a-z0-9._-]{3,32}$/.test(raw) ? raw : 'ndlovumtha';
}

export function isEnvSuperuserConfigured(): boolean {
  return Boolean(process.env.SUPERUSER_PASSWORD && process.env.SUPERUSER_PASSWORD.trim().length > 0);
}

export function getBootstrapStatus(): {
  needsSuperuserClaim: boolean;
  suggestedUsername: string;
  envConfigured: boolean;
} {
  const envConfigured = isEnvSuperuserConfigured();
  const store = readStore();
  return {
    needsSuperuserClaim: !envConfigured && !store.superuser,
    suggestedUsername: getConfiguredSuperuserUsername(),
    envConfigured,
  };
}

export function issueSessionToken(account: SessionAccount): string {
  const payload: VerifiedTokenPayload = {
    sub: account.id,
    role: account.role,
    username: account.username,
    jti: crypto.randomUUID(),
    exp: Date.now() + 24 * 60 * 60 * 1000,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
}

export function revokeSessionToken(token: string): void {
  const verified = verifySessionToken(token);
  if (verified) {
    revokedTokenIds.add(verified.jti);
  }
}

export function verifySessionToken(token: string): VerifiedTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encodedPayload, providedSig] = parts;
    const expectedSig = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(encodedPayload)
      .digest('base64url');
    const a = Buffer.from(providedSig, 'utf8');
    const b = Buffer.from(expectedSig, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return null;
    }
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as VerifiedTokenPayload;
    if (!payload.sub || !payload.role || !payload.exp || payload.exp < Date.now()) {
      return null;
    }
    if (revokedTokenIds.has(payload.jti)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function normalizeStaffPermissions(raw: unknown): StaffPermission[] {
  if (!Array.isArray(raw)) return [];
  const valid = new Set<string>(ALL_STAFF_PERMISSIONS);
  const deduped: StaffPermission[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && valid.has(item) && !deduped.includes(item as StaffPermission)) {
      deduped.push(item as StaffPermission);
    }
  }
  return deduped;
}

function resolveProfileLabel(permissions: StaffPermission[], requestedLabel?: string): string {
  const clean = (requestedLabel || '').trim().slice(0, 64);
  if (clean) return clean;
  if (permissions.length === 0) return 'Unassigned (No Access)';
  if (permissions.length === ALL_STAFF_PERMISSIONS.length) return 'Full Operations Staff';
  const matchedBuiltIn = DEFAULT_RIGHTS_PROFILES.find(
    (p) =>
      p.permissions.length === permissions.length &&
      p.permissions.every((reqPerm) => permissions.includes(reqPerm))
  );
  return matchedBuiltIn ? matchedBuiltIn.name : 'Custom Rights Profile';
}

function toSessionAccount(
  user: StoredUserRecord | StoredSuperuserRecord
): SessionAccount {
  if (user.role === 'superuser') {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      role: 'superuser',
      active: user.active,
      createdAt: user.createdAt,
      permissions: [...ALL_STAFF_PERMISSIONS],
      rightsProfileName: 'Superuser (Unrestricted)',
    };
  }
  if (user.role === 'staff') {
    const permissions = normalizeStaffPermissions(user.permissions);
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      role: 'staff',
      active: user.active,
      createdAt: user.createdAt,
      permissions,
      rightsProfileName: resolveProfileLabel(permissions, user.rightsProfileName),
    };
  }
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    role: 'customer',
    active: user.active,
    createdAt: user.createdAt,
    permissions: [],
  };
}

function getEnvSuperuserAccount(): SessionAccount {
  const username = getConfiguredSuperuserUsername();
  return {
    id: `superuser-${username}`,
    username,
    email: `${username}@offsideapparel.internal`,
    fullName: 'Superuser Operations Lead',
    role: 'superuser',
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    permissions: [...ALL_STAFF_PERMISSIONS],
    rightsProfileName: 'Superuser (Unrestricted)',
  };
}

export function getAccountById(userId: string): SessionAccount | null {
  const envUsername = getConfiguredSuperuserUsername();
  if (isEnvSuperuserConfigured() && userId === `superuser-${envUsername}`) {
    return getEnvSuperuserAccount();
  }
  const store = readStore();
  if (store.superuser && store.superuser.id === userId) {
    return store.superuser.active ? toSessionAccount(store.superuser) : null;
  }
  const found = store.users.find((u) => u.id === userId);
  if (!found || !found.active) return null;
  return toSessionAccount(found);
}

export function claimSuperuserAccount(params: {
  username: string;
  password: string;
  fullName?: string;
  email?: string;
}): { user: SessionAccount; token: string } {
  if (isEnvSuperuserConfigured()) {
    throw new HttpError(409, 'Superuser credentials are already configured in server environment.');
  }
  const store = readStore();
  if (store.superuser) {
    throw new HttpError(409, 'Superuser account has already been claimed.');
  }

  const expectedUsername = getConfiguredSuperuserUsername();
  const cleanUsername = (params.username || '').trim().toLowerCase();
  if (cleanUsername !== expectedUsername) {
    throw new HttpError(400, `Superuser username must be "${expectedUsername}".`);
  }
  const password = params.password || '';
  if (password.length < 8 || password.length > 128) {
    throw new HttpError(400, 'Superuser password must be between 8 and 128 characters.');
  }

  const cleanEmail = (params.email || `${expectedUsername}@offsideapparel.internal`)
    .trim()
    .toLowerCase();
  const cleanName = (params.fullName || 'Superuser Operations Lead').trim().slice(0, 80);

  const { salt, passwordHash } = hashPassword(password);
  const superuser: StoredSuperuserRecord = {
    id: `superuser-${expectedUsername}`,
    username: expectedUsername,
    email: cleanEmail,
    fullName: cleanName || 'Superuser Operations Lead',
    role: 'superuser',
    passwordHash,
    salt,
    active: true,
    createdAt: new Date().toISOString(),
  };

  store.superuser = superuser;
  appendLogInternal(
    store,
    'SUPERUSER_INITIALIZED',
    `Superuser account @${expectedUsername} initialized.`,
    'success'
  );
  writeStore(store);

  const sessionUser = toSessionAccount(superuser);
  return { user: sessionUser, token: issueSessionToken(sessionUser) };
}

export function authenticateUser(params: {
  identifier: string;
  password: string;
}): { user: SessionAccount; token: string } {
  const cleanId = (params.identifier || '').trim().toLowerCase();
  const password = params.password || '';
  if (!cleanId || !password) {
    throw new HttpError(400, 'Username/email and password are required.');
  }

  const expectedSuperUsername = getConfiguredSuperuserUsername();
  if (isEnvSuperuserConfigured()) {
    const envPass = (process.env.SUPERUSER_PASSWORD || '').trim();
    if (
      cleanId === expectedSuperUsername ||
      cleanId === `${expectedSuperUsername}@offsideapparel.internal`
    ) {
      if (verifySecretConstantTime(password, envPass)) {
        const account = getEnvSuperuserAccount();
        return { user: account, token: issueSessionToken(account) };
      }
      throw new HttpError(401, 'Invalid username/email or password.');
    }
  }

  const store = readStore();

  if (
    store.superuser &&
    (store.superuser.username.toLowerCase() === cleanId ||
      store.superuser.email.toLowerCase() === cleanId)
  ) {
    if (!verifyPassword(password, store.superuser.salt, store.superuser.passwordHash)) {
      throw new HttpError(401, 'Invalid username/email or password.');
    }
    const account = toSessionAccount(store.superuser);
    return { user: account, token: issueSessionToken(account) };
  }

  const matched = store.users.find(
    (u) => u.username.toLowerCase() === cleanId || u.email.toLowerCase() === cleanId
  );
  if (!matched || !verifyPassword(password, matched.salt, matched.passwordHash)) {
    throw new HttpError(401, 'Invalid username/email or password.');
  }
  if (!matched.active) {
    throw new HttpError(403, 'This account has been deactivated by an administrator.');
  }

  const account = toSessionAccount(matched);
  return { user: account, token: issueSessionToken(account) };
}

function validateUsername(raw: string): string {
  const clean = (raw || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(clean)) {
    throw new HttpError(
      400,
      'Username must be 3–32 characters using letters, numbers, dots, underscores, or hyphens.'
    );
  }
  return clean;
}

function validateEmail(raw: string): string {
  const clean = (raw || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) || clean.length > 160) {
    throw new HttpError(400, 'Enter a valid email address.');
  }
  return clean;
}

export function registerCustomerAccount(params: {
  username: string;
  email: string;
  fullName: string;
  password: string;
}): { user: SessionAccount; token: string } {
  const username = validateUsername(params.username);
  const email = validateEmail(params.email);
  const fullName = (params.fullName || '').trim().slice(0, 80);
  const password = params.password || '';

  if (fullName.length < 2) {
    throw new HttpError(400, 'Please enter your full name.');
  }
  if (password.length < 8 || password.length > 128) {
    throw new HttpError(400, 'Password must be at least 8 characters long.');
  }

  const reservedUsernames = new Set([getConfiguredSuperuserUsername(), 'ndlovumtha', 'superuser', 'admin']);
  if (reservedUsernames.has(username)) {
    throw new HttpError(409, 'That username is reserved.');
  }

  const store = readStore();
  if (
    store.superuser?.email.toLowerCase() === email ||
    store.users.some((u) => u.username.toLowerCase() === username || u.email.toLowerCase() === email)
  ) {
    throw new HttpError(409, 'An account with that username or email already exists.');
  }

  const { salt, passwordHash } = hashPassword(password);
  const customer: StoredUserRecord = {
    id: `cust-${crypto.randomUUID()}`,
    username,
    email,
    fullName,
    role: 'customer',
    passwordHash,
    salt,
    active: true,
    createdAt: new Date().toISOString(),
  };

  store.users.push(customer);
  writeStore(store);

  const sessionUser = toSessionAccount(customer);
  return { user: sessionUser, token: issueSessionToken(sessionUser) };
}

// ================= STAFF MANAGEMENT & USER RIGHTS PROFILES (SUPERUSER ONLY) =================

function toStaffSummary(u: StoredUserRecord): StaffMemberSummary {
  const permissions = normalizeStaffPermissions(u.permissions);
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    fullName: u.fullName,
    role: 'staff',
    active: u.active,
    createdAt: u.createdAt,
    createdBy: u.createdBy,
    permissions,
    rightsProfileName: resolveProfileLabel(permissions, u.rightsProfileName),
  };
}

export function listStaffAccounts(): StaffMemberSummary[] {
  const store = readStore();
  return store.users
    .filter((u) => u.role === 'staff')
    .map(toStaffSummary)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createStaffAccount(
  params: {
    username: string;
    email: string;
    fullName: string;
    password: string;
    permissions?: StaffPermission[];
    rightsProfileName?: string;
  },
  createdByUsername: string
): StaffMemberSummary {
  const username = validateUsername(params.username);
  const email = validateEmail(params.email);
  const fullName = (params.fullName || '').trim().slice(0, 80);
  const password = params.password || '';

  if (fullName.length < 2) {
    throw new HttpError(400, 'Staff full name is required.');
  }
  if (password.length < 8 || password.length > 128) {
    throw new HttpError(400, 'Staff password must be at least 8 characters long.');
  }
  if (username === getConfiguredSuperuserUsername() || username === 'ndlovumtha') {
    throw new HttpError(409, 'Cannot reuse the superuser username for a staff account.');
  }

  const store = readStore();
  if (
    store.superuser?.email.toLowerCase() === email ||
    store.users.some((u) => u.username.toLowerCase() === username || u.email.toLowerCase() === email)
  ) {
    throw new HttpError(409, 'Username or email is already in use.');
  }

  const permissions = normalizeStaffPermissions(params.permissions);
  const rightsProfileName = resolveProfileLabel(permissions, params.rightsProfileName);

  const { salt, passwordHash } = hashPassword(password);
  const staff: StoredUserRecord = {
    id: `staff-${crypto.randomUUID()}`,
    username,
    email,
    fullName,
    role: 'staff',
    passwordHash,
    salt,
    active: true,
    createdAt: new Date().toISOString(),
    createdBy: createdByUsername,
    permissions,
    rightsProfileName,
  };

  store.users.push(staff);
  appendLogInternal(
    store,
    'SUPERUSER_STAFF_CREATED',
    `Superuser @${createdByUsername} provisioned staff account @${username} with profile "${rightsProfileName}" (${permissions.length} rights).`,
    'success'
  );
  writeStore(store);

  return toStaffSummary(staff);
}

export function updateStaffAccount(
  staffId: string,
  updates: {
    active?: boolean;
    password?: string;
    fullName?: string;
    permissions?: StaffPermission[];
    rightsProfileName?: string;
  },
  actorUsername: string
): StaffMemberSummary {
  const store = readStore();
  const staff = store.users.find((u) => u.id === staffId && u.role === 'staff');
  if (!staff) {
    throw new HttpError(404, 'Staff account not found.');
  }

  if (typeof updates.active === 'boolean') {
    staff.active = updates.active;
  }
  if (typeof updates.fullName === 'string' && updates.fullName.trim().length >= 2) {
    staff.fullName = updates.fullName.trim().slice(0, 80);
  }
  if (typeof updates.password === 'string' && updates.password.length > 0) {
    if (updates.password.length < 8 || updates.password.length > 128) {
      throw new HttpError(400, 'Replacement password must be 8–128 characters.');
    }
    const { salt, passwordHash } = hashPassword(updates.password);
    staff.salt = salt;
    staff.passwordHash = passwordHash;
  }

  let rightsChanged = false;
  if (Array.isArray(updates.permissions)) {
    staff.permissions = normalizeStaffPermissions(updates.permissions);
    staff.rightsProfileName = resolveProfileLabel(
      staff.permissions,
      typeof updates.rightsProfileName === 'string' ? updates.rightsProfileName : undefined
    );
    rightsChanged = true;
  } else if (typeof updates.rightsProfileName === 'string' && updates.rightsProfileName.trim()) {
    staff.rightsProfileName = updates.rightsProfileName.trim().slice(0, 64);
    rightsChanged = true;
  }

  const currentPerms = normalizeStaffPermissions(staff.permissions);
  appendLogInternal(
    store,
    rightsChanged ? 'SUPERUSER_RIGHTS_ASSIGNED' : 'SUPERUSER_STAFF_UPDATED',
    rightsChanged
      ? `Superuser @${actorUsername} assigned profile "${staff.rightsProfileName}" to @${staff.username} (${currentPerms.join(', ') || 'no rights'}).`
      : `Superuser @${actorUsername} updated staff account @${staff.username} (active=${staff.active}).`,
    'info'
  );
  writeStore(store);
  return toStaffSummary(staff);
}

export function deleteStaffAccount(staffId: string, actorUsername: string): void {
  const store = readStore();
  const idx = store.users.findIndex((u) => u.id === staffId && u.role === 'staff');
  if (idx === -1) {
    throw new HttpError(404, 'Staff account not found.');
  }
  const removed = store.users[idx];
  store.users.splice(idx, 1);
  appendLogInternal(
    store,
    'SUPERUSER_STAFF_REMOVED',
    `Superuser @${actorUsername} removed staff account @${removed.username}.`,
    'warning'
  );
  writeStore(store);
}

export function listRightsProfiles(): RightsProfileDefinition[] {
  const store = readStore();
  const custom = store.customRightsProfiles.map((p) => ({
    ...p,
    permissions: normalizeStaffPermissions(p.permissions),
    builtIn: false,
  }));
  return [...DEFAULT_RIGHTS_PROFILES, ...custom];
}

export function createRightsProfile(
  params: { name: string; description?: string; permissions: StaffPermission[] },
  actorUsername: string
): RightsProfileDefinition {
  const cleanName = (params.name || '').trim().slice(0, 64);
  if (cleanName.length < 2) {
    throw new HttpError(400, 'Rights profile name must be at least 2 characters.');
  }
  const cleanPermissions = normalizeStaffPermissions(params.permissions);
  if (cleanPermissions.length === 0) {
    throw new HttpError(400, 'Select at least one operational right for a profile template.');
  }

  const store = readStore();
  const duplicate =
    DEFAULT_RIGHTS_PROFILES.some((p) => p.name.toLowerCase() === cleanName.toLowerCase()) ||
    store.customRightsProfiles.some((p) => p.name.toLowerCase() === cleanName.toLowerCase());
  if (duplicate) {
    throw new HttpError(409, `A user rights profile named "${cleanName}" already exists.`);
  }

  const created: RightsProfileDefinition = {
    id: `profile-custom-${crypto.randomUUID().slice(0, 8)}`,
    name: cleanName,
    description:
      (params.description || '').trim().slice(0, 180) ||
      `Custom employee rights profile (${cleanPermissions.length} assigned rights).`,
    permissions: cleanPermissions,
    builtIn: false,
  };

  store.customRightsProfiles.push(created);
  appendLogInternal(
    store,
    'SUPERUSER_RIGHTS_PROFILE_CREATED',
    `Superuser @${actorUsername} saved user rights profile "${created.name}" (${cleanPermissions.join(', ')}).`,
    'success'
  );
  writeStore(store);
  return created;
}

export function deleteRightsProfile(profileId: string, actorUsername: string): void {
  if (DEFAULT_RIGHTS_PROFILES.some((p) => p.id === profileId)) {
    throw new HttpError(400, 'Built-in standard rights profiles cannot be deleted.');
  }
  const store = readStore();
  const idx = store.customRightsProfiles.findIndex((p) => p.id === profileId);
  if (idx === -1) {
    throw new HttpError(404, 'Custom rights profile not found.');
  }
  const [removed] = store.customRightsProfiles.splice(idx, 1);
  appendLogInternal(
    store,
    'SUPERUSER_RIGHTS_PROFILE_DELETED',
    `Superuser @${actorUsername} removed custom rights profile "${removed.name}".`,
    'warning'
  );
  writeStore(store);
}

// ================= STORE CATALOG, STOCK ALARMS & ORDERS =================

function appendLogInternal(
  store: StoreData,
  event: string,
  details: string,
  status: 'success' | 'info' | 'warning'
): void {
  store.syncLogs.unshift({
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    event: event.slice(0, 120),
    details: details.slice(0, 500),
    status,
  });
  if (store.syncLogs.length > 40) {
    store.syncLogs = store.syncLogs.slice(0, 40);
  }
}

function maybeEmitStockAlarm(
  store: StoreData,
  params: {
    productId: string;
    productTitle: string;
    totalQty: number;
    floor: number;
    ceiling: number;
    recipientEmail: string;
  }
): void {
  const { productId, productTitle, totalQty, floor, ceiling, recipientEmail } = params;
  let alarmType: StockAlarmType | null = null;
  let threshold = floor;
  let message = '';

  if (totalQty === 0) {
    alarmType = 'OUT_OF_STOCK';
    threshold = floor;
    message = `CRITICAL STOCKOUT: ${productTitle} has 0 units remaining (Floor: ${floor}).`;
  } else if (totalQty <= floor) {
    alarmType = 'BELOW_FLOOR';
    threshold = floor;
    message = `FLOOR BREACH ALARM: ${productTitle} dropped to ${totalQty} units (Floor: ${floor}).`;
  } else if (totalQty >= ceiling) {
    alarmType = 'ABOVE_CEILING';
    threshold = ceiling;
    message = `CEILING BREACH ALARM: ${productTitle} reached ${totalQty} units (Ceiling: ${ceiling}).`;
  }

  if (!alarmType) return;

  store.stockAlarms.unshift({
    id: `alarm-${productId.slice(0, 32)}-${Date.now()}`,
    productId,
    productTitle,
    alarmType,
    triggerScope: 'total',
    currentQuantity: totalQty,
    threshold,
    acknowledged: false,
    recipientEmail,
    message,
    createdAtMillis: Date.now(),
  });
  if (store.stockAlarms.length > 60) {
    store.stockAlarms = store.stockAlarms.slice(0, 60);
  }
}

export function getPublicStoreOverlay(): {
  createdProducts: Product[];
  productPatches: Record<string, ProductVariantPatch>;
  deletedProductIds: string[];
} {
  const store = readStore();
  return {
    createdProducts: store.createdProducts,
    productPatches: store.productPatches,
    deletedProductIds: store.deletedProductIds,
  };
}

export function getOperationsSnapshot(requester: SessionAccount): {
  orders: CustomerOrderRecord[];
  stockAlarms: StockAlarm[];
  shopifyConfig: ShopifyConfig | null;
  syncLogs: SyncLogEntry[];
} {
  const store = readStore();
  const isSuper = requester.role === 'superuser';
  const perms = normalizeStaffPermissions(requester.permissions);

  const canOrders =
    isSuper || perms.includes('view_dispatch_orders') || perms.includes('execute_order_dispatch');
  const canAlarms =
    isSuper || perms.includes('view_stock_alarms') || perms.includes('manage_stock_thresholds');
  const canIntegrations = isSuper || perms.includes('manage_integrations');

  return {
    orders: canOrders
      ? store.orders.map((entry) => entry.order).sort((a, b) => b.createdAtMillis - a.createdAtMillis)
      : [],
    stockAlarms: canAlarms
      ? store.stockAlarms.sort((a, b) => b.createdAtMillis - a.createdAtMillis)
      : [],
    shopifyConfig: canIntegrations ? store.shopifyConfig : null,
    syncLogs: canIntegrations ? store.syncLogs : [],
  };
}

export function createProductOnServer(
  input: Omit<Product, 'id' | 'shopifyId' | 'handle'>,
  actor: SessionAccount
): Product {
  const store = readStore();
  const cleanSizes = (input.sizes || ['M', 'L']).filter((s): s is GarmentSize =>
    ALL_SIZES.includes(s)
  );
  const sizes: GarmentSize[] = cleanSizes.length > 0 ? Array.from(new Set(cleanSizes)) : ['M'];

  const stockBySize: Partial<Record<GarmentSize, number>> = {};
  for (const sz of sizes) {
    stockBySize[sz] = Math.max(0, Math.min(100000, Math.floor(Number(input.stockBySize?.[sz] ?? 0))));
  }
  const totalQty = sizes.reduce((sum, sz) => sum + (stockBySize[sz] ?? 0), 0);
  const floor = Math.max(0, Math.floor(Number(input.stockFloor ?? 10)));
  const ceiling = Math.max(Math.max(1, floor), Math.floor(Number(input.stockCeiling ?? 80)));

  const handleBase = (input.title || 'offside-item')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  const created: Product = {
    ...input,
    id: `offside-srv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    shopifyId: `gid://shopify/Product/${Math.floor(8490000000000 + Math.random() * 9000000000)}`,
    handle: handleBase || 'offside-item',
    sizes,
    colors:
      Array.isArray(input.colors) && input.colors.length > 0
        ? input.colors.slice(0, 6)
        : [{ name: 'Pitch Carbon', hex: '#0F1115' }],
    stockBySize,
    inventoryQuantity: totalQty,
    inStock: totalQty > 0,
    stockFloor: floor,
    stockCeiling: ceiling,
  };

  store.createdProducts.unshift(created);
  appendLogInternal(
    store,
    'OPS_PRODUCT_CREATED',
    `@${actor.username} (${actor.role}) published "${created.title}" (Stock: ${totalQty}, F:${floor}/C:${ceiling}).`,
    'success'
  );
  maybeEmitStockAlarm(store, {
    productId: created.id,
    productTitle: created.title,
    totalQty,
    floor,
    ceiling,
    recipientEmail: actor.email,
  });
  writeStore(store);
  return created;
}

export function updateProductVariantsOnServer(
  productId: string,
  baseProduct: Product | undefined,
  updates: ProductVariantPatch,
  actor: SessionAccount
): void {
  const store = readStore();
  const createdIdx = store.createdProducts.findIndex((p) => p.id === productId);
  const current = createdIdx > -1 ? store.createdProducts[createdIdx] : baseProduct;

  const sizes = updates.sizes ?? current?.sizes ?? ['M', 'L'];
  const stockBySize = updates.stockBySize ?? current?.stockBySize ?? {};
  const totalQty = sizes.reduce((sum, sz) => sum + Math.max(0, Math.floor(Number(stockBySize[sz] ?? 0))), 0);
  const floor = Math.max(0, Math.floor(updates.stockFloor ?? current?.stockFloor ?? 10));
  const ceiling = Math.max(Math.max(1, floor), Math.floor(updates.stockCeiling ?? current?.stockCeiling ?? 80));

  if (createdIdx > -1) {
    store.createdProducts[createdIdx] = {
      ...store.createdProducts[createdIdx],
      sizes,
      colors: updates.colors ?? store.createdProducts[createdIdx].colors,
      stockBySize,
      inventoryQuantity: totalQty,
      inStock: totalQty > 0,
      stockFloor: floor,
      stockCeiling: ceiling,
      price: updates.price ?? store.createdProducts[createdIdx].price,
      compareAtPrice: updates.compareAtPrice ?? store.createdProducts[createdIdx].compareAtPrice,
    };
  } else {
    store.productPatches[productId] = {
      ...store.productPatches[productId],
      ...updates,
      sizes,
      stockBySize,
      stockFloor: floor,
      stockCeiling: ceiling,
    };
  }

  const title = current?.title || productId;
  appendLogInternal(
    store,
    'OPS_VARIANT_STOCK_UPDATED',
    `@${actor.username} updated ${title}: ${totalQty} units across [${sizes.join(', ')}] (F:${floor}/C:${ceiling}).`,
    'info'
  );
  maybeEmitStockAlarm(store, {
    productId,
    productTitle: title,
    totalQty,
    floor,
    ceiling,
    recipientEmail: actor.email,
  });
  writeStore(store);
}

export function deleteProductOnServer(productId: string, actor: SessionAccount): void {
  const store = readStore();
  const createdIdx = store.createdProducts.findIndex((p) => p.id === productId);
  if (createdIdx > -1) {
    store.createdProducts.splice(createdIdx, 1);
  }
  if (!store.deletedProductIds.includes(productId)) {
    store.deletedProductIds.push(productId);
  }
  delete store.productPatches[productId];
  appendLogInternal(
    store,
    'OPS_PRODUCT_REMOVED',
    `@${actor.username} removed SKU ${productId} from catalog.`,
    'warning'
  );
  writeStore(store);
}

export function sendStockAlarmOnServer(
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
  },
  actor: SessionAccount
): StockAlarm {
  const store = readStore();
  const alarm: StockAlarm = {
    id: `alarm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    productId: params.productId,
    productTitle: params.productTitle.slice(0, 120),
    alarmType: params.alarmType,
    triggerScope: params.triggerScope,
    size: params.size,
    currentQuantity: Math.max(0, Math.floor(params.currentQuantity)),
    threshold: Math.max(0, Math.floor(params.threshold)),
    acknowledged: false,
    recipientEmail: (params.recipientEmail || actor.email).slice(0, 160),
    message: params.message.slice(0, 500),
    createdAtMillis: Date.now(),
  };
  store.stockAlarms.unshift(alarm);
  appendLogInternal(
    store,
    `STOCK_ALARM_${alarm.alarmType}`,
    `${alarm.message} Sent by @${actor.username} to ${alarm.recipientEmail}.`,
    'warning'
  );
  writeStore(store);
  return alarm;
}

export function acknowledgeAlarmOnServer(alarmId: string): void {
  const store = readStore();
  const alarm = store.stockAlarms.find((a) => a.id === alarmId);
  if (alarm) {
    alarm.acknowledged = true;
    writeStore(store);
  }
}

export function deleteAlarmOnServer(alarmId: string): void {
  const store = readStore();
  store.stockAlarms = store.stockAlarms.filter((a) => a.id !== alarmId);
  writeStore(store);
}

export function saveShopifyConfigOnServer(cfg: ShopifyConfig, actor: SessionAccount): void {
  const store = readStore();
  store.shopifyConfig = cfg;
  appendLogInternal(
    store,
    'INTEGRATION_CONFIG_SAVED',
    `@${actor.username} updated storefront integration endpoint (${cfg.storeDomain}).`,
    'info'
  );
  writeStore(store);
}

export function appendSyncLogOnServer(
  event: string,
  details: string,
  status: 'success' | 'info' | 'warning'
): void {
  const store = readStore();
  appendLogInternal(store, event, details, status);
  writeStore(store);
}

export function createOrderOnServer(params: {
  user: SessionAccount;
  items: CartItem[];
  customer: CheckoutCustomerInfo;
  discountPercentage: number;
  currentProducts: Product[];
}): ConfirmedOrder {
  const { user, items, customer, discountPercentage, currentProducts } = params;
  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpError(400, 'Cart items are required to place an order.');
  }

  const subtotal = items.reduce((acc, item) => acc + Number(item.price) * Math.max(1, Number(item.quantity)), 0);
  const discountAmount = Math.round(subtotal * (Math.max(0, Math.min(90, discountPercentage)) / 100));
  const shippingAmount = customer.shippingMethod === 'express' ? 24 : subtotal >= 150 ? 0 : 12;
  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const taxAmount = Math.round(taxableAmount * 0.08);
  const total = taxableAmount + shippingAmount + taxAmount;

  const orderNum = `OF-${Math.floor(100000 + Math.random() * 900000)}`;
  const shopifyRef = `gid://shopify/Order/${Math.floor(5800000000 + Math.random() * 900000000)}`;
  const isExpress = customer.shippingMethod === 'express';

  const deliveryDate = new Date();
  deliveryDate.setDate(deliveryDate.getDate() + (isExpress ? 2 : 4));
  const estimatedDelivery = deliveryDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const orderDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const store = readStore();

  const cleanItems = items.slice(0, 25).map((it) => ({
    productId: String(it.productId || '').slice(0, 128),
    title: String(it.title || 'Garment').slice(0, 120),
    price: Number(it.price) || 0,
    size: String(it.size || 'M').slice(0, 16),
    color: String(it.color || '').slice(0, 60),
    quantity: Math.max(1, Math.floor(Number(it.quantity) || 1)),
  }));

  // Deduct per-size inventory on the server catalog overlay automatically
  const prodMap = new Map<string, Product>();
  for (const p of currentProducts) prodMap.set(p.id, p);

  for (const item of cleanItems) {
    const prod = prodMap.get(item.productId);
    if (!prod) continue;

    const sizes = prod.sizes.length > 0 ? prod.sizes : (['M'] as GarmentSize[]);
    const nextStockMap: Partial<Record<GarmentSize, number>> = { ...(prod.stockBySize || {}) };
    if (Object.keys(nextStockMap).length === 0) {
      const base = Math.floor(prod.inventoryQuantity / sizes.length);
      let rem = prod.inventoryQuantity % sizes.length;
      for (const sz of sizes) {
        nextStockMap[sz] = base + (rem > 0 ? 1 : 0);
        if (rem > 0) rem -= 1;
      }
    }
    const sz = item.size as GarmentSize;
    if (ALL_SIZES.includes(sz)) {
      nextStockMap[sz] = Math.max(0, (nextStockMap[sz] ?? 0) - item.quantity);
    }
    const nextTotal = sizes.reduce((sum, s) => sum + (nextStockMap[s] ?? 0), 0);
    const floor = prod.stockFloor ?? 10;
    const ceiling = prod.stockCeiling ?? 80;

    const createdIdx = store.createdProducts.findIndex((p) => p.id === prod.id);
    if (createdIdx > -1) {
      store.createdProducts[createdIdx] = {
        ...store.createdProducts[createdIdx],
        stockBySize: nextStockMap,
        inventoryQuantity: nextTotal,
        inStock: nextTotal > 0,
      };
    } else {
      store.productPatches[prod.id] = {
        ...store.productPatches[prod.id],
        sizes,
        stockBySize: nextStockMap,
        stockFloor: floor,
        stockCeiling: ceiling,
      };
    }

    prodMap.set(prod.id, {
      ...prod,
      stockBySize: nextStockMap,
      inventoryQuantity: nextTotal,
      inStock: nextTotal > 0,
    });

    if (nextTotal <= floor) {
      maybeEmitStockAlarm(store, {
        productId: prod.id,
        productTitle: prod.title,
        totalQty: nextTotal,
        floor,
        ceiling,
        recipientEmail: store.superuser?.email || 'ops@offsideapparel.internal',
      });
    }
  }

  const orderRecord: CustomerOrderRecord = {
    orderNumber: orderNum,
    userId: user.id,
    shopifyOrderRef: shopifyRef,
    date: orderDate,
    items: cleanItems,
    shippingMethod: customer.shippingMethod === 'standard' ? 'standard' : 'express',
    paymentMethod:
      customer.paymentMethod === 'shopify_pay'
        ? 'shopify_pay'
        : customer.paymentMethod === 'apple_pay'
        ? 'apple_pay'
        : 'card',
    discountCode: customer.discountCode ? customer.discountCode.slice(0, 32) : undefined,
    discountPercentage,
    subtotal,
    discountAmount,
    shippingAmount,
    taxAmount,
    total,
    estimatedDelivery,
    status: 'Confirmed',
    stockDeducted: true,
    createdAtMillis: Date.now(),
    source: 'server',
  };

  const shippingInfo: OrderPrivateShippingInfo = {
    email: String(customer.email || user.email).slice(0, 160),
    firstName: String(customer.firstName || '').slice(0, 80),
    lastName: String(customer.lastName || '').slice(0, 80),
    athleteId: customer.athleteId ? String(customer.athleteId).slice(0, 64) : undefined,
    clubOrTeam: customer.clubOrTeam ? String(customer.clubOrTeam).slice(0, 120) : undefined,
    address: String(customer.address || '').slice(0, 200),
    apartment: customer.apartment ? String(customer.apartment).slice(0, 100) : undefined,
    city: String(customer.city || '').slice(0, 80),
    postalCode: String(customer.postalCode || '').slice(0, 24),
    country: String(customer.country || '').slice(0, 80),
    phone: String(customer.phone || '').slice(0, 32),
  };

  const courier = isExpress ? 'DHL Express Athlete Priority' : 'Carbon-Neutral Ground Fleet';
  const trackingNumber = `DHL-EXP-${Math.floor(100000000 + Math.random() * 900000000)}-INT`;

  const checkpoints: TrackingCheckpoint[] = [
    {
      step: 'Ordered',
      timestamp: `${orderDate}, ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      location: 'Offside Storefront',
      description: 'Payment authorized & order logged to database',
      completed: true,
      active: true,
    },
    {
      step: 'Processing',
      timestamp: 'Scheduled',
      location: 'Zurich Performance Garment Lab',
      description: 'Garments pulled from inventory bay for ultrasonic seam QA inspection',
      completed: false,
      active: false,
    },
    {
      step: 'Shipped',
      timestamp: 'Pending Dispatch',
      location: 'Courier International Sorting Bay',
      description: 'Courier handover and temperature-controlled flight loading',
      completed: false,
      active: false,
    },
    {
      step: 'Delivered',
      timestamp: `Estimated ${estimatedDelivery}`,
      location: `${shippingInfo.city}, ${shippingInfo.country}`,
      description: 'Direct handoff at destination facility',
      completed: false,
      active: false,
    },
  ];

  const tracking: ShipmentTrackingRecord = {
    orderNumber: orderNum,
    shopifyOrderRef: shopifyRef,
    currentStatus: 'Ordered',
    courier,
    trackingNumber,
    orderDate,
    estimatedDelivery,
    athleteName: `${shippingInfo.firstName} ${shippingInfo.lastName}`.trim() || user.fullName,
    athleteId: shippingInfo.athleteId || 'PRO-ATHLETE-ACTIVE',
    destination: `${shippingInfo.city}, ${shippingInfo.country}`,
    items: cleanItems.map((it) => ({
      title: it.title,
      size: it.size,
      quantity: it.quantity,
    })),
    checkpoints,
  };

  store.orders.unshift({ order: orderRecord, shipping: shippingInfo, tracking });
  appendLogInternal(
    store,
    'CUSTOMER_ORDER_CREATED',
    `Order ${orderNum} ($${total}) placed by @${user.username} with per-size stock reserved.`,
    'success'
  );
  writeStore(store);

  return {
    orderNumber: orderNum,
    shopifyOrderRef: shopifyRef,
    date: orderDate,
    items,
    customer,
    subtotal,
    discountAmount,
    shippingAmount,
    taxAmount,
    total,
    estimatedDelivery,
    status: 'Confirmed',
    dispatchCourier: courier,
    trackingNumber,
    stockDeducted: true,
  };
}

export function getOrdersForUser(userId: string): CustomerOrderRecord[] {
  const store = readStore();
  return store.orders
    .filter((entry) => entry.order.userId === userId)
    .map((entry) => entry.order)
    .sort((a, b) => b.createdAtMillis - a.createdAtMillis);
}

export function getOrderShippingOnServer(
  orderNumber: string,
  requester: SessionAccount
): OrderPrivateShippingInfo | null {
  const clean = orderNumber.trim().toUpperCase();
  const store = readStore();
  const found = store.orders.find((e) => e.order.orderNumber === clean);
  if (!found) return null;
  const perms = normalizeStaffPermissions(requester.permissions);
  const isPrivileged =
    requester.role === 'superuser' ||
    (requester.role === 'staff' &&
      (perms.includes('view_dispatch_orders') || perms.includes('execute_order_dispatch')));
  if (found.order.userId !== requester.id && !isPrivileged) {
    throw new HttpError(403, 'You are not authorized to access shipping details for this order.');
  }
  return found.shipping;
}

export function getOrderTrackingOnServer(orderNumber: string): ShipmentTrackingRecord | null {
  const clean = orderNumber.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,32}$/.test(clean)) return null;
  const store = readStore();
  const found = store.orders.find((e) => e.order.orderNumber === clean);
  return found ? found.tracking : null;
}

export function dispatchOrderOnServer(
  params: {
    orderNumber: string;
    nextStatus: OrderStatus;
    courier: string;
    trackingNumber: string;
    dispatchNotes?: string;
    deductStock?: boolean;
    products?: Product[];
  },
  actor: SessionAccount
): CustomerOrderRecord {
  const cleanOrderNum = params.orderNumber.trim().toUpperCase();
  const store = readStore();
  const found = store.orders.find((e) => e.order.orderNumber === cleanOrderNum);
  if (!found) {
    throw new HttpError(404, `Order ${cleanOrderNum} not found on server.`);
  }

  const mappedShipmentStatus: ShipmentStatus =
    params.nextStatus === 'Confirmed'
      ? 'Ordered'
      : params.nextStatus === 'Preparing Shipment'
      ? 'Processing'
      : params.nextStatus === 'Dispatched'
      ? 'Shipped'
      : 'Delivered';

  const statusOrder: ShipmentStatus[] = ['Ordered', 'Processing', 'Shipped', 'Delivered'];
  const newIndex = statusOrder.indexOf(mappedShipmentStatus);
  const nowTimestamp = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  found.order.status = params.nextStatus;
  found.order.dispatchCourier = (params.courier || found.order.dispatchCourier || 'DHL Express Athlete Priority').slice(0, 100);
  found.order.trackingNumber = (params.trackingNumber || found.order.trackingNumber || '').slice(0, 64);
  if (params.dispatchNotes?.trim()) {
    found.order.dispatchNotes = params.dispatchNotes.trim().slice(0, 300);
  }
  if (params.nextStatus === 'Dispatched' || params.nextStatus === 'Delivered') {
    found.order.dispatchedAt = found.order.dispatchedAt || new Date().toISOString();
  }

  found.tracking.currentStatus = mappedShipmentStatus;
  found.tracking.courier = found.order.dispatchCourier;
  found.tracking.trackingNumber = found.order.trackingNumber;
  found.tracking.checkpoints = found.tracking.checkpoints.map((cp) => {
    const cpIdx = statusOrder.indexOf(cp.step);
    const isCompleted = cpIdx <= newIndex;
    const isActive = cpIdx === newIndex;
    let nextDescription = cp.description;
    if (cp.step === 'Shipped' && isCompleted) {
      nextDescription = params.dispatchNotes?.trim()
        ? `Dispatched via ${found.order.dispatchCourier} (${found.order.trackingNumber}) — ${params.dispatchNotes.trim()}`
        : `Dispatched from Offside Hub via ${found.order.dispatchCourier} (${found.order.trackingNumber})`;
    }
    return {
      ...cp,
      completed: isCompleted,
      active: isActive,
      description: nextDescription.slice(0, 240),
      timestamp:
        isCompleted &&
        (cp.timestamp.includes('Estimated') ||
          cp.timestamp.includes('Scheduled') ||
          cp.timestamp.includes('Pending'))
          ? nowTimestamp
          : cp.timestamp,
    };
  });

  appendLogInternal(
    store,
    `DISPATCH_${params.nextStatus.toUpperCase().replace(/\s+/g, '_')}`,
    `@${actor.username} updated Order ${cleanOrderNum} to "${params.nextStatus}" (${found.order.dispatchCourier}).`,
    'success'
  );
  writeStore(store);
  return found.order;
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
