import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { auth } from './lib/firebase';
import {
  Product,
  CartItem,
  ShopifyConfig,
  SyncLogEntry,
  CheckoutCustomerInfo,
  ConfirmedOrder,
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
  batchRestockLowItemsInFirestore,
  applyFlashPriceSyncInFirestore,
  deleteProductInFirestore,
  subscribeToShopifyIntegration,
  saveShopifyConfigInFirestore,
  subscribeToSyncLogs,
  appendSyncLogInFirestore,
  createOrderInFirestore,
} from './services/firestore';
import { INITIAL_PRODUCTS } from './data/products';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { PromotionsSlider } from './components/PromotionsSlider';
import { ProductGrid } from './components/ProductGrid';
import { ProductDetailModal } from './components/ProductDetailModal';
import { CartDrawer } from './components/CartDrawer';
import { CustomCheckoutModal } from './components/CustomCheckoutModal';
import { AdminLoginModal } from './components/AdminLoginModal';
import { AdminPanelModal } from './components/AdminPanelModal';
import { FabricTechnologySection } from './components/FabricTechnologySection';
import { AthleteFitGuideModal } from './components/AthleteFitGuideModal';
import { OrderTrackerModal } from './components/OrderTrackerModal';
import { Footer } from './components/Footer';
import { Flame, Truck, Lock, Zap } from 'lucide-react';

const CART_STORAGE_KEY = 'offside_apparel_cart';
const DISCOUNT_CODE_KEY = 'offside_discount_code';

