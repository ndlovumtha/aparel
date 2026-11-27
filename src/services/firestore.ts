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
  ALL_SIZING_TYPES,
  GarmentSize,
  Product,
  ProductCategory,
  ShopifyConfig,
  SizingType,
  SyncLogEntry,
  CartItem,
  CheckoutCustomerInfo,
  ConfirmedOrder,
  OrderStatus,
  ShipmentStatus,
  ShipmentTrackingRecord,
  StockAlarm,
  StockAlarmType,
  TrackingCheckpoint,
  CustomerOrderItem,
  CustomerOrderRecord,
  OrderPrivateShippingInfo,
} from '../types/store';
export type { CustomerOrderItem, CustomerOrderRecord, OrderPrivateShippingInfo };
import { INITIAL_PRODUCTS } from '../data/products';
import {
  DEFAULT_STOCK_CEILING,
  DEFAULT_STOCK_FLOOR,
  getEffectiveStockMap,
  getProductCeiling,
  getProductFloor,
  getTotalFromStockMap,
  inferSizingTypeFromProduct,
} from '../utils/inventory';

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

function sanitizeCategory(rawCategory: string | undefined): ProductCategory {
  const clean = clampStr(rawCategory, 60);
  return clean.length >= 2 ? clean : 'Tops';
}

function sanitizeSizingType(
  rawSizingType: string | undefined,
  sizes: GarmentSize[],
  category: string
): SizingType {
  if (rawSizingType && ALL_SIZING_TYPES.includes(rawSizingType as SizingType)) {
    return rawSizingType as SizingType;
  }
  return inferSizingTypeFromProduct({ sizingType: undefined, sizes, category });
}

function sanitizeSizes(rawSizes: GarmentSize[] | undefined): GarmentSize[] {
  const cleaned = (rawSizes || ['M', 'L'])
    .map((s) => clampStr(String(s ?? ''), 20))
    .filter((s) => s.length >= 1);
  return cleaned.length > 0 ? Array.from(new Set(cleaned)).slice(0, 10) : ['M'];
}

function sanitizeColors(
  rawColors: { name: string; hex: string }[] | undefined
): { name: string; hex: string }[] {
  const cleaned = (rawColors || [])
    .map((c) => ({
      name: clampStr(c.name, 60, 'Pitch Carbon') || 'Pitch Carbon',
      hex: /^#[0-9a-fA-F]{3,8}$/.test((c.hex || '').trim())
        ? (c.hex || '').trim().slice(0, 20)
        : '#0F1115',
    }))
    .slice(0, 6);
  return cleaned.length > 0 ? cleaned : [{ name: 'Pitch Carbon', hex: '#0F1115' }];
}

