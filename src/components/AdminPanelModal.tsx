import React, { useState } from 'react';
import { Product, ShopifyConfig, SyncLogEntry } from '../types/store';
import {
  X,
  Plus,
  Package,
  Layers,
  Database,
  RefreshCw,
  Search,
  CheckCircle,
  AlertTriangle,
  Zap,
  Globe,
  Trash2,
  Edit,
  ArrowRight,
  LogOut,
  SlidersHorizontal,
  DollarSign,
  TrendingUp,
  ShieldCheck,
  Check,
} from 'lucide-react';

interface AdminPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  products: Product[];
  shopifyConfig: ShopifyConfig;
  syncLogs: SyncLogEntry[];
  onUpdateStock: (productId: string, newQuantity: number) => void;
  onAddStock: (productId: string, addUnits: number) => void;
  onBatchRestock: (incrementAmount?: number) => void;
  onCreateProduct: (newProductData: Omit<Product, 'id' | 'shopifyId' | 'handle'>) => void;
  onDeleteProduct: (productId: string) => void;
  onTriggerSync: () => Promise<void>;
  onSaveShopifyConfig: (config: ShopifyConfig) => void;
  onTriggerWebhook: (type: 'inventory_reduced' | 'price_sync' | 'new_product', productId?: string) => void;
}

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({
  isOpen,
  onClose,
  onLogout,
  products,
  shopifyConfig,
  syncLogs,
  onUpdateStock,
  onAddStock,
  onBatchRestock,
  onCreateProduct,
  onDeleteProduct,
  onTriggerSync,
  onSaveShopifyConfig,
  onTriggerWebhook,
}) => {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState<'stock' | 'products' | 'integrations'>('stock');
  const [stockSearch, setStockSearch] = useState('');
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'low' | 'out' | 'ok'>('all');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');

  // Integrations form state
  const [domain, setDomain] = useState(shopifyConfig.storeDomain);
  const [token, setToken] = useState(shopifyConfig.storefrontAccessToken);
  const [apiVersion, setApiVersion] = useState(shopifyConfig.apiVersion);
  const [isSyncing, setIsSyncing] = useState(false);
  const [targetSkuForWebhook, setTargetSkuForWebhook] = useState<string>(products[0]?.id || '');
  const [integrationSavedNotice, setIntegrationSavedNotice] = useState(false);

  // New Product Creator Modal / Section state
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTagline, setNewTagline] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newPrice, setNewPrice] = useState<number>(140);
  const [newComparePrice, setNewComparePrice] = useState<number | undefined>(160);
  const [newCategory, setNewCategory] = useState<'Tops' | 'Bottoms' | 'Outerwear' | 'Accessories'>('Tops');
  const [newDiscipline, setNewDiscipline] = useState<'Track & Field' | 'Pitch & Field' | 'Endurance' | 'Recovery' | 'All'>('Track & Field');
  const [newStock, setNewStock] = useState<number>(30);
  const [newGsm, setNewGsm] = useState<number>(95);
  const [newImage, setNewImage] = useState<string>('/src/assets/images/product_stealth_jersey_1793037645515.jpg');
  const [newSizes, setNewSizes] = useState<('XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL')[]>(['S', 'M', 'L', 'XL']);
  const [newComposition, setNewComposition] = useState('80% Recycled Micro-Polyamide, 20% Elastane');
  const [newSeamType, setNewSeamType] = useState('Ultrasonic Thermo-Bonded (Zero-Chafe)');
  const [newBreathability, setNewBreathability] = useState('1,600 g/m²/24h');
  const [newFitNotes, setNewFitNotes] = useState('Athletic anatomical contour. Fits true to size with snug aerodynamic chest profile.');

  // Stock Metrics
  const totalUnits = products.reduce((acc, p) => acc + p.inventoryQuantity, 0);
  const lowStockItems = products.filter((p) => p.inventoryQuantity < 10);
  const outOfStockItems = products.filter((p) => p.inventoryQuantity === 0);
  const totalValuation = products.reduce((acc, p) => acc + p.price * p.inventoryQuantity, 0);

  // Filtered Products for Stock Management
  const filteredStockList = products.filter((p) => {
    const matchesSearch =
      p.title.toLowerCase().includes(stockSearch.toLowerCase()) ||
      p.category.toLowerCase().includes(stockSearch.toLowerCase()) ||
      p.discipline.toLowerCase().includes(stockSearch.toLowerCase());

    const matchesCategory = selectedCategoryFilter === 'all' || p.category === selectedCategoryFilter;

    let matchesStatus = true;
    if (stockStatusFilter === 'low') matchesStatus = p.inventoryQuantity > 0 && p.inventoryQuantity < 10;
    if (stockStatusFilter === 'out') matchesStatus = p.inventoryQuantity === 0;
    if (stockStatusFilter === 'ok') matchesStatus = p.inventoryQuantity >= 10;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  const handleSyncClick = async () => {
    setIsSyncing(true);
    await onTriggerSync();
    setIsSyncing(false);
  };

  const handleSaveIntegration = () => {
    onSaveShopifyConfig({
      ...shopifyConfig,
      storeDomain: domain,
      storefrontAccessToken: token,
      apiVersion,
    });
    setIntegrationSavedNotice(true);
    setTimeout(() => setIntegrationSavedNotice(false), 2500);
  };

  const handleCreateProductSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    onCreateProduct({
      title: newTitle.trim(),
      tagline: newTagline.trim() || 'Minimalist Performance Apparel',
      description: newDescription.trim() || 'Engineered for relentless competition with bonded seams.',
      price: Number(newPrice) || 120,
      compareAtPrice: newComparePrice ? Number(newComparePrice) : undefined,
      currency: 'USD',
      category: newCategory,
      discipline: newDiscipline,
      image: newImage,
      detailImage: '/src/assets/images/craft_technical_fabric_1793037647097.jpg',
      sizes: newSizes,
      colors: [
        { name: 'Pitch Carbon', hex: '#0F1115' },
        { name: 'Monolith Grey', hex: '#2A2E35' },
      ],
      inStock: newStock > 0,
      inventoryQuantity: Number(newStock) || 0,
      weightGsm: Number(newGsm) || 100,
      fabricSpecs: {
        composition: newComposition,
        treatment: 'Coldblack® UV Reflector & Anti-Odor Silver Ion',
        seamType: newSeamType,
        breathabilityRating: newBreathability,
      },
      athleteFitNotes: newFitNotes,
      featured: false,
    });

    // Reset and close
    setNewTitle('');
    setNewTagline('');
    setNewDescription('');
    setIsCreatingProduct(false);
  };

  const toggleSize = (size: 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL') => {
    if (newSizes.includes(size)) {
      if (newSizes.length > 1) {
        setNewSizes(newSizes.filter((s) => s !== size));
      }
    } else {
      setNewSizes([...newSizes, size]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-5">
      <div
        className="relative bg-[#0b0d12] border border-[#232936] w-full max-w-6xl max-h-[94vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Admin Bar Header */}
        <div className="px-6 py-4 bg-[#10141c] border-b border-[#1d2330] flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#18202d] border border-[#2c374b] flex items-center justify-center text-[#ccff00]">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white uppercase tracking-tight">
                  Offside HQ Admin Operations
                </h2>
                <span className="text-[10px] font-mono bg-[#162111] text-[#ccff00] border border-[#ccff00]/40 px-1.5 py-0.2 uppercase font-bold">
                  Authorized Session
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Stock Management · Product Catalog Engineering · Integrations & Webhooks
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onLogout}
              className="px-3 py-1.5 bg-[#171b26] hover:bg-rose-950/40 text-slate-300 hover:text-rose-300 border border-[#252c3c] hover:border-rose-800 text-xs font-mono uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log Out</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white transition-colors cursor-pointer"
              aria-label="Close Admin Panel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#1d2330] bg-[#0e1118] px-6 text-xs font-medium">
          <button
            onClick={() => setActiveTab('stock')}
            className={`py-3.5 px-5 border-b-2 uppercase tracking-wider flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'stock'
                ? 'border-[#ccff00] text-white font-bold bg-[#141822]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Package className="w-4 h-4 text-[#ccff00]" />
            <span>Stock Management ({products.length} SKUs)</span>
            {lowStockItems.length > 0 && (
              <span className="bg-amber-950 text-amber-300 border border-amber-600/40 px-1.5 text-[10px] font-mono font-bold">
                {lowStockItems.length} Low
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('products')}
            className={`py-3.5 px-5 border-b-2 uppercase tracking-wider flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'products'
                ? 'border-[#ccff00] text-white font-bold bg-[#141822]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4 text-[#ccff00]" />
            <span>Product Catalog & Creator</span>
          </button>

          <button
            onClick={() => setActiveTab('integrations')}
            className={`py-3.5 px-5 border-b-2 uppercase tracking-wider flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'integrations'
                ? 'border-[#ccff00] text-white font-bold bg-[#141822]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-4 h-4 text-[#ccff00]" />
            <span>Integrations (Shopify & Webhooks)</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-6 overflow-y-auto flex-1 max-h-[75vh]">
          {/* ================= TAB 1: STOCK MANAGEMENT SYSTEM ================= */}
          {activeTab === 'stock' && (
            <div className="space-y-6">
              {/* Summary KPI Strips */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                <div className="p-4 bg-[#121620] border border-[#212735]">
                  <span className="text-[11px] uppercase font-mono text-slate-400 block mb-1">
                    Total Warehouse Units
                  </span>
                  <span className="text-2xl font-bold font-mono text-white tabular-nums">
                    {totalUnits}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Physical count ready</span>
                </div>

                <div className="p-4 bg-[#121620] border border-[#212735]">
                  <span className="text-[11px] uppercase font-mono text-slate-400 block mb-1">
                    Active Catalog SKUs
                  </span>
                  <span className="text-2xl font-bold font-mono text-white tabular-nums">
                    {products.length}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">In synchronized store</span>
                </div>

                <div className="p-4 bg-[#121620] border border-[#212735]">
                  <span className="text-[11px] uppercase font-mono text-amber-400 block mb-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                    Low Stock Alerts (&lt;10)
                  </span>
                  <span className="text-2xl font-bold font-mono text-amber-300 tabular-nums">
                    {lowStockItems.length}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Requires replenishment</span>
                </div>

                <div className="p-4 bg-[#121620] border border-[#212735]">
                  <span className="text-[11px] uppercase font-mono text-[#ccff00] block mb-1">
                    Inventory Valuation
                  </span>
                  <span className="text-2xl font-bold font-mono text-[#ccff00] tabular-nums">
                    ${totalValuation.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Retail value equivalent</span>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="p-4 bg-[#11141c] border border-[#1f2533] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Search & Status Filters */}
                <div className="flex flex-wrap items-center gap-2.5 flex-1">
                  <div className="relative min-w-[200px]">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
                    <input
                      type="text"
                      value={stockSearch}
                      onChange={(e) => setStockSearch(e.target.value)}
                      placeholder="Filter by SKU or title..."
                      className="w-full bg-[#161a24] border border-[#262e3e] text-white pl-8 pr-3 py-1.5 text-xs font-mono focus:outline-none focus:border-[#ccff00]"
                    />
                  </div>

                  <select
                    value={stockStatusFilter}
                    onChange={(e) => setStockStatusFilter(e.target.value as any)}
                    className="bg-[#161a24] border border-[#262e3e] text-xs text-white px-2.5 py-1.5 focus:outline-none focus:border-[#ccff00]"
                  >
                    <option value="all">All Stock Statuses</option>
                    <option value="low">Low Stock Alerts (&lt; 10)</option>
                    <option value="ok">Healthy Stock (&ge; 10)</option>
                    <option value="out">Out of Stock (0)</option>
                  </select>

                  <select
                    value={selectedCategoryFilter}
                    onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                    className="bg-[#161a24] border border-[#262e3e] text-xs text-white px-2.5 py-1.5 focus:outline-none focus:border-[#ccff00]"
                  >
                    <option value="all">All Categories</option>
                    <option value="Tops">Tops</option>
                    <option value="Bottoms">Bottoms</option>
                    <option value="Outerwear">Outerwear</option>
                    <option value="Accessories">Accessories</option>
                  </select>
                </div>

                {/* Batch Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onBatchRestock(20)}
                    className="px-4 py-2 bg-[#1b2230] hover:bg-[#252f44] text-[#ccff00] border border-[#ccff00]/30 hover:border-[#ccff00] text-xs font-mono font-semibold uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Batch Restock Low Items (+20)</span>
                  </button>

                  <button
                    onClick={() => {
                      setActiveTab('products');
                      setIsCreatingProduct(true);
                    }}
                    className="px-4 py-2 bg-[#ccff00] hover:bg-[#b8e600] text-black text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer shadow-md"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New SKU</span>
                  </button>
                </div>
              </div>

              {/* Stock Table */}
              <div className="border border-[#1e2432] bg-[#0e1117] overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#121620] border-b border-[#1e2432] text-slate-400 font-mono uppercase text-[11px]">
                    <tr>
                      <th className="py-3 px-4">Garment / SKU</th>
                      <th className="py-3 px-3">Discipline</th>
                      <th className="py-3 px-3">Price</th>
                      <th className="py-3 px-3">Available Stock</th>
                      <th className="py-3 px-3">Health Status</th>
                      <th className="py-3 px-4 text-right">Quick Stock Adjuster</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#171b26] text-slate-300">
                    {filteredStockList.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500 font-mono">
                          No inventory matches the active stock filters.
                        </td>
                      </tr>
                    ) : (
                      filteredStockList.map((prod) => {
                        const isLow = prod.inventoryQuantity > 0 && prod.inventoryQuantity < 10;
                        const isOut = prod.inventoryQuantity === 0;
                        return (
                          <tr key={prod.id} className="hover:bg-[#131722] transition-colors">
                            {/* Product Info */}
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <img
                                  src={prod.image}
                                  alt={prod.title}
                                  referrerPolicy="no-referrer"
                                  className="w-10 h-10 object-cover bg-[#161a24] border border-[#242c3c] shrink-0"
                                />
                                <div>
                                  <h4 className="text-white font-semibold text-xs">{prod.title}</h4>
                                  <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                                    <span>{prod.id}</span>
                                    <span>·</span>
                                    <span>{prod.weightGsm}g GSM</span>
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Discipline */}
                            <td className="py-3 px-3 font-mono text-slate-300 text-[11px]">
                              {prod.discipline}
                            </td>

                            {/* Price */}
                            <td className="py-3 px-3 font-mono text-white tabular-nums font-bold">
                              ${prod.price}
                            </td>

                            {/* Available Stock */}
                            <td className="py-3 px-3 font-mono">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-base font-bold tabular-nums ${
                                    isOut
                                      ? 'text-rose-400'
                                      : isLow
                                      ? 'text-amber-300'
                                      : 'text-[#ccff00]'
                                  }`}
                                >
                                  {prod.inventoryQuantity}
                                </span>
                                <span className="text-[10px] text-slate-500">units</span>
                              </div>
                            </td>

                            {/* Status Badge */}
                            <td className="py-3 px-3">
                              {isOut ? (
                                <span className="bg-rose-950/80 text-rose-300 border border-rose-700/50 px-2 py-0.5 text-[10px] uppercase font-mono font-bold">
                                  Out of Stock
                                </span>
                              ) : isLow ? (
                                <span className="bg-amber-950/80 text-amber-300 border border-amber-600/50 px-2 py-0.5 text-[10px] uppercase font-mono font-bold">
                                  Low Stock ({prod.inventoryQuantity})
                                </span>
                              ) : (
                                <span className="bg-[#142310] text-[#ccff00] border border-[#ccff00]/40 px-2 py-0.5 text-[10px] uppercase font-mono font-bold">
                                  In Stock
                                </span>
                              )}
                            </td>

                            {/* Quick Adjuster Actions */}
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5 font-mono">
                                <button
                                  onClick={() => onAddStock(prod.id, -5)}
                                  disabled={prod.inventoryQuantity < 5}
                                  className="px-2 py-1 bg-[#181d28] hover:bg-[#252c3c] text-slate-300 hover:text-white border border-[#2b3447] text-[11px] disabled:opacity-30 cursor-pointer"
                                  title="Reduce 5 units"
                                >
                                  -5
                                </button>
                                <button
                                  onClick={() => onAddStock(prod.id, -1)}
                                  disabled={prod.inventoryQuantity < 1}
                                  className="px-2 py-1 bg-[#181d28] hover:bg-[#252c3c] text-slate-300 hover:text-white border border-[#2b3447] text-[11px] disabled:opacity-30 cursor-pointer"
                                  title="Reduce 1 unit"
                                >
                                  -1
                                </button>
                                <button
                                  onClick={() => onAddStock(prod.id, 5)}
                                  className="px-2 py-1 bg-[#1a2313] hover:bg-[#26351c] text-[#ccff00] border border-[#ccff00]/30 text-[11px] font-bold cursor-pointer"
                                  title="Add 5 units"
                                >
                                  +5
                                </button>
                                <button
                                  onClick={() => onAddStock(prod.id, 10)}
                                  className="px-2 py-1 bg-[#1a2313] hover:bg-[#26351c] text-[#ccff00] border border-[#ccff00]/30 text-[11px] font-bold cursor-pointer"
                                  title="Add 10 units"
                                >
                                  +10
                                </button>

                                {/* Direct numerical edit */}
                                <input
                                  type="number"
                                  min="0"
                                  value={prod.inventoryQuantity}
                                  onChange={(e) => onUpdateStock(prod.id, parseInt(e.target.value) || 0)}
                                  className="w-14 bg-[#141822] border border-[#283142] text-white px-1.5 py-1 text-xs text-center font-mono focus:outline-none focus:border-[#ccff00]"
                                  title="Set exact stock quantity"
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================= TAB 2: PRODUCT CATALOG & CREATOR ================= */}
          {activeTab === 'products' && (
            <div className="space-y-6">
              {/* Top Banner to toggle creation form */}
              <div className="p-4 bg-[#11141c] border border-[#1f2533] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-tight">
                    Athlete Technical Gear Catalog
                  </h3>
                  <p className="text-xs text-slate-400">
                    Create new aerodynamic garments, manage specifications, or archive discontinued items.
                  </p>
                </div>

                <button
                  onClick={() => setIsCreatingProduct(!isCreatingProduct)}
                  className="px-5 py-2.5 bg-[#ccff00] hover:bg-[#b8e600] text-black font-bold uppercase tracking-wider text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  <Plus className="w-4 h-4" />
                  <span>{isCreatingProduct ? 'Close Creator' : 'Create New Product'}</span>
                </button>
              </div>

              {/* Product Creation Form (Collapsible) */}
              {isCreatingProduct && (
                <div className="p-6 bg-[#0f121a] border border-[#242b3b] shadow-xl">
                  <div className="flex items-center justify-between pb-3 mb-5 border-b border-[#1f2535]">
                    <div className="flex items-center gap-2">
                      <Plus className="w-4 h-4 text-[#ccff00]" />
                      <h4 className="text-sm font-bold uppercase tracking-wider text-white">
                        Product Specification & Creation Form
                      </h4>
                    </div>
                    <span className="text-xs font-mono text-[#ccff00]">
                      Instantly synced to customer storefront
                    </span>
                  </div>

                  <form onSubmit={handleCreateProductSubmit} className="space-y-4 text-xs">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-slate-400 uppercase font-medium mb-1">
                          Product Title *
                        </label>
                        <input
                          type="text"
                          required
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                          placeholder="e.g. AeroCarbon Velocity Speed Suit"
                          className="w-full bg-[#151924] border border-[#262e3e] text-white px-3 py-2 text-xs focus:outline-none focus:border-[#ccff00]"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-400 uppercase font-medium mb-1">
                          Tagline / Subtitle *
                        </label>
                        <input
                          type="text"
                          required
                          value={newTagline}
                          onChange={(e) => setNewTagline(e.target.value)}
                          placeholder="e.g. Sub-120g Aerodynamic Track Weapon"
                          className="w-full bg-[#151924] border border-[#262e3e] text-white px-3 py-2 text-xs focus:outline-none focus:border-[#ccff00]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-400 uppercase font-medium mb-1">
                        Garment Description *
                      </label>
                      <textarea
                        rows={2}
                        required
                        value={newDescription}
                        onChange={(e) => setNewDescription(e.target.value)}
                        placeholder="Detailed technical overview of fabric, performance features, and competition advantages..."
                        className="w-full bg-[#151924] border border-[#262e3e] text-white px-3 py-2 text-xs focus:outline-none focus:border-[#ccff00]"
                      />
                    </div>

                    {/* Numeric and Category inputs */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-slate-400 uppercase font-medium mb-1">
                          Price ($ USD) *
                        </label>
                        <input
                          type="number"
                          required
                          min="1"
                          value={newPrice}
                          onChange={(e) => setNewPrice(Number(e.target.value))}
                          className="w-full bg-[#151924] border border-[#262e3e] text-white px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#ccff00]"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-400 uppercase font-medium mb-1">
                          Compare Price ($)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={newComparePrice || ''}
                          onChange={(e) => setNewComparePrice(e.target.value ? Number(e.target.value) : undefined)}
                          placeholder="Optional"
                          className="w-full bg-[#151924] border border-[#262e3e] text-white px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#ccff00]"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-400 uppercase font-medium mb-1">
                          Initial Stock Units *
                        </label>
                        <input
                          type="number"
                          required
                          min="0"
                          value={newStock}
                          onChange={(e) => setNewStock(Number(e.target.value))}
                          className="w-full bg-[#151924] border border-[#262e3e] text-white px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#ccff00]"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-400 uppercase font-medium mb-1">
                          Weight (GSM) *
                        </label>
                        <input
                          type="number"
                          required
                          min="30"
                          value={newGsm}
                          onChange={(e) => setNewGsm(Number(e.target.value))}
                          className="w-full bg-[#151924] border border-[#262e3e] text-white px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#ccff00]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-slate-400 uppercase font-medium mb-1">
                          Category *
                        </label>
                        <select
                          value={newCategory}
                          onChange={(e) => setNewCategory(e.target.value as any)}
                          className="w-full bg-[#151924] border border-[#262e3e] text-white px-3 py-2 text-xs focus:outline-none focus:border-[#ccff00]"
                        >
                          <option value="Tops">Tops</option>
                          <option value="Bottoms">Bottoms</option>
                          <option value="Outerwear">Outerwear</option>
                          <option value="Accessories">Accessories</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-400 uppercase font-medium mb-1">
                          Discipline Target *
                        </label>
                        <select
                          value={newDiscipline}
                          onChange={(e) => setNewDiscipline(e.target.value as any)}
                          className="w-full bg-[#151924] border border-[#262e3e] text-white px-3 py-2 text-xs focus:outline-none focus:border-[#ccff00]"
                        >
                          <option value="Track & Field">Track & Field</option>
                          <option value="Pitch & Field">Pitch & Field</option>
                          <option value="Endurance">Endurance</option>
                          <option value="Recovery">Recovery</option>
                          <option value="All">All Disciplines</option>
                        </select>
                      </div>
                    </div>

                    {/* Image Selection presets */}
                    <div>
                      <label className="block text-slate-400 uppercase font-medium mb-1">
                        Product Imagery:
                      </label>
                      <div className="grid grid-cols-3 gap-2 mb-2">
                        {[
                          { label: 'Stealth Top', path: '/src/assets/images/product_stealth_jersey_1793037645515.jpg' },
                          { label: 'Tech Outerwear', path: '/src/assets/images/product_technical_jacket_1793037646546.jpg' },
                          { label: 'Kinetic Shorts', path: '/src/assets/images/product_compression_tights_1793037646698.jpg' },
                        ].map((preset) => (
                          <div
                            key={preset.path}
                            onClick={() => setNewImage(preset.path)}
                            className={`p-2 border cursor-pointer flex items-center gap-2 ${
                              newImage === preset.path
                                ? 'border-[#ccff00] bg-[#1a2314]'
                                : 'border-[#262e3e] bg-[#151924] hover:border-slate-400'
                            }`}
                          >
                            <img src={preset.path} alt={preset.label} className="w-8 h-8 object-cover shrink-0" />
                            <span className="text-[11px] text-white font-mono">{preset.label}</span>
                          </div>
                        ))}
                      </div>
                      <input
                        type="text"
                        value={newImage}
                        onChange={(e) => setNewImage(e.target.value)}
                        placeholder="Custom image path or URL"
                        className="w-full bg-[#151924] border border-[#262e3e] text-white px-3 py-1.5 text-xs font-mono focus:outline-none"
                      />
                    </div>

                    {/* Sizes selection checkboxes */}
                    <div>
                      <label className="block text-slate-400 uppercase font-medium mb-1">
                        Available Athlete Sizes:
                      </label>
                      <div className="flex gap-2">
                        {(['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const).map((sz) => {
                          const isChecked = newSizes.includes(sz);
                          return (
                            <button
                              type="button"
                              key={sz}
                              onClick={() => toggleSize(sz)}
                              className={`px-3 py-1.5 text-xs font-mono font-bold uppercase border cursor-pointer transition-colors ${
                                isChecked
                                  ? 'bg-[#ccff00] text-black border-[#ccff00]'
                                  : 'bg-[#151924] text-slate-400 border-[#262e3e] hover:text-white'
                              }`}
                            >
                              {sz}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Specifications */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-slate-400 uppercase font-medium mb-1">
                          Composition
                        </label>
                        <input
                          type="text"
                          value={newComposition}
                          onChange={(e) => setNewComposition(e.target.value)}
                          className="w-full bg-[#151924] border border-[#262e3e] text-white px-3 py-1.5 text-xs focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 uppercase font-medium mb-1">
                          Seam Technology
                        </label>
                        <input
                          type="text"
                          value={newSeamType}
                          onChange={(e) => setNewSeamType(e.target.value)}
                          className="w-full bg-[#151924] border border-[#262e3e] text-white px-3 py-1.5 text-xs focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 uppercase font-medium mb-1">
                          Breathability Rating
                        </label>
                        <input
                          type="text"
                          value={newBreathability}
                          onChange={(e) => setNewBreathability(e.target.value)}
                          className="w-full bg-[#151924] border border-[#262e3e] text-white px-3 py-1.5 text-xs focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="pt-3 flex items-center justify-end gap-3 border-t border-[#1f2535]">
                      <button
                        type="button"
                        onClick={() => setIsCreatingProduct(false)}
                        className="px-4 py-2 border border-[#283244] text-slate-300 hover:text-white uppercase font-mono text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-6 py-2.5 bg-[#ccff00] hover:bg-[#b8e600] text-black font-bold uppercase tracking-wider text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-md"
                      >
                        <Check className="w-4 h-4" />
                        <span>Publish & Add to Store Catalog</span>
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Current Product Catalog Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {products.map((p) => (
                  <div
                    key={p.id}
                    className="p-4 bg-[#10141d] border border-[#1f2636] flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex gap-3 mb-3">
                        <img
                          src={p.image}
                          alt={p.title}
                          referrerPolicy="no-referrer"
                          className="w-16 h-16 object-cover bg-black border border-[#252d3f] shrink-0"
                        />
                        <div className="min-w-0">
                          <span className="text-[10px] uppercase font-mono text-[#ccff00] block">
                            {p.discipline} · {p.category}
                          </span>
                          <h4 className="text-white font-bold text-xs truncate">{p.title}</h4>
                          <span className="text-xs font-mono font-bold text-white block mt-1">
                            ${p.price} USD
                          </span>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-400 line-clamp-2 mb-3">
                        {p.description}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-[#1a202d] flex items-center justify-between">
                      <span className="text-xs font-mono text-slate-300">
                        Stock:{' '}
                        <strong
                          className={p.inventoryQuantity < 10 ? 'text-amber-400' : 'text-[#ccff00]'}
                        >
                          {p.inventoryQuantity}
                        </strong>
                      </span>

                      <button
                        onClick={() => {
                          if (confirm(`Archive and remove ${p.title} from the catalog?`)) {
                            onDeleteProduct(p.id);
                          }
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                        title="Delete SKU"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ================= TAB 3: INTEGRATIONS (SHOPIFY & WEBHOOKS) ================= */}
          {activeTab === 'integrations' && (
            <div className="space-y-6">
              {/* Header explanation */}
              <div className="p-4 bg-[#11141c] border border-[#1f2533] flex items-start gap-3">
                <Database className="w-5 h-5 text-[#ccff00] shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-tight">
                    Shopify Storefront API & Webhook Control Hub
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    All external e-commerce integrations, synchronization protocols, GraphQL endpoints,
                    and real-time webhook listeners are isolated in this secure administrative console.
                  </p>
                </div>
              </div>

              {/* Live Status and Synchronize Now */}
              <div className="p-5 bg-[#121620] border border-[#232a3a] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-4 h-4 text-[#ccff00]" />
                    <span className="text-sm font-bold text-white">
                      Two-Way Catalog Sync Active
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 bg-[#161a24] px-2 py-0.5 border border-[#283244]">
                      v{shopifyConfig.apiVersion} GraphQL
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Host: <span className="text-slate-200 font-mono">{shopifyConfig.storeDomain}</span> ·{' '}
                    <span className="font-mono tabular-nums">{products.length} SKUs in Local Cache</span>
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1 font-mono">
                    Last handshake: {shopifyConfig.lastSyncedAt ? new Date(shopifyConfig.lastSyncedAt).toLocaleString() : 'Active'}
                  </p>
                </div>

                <button
                  onClick={handleSyncClick}
                  disabled={isSyncing}
                  className="px-6 py-3 bg-[#ccff00] hover:bg-[#b8e600] active:scale-95 text-black font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Synchronizing...' : 'Sync Catalog From Shopify'}</span>
                </button>
              </div>

              {/* Webhook Simulator */}
              <div className="p-5 bg-[#0f121a] border border-[#1f2536]">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-[#ccff00]" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                    Simulate Real-Time Shopify Webhook Dispatches
                  </h4>
                </div>
                <p className="text-xs text-slate-400 mb-4">
                  Test instant stock decrements and flash price sync events pushed from the Shopify backend.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  <div className="p-3.5 bg-[#141822] border border-[#232b3a] flex flex-col justify-between">
                    <div>
                      <span className="text-xs font-bold text-white block mb-1">
                        inventory_levels/connect
                      </span>
                      <p className="text-[11px] text-slate-400 mb-3">
                        Simulate Shopify deducting 1 unit of stock for target SKU.
                      </p>
                    </div>
                    <button
                      onClick={() => onTriggerWebhook('inventory_reduced', targetSkuForWebhook)}
                      className="w-full py-2 bg-[#1b2230] hover:bg-[#252f44] text-xs font-mono uppercase text-slate-200 border border-[#2b354a] transition-colors cursor-pointer"
                    >
                      Trigger Stock Decrement
                    </button>
                  </div>

                  <div className="p-3.5 bg-[#141822] border border-[#232b3a] flex flex-col justify-between">
                    <div>
                      <span className="text-xs font-bold text-white block mb-1">
                        products/update
                      </span>
                      <p className="text-[11px] text-slate-400 mb-3">
                        Simulate Shopify pushing a 5% promotional discount.
                      </p>
                    </div>
                    <button
                      onClick={() => onTriggerWebhook('price_sync', targetSkuForWebhook)}
                      className="w-full py-2 bg-[#1b2230] hover:bg-[#252f44] text-xs font-mono uppercase text-slate-200 border border-[#2b354a] transition-colors cursor-pointer"
                    >
                      Trigger Flash Price Sync
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400">Target Webhook SKU:</span>
                  <select
                    value={targetSkuForWebhook}
                    onChange={(e) => setTargetSkuForWebhook(e.target.value)}
                    className="flex-1 bg-[#141822] border border-[#232b3a] text-white px-2.5 py-1.5 text-xs font-mono focus:outline-none"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} (${p.price} · Available Stock: {p.inventoryQuantity})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Endpoint Credentials Configuration */}
              <div className="p-5 bg-[#0f121a] border border-[#1f2536] space-y-4 text-xs">
                <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                  Storefront API Credentials
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-400 uppercase font-medium mb-1">
                      Shopify Domain
                    </label>
                    <input
                      type="text"
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                      className="w-full bg-[#151924] border border-[#262e3e] text-white px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#ccff00]"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 uppercase font-medium mb-1">
                      Storefront Access Token
                    </label>
                    <input
                      type="password"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      className="w-full bg-[#151924] border border-[#262e3e] text-white px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#ccff00]"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">GraphQL Version:</span>
                    <select
                      value={apiVersion}
                      onChange={(e) => setApiVersion(e.target.value)}
                      className="bg-[#151924] border border-[#262e3e] text-white px-2 py-1 text-xs font-mono"
                    >
                      <option value="2024-01">2024-01 (Stable)</option>
                      <option value="2024-04">2024-04 (Release Candidate)</option>
                    </select>
                  </div>

                  <button
                    onClick={handleSaveIntegration}
                    className="px-5 py-2 bg-white hover:bg-slate-200 text-black font-bold uppercase tracking-wider text-xs transition-colors cursor-pointer"
                  >
                    {integrationSavedNotice ? 'Saved!' : 'Save Integration Settings'}
                  </button>
                </div>
              </div>

              {/* Audit Log Stream */}
              <div className="p-4 bg-[#0d1017] border border-[#1b2130]">
                <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-3">
                  Integration & Webhook Event Audit Log ({syncLogs.length})
                </h4>
                <div className="space-y-2 max-h-60 overflow-y-auto text-xs font-mono">
                  {syncLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-2.5 bg-[#121620] border border-[#1d2432] flex items-start justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 text-[11px] tabular-nums">
                            {log.timestamp}
                          </span>
                          <span className="font-bold text-slate-200">{log.event}</span>
                        </div>
                        <p className="text-slate-400 text-[11px] mt-0.5 font-sans">{log.details}</p>
                      </div>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 uppercase tracking-wider font-bold shrink-0 ${
                          log.status === 'success'
                            ? 'bg-[#152311] text-[#ccff00] border border-[#ccff00]/30'
                            : log.status === 'warning'
                            ? 'bg-[#291b10] text-amber-400 border border-amber-400/30'
                            : 'bg-[#141b26] text-blue-400 border border-blue-400/30'
                        }`}
                      >
                        {log.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Admin Modal Footer */}
        <div className="px-6 py-3 bg-[#0e1118] border-t border-[#1d2330] flex items-center justify-between text-xs text-slate-400 font-mono">
          <span className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-[#ccff00]" />
            <span>Offside Apparel Operational Core · Stock & Sync Authoritative</span>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-white text-black font-sans font-bold uppercase text-xs hover:bg-slate-200 transition-colors cursor-pointer"
          >
            Return to Storefront
          </button>
        </div>
      </div>
    </div>
  );
};