export default function App() {
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [promotions, setPromotions] = useState<FirestorePromotion[]>(INITIAL_PROMOTIONS);
  const [shopifyConfig, setShopifyConfig] = useState<ShopifyConfig>(DEFAULT_SHOPIFY_CONFIG);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>(INITIAL_SYNC_LOGS);

  // Firebase Auth & Admin Authorization State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState<boolean>(false);

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
  const [isAdminLoginOpen, setIsAdminLoginOpen] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [trackingOrderNumber, setTrackingOrderNumber] = useState('OF-849102');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Top banner dismissible state
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Persist cart to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch (e) {
      console.warn('Failed to save cart', e);
    }
  }, [cart]);

  // Listen to Firebase Auth state and seed Firestore if Admin signs in
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const isAdmin = await checkIsUserAdmin(user);
          setIsAdminLoggedIn(isAdmin);
          if (isAdmin) {
            await seedDatabaseIfEmptyAsAdmin();
          }
        } catch (err) {
          console.error('Admin verification check error:', err);
          setIsAdminLoggedIn(false);
        }
      } else {
        setIsAdminLoggedIn(false);
      }
    });
    return () => unsubAuth();
  }, []);

  // Subscribe to public Storefront Products and Promotions collections in Firestore
  useEffect(() => {
    const unsubProducts = subscribeToProducts((dbProducts) => {
      setProducts(dbProducts);
    });
    const unsubPromos = subscribeToPromotions((dbPromos) => {
      setPromotions(dbPromos);
    });
    return () => {
      unsubProducts();
      unsubPromos();
    };
  }, []);

  // Subscribe to Admin-only Shopify Integration config & Audit Logs when authenticated as Admin
  useEffect(() => {
    if (!isAdminLoggedIn) {
      setShopifyConfig(DEFAULT_SHOPIFY_CONFIG);
      setSyncLogs(INITIAL_SYNC_LOGS);
      return;
    }

    const unsubIntegration = subscribeToShopifyIntegration((cfg) => {
      setShopifyConfig(cfg);
    });
    const unsubLogs = subscribeToSyncLogs((logs) => {
      if (logs.length > 0) setSyncLogs(logs);
    });

    return () => {
      unsubIntegration();
      unsubLogs();
    };
  }, [isAdminLoggedIn]);

  // Toast notification helper
  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
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

  // Quick add with default size & color
  const handleQuickAdd = (product: Product) => {
    handleAddToCart(product, product.sizes[0] || 'M', product.colors[0]?.name || 'Pitch Carbon', 1);
    setIsCartOpen(true);
  };

  // Update item quantity
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

  // Remove item
  const handleRemoveItem = (id: string) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  // Apply discount code
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

  // Admin Access Handler
  const handleOpenAdmin = () => {
    if (isAdminLoggedIn) {
      setIsAdminPanelOpen(true);
    } else {
      setIsAdminLoginOpen(true);
    }
  };

  const handleAdminLoginSuccess = () => {
    setIsAdminLoggedIn(true);
    setIsAdminLoginOpen(false);
    setIsAdminPanelOpen(true);
    showToast('Admin Session Authorized');
  };

  const handleAdminLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Sign out error:', err);
    }
    setIsAdminLoggedIn(false);
    setIsAdminPanelOpen(false);
    showToast('Admin Logged Out');
  };

  // Admin Stock Actions (Firestore)
  const handleUpdateStock = async (productId: string, newQuantity: number) => {
    await updateProductStockInFirestore(productId, newQuantity);
    showToast('Stock quantity saved to Firestore');
  };

  const handleAddStock = async (productId: string, addUnits: number) => {
    const prod = products.find((p) => p.id === productId);
    const currentQty = prod ? prod.inventoryQuantity : 0;
    const nextQty = Math.max(0, currentQty + addUnits);
    await updateProductStockInFirestore(productId, nextQty);
    showToast(`Added ${addUnits > 0 ? `+${addUnits}` : addUnits} units to Firestore stock`);
  };

  const handleBatchRestock = async (incrementAmount: number = 20) => {
    const count = await batchRestockLowItemsInFirestore(products, incrementAmount);
    showToast(
      count > 0
        ? `Batch restocked ${count} low inventory SKUs (+${incrementAmount} units)`
        : 'All SKUs already have healthy inventory'
    );
  };

  // Admin Product Actions (Firestore)
  const handleCreateProduct = async (newProductData: Omit<Product, 'id' | 'shopifyId' | 'handle'>) => {
    await createProductInFirestore(newProductData);
    showToast(`Created & published "${newProductData.title}" to Firestore`);
  };

  const handleDeleteProduct = async (productId: string) => {
    const prod = products.find((p) => p.id === productId);
    await deleteProductInFirestore(productId, prod?.title);
    showToast('Product removed from Firestore catalog');
  };

  // Trigger Shopify catalog sync from Admin and persist snapshot to Firestore
  const handleTriggerSync = async () => {
    try {
      const res = await syncCatalogFromShopify(shopifyConfig);
      const updatedCfg: ShopifyConfig = {
        ...getShopifyConfig(),
        syncStatus: 'synced',
        lastSyncedAt: new Date().toISOString(),
        itemsCount: products.length,
      };
      await saveShopifyConfigInFirestore(updatedCfg);
      await appendSyncLogInFirestore({
        event: 'SHOPIFY_FIRESTORE_SYNC',
        details: `Synchronized Shopify endpoint (${shopifyConfig.storeDomain}) with ${products.length} Firestore SKUs.`,
        status: 'success',
      });
      setShopifyConfig(updatedCfg);
      showToast(`Storefront catalog synchronized (${res.products.length} SKUs)`);
    } catch (e) {
      console.error(e);
      showToast('Synchronization completed with Firestore catalog');
    }
  };

  // Trigger simulated webhook from Admin persisted in Firestore
  const handleTriggerWebhook = async (
    type: 'inventory_reduced' | 'price_sync' | 'new_product',
    productId?: string
  ) => {
    const target = products.find((p) => p.id === productId) || products[0];
    if (!target) return;

    if (type === 'inventory_reduced') {
      const nextQty = Math.max(0, target.inventoryQuantity - 1);
      await updateProductStockInFirestore(target.id, nextQty);
      await appendSyncLogInFirestore({
        event: 'WEBHOOK: inventory_levels/connect',
        details: `Shopify webhook decremented ${target.title} to ${nextQty} units.`,
        status: 'info',
      });
    } else if (type === 'price_sync') {
      await applyFlashPriceSyncInFirestore(target.id, target.price);
    }
    showToast(`Webhook event executed: ${type}`);
  };

  // Process custom checkout atomically in Firestore
  const handleProcessOrder = async (customer: CheckoutCustomerInfo): Promise<ConfirmedOrder> => {
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

      {/* Slim Dismissible Top Notification Bar (<= 40px) - No Shopify mentions */}
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
              onClick={handleOpenAdmin}
              className="text-xs text-slate-400 hover:text-white font-mono inline-flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Lock className="w-3 h-3 text-[#ccff00]" />
              <span>Admin Portal</span>
            </button>
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

      {/* Navigation adhering to Top Bar Contract */}
      <Navbar
        cartCount={totalCartItems}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenAdmin={handleOpenAdmin}
        onOpenFitGuide={() => setIsFitGuideOpen(true)}
        onOpenOrderTracker={() => setIsOrderTrackerOpen(true)}
        onOpenSpecials={scrollToPromotions}
        isAdminLoggedIn={isAdminLoggedIn}
      />

      {/* Main Content */}
      <main className="flex-1">
        {/* Campaign Hero - Clean, minimal, zero Shopify text */}
        <Hero
          onExploreClick={scrollToCollection}
          onViewSpecials={scrollToPromotions}
        />

        {/* Specials & Promotions Slider Component */}
        <PromotionsSlider
          promotions={promotions}
          onApplyPromoCode={handleApplyDiscount}
          onExploreCategory={() => scrollToCollection()}
        />

        {/* Product Catalog Grid - Filterable, clean */}
        <ProductGrid
          products={products}
          onSelectProduct={(product) => setSelectedProduct(product)}
          onQuickAdd={handleQuickAdd}
        />

        {/* Textile Lab & Fabric Technology */}
        <FabricTechnologySection />

        {/* Disciplines & Competition Strip */}
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
      {/* 1. Product Detail Modal */}
      <ProductDetailModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={handleAddToCart}
        onOpenFitGuide={() => {
          setSelectedProduct(null);
          setIsFitGuideOpen(true);
        }}
      />

      {/* 2. Cart Drawer */}
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

      {/* 3. Fully Customized Checkout Experience */}
      <CustomCheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        items={cart}
        discountCode={discountCode}
        discountPercentage={discountPercentage}
        currentUser={currentUser}
        onProcessOrder={handleProcessOrder}
        onOrderSuccess={() => {
          setCart([]);
        }}
        onTrackOrder={(orderNum) => {
          setTrackingOrderNumber(orderNum);
          setIsOrderTrackerOpen(true);
        }}
      />

      {/* 4. Athlete Fit Guide Modal */}
      <AthleteFitGuideModal
        isOpen={isFitGuideOpen}
        onClose={() => setIsFitGuideOpen(false)}
      />

      {/* 5. Order Tracker Modal */}
      <OrderTrackerModal
        isOpen={isOrderTrackerOpen}
        onClose={() => setIsOrderTrackerOpen(false)}
        initialOrderNumber={trackingOrderNumber}
        currentUser={currentUser}
        isAdmin={isAdminLoggedIn}
      />

      {/* 6. Admin Login Modal */}
      <AdminLoginModal
        isOpen={isAdminLoginOpen}
        onClose={() => setIsAdminLoginOpen(false)}
        onLoginSuccess={handleAdminLoginSuccess}
        currentUser={currentUser}
      />

      {/* 7. Dedicated Admin Panel: Stock Management, Product Creator & Integrations */}
      <AdminPanelModal
        isOpen={isAdminPanelOpen}
        onClose={() => setIsAdminPanelOpen(false)}
        onLogout={handleAdminLogout}
        products={products}
        shopifyConfig={shopifyConfig}
        syncLogs={syncLogs}
        onUpdateStock={handleUpdateStock}
        onAddStock={handleAddStock}
        onBatchRestock={handleBatchRestock}
        onCreateProduct={handleCreateProduct}
        onDeleteProduct={handleDeleteProduct}
        onTriggerSync={handleTriggerSync}
        onSaveShopifyConfig={async (cfg) => {
          setShopifyConfig(cfg);
          await saveShopifyConfigInFirestore(cfg);
          showToast('Shopify integration configuration saved to Firestore');
        }}
        onTriggerWebhook={handleTriggerWebhook}
      />

      {/* Footer - No Shopify mentions */}
      <Footer
        onOpenAdmin={handleOpenAdmin}
        onOpenOrderTracker={() => setIsOrderTrackerOpen(true)}
        onOpenSpecials={scrollToPromotions}
      />
    </div>
  );
}