function sanitizeStockBySize(
  sizes: GarmentSize[],
  rawMap?: Partial<Record<GarmentSize, number>>,
  fallbackTotal = 0
): Partial<Record<GarmentSize, number>> {
  const result: Partial<Record<GarmentSize, number>> = {};
  if (rawMap && Object.keys(rawMap).length > 0) {
    for (const sz of sizes) {
      result[sz] = Math.max(0, Math.min(100000, Math.floor(Number(rawMap[sz] ?? 0))));
    }
    return result;
  }

  const cleanTotal = Math.max(0, Math.min(100000, Math.floor(fallbackTotal)));
  const base = Math.floor(cleanTotal / sizes.length);
  let rem = cleanTotal % sizes.length;
  for (const sz of sizes) {
    const extra = rem > 0 ? 1 : 0;
    if (rem > 0) rem -= 1;
    result[sz] = base + extra;
  }
  return result;
}

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
        const sizes = sanitizeSizes(data.sizes);
        const rawStockMap =
          data.stockBySize && typeof data.stockBySize === 'object'
            ? (data.stockBySize as Partial<Record<GarmentSize, number>>)
            : undefined;
        const legacyQty = Number(data.inventoryQuantity ?? 0);
        const totalQty = rawStockMap
          ? getTotalFromStockMap(sizes, rawStockMap)
          : legacyQty;

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
          category: sanitizeCategory(data.category),
          sizingType: sanitizeSizingType(data.sizingType, sizes, String(data.category || '')),
          discipline: data.discipline,
          image: data.image,
          detailImage: data.detailImage,
          sizes,
          colors: data.colors || [{ name: 'Pitch Carbon', hex: '#0F1115' }],
          inStock: totalQty > 0,
          inventoryQuantity: totalQty,
          stockBySize: rawStockMap,
          stockFloor:
            typeof data.stockFloor === 'number' ? data.stockFloor : DEFAULT_STOCK_FLOOR,
          stockCeiling:
            typeof data.stockCeiling === 'number'
              ? data.stockCeiling
              : DEFAULT_STOCK_CEILING,
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
        const cleanSizes = sanitizeSizes(p.sizes);
        const stockMap = sanitizeStockBySize(cleanSizes, p.stockBySize, p.inventoryQuantity);
        const totalQty = getTotalFromStockMap(cleanSizes, stockMap);
        const floor = getProductFloor(p);
        const ceiling = Math.max(floor, getProductCeiling(p));

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
          sizes: cleanSizes,
          colors: sanitizeColors(p.colors),
          inStock: totalQty > 0,
          inventoryQuantity: totalQty,
          stockBySize: stockMap,
          stockFloor: floor,
          stockCeiling: ceiling,
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

  const cleanSizes = sanitizeSizes(newProductData.sizes);
  const cleanColors = sanitizeColors(newProductData.colors);
  const stockBySize = sanitizeStockBySize(
    cleanSizes,
    newProductData.stockBySize,
    Number(newProductData.inventoryQuantity) || 0
  );
  const totalQty = getTotalFromStockMap(cleanSizes, stockBySize);
  const floor = Math.max(0, Math.min(100000, Math.floor(Number(newProductData.stockFloor ?? DEFAULT_STOCK_FLOOR))));
  const ceiling = Math.max(
    Math.max(1, floor),
    Math.min(1000000, Math.floor(Number(newProductData.stockCeiling ?? DEFAULT_STOCK_CEILING)))
  );

  const cleanCategory = sanitizeCategory(newProductData.category);
  const cleanSizingType = sanitizeSizingType(newProductData.sizingType, cleanSizes, cleanCategory);

  const payload: Record<string, unknown> = {
    shopifyId,
    title: clampStr(newProductData.title, 120, 'Technical Garment'),
    handle,
    tagline: clampStr(newProductData.tagline, 160, 'Minimalist Performance Apparel'),
    description: clampStr(newProductData.description, 2000, 'Engineered for competition.'),
    price: Math.max(1, Math.min(100000, Number(newProductData.price) || 120)),
    currency: 'USD',
    category: cleanCategory,
    sizingType: cleanSizingType,
    discipline: newProductData.discipline,
    image: clampStr(newProductData.image, 500, '/src/assets/images/product_stealth_jersey_1793037645515.jpg'),
    sizes: cleanSizes,
    colors: cleanColors,
    inStock: totalQty > 0,
    inventoryQuantity: totalQty,
    stockBySize,
    stockFloor: floor,
    stockCeiling: ceiling,
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
      details: `Created "${payload.title}" (${cleanSizes.length} sizes, ${cleanColors.length} colors, Stock: ${totalQty}, Floor: ${floor}, Ceiling: ${ceiling}).`,
      status: 'success',
    });

    await checkAndEmitStockAlarmIfBreached({
      productId: id,
      productTitle: String(payload.title),
      totalQty,
      floor,
      ceiling,
    });

    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateProductVariantsAndStockInFirestore(
  product: Product,
  updates: {
    category?: ProductCategory;
    sizingType?: SizingType;
    sizes?: GarmentSize[];
    colors?: { name: string; hex: string }[];
    stockBySize?: Partial<Record<GarmentSize, number>>;
    stockFloor?: number;
    stockCeiling?: number;
  }
): Promise<void> {
  const path = `products/${product.id}`;
  const nextCategory = sanitizeCategory(updates.category ?? product.category);
  const nextSizes = sanitizeSizes(updates.sizes ?? product.sizes);
  const nextSizingType = sanitizeSizingType(
    updates.sizingType ?? product.sizingType,
    nextSizes,
    nextCategory
  );
  const nextColors = sanitizeColors(updates.colors ?? product.colors);
  const currentMap = getEffectiveStockMap(product);
  const nextStockMap = sanitizeStockBySize(nextSizes, updates.stockBySize ?? currentMap, product.inventoryQuantity);
  const nextTotal = getTotalFromStockMap(nextSizes, nextStockMap);

  const nextFloor = Math.max(
    0,
    Math.min(100000, Math.floor(updates.stockFloor ?? getProductFloor(product)))
  );
  const nextCeiling = Math.max(
    Math.max(1, nextFloor),
    Math.min(1000000, Math.floor(updates.stockCeiling ?? getProductCeiling(product)))
  );

  try {
    await updateDoc(doc(db, 'products', product.id), {
      category: nextCategory,
      sizingType: nextSizingType,
      sizes: nextSizes,
      colors: nextColors,
      stockBySize: nextStockMap,
      inventoryQuantity: nextTotal,
      inStock: nextTotal > 0,
      stockFloor: nextFloor,
      stockCeiling: nextCeiling,
      updatedAt: serverTimestamp(),
    });

    await appendSyncLogInFirestore({
      event: 'ADMIN_VARIANT_STOCK_UPDATED',
      details: `Updated ${product.title}: Total ${nextTotal} units across [${nextSizes.join(', ')}] (Floor ${nextFloor} / Ceiling ${nextCeiling}).`,
      status: 'info',
    });

    await checkAndEmitStockAlarmIfBreached({
      productId: product.id,
      productTitle: product.title,
      totalQty: nextTotal,
      floor: nextFloor,
      ceiling: nextCeiling,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateProductStockInFirestore(
  productId: string,
  newQuantity: number,
  product?: Product
): Promise<void> {
  const path = `products/${productId}`;
  const clampedQty = Math.max(0, Math.min(1000000, Math.floor(newQuantity)));

  try {
    const targetSizes = product ? sanitizeSizes(product.sizes) : (['M', 'L'] as GarmentSize[]);
    const nextStockMap = sanitizeStockBySize(targetSizes, undefined, clampedQty);
    const floor = product ? getProductFloor(product) : DEFAULT_STOCK_FLOOR;
    const ceiling = product ? Math.max(floor, getProductCeiling(product)) : DEFAULT_STOCK_CEILING;

    await updateDoc(doc(db, 'products', productId), {
      inventoryQuantity: clampedQty,
      stockBySize: nextStockMap,
      inStock: clampedQty > 0,
      updatedAt: serverTimestamp(),
    });
    await appendSyncLogInFirestore({
      event: 'ADMIN_STOCK_OVERRIDE',
      details: `Firestore inventory for SKU ${productId} set to ${clampedQty} units.`,
      status: 'info',
    });

    if (product) {
      await checkAndEmitStockAlarmIfBreached({
        productId: product.id,
        productTitle: product.title,
        totalQty: clampedQty,
        floor,
        ceiling,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function batchRestockLowItemsInFirestore(
  products: Product[],
  incrementAmount = 20
): Promise<number> {
  const lowItems = products.filter((p) => p.inventoryQuantity <= getProductFloor(p));
  if (lowItems.length === 0) return 0;

  try {
    const batch = writeBatch(db);
    for (const p of lowItems) {
      const currentMap = getEffectiveStockMap(p);
      const nextMap: Partial<Record<GarmentSize, number>> = { ...currentMap };
      const perSizeAdd = Math.max(1, Math.floor(incrementAmount / p.sizes.length));
      let extra = incrementAmount % p.sizes.length;

      for (const sz of p.sizes) {
        const add = perSizeAdd + (extra > 0 ? 1 : 0);
        if (extra > 0) extra -= 1;
        nextMap[sz] = Math.min(100000, (nextMap[sz] ?? 0) + add);
      }

      const nextQty = getTotalFromStockMap(p.sizes, nextMap);
      batch.update(doc(db, 'products', p.id), {
        stockBySize: nextMap,
        inventoryQuantity: nextQty,
        inStock: true,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
    await appendSyncLogInFirestore({
      event: 'ADMIN_BATCH_RESTOCK',
      details: `Batch restocked ${lowItems.length} below-floor SKUs (+${incrementAmount} units distributed by size) in Firestore.`,
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

// ================= STOCK ALARMS (FLOOR & CEILING) =================

async function checkAndEmitStockAlarmIfBreached(params: {
  productId: string;
  productTitle: string;
  totalQty: number;
  floor: number;
  ceiling: number;
}): Promise<void> {
  const { productId, productTitle, totalQty, floor, ceiling } = params;
  let alarmType: StockAlarmType | null = null;
  let threshold = floor;
  let message = '';

  if (totalQty === 0) {
    alarmType = 'OUT_OF_STOCK';
    threshold = floor;
    message = `CRITICAL STOCKOUT: ${productTitle} has 0 units remaining (Floor: ${floor}). Immediate replenishment required.`;
  } else if (totalQty <= floor) {
    alarmType = 'BELOW_FLOOR';
    threshold = floor;
    message = `FLOOR BREACH ALARM: ${productTitle} dropped to ${totalQty} units (Floor threshold: ${floor}).`;
  } else if (totalQty >= ceiling) {
    alarmType = 'ABOVE_CEILING';
    threshold = ceiling;
    message = `CEILING BREACH ALARM: ${productTitle} reached ${totalQty} units (Ceiling limit: ${ceiling}). Halt incoming manufacturing batches.`;
  }

  if (!alarmType) return;

  await sendStockAlarmInFirestore({
    productId,
    productTitle,
    alarmType,
    triggerScope: 'total',
    currentQuantity: totalQty,
    threshold,
    recipientEmail: auth.currentUser?.email || ADMIN_BOOTSTRAP_EMAIL,
    message,
  });
}

export async function sendStockAlarmInFirestore(params: {
  productId: string;
  productTitle: string;
  alarmType: StockAlarmType;
  triggerScope: 'total' | 'size';
  size?: GarmentSize;
  currentQuantity: number;
  threshold: number;
  recipientEmail: string;
  message: string;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user || !(await checkIsUserAdmin(user))) {
    throw new Error('Admin session required to dispatch stock alarms.');
  }

  const alarmId = `alarm-${toSafeId(params.productId).slice(0, 40)}-${Date.now()}`;
  const path = `stockAlarms/${alarmId}`;

  const payload: Record<string, unknown> = {
    productId: toSafeId(params.productId),
    productTitle: clampStr(params.productTitle, 120, 'Product'),
    alarmType: params.alarmType,
    triggerScope: params.triggerScope,
    currentQuantity: Math.max(0, Math.min(1000000, Math.floor(params.currentQuantity))),
    threshold: Math.max(0, Math.min(1000000, Math.floor(params.threshold))),
    acknowledged: false,
    recipientEmail: clampStr(params.recipientEmail || ADMIN_BOOTSTRAP_EMAIL, 160),
    message: clampStr(params.message, 500),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (params.size && clampStr(params.size, 20).length >= 1) {
    payload.size = clampStr(params.size, 20);
  }

  try {
    await setDoc(doc(db, 'stockAlarms', alarmId), payload);
    await appendSyncLogInFirestore({
      event: `STOCK_ALARM_${params.alarmType}`,
      details: `${payload.message} Dispatched to ${payload.recipientEmail}.`,
      status: 'warning',
    });
    return alarmId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeToStockAlarms(
  onData: (alarms: StockAlarm[]) => void
): Unsubscribe {
  const path = 'stockAlarms';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const list: StockAlarm[] = snapshot.docs
        .map((d) => {
          const data = d.data();
          const createdAtMillis =
            typeof data.createdAt?.toMillis === 'function' ? Number(data.createdAt.toMillis()) : 0;
          const triggerScope: 'total' | 'size' = data.triggerScope === 'size' ? 'size' : 'total';
          return {
            id: d.id,
            productId: String(data.productId || ''),
            productTitle: String(data.productTitle || ''),
            alarmType: (data.alarmType as StockAlarmType) || 'BELOW_FLOOR',
            triggerScope,
            size: data.size as GarmentSize | undefined,
            currentQuantity: Number(data.currentQuantity ?? 0),
            threshold: Number(data.threshold ?? 0),
            acknowledged: Boolean(data.acknowledged),
            recipientEmail: String(data.recipientEmail || ADMIN_BOOTSTRAP_EMAIL),
            message: String(data.message || ''),
            createdAtMillis,
          };
        })
        .sort((a, b) => b.createdAtMillis - a.createdAtMillis);
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function acknowledgeStockAlarmInFirestore(alarmId: string): Promise<void> {
  const path = `stockAlarms/${alarmId}`;
  try {
    await updateDoc(doc(db, 'stockAlarms', alarmId), {
      acknowledged: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteStockAlarmInFirestore(alarmId: string): Promise<void> {
  const path = `stockAlarms/${alarmId}`;
  try {
    await deleteDoc(doc(db, 'stockAlarms', alarmId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ================= INTEGRATIONS & SYNC LOGS =================

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

// ================= ORDERS & ADMIN DISPATCH SYSTEM =================

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

  const isAdminUser = await checkIsUserAdmin(user);
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
    stockDeducted: isAdminUser,
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

  // 4. Decrement per-size and total inventory in Firestore if signed-in user is Admin
  const breachedProducts: { productId: string; productTitle: string; totalQty: number; floor: number; ceiling: number }[] = [];
  if (isAdminUser) {
    const prodMap = new Map<string, Product>();
    for (const p of currentProducts) prodMap.set(p.id, p);

    for (const item of items) {
      const prod = prodMap.get(item.productId);
      if (prod) {
        const nextStockBySize = { ...getEffectiveStockMap(prod) };
        const sz = clampStr(item.size, 20);
        if (sz && (prod.sizes.includes(sz) || sz in nextStockBySize)) {
          nextStockBySize[sz] = Math.max(0, (nextStockBySize[sz] ?? 0) - item.quantity);
        }
        const nextTotal = getTotalFromStockMap(prod.sizes, nextStockBySize);

        batch.update(doc(db, 'products', prod.id), {
          stockBySize: nextStockBySize,
          inventoryQuantity: nextTotal,
          inStock: nextTotal > 0,
          updatedAt: serverTimestamp(),
        });

        const updatedProd: Product = {
          ...prod,
          stockBySize: nextStockBySize,
          inventoryQuantity: nextTotal,
          inStock: nextTotal > 0,
        };
        prodMap.set(prod.id, updatedProd);
      }
    }

    for (const item of items) {
      const updated = prodMap.get(item.productId);
      if (updated) {
        const floor = getProductFloor(updated);
        if (updated.inventoryQuantity <= floor) {
          breachedProducts.push({
            productId: updated.id,
            productTitle: updated.title,
            totalQty: updated.inventoryQuantity,
            floor,
            ceiling: getProductCeiling(updated),
          });
        }
      }
    }
  }

  try {
    await batch.commit();
    if (isAdminUser) {
      await appendSyncLogInFirestore({
        event: 'FIRESTORE_ORDER_CREATED',
        details: `Order ${orderNum} committed atomically with PII isolation & per-size stock deduction.`,
        status: 'success',
      });
      for (const bp of breachedProducts) {
        await checkAndEmitStockAlarmIfBreached(bp);
      }
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
    stockDeducted: isAdminUser,
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

    const mappedOrderStatus: OrderStatus =
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

// Shared order interfaces re-exported from ../types/store

function mapOrderDoc(
  docId: string,
  data: Record<string, unknown>
): CustomerOrderRecord {
  const rawCreatedAt = data.createdAt as { toMillis?: () => number } | undefined;
  const createdAtMillis =
    typeof rawCreatedAt?.toMillis === 'function' ? Number(rawCreatedAt.toMillis()) : 0;
  const shippingMethod: 'express' | 'standard' =
    data.shippingMethod === 'standard' ? 'standard' : 'express';
  const paymentMethod: 'card' | 'shopify_pay' | 'apple_pay' =
    data.paymentMethod === 'shopify_pay'
      ? 'shopify_pay'
      : data.paymentMethod === 'apple_pay'
      ? 'apple_pay'
      : 'card';
  const rawStatus = String(data.status || 'Confirmed');
  const status: OrderStatus =
    rawStatus === 'Preparing Shipment' ||
    rawStatus === 'Dispatched' ||
    rawStatus === 'Delivered'
      ? rawStatus
      : 'Confirmed';

  return {
    orderNumber: String(data.orderNumber || docId),
    userId: String(data.userId || ''),
    shopifyOrderRef: String(data.shopifyOrderRef || ''),
    date: String(data.date || ''),
    items: Array.isArray(data.items)
      ? data.items.map((it: Record<string, unknown>) => ({
          productId: String(it.productId || ''),
          title: String(it.title || 'Garment'),
          price: Number(it.price ?? 0),
          size: String(it.size || 'M'),
          color: String(it.color || ''),
          quantity: Number(it.quantity ?? 1),
        }))
      : [],
    shippingMethod,
    paymentMethod,
    discountCode: data.discountCode ? String(data.discountCode) : undefined,
    discountPercentage:
      typeof data.discountPercentage === 'number' ? data.discountPercentage : undefined,
    subtotal: Number(data.subtotal ?? 0),
    discountAmount: Number(data.discountAmount ?? 0),
    shippingAmount: Number(data.shippingAmount ?? 0),
    taxAmount: Number(data.taxAmount ?? 0),
    total: Number(data.total ?? 0),
    estimatedDelivery: String(data.estimatedDelivery || ''),
    status,
    dispatchCourier: data.dispatchCourier ? String(data.dispatchCourier) : undefined,
    trackingNumber: data.trackingNumber ? String(data.trackingNumber) : undefined,
    dispatchNotes: data.dispatchNotes ? String(data.dispatchNotes) : undefined,
    dispatchedAt: data.dispatchedAt ? String(data.dispatchedAt) : undefined,
    stockDeducted: typeof data.stockDeducted === 'boolean' ? data.stockDeducted : undefined,
    createdAtMillis,
  };
}

export function subscribeToCustomerOrders(
  uid: string,
  onData: (orders: CustomerOrderRecord[]) => void
): Unsubscribe {
  const path = 'orders';
  const q = query(collection(db, path), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const orders = snap.docs
        .map((d) => mapOrderDoc(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => b.createdAtMillis - a.createdAtMillis);
      onData(orders);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeToAllOrdersForAdmin(
  onData: (orders: CustomerOrderRecord[]) => void
): Unsubscribe {
  const path = 'orders';
  return onSnapshot(
    collection(db, path),
    (snap) => {
      const orders = snap.docs
        .map((d) => mapOrderDoc(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => b.createdAtMillis - a.createdAtMillis);
      onData(orders);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function dispatchOrderFromAdminInFirestore(params: {
  order: CustomerOrderRecord;
  nextStatus: OrderStatus;
  courier: string;
  trackingNumber: string;
  dispatchNotes?: string;
  deductStock: boolean;
  products: Product[];
}): Promise<void> {
  const { order, nextStatus, courier, trackingNumber, dispatchNotes, deductStock, products } =
    params;
  const cleanOrderNum = order.orderNumber.trim().toUpperCase();
  const path = `orders/${cleanOrderNum}`;

  const mappedShipmentStatus: ShipmentStatus =
    nextStatus === 'Confirmed'
      ? 'Ordered'
      : nextStatus === 'Preparing Shipment'
      ? 'Processing'
      : nextStatus === 'Dispatched'
      ? 'Shipped'
      : 'Delivered';

  const statusOrder: ShipmentStatus[] = ['Ordered', 'Processing', 'Shipped', 'Delivered'];
  const newIndex = statusOrder.indexOf(mappedShipmentStatus);

  const cleanCourier = clampStr(courier, 100, 'DHL Express Athlete Priority');
  const cleanTracking = clampStr(
    trackingNumber,
    64,
    `DHL-EXP-${Math.floor(100000000 + Math.random() * 900000000)}-INT`
  );
  const nowTimestamp = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  const nowIso = new Date().toISOString();

  try {
    const batch = writeBatch(db);
    const shouldDeductNow = Boolean(deductStock && !order.stockDeducted);

    const orderUpdatePayload: Record<string, unknown> = {
      status: nextStatus,
      dispatchCourier: cleanCourier,
      trackingNumber: cleanTracking,
      stockDeducted: Boolean(order.stockDeducted || shouldDeductNow),
      updatedAt: serverTimestamp(),
    };
    if (dispatchNotes && dispatchNotes.trim()) {
      orderUpdatePayload.dispatchNotes = clampStr(dispatchNotes, 300);
    }
    if (nextStatus === 'Dispatched' || nextStatus === 'Delivered') {
      orderUpdatePayload.dispatchedAt = order.dispatchedAt || nowIso.slice(0, 64);
    }
    batch.update(doc(db, 'orders', cleanOrderNum), orderUpdatePayload);

    const trackSnap = await getDoc(doc(db, 'tracking', cleanOrderNum));
    if (trackSnap.exists()) {
      const trackData = trackSnap.data();
      const existingCheckpoints = Array.isArray(trackData.checkpoints)
        ? (trackData.checkpoints as TrackingCheckpoint[])
        : [];

      const updatedCheckpoints: TrackingCheckpoint[] = existingCheckpoints.map((cp) => {
        const cpIdx = statusOrder.indexOf(cp.step);
        const isCompleted = cpIdx <= newIndex;
        const isActive = cpIdx === newIndex;
        let nextDescription = cp.description;
        if (cp.step === 'Shipped' && isCompleted && dispatchNotes?.trim()) {
          nextDescription = clampStr(
            `Dispatched via ${cleanCourier} (${cleanTracking}) — ${dispatchNotes.trim()}`,
            240
          );
        } else if (cp.step === 'Shipped' && isCompleted) {
          nextDescription = `Dispatched from Offside Hub via ${cleanCourier} (${cleanTracking})`;
        }

        return {
          ...cp,
          completed: isCompleted,
          active: isActive,
          description: nextDescription,
          timestamp:
            isCompleted &&
            (cp.timestamp.includes('Estimated') ||
              cp.timestamp.includes('Scheduled') ||
              cp.timestamp.includes('Pending'))
              ? nowTimestamp
              : cp.timestamp,
        };
      });

      if (updatedCheckpoints.length === 4) {
        batch.update(doc(db, 'tracking', cleanOrderNum), {
          currentStatus: mappedShipmentStatus,
          courier: cleanCourier,
          trackingNumber: cleanTracking,
          checkpoints: updatedCheckpoints,
          updatedAt: serverTimestamp(),
        });
      }
    }

    const breachedProducts: {
      productId: string;
      productTitle: string;
      totalQty: number;
      floor: number;
      ceiling: number;
    }[] = [];

    if (shouldDeductNow) {
      const prodMap = new Map<string, Product>();
      for (const p of products) prodMap.set(p.id, p);

      for (const item of order.items) {
        const prod = prodMap.get(item.productId);
        if (!prod) continue;
        const nextStockBySize = { ...getEffectiveStockMap(prod) };
        const sz = clampStr(item.size, 20);
        if (sz && (prod.sizes.includes(sz) || sz in nextStockBySize)) {
          nextStockBySize[sz] = Math.max(0, (nextStockBySize[sz] ?? 0) - item.quantity);
        }
        const nextTotal = getTotalFromStockMap(prod.sizes, nextStockBySize);

        batch.update(doc(db, 'products', prod.id), {
          stockBySize: nextStockBySize,
          inventoryQuantity: nextTotal,
          inStock: nextTotal > 0,
          updatedAt: serverTimestamp(),
        });

        prodMap.set(prod.id, {
          ...prod,
          stockBySize: nextStockBySize,
          inventoryQuantity: nextTotal,
          inStock: nextTotal > 0,
        });
      }

      for (const item of order.items) {
        const updated = prodMap.get(item.productId);
        if (updated) {
          const floor = getProductFloor(updated);
          if (updated.inventoryQuantity <= floor) {
            breachedProducts.push({
              productId: updated.id,
              productTitle: updated.title,
              totalQty: updated.inventoryQuantity,
              floor,
              ceiling: getProductCeiling(updated),
            });
          }
        }
      }
    }

    await batch.commit();

    await appendSyncLogInFirestore({
      event: `DISPATCH_${nextStatus.toUpperCase().replace(/\s+/g, '_')}`,
      details: `Order ${cleanOrderNum} updated to "${nextStatus}" via ${cleanCourier} (${cleanTracking})${
        shouldDeductNow ? ' with per-size stock deduction' : ''
      }.`,
      status: 'success',
    });

    for (const bp of breachedProducts) {
      await checkAndEmitStockAlarmIfBreached(bp);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function getOrderShippingDetailsFromFirestore(
  orderNumber: string
): Promise<OrderPrivateShippingInfo | null> {
  const cleanOrderNum = orderNumber.trim().toUpperCase();
  if (!/^[a-zA-Z0-9_-]{3,32}$/.test(cleanOrderNum)) return null;

  const path = `orders/${cleanOrderNum}/private/shipping`;
  try {
    const snap = await getDoc(doc(db, 'orders', cleanOrderNum, 'private', 'shipping'));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      email: String(d.email || ''),
      firstName: String(d.firstName || ''),
      lastName: String(d.lastName || ''),
      athleteId: d.athleteId ? String(d.athleteId) : undefined,
      clubOrTeam: d.clubOrTeam ? String(d.clubOrTeam) : undefined,
      address: String(d.address || ''),
      apartment: d.apartment ? String(d.apartment) : undefined,
      city: String(d.city || ''),
      postalCode: String(d.postalCode || ''),
      country: String(d.country || ''),
      phone: String(d.phone || ''),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}
