import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { auth, ADMIN_BOOTSTRAP_EMAIL } from './lib/firebase';
import {
  GarmentSize,
  OrderStatus,
  Product,
  CartItem,
  ShopifyConfig,
  StockAlarm,
  StockAlarmType,
  SyncLogEntry,
  CheckoutCustomerInfo,
  ConfirmedOrder,
  SessionAccount,
  CustomerOrderRecord,
} from './types/store';
import {
  DEFAULT_SHOPIFY_CONFIG,
  INITIAL_SYNC_LOGS,
  syncCatalogFromShopify,
  getShopifyConfig,
} from './services/shopify';
import {
  FirestorePromotion,
  INITIAL_PROMOTIONS,
  checkIsUserAdmin,
  subscribeToProducts,
  subscribeToPromotions,
  seedDatabaseIfEmptyAsAdmin,
  createProductInFirestore,
  updateProductStockInFirestore,
  updateProductVariantsAndStockInFirestore,
  batchRestockLowItemsInFirestore,
  applyFlashPriceSyncInFirestore,
  deleteProductInFirestore,
  subscribeToStockAlarms,
  sendStockAlarmInFirestore,
  acknowledgeStockAlarmInFirestore,
  deleteStockAlarmInFirestore,
  subscribeToAllOrdersForAdmin,
  dispatchOrderFromAdminInFirestore,
  subscribeToShopifyIntegration,
  saveShopifyConfigInFirestore,
  subscribeToSyncLogs,
  appendSyncLogInFirestore,
  createOrderInFirestore,
} from './services/firestore';
import {
  PublicStoreOverlay,
  acknowledgeAlarmOnServerApi,
  appendSyncLogOnServerApi,
  createOrderOnServerApi,
  createProductOnServerApi,
  deleteAlarmOnServerApi,
  deleteProductOnServerApi,
  dispatchOrderOnServerApi,
  fetchOperationsSnapshot,
  fetchPublicStoreOverlay,
  logoutSession,
  saveShopifyConfigOnServerApi,
  sendStockAlarmOnServerApi,
  updateProductVariantsOnServerApi,
} from './services/authApi';
import { getProductFloor, getProductSizeStock, getTotalFromStockMap } from './utils/inventory';
import { hasAnyOpsPermission, hasOpsPermission } from './utils/permissions';
import { INITIAL_PRODUCTS } from './data/products';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { PromotionsSlider } from './components/PromotionsSlider';
import { ProductGrid } from './components/ProductGrid';
import { ProductDetailModal } from './components/ProductDetailModal';
import { CartDrawer } from './components/CartDrawer';
import { CustomCheckoutModal } from './components/CustomCheckoutModal';
import { AuthModal } from './components/AuthModal';
import { AdminPanelModal } from './components/AdminPanelModal';
import { FabricTechnologySection } from './components/FabricTechnologySection';
import { AthleteFitGuideModal } from './components/AthleteFitGuideModal';
import { OrderTrackerModal } from './components/OrderTrackerModal';
import { CustomerProfileOrdersModal } from './components/CustomerProfileOrdersModal';
import { Footer } from './components/Footer';
import { Flame, Truck, LogIn, Zap, User as UserIcon } from 'lucide-react';

const CART_STORAGE_KEY = 'offside_apparel_cart';
const DISCOUNT_CODE_KEY = 'offside_discount_code';

