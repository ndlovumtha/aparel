import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import {
  db,
  auth,
  ADMIN_BOOTSTRAP_EMAIL,
  OperationType,
  handleFirestoreError,
} from '../lib/firebase';
import {
  Product,
  ShopifyConfig,
  SyncLogEntry,
  CartItem,
  CheckoutCustomerInfo,
  ConfirmedOrder,
  ShipmentStatus,
  ShipmentTrackingRecord,
  TrackingCheckpoint,
} from '../types/store';
import { INITIAL_PRODUCTS } from '../data/products';

export interface FirestorePromotion {
  id: string;
  badge: string;
  tagline: string;
  title: string;
  description: string;
  promoCode: string;
  discountValue: string;
  discountPercent: number;
  validUntil: string;
  image: string;
  highlightPill: string;
  categoryLink: string;
  active: boolean;
  sortOrder: number;
}

export const INITIAL_PROMOTIONS: FirestorePromotion[] = [
  {
    id: 'promo-1',
    badge: 'Competition Season Special',
    tagline: 'Aerodynamic Performance Peak',
    title: '20% Off AeroCarbon™ Matchday & Race Tops',
    description:
      'Engineered for sub-10s sprinters and marathon record attempts. Ultralight sub-90g matrix with ultrasonic zero-chafe welded seams.',
    promoCode: 'OLYMPIC20',
    discountValue: '20% OFF',
    discountPercent: 20,
    validUntil: 'Active for Olympic & Trials Athletes',
    image: '/src/assets/images/product_stealth_jersey_1793037645515.jpg',
    highlightPill: 'Sub-90g Garment Matrix',
    categoryLink: 'Track & Field',
    active: true,
    sortOrder: 1,
  },
  {
    id: 'promo-2',
    badge: 'Team & Federation Restock',
    tagline: 'Muscular Stabilization Program',
    title: 'Squad Bundle: Buy 2 Get 1 Free on Apex Compression',
    description:
      'Equip your training squad with 22-26 mmHg graduated compression shorts designed to minimize eccentric hamstring micro-tears during decelerations.',
    promoCode: 'SQUADPRO',
    discountValue: 'BUY 2 GET 1',
    discountPercent: 25,
    validUntil: 'Available for Clubs & National Squads',
    image: '/src/assets/images/product_compression_tights_1793037646698.jpg',
    highlightPill: '22-26 mmHg Compression',
    categoryLink: 'Pitch & Field',
    active: true,
    sortOrder: 2,
  },
  {
    id: 'promo-3',
    badge: 'Extreme Weather Launch',
    tagline: '20,000mm HydroZero™ Technology',
    title: 'Complimentary Pro Athlete Bag with Storm Shell Orders',
    description:
      'Order any VaporWeave or HydroZero™ technical waterproof outerwear and automatically receive a complimentary ballistic waterproof athlete gear pack.',
    promoCode: 'STORMREADY',
    discountValue: 'FREE $75 GIFT',
    discountPercent: 15,
    validUntil: 'Limited First 150 Weather Orders',
    image: '/src/assets/images/product_technical_jacket_1793037646546.jpg',
    highlightPill: '20,000mm Hydrostatic Barrier',
    categoryLink: 'Outerwear',
    active: true,
    sortOrder: 3,
  },
  {
    id: 'promo-4',
    badge: 'Global Dispatch Privilege',
    tagline: 'Zero Wait Priority Transit',
    title: 'Free Worldwide DHL Express Priority on Orders Over $120',
    description:
      'Direct temperature-controlled airfreight to any national training facility, altitude camp, or private residence with live GPS tracking.',
    promoCode: 'FASTTRACK',
    discountValue: 'FREE EXPRESS',
    discountPercent: 15,
    validUntil: 'Automated Global Handoff',
    image: '/src/assets/images/hero_athlete_campaign_1793037644855.jpg',
    highlightPill: '2-Day Guaranteed Airfreight',
    categoryLink: 'All',
    active: true,
    sortOrder: 4,
  },
];

// Sanitization helpers matching firebase-blueprint.json constraints
const clampStr = (val: string | undefined, max: number, fallback = ''): string => {
  const s = (val ?? fallback).trim();
  return s.length > max ? s.slice(0, max) : s;
};

const toHandle = (raw: string): string => {
  const clean = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return (clean || 'offside-item').slice(0, 128);
};