export default function App() {
  const [baseProducts, setBaseProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [storeOverlay, setStoreOverlay] = useState<PublicStoreOverlay>({
    createdProducts: [],
    productPatches: {},
    deletedProductIds: [],
  });

  const [promotions, setPromotions] = useState<FirestorePromotion[]>(INITIAL_PROMOTIONS);
  const [shopifyConfig, setShopifyConfig] = useState<ShopifyConfig>(DEFAULT_SHOPIFY_CONFIG);
  const [serverShopifyConfig, setServerShopifyConfig] = useState<ShopifyConfig | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>(INITIAL_SYNC_LOGS);
  const [serverSyncLogs, setServerSyncLogs] = useState<SyncLogEntry[]>([]);
  const [firestoreAdminOrders, setFirestoreAdminOrders] = useState<CustomerOrderRecord[]>([]);
  const [serverAdminOrders, setServerAdminOrders] = useState<CustomerOrderRecord[]>([]);
  const [firestoreAlarms, setFirestoreAlarms] = useState<StockAlarm[]>([]);
  const [serverAlarms, setServerAlarms] = useState<StockAlarm[]>([]);

  // Firebase Auth & Custom Session Auth (token held strictly in React memory)
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isFirebaseAdmin, setIsFirebaseAdmin] = useState<boolean>(false);
  const [sessionAccount, setSessionAccount] = useState<SessionAccount | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const isCustomOpsUser = Boolean(
    sessionAccount && hasAnyOpsPermission(sessionAccount, false)
  );
  const canAccessOperations = isFirebaseAdmin || isCustomOpsUser;
  const canPersistTrackingDispatch = hasOpsPermission(
    sessionAccount,
    isFirebaseAdmin,
    'execute_order_dispatch'
  );

  // Cart State
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Discount Code State
  const [discountCode, setDiscountCode] = useState<string>(() => {
    return localStorage.getItem(DISCOUNT_CODE_KEY) || '';
  });
  const [discountPercentage, setDiscountPercentage] = useState<number>(() => {
    const code = (localStorage.getItem(DISCOUNT_CODE_KEY) || '').toUpperCase();
    if (code === 'OLYMPIC20') return 20;
    if (code === 'SQUADPRO') return 25;
    if (['PRO15', 'OLYMPIC', 'ATHLETE2026', 'PROATHLETE15'].includes(code)) return 15;
    return 0;
  });

  // Modals & Drawers
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isFitGuideOpen, setIsFitGuideOpen] = useState(false);
  const [isOrderTrackerOpen, setIsOrderTrackerOpen] = useState(false);
  const [isOrderHistoryOpen, setIsOrderHistoryOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'signup'>('login');
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [trackingOrderNumber, setTrackingOrderNumber] = useState('OF-849102');
  const [catalogSearchQuery, setCatalogSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Merge Firestore/initial catalog with persistent server overlay
  const products = useMemo<Product[]>(() => {
    const deletedSet = new Set(storeOverlay.deletedProductIds);
    const mergedBase = baseProducts
      .filter((p) => !deletedSet.has(p.id))
      .map((p) => {
        const patch = storeOverlay.productPatches[p.id];
        if (!patch) return p;
        const sizes = patch.sizes ?? p.sizes;
        const stockBySize = patch.stockBySize ?? p.stockBySize;
        const totalQty = stockBySize
          ? getTotalFromStockMap(sizes, stockBySize)
          : p.inventoryQuantity;
        return {
          ...p,
          ...patch,
          sizes,
          stockBySize,
          inventoryQuantity: totalQty,
          inStock: totalQty > 0,
        };
      });

    const createdVisible = storeOverlay.createdProducts.filter((p) => !deletedSet.has(p.id));
    return [...createdVisible, ...mergedBase];
  }, [baseProducts, storeOverlay]);

  const combinedOrders = useMemo<CustomerOrderRecord[]>(() => {
    const map = new Map<string, CustomerOrderRecord>();
    for (const o of firestoreAdminOrders) map.set(o.orderNumber, { ...o, source: 'firestore' });
    for (const o of serverAdminOrders) map.set(o.orderNumber, { ...o, source: 'server' });
    return Array.from(map.values()).sort((a, b) => b.createdAtMillis - a.createdAtMillis);
  }, [firestoreAdminOrders, serverAdminOrders]);

  const combinedAlarms = useMemo<StockAlarm[]>(() => {
    const map = new Map<string, StockAlarm>();
    for (const a of firestoreAlarms) map.set(a.id, a);
    for (const a of serverAlarms) map.set(a.id, a);
    return Array.from(map.values()).sort((a, b) => b.createdAtMillis - a.createdAtMillis);
  }, [firestoreAlarms, serverAlarms]);

  const activeShopifyConfig = serverShopifyConfig || shopifyConfig;
  const activeSyncLogs = useMemo(() => {
    const list = [...serverSyncLogs, ...syncLogs];
    return list.length > 0 ? list.slice(0, 40) : INITIAL_SYNC_LOGS;
  }, [serverSyncLogs, syncLogs]);

  // Persist cart to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch (e) {
      console.warn('Failed to save cart', e);
    }
  }, [cart]);

  // Fetch public catalog overlay from Express server
  useEffect(() => {
    fetchPublicStoreOverlay()
      .then((overlay) => setStoreOverlay(overlay))
      .catch((err) => console.warn('Could not load store overlay:', err));
  }, []);

  // Refresh server operations snapshot for Superuser / Staff
  const refreshServerOperations = useCallback(async (token: string) => {
    try {
      const snap = await fetchOperationsSnapshot(token);
      setServerAdminOrders(snap.orders || []);
      setServerAlarms(snap.stockAlarms || []);
      if (snap.shopifyConfig) setServerShopifyConfig(snap.shopifyConfig);
      setServerSyncLogs(snap.syncLogs || []);
    } catch (err) {
      console.warn('Operations snapshot refresh failed:', err);
    }
  }, []);

  useEffect(() => {
    if (!isCustomOpsUser || !authToken) {
      setServerAdminOrders([]);
      setServerAlarms([]);
      setServerShopifyConfig(null);
      setServerSyncLogs([]);
      return;
    }
    refreshServerOperations(authToken);
  }, [isCustomOpsUser, authToken, refreshServerOperations]);

  // Listen to Firebase Auth state and seed Firestore if Admin signs in
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const isAdmin = await checkIsUserAdmin(user);
          setIsFirebaseAdmin(isAdmin);
          if (isAdmin) {
            await seedDatabaseIfEmptyAsAdmin();
          }
        } catch (err) {
          console.error('Admin verification check error:', err);
          setIsFirebaseAdmin(false);
        }
      } else {
        setIsFirebaseAdmin(false);
      }
    });
    return () => unsubAuth();
  }, []);

  // Subscribe to public Storefront Products and Promotions collections in Firestore
  useEffect(() => {
    const unsubProducts = subscribeToProducts((dbProducts) => {
      setBaseProducts(dbProducts);
    });
    const unsubPromos = subscribeToPromotions((dbPromos) => {
      setPromotions(dbPromos);
    });
    return () => {
      unsubProducts();
      unsubPromos();
    };
  }, []);

  // Subscribe to Firestore Admin-only streams when Firebase Admin is signed in
  useEffect(() => {
    if (!isFirebaseAdmin) {
      setShopifyConfig(DEFAULT_SHOPIFY_CONFIG);
      setSyncLogs(INITIAL_SYNC_LOGS);
      setFirestoreAdminOrders([]);
      setFirestoreAlarms([]);
      return;
    }

    const unsubIntegration = subscribeToShopifyIntegration((cfg) => {
      setShopifyConfig(cfg);
    });
    const unsubLogs = subscribeToSyncLogs((logs) => {
      if (logs.length > 0) setSyncLogs(logs);
    });
    const unsubAlarms = subscribeToStockAlarms((alarms) => {
      setFirestoreAlarms(alarms);
    });
    const unsubOrders = subscribeToAllOrdersForAdmin((ordersList) => {
      setFirestoreAdminOrders(ordersList);
    });

    return () => {
      unsubIntegration();
      unsubLogs();
      unsubAlarms();
      unsubOrders();
    };
  }, [isFirebaseAdmin]);

  // Toast notification helper
  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const handleOpenLogin = (mode: 'login' | 'signup' = 'login') => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  };

  const handleCustomAuthSuccess = (user: SessionAccount, token: string) => {
    setSessionAccount(user);
    setAuthToken(token);
    setIsAuthModalOpen(false);
    if (user.role === 'superuser' || user.role === 'staff') {
      if (hasAnyOpsPermission(user, isFirebaseAdmin)) {
        setIsAdminPanelOpen(true);
        showToast(
          `Signed in as ${user.role.toUpperCase()} (@${user.username}) · ${
            user.rightsProfileName || 'Operations'
          }`
        );
      } else {
        showToast(`Signed in as @${user.username} — No operational rights assigned yet.`);
      }
    } else {
      showToast(`Welcome, ${user.fullName} (@${user.username})`);
    }
  };

  const handleLogoutAll = async () => {
    if (authToken) {
      try {
        await logoutSession(authToken);
      } catch {
        // Ignore network errors on logout
      }
    }
    try {
      if (auth.currentUser) {
        await signOut(auth);
      }
    } catch (err) {
      console.error('Sign out error:', err);
    }
    setAuthToken(null);
    setSessionAccount(null);
    setIsFirebaseAdmin(false);
    setIsAdminPanelOpen(false);
    showToast('Signed out of account');
  };

  // Add item to cart
  const handleAddToCart = (product: Product, size: string, color: string, quantity: number) => {
    setCart((prev) => {
      const existingIdx = prev.findIndex(
        (item) => item.productId === product.id && item.size === size && item.color === color
      );
      if (existingIdx > -1) {
        const next = [...prev];
        next[existingIdx].quantity += quantity;
        return next;
      } else {
        const newItem: CartItem = {
          id: `cart-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          productId: product.id,
          title: product.title,
          price: product.price,
          size,
          color,
          quantity,
          image: product.image,
        };
        return [...prev, newItem];
      }
    });

    showToast(`Added ${quantity}x ${product.title} (Size ${size}) to Bag`);
  };

  const handleQuickAdd = (product: Product) => {
    const firstAvailableSize =
      product.sizes.find((sz) => getProductSizeStock(product, sz) > 0) || product.sizes[0] || 'M';
    if (getProductSizeStock(product, firstAvailableSize) <= 0) {
      setSelectedProduct(product);
      return;
    }
    handleAddToCart(product, firstAvailableSize, product.colors[0]?.name || 'Pitch Carbon', 1);
    setIsCartOpen(true);
  };

  const handleUpdateQuantity = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const handleRemoveItem = (id: string) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  const handleApplyDiscount = (code: string): { success: boolean; message: string } => {
    const cleanCode = code.trim().toUpperCase();
    if (cleanCode === 'OLYMPIC20') {
      setDiscountCode(cleanCode);
      setDiscountPercentage(20);
      localStorage.setItem(DISCOUNT_CODE_KEY, cleanCode);
      showToast('Special Applied: 20% Off AeroCarbon Series');
      return { success: true, message: '20% Olympic Series Privilege Applied' };
    }
    if (cleanCode === 'SQUADPRO') {
      setDiscountCode(cleanCode);
      setDiscountPercentage(25);
      localStorage.setItem(DISCOUNT_CODE_KEY, cleanCode);
      showToast('Special Applied: 25% Squad Bundle Privilege');
      return { success: true, message: '25% Squad Bundle Privilege Applied' };
    }
    if (['PRO15', 'OLYMPIC', 'ATHLETE2026', 'PROATHLETE15'].includes(cleanCode)) {
      setDiscountCode(cleanCode);
      setDiscountPercentage(15);
      localStorage.setItem(DISCOUNT_CODE_KEY, cleanCode);
      showToast('15% Pro Athlete Privilege applied');
      return { success: true, message: '15% Pro Athlete Privilege Applied' };
    }
    return { success: false, message: 'Invalid code. Use "OLYMPIC20" or "PRO15".' };
  };

  // Operations Actions (Server API for Superuser/Staff + Firestore when Google Admin active)
  const handleBatchRestock = async (incrementAmount: number = 20) => {
    let count = 0;
    if (isCustomOpsUser && authToken) {
      const belowFloor = products.filter((p) => p.inventoryQuantity <= getProductFloor(p));
      for (const p of belowFloor) {
        const nextMap: Partial<Record<GarmentSize, number>> = { ...(p.stockBySize || {}) };
        const perSize = Math.max(1, Math.floor(incrementAmount / p.sizes.length));
        let extra = incrementAmount % p.sizes.length;
        for (const sz of p.sizes) {
          const add = perSize + (extra > 0 ? 1 : 0);
          if (extra > 0) extra -= 1;
          nextMap[sz] = Math.min(100000, (nextMap[sz] ?? 0) + add);
        }
        const res = await updateProductVariantsOnServerApi(authToken, p.id, p, {
          stockBySize: nextMap,
        });
        setStoreOverlay(res.overlay);
        count += 1;
      }
      await refreshServerOperations(authToken);
    }
    if (isFirebaseAdmin) {
      const fsCount = await batchRestockLowItemsInFirestore(products, incrementAmount);
      count = Math.max(count, fsCount);
    }
    showToast(
      count > 0
        ? `Batch restocked ${count} below-floor SKUs (+${incrementAmount} units)`
        : 'All SKUs are above stock floor thresholds'
    );
  };

  const handleCreateProduct = async (
    newProductData: Omit<Product, 'id' | 'shopifyId' | 'handle'>
  ) => {
    if (isCustomOpsUser && authToken) {
      const res = await createProductOnServerApi(authToken, newProductData);
      setStoreOverlay(res.overlay);
      await refreshServerOperations(authToken);
    }
    if (isFirebaseAdmin) {
      await createProductInFirestore(newProductData);
    }
    showToast(`Created & published "${newProductData.title}"`);
  };

  const handleUpdateProductVariantsAndStock = async (
    product: Product,
    updates: {
      sizes?: GarmentSize[];
      colors?: { name: string; hex: string }[];
      stockBySize?: Partial<Record<GarmentSize, number>>;
      stockFloor?: number;
      stockCeiling?: number;
    }
  ) => {
    if (isCustomOpsUser && authToken) {
      const res = await updateProductVariantsOnServerApi(authToken, product.id, product, updates);
      setStoreOverlay(res.overlay);
      await refreshServerOperations(authToken);
    }
    if (isFirebaseAdmin && !product.id.startsWith('offside-srv-')) {
      await updateProductVariantsAndStockInFirestore(product, updates);
    }
    showToast(`Saved variants & per-size stock for "${product.title}"`);
  };

  const handleSendStockAlarm = async (params: {
    productId: string;
    productTitle: string;
    alarmType: StockAlarmType;
    triggerScope: 'total' | 'size';
    size?: GarmentSize;
    currentQuantity: number;
    threshold: number;
    recipientEmail: string;
    message: string;
  }) => {
    if (isCustomOpsUser && authToken) {
      await sendStockAlarmOnServerApi(authToken, params);
      await refreshServerOperations(authToken);
    }
    if (isFirebaseAdmin) {
      await sendStockAlarmInFirestore(params);
    }
    showToast(`Stock alarm dispatched to ${params.recipientEmail}`);
  };

  const handleAcknowledgeAlarm = async (alarmId: string) => {
    if (isCustomOpsUser && authToken) {
      await acknowledgeAlarmOnServerApi(authToken, alarmId);
      await refreshServerOperations(authToken);
    }
    if (isFirebaseAdmin) {
      await acknowledgeStockAlarmInFirestore(alarmId);
    }
    showToast('Stock alarm acknowledged');
  };

  const handleDeleteAlarm = async (alarmId: string) => {
    if (isCustomOpsUser && authToken) {
      await deleteAlarmOnServerApi(authToken, alarmId);
      await refreshServerOperations(authToken);
    }
    if (isFirebaseAdmin) {
      await deleteStockAlarmInFirestore(alarmId);
    }
    showToast('Stock alarm dismissed');
  };

  const handleDispatchOrder = async (params: {
    order: CustomerOrderRecord;
    nextStatus: OrderStatus;
    courier: string;
    trackingNumber: string;
    dispatchNotes?: string;
    deductStock: boolean;
  }) => {
    if (params.order.source === 'server' || (isCustomOpsUser && authToken)) {
      if (authToken && params.order.source === 'server') {
        await dispatchOrderOnServerApi(authToken, {
          orderNumber: params.order.orderNumber,
          nextStatus: params.nextStatus,
          courier: params.courier,
          trackingNumber: params.trackingNumber,
          dispatchNotes: params.dispatchNotes,
          deductStock: params.deductStock,
          products,
        });
        await refreshServerOperations(authToken);
      }
    }
    if (isFirebaseAdmin && params.order.source !== 'server') {
      await dispatchOrderFromAdminInFirestore({
        ...params,
        products,
      });
    }
    showToast(`Order #${params.order.orderNumber} updated to "${params.nextStatus}"`);
  };

  const handleDeleteProduct = async (productId: string) => {
    const prod = products.find((p) => p.id === productId);
    if (isCustomOpsUser && authToken) {
      const res = await deleteProductOnServerApi(authToken, productId);
      setStoreOverlay(res.overlay);
      await refreshServerOperations(authToken);
    }
    if (isFirebaseAdmin && !productId.startsWith('offside-srv-')) {
      await deleteProductInFirestore(productId, prod?.title);
    }
    showToast('Product removed from catalog');
  };

  const handleTriggerSync = async () => {
    try {
      const res = await syncCatalogFromShopify(activeShopifyConfig);
      const updatedCfg: ShopifyConfig = {
        ...getShopifyConfig(),
        syncStatus: 'synced',
        lastSyncedAt: new Date().toISOString(),
        itemsCount: products.length,
      };
      if (isCustomOpsUser && authToken) {
        await saveShopifyConfigOnServerApi(authToken, updatedCfg);
        await appendSyncLogOnServerApi(
          authToken,
          'SHOPIFY_CATALOG_SYNC',
          `Synchronized endpoint (${activeShopifyConfig.storeDomain}) with ${products.length} SKUs.`,
          'success'
        );
        await refreshServerOperations(authToken);
      }
      if (isFirebaseAdmin) {
        await saveShopifyConfigInFirestore(updatedCfg);
        await appendSyncLogInFirestore({
          event: 'SHOPIFY_FIRESTORE_SYNC',
          details: `Synchronized Shopify endpoint (${shopifyConfig.storeDomain}) with ${products.length} Firestore SKUs.`,
          status: 'success',
        });
      }
      setShopifyConfig(updatedCfg);
      showToast(`Storefront catalog synchronized (${res.products.length} SKUs)`);
    } catch (e) {
      console.error(e);
      showToast('Synchronization completed');
    }
  };

  const handleTriggerWebhook = async (
    type: 'inventory_reduced' | 'price_sync' | 'new_product',
    productId?: string
  ) => {
    const target = products.find((p) => p.id === productId) || products[0];
    if (!target) return;

    if (type === 'inventory_reduced') {
      const nextQty = Math.max(0, target.inventoryQuantity - 1);
      if (isCustomOpsUser && authToken) {
        const firstSz = target.sizes[0] || 'M';
        const nextMap = { ...(target.stockBySize || {}) };
        nextMap[firstSz] = Math.max(0, (nextMap[firstSz] ?? 1) - 1);
        const res = await updateProductVariantsOnServerApi(authToken, target.id, target, {
          stockBySize: nextMap,
        });
        setStoreOverlay(res.overlay);
        await appendSyncLogOnServerApi(
          authToken,
          'WEBHOOK: inventory_levels/connect',
          `Shopify webhook decremented ${target.title} size ${firstSz}.`,
          'info'
        );
        await refreshServerOperations(authToken);
      }
      if (isFirebaseAdmin && !target.id.startsWith('offside-srv-')) {
        await updateProductStockInFirestore(target.id, nextQty, target);
        await appendSyncLogInFirestore({
          event: 'WEBHOOK: inventory_levels/connect',
          details: `Shopify webhook decremented ${target.title} to ${nextQty} units.`,
          status: 'info',
        });
      }
    } else if (type === 'price_sync') {
      const newPrice = Math.max(1, Math.round(target.price * 0.95));
      if (isCustomOpsUser && authToken) {
        const res = await updateProductVariantsOnServerApi(authToken, target.id, target, {
          price: newPrice,
          compareAtPrice: target.price,
        });
        setStoreOverlay(res.overlay);
        await appendSyncLogOnServerApi(
          authToken,
          'WEBHOOK: products/update',
          `Flash pricing sync applied to ${target.title} ($${newPrice}).`,
          'success'
        );
        await refreshServerOperations(authToken);
      }
      if (isFirebaseAdmin && !target.id.startsWith('offside-srv-')) {
        await applyFlashPriceSyncInFirestore(target.id, target.price);
      }
    }
    showToast(`Webhook event executed: ${type}`);
  };

  // Process custom checkout (Server API for username/password accounts, Firestore for Google accounts)
  const handleProcessOrder = async (customer: CheckoutCustomerInfo): Promise<ConfirmedOrder> => {
    if (sessionAccount && authToken) {
      const res = await createOrderOnServerApi(authToken, {
        items: cart,
        customer,
        discountPercentage,
        currentProducts: products,
      });
      setStoreOverlay(res.overlay);
      if (isCustomOpsUser) {
        await refreshServerOperations(authToken);
      }
      return res.order;
    }
    return await createOrderInFirestore(cart, customer, discountPercentage, products);
  };

  const totalCartItems = cart.reduce((acc, i) => acc + i.quantity, 0);

  const scrollToPromotions = () => {
    const el = document.getElementById('promotions-slider');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToCollection = () => {
    const el = document.getElementById('collection');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#0b0c0e] text-[#e5e7eb] flex flex-col font-sans selection:bg-[#ccff00] selection:text-black">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#161a22] border border-[#ccff00] text-white px-4 py-3 shadow-2xl flex items-center gap-3 text-xs font-mono animate-in fade-in slide-in-from-bottom-3 duration-200">
          <Zap className="w-4 h-4 text-[#ccff00] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Slim Dismissible Top Notification Bar (No public Admin Portal button) */}
      {!bannerDismissed && (
        <div className="bg-[#12151b] border-b border-[#1f242e] px-4 py-2 text-xs flex items-center justify-between text-slate-300">
          <div className="max-w-7xl mx-auto flex items-center justify-center gap-3 w-full">
            <span className="hidden sm:inline text-[#ccff00] font-mono text-[11px] font-semibold">
              COMPETITION SPECIAL
            </span>
            <span className="hidden sm:inline text-slate-700">·</span>
            <span className="text-white font-medium">
              Use code <span className="font-mono text-[#ccff00] font-bold">OLYMPIC20</span> for 20% off Race Tops
            </span>
            <span className="hidden md:inline text-slate-700">·</span>
            <button
              onClick={scrollToPromotions}
              className="text-xs text-slate-300 hover:text-[#ccff00] font-mono inline-flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Flame className="w-3.5 h-3.5 text-[#ccff00]" />
              <span>View All Specials</span>
            </button>
            <span className="hidden md:inline text-slate-700">·</span>
            <button
              onClick={() => setIsOrderTrackerOpen(true)}
              className="text-xs text-slate-300 hover:text-white font-mono inline-flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Truck className="w-3 h-3 text-slate-400" />
              <span>Track Shipment</span>
            </button>
            <span className="hidden md:inline text-slate-700">·</span>
            <button
              onClick={() => setIsOrderHistoryOpen(true)}
              className="text-xs text-slate-300 hover:text-white font-mono inline-flex items-center gap-1 transition-colors cursor-pointer"
            >
              <UserIcon className="w-3 h-3 text-[#ccff00]" />
              <span>Order History</span>
            </button>
            {!sessionAccount && !currentUser && (
              <>
                <span className="hidden md:inline text-slate-700">·</span>
                <button
                  onClick={() => handleOpenLogin('login')}
                  className="text-xs text-slate-300 hover:text-white font-mono inline-flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <LogIn className="w-3 h-3 text-[#ccff00]" />
                  <span>Login / Sign Up</span>
                </button>
              </>
            )}
          </div>
          <button
            onClick={() => setBannerDismissed(true)}
            aria-label="Dismiss banner"
            className="text-slate-500 hover:text-white text-xs px-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Navigation */}
      <Navbar
        cartCount={totalCartItems}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenLogin={handleOpenLogin}
        onOpenOperations={() => {
          if (canAccessOperations) setIsAdminPanelOpen(true);
        }}
        onLogoutAll={handleLogoutAll}
        onOpenFitGuide={() => setIsFitGuideOpen(true)}
        onOpenOrderTracker={() => setIsOrderTrackerOpen(true)}
        onOpenOrderHistory={() => setIsOrderHistoryOpen(true)}
        onOpenSpecials={scrollToPromotions}
        canAccessOperations={canAccessOperations}
        sessionAccount={sessionAccount}
        currentUser={currentUser}
        searchQuery={catalogSearchQuery}
        onSearchChange={setCatalogSearchQuery}
        onSearchSubmit={scrollToCollection}
      />

      {/* Main Content */}
      <main className="flex-1">
        <Hero
          onExploreClick={scrollToCollection}
          onViewSpecials={scrollToPromotions}
        />

        <PromotionsSlider
          promotions={promotions}
          onApplyPromoCode={handleApplyDiscount}
          onExploreCategory={() => scrollToCollection()}
        />

        <ProductGrid
          products={products}
          onSelectProduct={(product) => setSelectedProduct(product)}
          onQuickAdd={handleQuickAdd}
          searchQuery={catalogSearchQuery}
          onClearSearch={() => setCatalogSearchQuery('')}
        />

        <FabricTechnologySection />

        <section id="disciplines" className="bg-[#0b0c0e] py-16 px-6 border-b border-[#1b1f28]">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
              <div>
                <span className="text-xs uppercase tracking-widest text-[#ccff00] font-mono block mb-1">
                  Discipline Specific Optimization
                </span>
                <h3 className="text-2xl sm:text-3xl font-bold uppercase text-white tracking-tight">
                  Calibrated for Competition Formats
                </h3>
              </div>
              <p className="text-xs text-slate-400 max-w-md">
                Every discipline imposes unique biomechanical demands. Offside apparel targets specific muscle oscillation and thermal patterns.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 bg-[#0f1218] border border-[#1e232e]">
                <span className="text-xs font-mono text-[#ccff00] uppercase block mb-1">01. Track & Field</span>
                <h4 className="text-base font-bold text-white uppercase mb-2">Sprint Velocity</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Sub-90g tops with zero flutter at velocities exceeding 35 km/h. Bonded hems eradicate collar friction.
                </p>
              </div>

              <div className="p-5 bg-[#0f1218] border border-[#1e232e]">
                <span className="text-xs font-mono text-[#ccff00] uppercase block mb-1">02. Pitch & Field</span>
                <h4 className="text-base font-bold text-white uppercase mb-2">Multi-Directional</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  High-tension kinetic shorts stabilizing groin, hip flexors, and hamstrings through aggressive cutting maneuvers.
                </p>
              </div>

              <div className="p-5 bg-[#0f1218] border border-[#1e232e]">
                <span className="text-xs font-mono text-[#ccff00] uppercase block mb-1">03. Endurance</span>
                <h4 className="text-base font-bold text-white uppercase mb-2">Thermal Equilibrium</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Australian 17.5µ Merino-Poly blends offering natural homeostasis over 2+ hour high-output marathon efforts.
                </p>
              </div>

              <div className="p-5 bg-[#0f1218] border border-[#1e232e]">
                <span className="text-xs font-mono text-[#ccff00] uppercase block mb-1">04. Post-Match</span>
                <h4 className="text-base font-bold text-white uppercase mb-2">Recovery & Transit</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  High-gauge architectural knits tailored for team flights, press conferences, and accelerated venous return.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Modals & Slide-Overs */}
      <ProductDetailModal
        product={
          selectedProduct
            ? products.find((p) => p.id === selectedProduct.id) || selectedProduct
            : null
        }
        onClose={() => setSelectedProduct(null)}
        onAddToCart={handleAddToCart}
        onOpenFitGuide={() => {
          setSelectedProduct(null);
          setIsFitGuideOpen(true);
        }}
      />

      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cart}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onCheckout={() => {
          setIsCartOpen(false);
          setIsCheckoutOpen(true);
        }}
        discountCode={discountCode}
        discountPercentage={discountPercentage}
        onApplyDiscount={handleApplyDiscount}
      />

      <CustomCheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        items={cart}
        discountCode={discountCode}
        discountPercentage={discountPercentage}
        currentUser={currentUser}
        sessionAccount={sessionAccount}
        onOpenLoginModal={(mode = 'login') => handleOpenLogin(mode)}
        onProcessOrder={handleProcessOrder}
        onOrderSuccess={() => {
          setCart([]);
        }}
        onTrackOrder={(orderNum) => {
          setTrackingOrderNumber(orderNum);
          setIsOrderTrackerOpen(true);
        }}
      />

      <AthleteFitGuideModal
        isOpen={isFitGuideOpen}
        onClose={() => setIsFitGuideOpen(false)}
      />

      <OrderTrackerModal
        isOpen={isOrderTrackerOpen}
        onClose={() => setIsOrderTrackerOpen(false)}
        initialOrderNumber={trackingOrderNumber}
        currentUser={currentUser}
        sessionAccount={sessionAccount}
        authToken={authToken}
        isAdmin={canPersistTrackingDispatch}
      />

      {/* Unified Login / Customer Sign Up / First-Run Superuser Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        initialMode={authModalMode}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={handleCustomAuthSuccess}
        onGoogleLoginSuccess={(user) => {
          showToast(`Signed in with Google (${user.email})`);
        }}
      />

      {/* Operations Console (Accessible after Superuser, Staff, or Admin sign-in) */}
      <AdminPanelModal
        isOpen={isAdminPanelOpen && canAccessOperations}
        onClose={() => setIsAdminPanelOpen(false)}
        onLogout={handleLogoutAll}
        adminEmail={sessionAccount?.email || currentUser?.email || ADMIN_BOOTSTRAP_EMAIL}
        sessionAccount={sessionAccount}
        isFirebaseAdmin={isFirebaseAdmin}
        authToken={authToken}
        products={products}
        orders={combinedOrders}
        stockAlarms={combinedAlarms}
        shopifyConfig={activeShopifyConfig}
        syncLogs={activeSyncLogs}
        onBatchRestock={handleBatchRestock}
        onCreateProduct={handleCreateProduct}
        onUpdateProductVariantsAndStock={handleUpdateProductVariantsAndStock}
        onDeleteProduct={handleDeleteProduct}
        onSendStockAlarm={handleSendStockAlarm}
        onAcknowledgeAlarm={handleAcknowledgeAlarm}
        onDeleteAlarm={handleDeleteAlarm}
        onDispatchOrder={handleDispatchOrder}
        onTriggerSync={handleTriggerSync}
        onSaveShopifyConfig={async (cfg) => {
          setShopifyConfig(cfg);
          if (isCustomOpsUser && authToken) {
            await saveShopifyConfigOnServerApi(authToken, cfg);
            await refreshServerOperations(authToken);
          }
          if (isFirebaseAdmin) {
            await saveShopifyConfigInFirestore(cfg);
          }
          showToast('Integration configuration saved');
        }}
        onTriggerWebhook={handleTriggerWebhook}
      />

      <CustomerProfileOrdersModal
        isOpen={isOrderHistoryOpen}
        onClose={() => setIsOrderHistoryOpen(false)}
        currentUser={currentUser}
        sessionAccount={sessionAccount}
        authToken={authToken}
        onOpenLoginModal={(mode = 'login') => handleOpenLogin(mode)}
        onLogoutAll={handleLogoutAll}
        onTrackOrder={(orderNum) => {
          setTrackingOrderNumber(orderNum);
          setIsOrderTrackerOpen(true);
        }}
        onExploreCollection={scrollToCollection}
      />

      <Footer
        onOpenLogin={() => handleOpenLogin('login')}
        onOpenOrderTracker={() => setIsOrderTrackerOpen(true)}
        onOpenOrderHistory={() => setIsOrderHistoryOpen(true)}
        onOpenSpecials={scrollToPromotions}
      />
    </div>
  );
}