const toSafeId = (raw: string): string => {
  const clean = raw.replace(/[^a-zA-Z0-9_-]/g, '-');
  return (clean || `id-${Date.now()}`).slice(0, 128);
};

export async function checkIsUserAdmin(user: User | null): Promise<boolean> {
  if (!user || !user.emailVerified) return false;
  if (user.email?.toLowerCase() === ADMIN_BOOTSTRAP_EMAIL.toLowerCase()) {
    return true;
  }
  const path = `admins/${user.uid}`;
  try {
    const snap = await getDoc(doc(db, 'admins', user.uid));
    return snap.exists() && snap.data()?.role === 'admin';
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export function subscribeToProducts(
  onData: (products: Product[], fromDb: boolean) => void
): Unsubscribe {
  const path = 'products';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      if (snapshot.empty) {
        onData(INITIAL_PRODUCTS, false);
        return;
      }
      const list: Product[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          shopifyId: data.shopifyId,
          title: data.title,
          handle: data.handle,
          tagline: data.tagline,
          description: data.description,
          price: data.price,
          compareAtPrice: data.compareAtPrice,
          currency: data.currency || 'USD',
          category: data.category,
          discipline: data.discipline,
          image: data.image,
          detailImage: data.detailImage,
          sizes: data.sizes || ['M', 'L'],
          colors: data.colors || [{ name: 'Pitch Carbon', hex: '#0F1115' }],
          inStock: Boolean(data.inStock),
          inventoryQuantity: Number(data.inventoryQuantity ?? 0),
          weightGsm: Number(data.weightGsm ?? 100),
          fabricSpecs: data.fabricSpecs,
          athleteFitNotes: data.athleteFitNotes || '',
          featured: Boolean(data.featured),
        };
      });
      onData(list, true);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeToPromotions(
  onData: (promos: FirestorePromotion[]) => void
): Unsubscribe {
  const path = 'promotions';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      if (snapshot.empty) {
        onData(INITIAL_PROMOTIONS);
        return;
      }
      const list: FirestorePromotion[] = snapshot.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            badge: data.badge,
            tagline: data.tagline,
            title: data.title,
            description: data.description,
            promoCode: data.promoCode,
            discountValue: data.discountValue,
            discountPercent: Number(data.discountPercent ?? 15),
            validUntil: data.validUntil,
            image: data.image,
            highlightPill: data.highlightPill,
            categoryLink: data.categoryLink,
            active: Boolean(data.active),
            sortOrder: Number(data.sortOrder ?? 1),
          };
        })
        .filter((p) => p.active)
        .sort((a, b) => a.sortOrder - b.sortOrder);

      onData(list.length > 0 ? list : INITIAL_PROMOTIONS);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function seedDatabaseIfEmptyAsAdmin(): Promise<boolean> {
  const user = auth.currentUser;
  if (!user || !(await checkIsUserAdmin(user))) return false;

  try {
    const prodSnap = await getDocs(collection(db, 'products'));
    const promoSnap = await getDocs(collection(db, 'promotions'));
    const integSnap = await getDoc(doc(db, 'integrations', 'shopify'));

    const batch = writeBatch(db);
    let hasWrites = false;

    if (prodSnap.empty) {
      hasWrites = true;
      for (const p of INITIAL_PRODUCTS) {
        const payload: Record<string, unknown> = {
          shopifyId: clampStr(p.shopifyId, 128),
          title: clampStr(p.title, 120),
          handle: toHandle(p.handle),
          tagline: clampStr(p.tagline, 160),
          description: clampStr(p.description, 2000),
          price: Number(p.price),
          currency: 'USD',
          category: p.category,
          discipline: p.discipline,
          image: clampStr(p.image, 500),
          sizes: p.sizes.slice(0, 6),
          colors: p.colors.slice(0, 6),
          inStock: p.inventoryQuantity > 0,
          inventoryQuantity: p.inventoryQuantity,
          weightGsm: p.weightGsm,
          fabricSpecs: {
            composition: clampStr(p.fabricSpecs.composition, 240),
            treatment: clampStr(p.fabricSpecs.treatment, 240),
            seamType: clampStr(p.fabricSpecs.seamType, 240),
            breathabilityRating: clampStr(p.fabricSpecs.breathabilityRating, 160),
          },
          athleteFitNotes: clampStr(p.athleteFitNotes, 600),
          featured: Boolean(p.featured),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (typeof p.compareAtPrice === 'number') {
          payload.compareAtPrice = p.compareAtPrice;
        }
        if (p.detailImage) {
          payload.detailImage = clampStr(p.detailImage, 500);
        }
        batch.set(doc(db, 'products', toSafeId(p.id)), payload);
      }
    }

    if (promoSnap.empty) {
      hasWrites = true;
      for (const pr of INITIAL_PROMOTIONS) {
        batch.set(doc(db, 'promotions', toSafeId(pr.id)), {
          badge: clampStr(pr.badge, 80),
          tagline: clampStr(pr.tagline, 120),
          title: clampStr(pr.title, 140),
          description: clampStr(pr.description, 600),
          promoCode: pr.promoCode.toUpperCase().replace(/[^A-Z0-9_-]/g, ''),
          discountValue: clampStr(pr.discountValue, 40),
          discountPercent: Number(pr.discountPercent),
          validUntil: clampStr(pr.validUntil, 120),
          image: clampStr(pr.image, 500),
          highlightPill: clampStr(pr.highlightPill, 100),
          categoryLink: clampStr(pr.categoryLink, 60),
          active: pr.active,
          sortOrder: pr.sortOrder,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    if (!integSnap.exists()) {
      hasWrites = true;
      batch.set(doc(db, 'integrations', 'shopify'), {
        storeDomain: 'offside-apparel.myshopify.com',
        storefrontAccessToken: 'shpat_08f9a91c7849e7019d5b0012b',
        apiVersion: '2024-01',
        syncStatus: 'synced',
        lastSyncedAt: new Date().toISOString(),
        mode: 'synced-cache',
        autoSync: true,
        itemsCount: INITIAL_PRODUCTS.length,
        updatedAt: serverTimestamp(),
      });
    }

    if (hasWrites) {
      await batch.commit();
      await appendSyncLogInFirestore({
        event: 'FIRESTORE_CATALOG_SEEDED',
        details: `Initialized Firestore database with ${INITIAL_PRODUCTS.length} products and ${INITIAL_PROMOTIONS.length} promotions.`,
        status: 'success',
      });
    }
    return hasWrites;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'products');
  }
}

export async function createProductInFirestore(
  newProductData: Omit<Product, 'id' | 'shopifyId' | 'handle'> & { handle?: string }
): Promise<string> {
  const id = `offside-custom-${Date.now()}`;
  const path = `products/${id}`;
  const shopifyId = `gid://shopify/Product/${Math.floor(8490000000000 + Math.random() * 9000000000)}`;
  const handle = toHandle(newProductData.handle || newProductData.title);

  const payload: Record<string, unknown> = {
    shopifyId,
    title: clampStr(newProductData.title, 120, 'Technical Garment'),
    handle,
    tagline: clampStr(newProductData.tagline, 160, 'Minimalist Performance Apparel'),
    description: clampStr(newProductData.description, 2000, 'Engineered for competition.'),
    price: Math.max(1, Math.min(100000, Number(newProductData.price) || 120)),
    currency: 'USD',
    category: newProductData.category,
    discipline: newProductData.discipline,
    image: clampStr(newProductData.image, 500, '/src/assets/images/product_stealth_jersey_1793037645515.jpg'),
    sizes: newProductData.sizes.slice(0, 6),
    colors: newProductData.colors.slice(0, 6),
    inStock: Number(newProductData.inventoryQuantity) > 0,
    inventoryQuantity: Math.max(0, Math.floor(Number(newProductData.inventoryQuantity) || 0)),
    weightGsm: Math.max(10, Math.min(2000, Number(newProductData.weightGsm) || 100)),
    fabricSpecs: {
      composition: clampStr(newProductData.fabricSpecs.composition, 240, 'Technical Synthetics'),
      treatment: clampStr(newProductData.fabricSpecs.treatment, 240, 'Hydrophobic Finish'),
      seamType: clampStr(newProductData.fabricSpecs.seamType, 240, 'Ultrasonic Bonded'),
      breathabilityRating: clampStr(newProductData.fabricSpecs.breathabilityRating, 160, 'High Permeability'),
    },
    athleteFitNotes: clampStr(newProductData.athleteFitNotes, 600, 'Athletic anatomical contour.'),
    featured: Boolean(newProductData.featured),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (typeof newProductData.compareAtPrice === 'number' && newProductData.compareAtPrice > 0) {
    payload.compareAtPrice = newProductData.compareAtPrice;
  }
  if (newProductData.detailImage) {
    payload.detailImage = clampStr(newProductData.detailImage, 500);
  }

  try {
    await setDoc(doc(db, 'products', id), payload);
    await appendSyncLogInFirestore({
      event: 'ADMIN_PRODUCT_CREATED',
      details: `Created "${payload.title}" in Firestore (Initial Stock: ${payload.inventoryQuantity}).`,
      status: 'success',
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateProductStockInFirestore(
  productId: string,
  newQuantity: number
): Promise<void> {
  const path = `products/${productId}`;
  const clampedQty = Math.max(0, Math.min(1000000, Math.floor(newQuantity)));
  try {
    await updateDoc(doc(db, 'products', productId), {
      inventoryQuantity: clampedQty,
      inStock: clampedQty > 0,
      updatedAt: serverTimestamp(),
    });
    await appendSyncLogInFirestore({
      event: 'ADMIN_STOCK_OVERRIDE',
      details: `Firestore inventory for SKU ${productId} set to ${clampedQty} units.`,
      status: 'info',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function batchRestockLowItemsInFirestore(
  products: Product[],
  incrementAmount = 20
): Promise<number> {
  const lowItems = products.filter((p) => p.inventoryQuantity < 10);
  if (lowItems.length === 0) return 0;

  try {
    const batch = writeBatch(db);
    for (const p of lowItems) {
      const nextQty = Math.min(1000000, p.inventoryQuantity + incrementAmount);
      batch.update(doc(db, 'products', p.id), {
        inventoryQuantity: nextQty,
        inStock: true,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
    await appendSyncLogInFirestore({
      event: 'ADMIN_BATCH_RESTOCK',
      details: `Batch restocked ${lowItems.length} low-stock SKUs (+${incrementAmount} units each) in Firestore.`,
      status: 'success',
    });
    return lowItems.length;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'products');
  }
}

export async function applyFlashPriceSyncInFirestore(
  productId: string,
  currentPrice: number
): Promise<void> {
  const path = `products/${productId}`;
  const newPrice = Math.max(1, Math.round(currentPrice * 0.95));
  try {
    await updateDoc(doc(db, 'products', productId), {
      price: newPrice,
      compareAtPrice: currentPrice,
      updatedAt: serverTimestamp(),
    });
    await appendSyncLogInFirestore({
      event: 'WEBHOOK: products/update',
      details: `Flash pricing sync applied to SKU ${productId} (Updated to $${newPrice}).`,
      status: 'success',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteProductInFirestore(productId: string, title?: string): Promise<void> {
  const path = `products/${productId}`;
  try {
    await deleteDoc(doc(db, 'products', productId));
    await appendSyncLogInFirestore({
      event: 'ADMIN_PRODUCT_ARCHIVED',
      details: `SKU ${productId} (${title || 'Product'}) deleted from Firestore.`,
      status: 'warning',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeToShopifyIntegration(
  onData: (config: ShopifyConfig) => void
): Unsubscribe {
  const path = 'integrations/shopify';
  return onSnapshot(
    doc(db, 'integrations', 'shopify'),
    (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        onData({
          storeDomain: d.storeDomain || 'offside-apparel.myshopify.com',
          storefrontAccessToken: d.storefrontAccessToken || '',
          apiVersion: d.apiVersion || '2024-01',
          syncStatus: d.syncStatus || 'synced',
          lastSyncedAt: d.lastSyncedAt || null,
          mode: d.mode || 'synced-cache',
          autoSync: Boolean(d.autoSync),
          itemsCount: Number(d.itemsCount ?? INITIAL_PRODUCTS.length),
        });
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export async function saveShopifyConfigInFirestore(config: ShopifyConfig): Promise<void> {
  const path = 'integrations/shopify';
  try {
    await setDoc(doc(db, 'integrations', 'shopify'), {
      storeDomain: clampStr(config.storeDomain, 160, 'offside-apparel.myshopify.com'),
      storefrontAccessToken: clampStr(config.storefrontAccessToken, 200),
      apiVersion: config.apiVersion === '2024-04' ? '2024-04' : '2024-01',
      syncStatus: config.syncStatus,
      lastSyncedAt: clampStr(config.lastSyncedAt || new Date().toISOString(), 64),
      mode: config.mode === 'live-shopify' ? 'live-shopify' : 'synced-cache',
      autoSync: Boolean(config.autoSync),
      itemsCount: Math.max(0, Number(config.itemsCount) || 0),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeToSyncLogs(onData: (logs: SyncLogEntry[]) => void): Unsubscribe {
  const path = 'syncLogs';
  const q = query(collection(db, path), orderBy('createdAt', 'desc'), limit(30));
  return onSnapshot(
    q,
    (snap) => {
      const logs: SyncLogEntry[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          timestamp: data.timestamp || '',
          event: data.event || '',
          details: data.details || '',
          status: data.status || 'info',
        };
      });
      onData(logs);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function appendSyncLogInFirestore(
  log: Omit<SyncLogEntry, 'id' | 'timestamp'>
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !(await checkIsUserAdmin(user))) return;

  const logId = `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const path = `syncLogs/${logId}`;
  try {
    await setDoc(doc(db, 'syncLogs', logId), {
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      event: clampStr(log.event, 120),
      details: clampStr(log.details, 500),
      status: log.status,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function createOrderInFirestore(
  items: CartItem[],
  customer: CheckoutCustomerInfo,
  discountPercentage: number,
  currentProducts: Product[]
): Promise<ConfirmedOrder> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) {
    throw new Error('Please sign in with a verified Google account to place your order.');
  }

  const subtotal = items.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const discountAmount = Math.round(subtotal * (discountPercentage / 100));
  const shippingAmount = customer.shippingMethod === 'express' ? 24 : subtotal >= 150 ? 0 : 12;
  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const taxAmount = Math.round(taxableAmount * 0.08);
  const total = taxableAmount + shippingAmount + taxAmount;

  const orderNum = `OF-${Math.floor(100000 + Math.random() * 900000)}`;
  const shopifyRef = `gid://shopify/Order/${Math.floor(5800000000 + Math.random() * 900000000)}`;

  const deliveryDate = new Date();
  deliveryDate.setDate(deliveryDate.getDate() + (customer.shippingMethod === 'express' ? 2 : 4));
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

  const batch = writeBatch(db);

  // 1. Public-safe Order Summary (No PII)
  const orderDocPayload: Record<string, unknown> = {
    orderNumber: orderNum,
    userId: user.uid,
    shopifyOrderRef: shopifyRef,
    date: orderDate,
    items: items.slice(0, 25).map((it) => ({
      productId: clampStr(it.productId, 128),
      title: clampStr(it.title, 120),
      price: Number(it.price),
      size: clampStr(it.size, 16),
      color: clampStr(it.color, 60),
      quantity: Math.max(1, Math.floor(it.quantity)),
    })),
    shippingMethod: customer.shippingMethod,
    paymentMethod: customer.paymentMethod,
    subtotal,
    discountAmount,
    shippingAmount,
    taxAmount,
    total,
    estimatedDelivery,
    status: 'Confirmed',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (customer.discountCode) {
    orderDocPayload.discountCode = clampStr(customer.discountCode, 32);
    orderDocPayload.discountPercentage = discountPercentage;
  }
  batch.set(doc(db, 'orders', orderNum), orderDocPayload);

  // 2. Isolated Private PII Subcollection
  const shippingPayload: Record<string, unknown> = {
    ownerId: user.uid,
    email: clampStr(customer.email || user.email || '', 160),
    firstName: clampStr(customer.firstName, 80),
    lastName: clampStr(customer.lastName, 80),
    address: clampStr(customer.address, 200),
    city: clampStr(customer.city, 80),
    postalCode: clampStr(customer.postalCode, 24),
    country: clampStr(customer.country, 80),
    phone: clampStr(customer.phone, 32),
    createdAt: serverTimestamp(),
  };
  if (customer.athleteId) shippingPayload.athleteId = clampStr(customer.athleteId, 64);
  if (customer.clubOrTeam) shippingPayload.clubOrTeam = clampStr(customer.clubOrTeam, 120);
  if (customer.apartment) shippingPayload.apartment = clampStr(customer.apartment, 100);
  batch.set(doc(db, 'orders', orderNum, 'private', 'shipping'), shippingPayload);

  // 3. Shipment Tracking Record (Non-PII)
  const isExpress = customer.shippingMethod === 'express';
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
      location: `${clampStr(customer.city, 50)}, ${clampStr(customer.country, 50)}`,
      description: 'Direct handoff at destination facility',
      completed: false,
      active: false,
    },
  ];

  const trackingPayload: Record<string, unknown> = {
    orderNumber: orderNum,
    ownerId: user.uid,
    shopifyOrderRef: shopifyRef,
    currentStatus: 'Ordered',
    courier: isExpress ? 'DHL Express Athlete Priority' : 'Carbon-Neutral Ground Fleet',
    trackingNumber: `DHL-EXP-${Math.floor(100000000 + Math.random() * 900000000)}-INT`,
    orderDate,
    estimatedDelivery,
    athleteName: clampStr(`${customer.firstName} ${customer.lastName}`, 100),
    athleteId: clampStr(customer.athleteId || 'PRO-ATHLETE-ACTIVE', 64),
    destination: clampStr(`${customer.city}, ${customer.country}`, 120),
    items: items.slice(0, 25).map((it) => ({
      title: clampStr(it.title, 120),
      size: clampStr(it.size, 16),
      quantity: Math.max(1, Math.floor(it.quantity)),
    })),
    checkpoints,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  batch.set(doc(db, 'tracking', orderNum), trackingPayload);

  // 4. Decrement inventory in Firestore if signed-in user is Admin
  const isAdminUser = await checkIsUserAdmin(user);
  if (isAdminUser) {
    for (const item of items) {
      const prod = currentProducts.find((p) => p.id === item.productId);
      if (prod) {
        const nextQty = Math.max(0, prod.inventoryQuantity - item.quantity);
        batch.update(doc(db, 'products', prod.id), {
          inventoryQuantity: nextQty,
          inStock: nextQty > 0,
          updatedAt: serverTimestamp(),
        });
      }
    }
  }

  try {
    await batch.commit();
    if (isAdminUser) {
      await appendSyncLogInFirestore({
        event: 'FIRESTORE_ORDER_CREATED',
        details: `Order ${orderNum} committed atomically with PII isolation & stock update.`,
        status: 'success',
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `orders/${orderNum}`);
  }

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
  };
}

export async function getOrderTrackingFromFirestore(
  orderNumber: string
): Promise<ShipmentTrackingRecord | null> {
  const cleanOrderNum = orderNumber.trim().toUpperCase();
  if (!/^[a-zA-Z0-9_-]{3,32}$/.test(cleanOrderNum)) return null;

  const path = `tracking/${cleanOrderNum}`;
  try {
    const snap = await getDoc(doc(db, 'tracking', cleanOrderNum));
    if (snap.exists()) {
      const d = snap.data();
      return {
        orderNumber: d.orderNumber,
        shopifyOrderRef: d.shopifyOrderRef,
        currentStatus: d.currentStatus,
        courier: d.courier,
        trackingNumber: d.trackingNumber,
        orderDate: d.orderDate,
        estimatedDelivery: d.estimatedDelivery,
        athleteName: d.athleteName,
        athleteId: d.athleteId,
        destination: d.destination,
        items: d.items || [],
        checkpoints: d.checkpoints || [],
      };
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function updateOrderTrackingStatusInFirestore(
  orderNumber: string,
  newStatus: ShipmentStatus,
  checkpoints: TrackingCheckpoint[]
): Promise<void> {
  const cleanOrderNum = orderNumber.trim().toUpperCase();
  const path = `tracking/${cleanOrderNum}`;
  try {
    const snap = await getDoc(doc(db, 'tracking', cleanOrderNum));
    if (!snap.exists()) return;

    const batch = writeBatch(db);
    batch.update(doc(db, 'tracking', cleanOrderNum), {
      currentStatus: newStatus,
      checkpoints,
      updatedAt: serverTimestamp(),
    });

    const mappedOrderStatus =
      newStatus === 'Ordered'
        ? 'Confirmed'
        : newStatus === 'Processing'
        ? 'Preparing Shipment'
        : newStatus === 'Shipped'
        ? 'Dispatched'
        : 'Delivered';

    const orderSnap = await getDoc(doc(db, 'orders', cleanOrderNum));
    if (orderSnap.exists()) {
      batch.update(doc(db, 'orders', cleanOrderNum), {
        status: mappedOrderStatus,
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    await appendSyncLogInFirestore({
      event: 'ORDER_TRACKING_UPDATED',
      details: `Order ${cleanOrderNum} transitioned to [${newStatus}] in Firestore.`,
      status: 'info',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function getUserOrdersFromFirestore(uid: string): Promise<
  { orderNumber: string; date: string; total: number; status: string }[]
> {
  const path = 'orders';
  try {
    const q = query(collection(db, path), where('userId', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        orderNumber: data.orderNumber,
        date: data.date,
        total: Number(data.total ?? 0),
        status: data.status || 'Confirmed',
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}
