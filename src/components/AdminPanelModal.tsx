import React, { useState, useEffect, useMemo } from 'react';
import {
  ALL_STAFF_PERMISSIONS,
  DEFAULT_RIGHTS_PROFILES,
  PREDEFINED_PRODUCT_CATEGORIES,
  SIZING_TYPE_PRESETS,
  GarmentSize,
  OrderStatus,
  Product,
  ProductCategory,
  RightsProfileDefinition,
  ShopifyConfig,
  SizingType,
  STAFF_PERMISSION_CATALOG,
  StockAlarm,
  StockAlarmType,
  SyncLogEntry,
  SessionAccount,
  StaffMemberSummary,
  StaffPermission,
} from '../types/store';
import {
  CustomerOrderRecord,
  OrderPrivateShippingInfo,
  getOrderShippingDetailsFromFirestore,
} from '../services/firestore';
import {
  fetchStaffList,
  createStaffAccountApi,
  updateStaffAccountApi,
  deleteStaffAccountApi,
  fetchRightsProfiles,
  createRightsProfileApi,
  deleteRightsProfileApi,
  fetchOrderShippingOnServerApi,
} from '../services/authApi';
import {
  DEFAULT_STOCK_CEILING,
  DEFAULT_STOCK_FLOOR,
  evaluateProductStockHealth,
  getEffectiveStockMap,
  getProductCeiling,
  getProductFloor,
  getSizingTypePreset,
  getTotalFromStockMap,
  inferSizingTypeFromProduct,
  suggestSizingTypeForCategory,
} from '../utils/inventory';
import { hasOpsPermission } from '../utils/permissions';
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
  Trash2,
  Edit,
  LogOut,
  ShieldCheck,
  Check,
  Bell,
  BellRing,
  Truck,
  Send,
  MapPin,
  Palette,
  SlidersHorizontal,
  Users,
  UserPlus,
  Key,
  Lock,
  BookmarkPlus,
} from 'lucide-react';

interface AdminPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  adminEmail: string;
  sessionAccount: SessionAccount | null;
  isFirebaseAdmin?: boolean;
  authToken: string | null;
  products: Product[];
  orders: CustomerOrderRecord[];
  stockAlarms: StockAlarm[];
  shopifyConfig: ShopifyConfig;
  syncLogs: SyncLogEntry[];
  onBatchRestock: (incrementAmount?: number) => Promise<void> | void;
  onCreateProduct: (newProductData: Omit<Product, 'id' | 'shopifyId' | 'handle'>) => Promise<void> | void;
  onUpdateProductVariantsAndStock: (
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
  ) => Promise<void>;
  onDeleteProduct: (productId: string) => Promise<void> | void;
  onSendStockAlarm: (params: {
    productId: string;
    productTitle: string;
    alarmType: StockAlarmType;
    triggerScope: 'total' | 'size';
    size?: GarmentSize;
    currentQuantity: number;
    threshold: number;
    recipientEmail: string;
    message: string;
  }) => Promise<void>;
  onAcknowledgeAlarm: (alarmId: string) => Promise<void>;
  onDeleteAlarm: (alarmId: string) => Promise<void>;
  onDispatchOrder: (params: {
    order: CustomerOrderRecord;
    nextStatus: OrderStatus;
    courier: string;
    trackingNumber: string;
    dispatchNotes?: string;
    deductStock: boolean;
  }) => Promise<void>;
  onTriggerSync: () => Promise<void>;
  onSaveShopifyConfig: (config: ShopifyConfig) => void;
  onTriggerWebhook: (type: 'inventory_reduced' | 'price_sync' | 'new_product', productId?: string) => void;
}

const PERMISSION_MODULES: ('Stock & Alarms' | 'Inventory' | 'Order Dispatch' | 'Integrations')[] = [
  'Stock & Alarms',
  'Inventory',
  'Order Dispatch',
  'Integrations',
];

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({
  isOpen,
  onClose,
  onLogout,
  adminEmail,
  sessionAccount,
  isFirebaseAdmin = false,
  authToken,
  products,
  orders,
  stockAlarms,
  shopifyConfig,
  syncLogs,
  onBatchRestock,
  onCreateProduct,
  onUpdateProductVariantsAndStock,
  onDeleteProduct,
  onSendStockAlarm,
  onAcknowledgeAlarm,
  onDeleteAlarm,
  onDispatchOrder,
  onTriggerSync,
  onSaveShopifyConfig,
  onTriggerWebhook,
}) => {
  const isSuperuser = sessionAccount?.role === 'superuser';

  // Granular Employee Permissions
  const canEditStock = hasOpsPermission(sessionAccount, isFirebaseAdmin, 'manage_stock_thresholds');
  const canViewStock =
    canEditStock || hasOpsPermission(sessionAccount, isFirebaseAdmin, 'view_stock_alarms');
  const canManageCatalog = hasOpsPermission(sessionAccount, isFirebaseAdmin, 'manage_catalog_variants');
  const canExecuteDispatch = hasOpsPermission(sessionAccount, isFirebaseAdmin, 'execute_order_dispatch');
  const canViewDispatch =
    canExecuteDispatch || hasOpsPermission(sessionAccount, isFirebaseAdmin, 'view_dispatch_orders');
  const canManageIntegrations = hasOpsPermission(
    sessionAccount,
    isFirebaseAdmin,
    'manage_integrations'
  );

  const allowedTabs = useMemo(() => {
    const tabs: ('stock' | 'products' | 'dispatch' | 'staff' | 'integrations')[] = [];
    if (canViewStock) tabs.push('stock');
    if (canManageCatalog) tabs.push('products');
    if (canViewDispatch) tabs.push('dispatch');
    if (isSuperuser) tabs.push('staff');
    if (canManageIntegrations) tabs.push('integrations');
    return tabs;
  }, [canViewStock, canManageCatalog, canViewDispatch, isSuperuser, canManageIntegrations]);

  const [activeTab, setActiveTab] = useState<'stock' | 'products' | 'dispatch' | 'staff' | 'integrations'>('stock');
  const [stockSearch, setStockSearch] = useState('');
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'below_floor' | 'above_ceiling' | 'out' | 'ok'>('all');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');

  // Superuser Staff Accounts & User Rights Profiles Management state
  const [staffList, setStaffList] = useState<StaffMemberSummary[]>([]);
  const [rightsProfiles, setRightsProfiles] = useState<RightsProfileDefinition[]>(DEFAULT_RIGHTS_PROFILES);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [staffNotice, setStaffNotice] = useState<string | null>(null);
  const [newStaffFullName, setNewStaffFullName] = useState('');
  const [newStaffUsername, setNewStaffUsername] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('');
  const [newStaffSelectedProfileId, setNewStaffSelectedProfileId] = useState<string>(
    DEFAULT_RIGHTS_PROFILES[0].id
  );
  const [newStaffProfileName, setNewStaffProfileName] = useState<string>(
    DEFAULT_RIGHTS_PROFILES[0].name
  );
  const [newStaffPermissions, setNewStaffPermissions] = useState<StaffPermission[]>(
    DEFAULT_RIGHTS_PROFILES[0].permissions
  );
  const [isCreatingStaff, setIsCreatingStaff] = useState(false);
  const [confirmDeleteStaffId, setConfirmDeleteStaffId] = useState<string | null>(null);

  // Per-employee inline Rights Assignment editor
  const [editingRightsStaffId, setEditingRightsStaffId] = useState<string | null>(null);
  const [editStaffProfileName, setEditStaffProfileName] = useState('');
  const [editStaffPermissions, setEditStaffPermissions] = useState<StaffPermission[]>([]);
  const [isSavingStaffRights, setIsSavingStaffRights] = useState(false);

  // Custom Rights Profile creator
  const [showNewProfileBuilder, setShowNewProfileBuilder] = useState(false);
  const [customProfileName, setCustomProfileName] = useState('');
  const [customProfileDesc, setCustomProfileDesc] = useState('');
  const [customProfilePerms, setCustomProfilePerms] = useState<StaffPermission[]>([
    'view_stock_alarms',
  ]);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Inline per-SKU stock & threshold draft edits in Stock tab
  const [stockDrafts, setStockDrafts] = useState<
    Record<
      string,
      {
        stockBySize: Partial<Record<GarmentSize, number>>;
        floor: number;
        ceiling: number;
      }
    >
  >({});
  const [savingStockId, setSavingStockId] = useState<string | null>(null);
  const [sendingAlarmId, setSendingAlarmId] = useState<string | null>(null);
  const [alarmRecipientEmail, setAlarmRecipientEmail] = useState<string>(adminEmail || 'blujay1809@gmail.com');

  // Inventory list search & category filter
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState<'all' | ProductCategory>('all');

  // Product Variant Editor state (for editing existing product category, sizing type, sizes, colorways, stock, thresholds)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editCategory, setEditCategory] = useState<ProductCategory>('Tops');
  const [editSizingType, setEditSizingType] = useState<SizingType>('apparel_alpha');
  const [editSizes, setEditSizes] = useState<GarmentSize[]>([]);
  const [editCustomSizeInput, setEditCustomSizeInput] = useState('');
  const [editStockBySize, setEditStockBySize] = useState<Partial<Record<GarmentSize, number>>>({});
  const [editColors, setEditColors] = useState<{ name: string; hex: string }[]>([]);
  const [editColorName, setEditColorName] = useState('');
  const [editColorHex, setEditColorHex] = useState('#1B2028');
  const [editFloor, setEditFloor] = useState<number>(DEFAULT_STOCK_FLOOR);
  const [editCeiling, setEditCeiling] = useState<number>(DEFAULT_STOCK_CEILING);
  const [editFormError, setEditFormError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // New Product Creator Modal / Section state
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTagline, setNewTagline] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newPrice, setNewPrice] = useState<number>(140);
  const [newComparePrice, setNewComparePrice] = useState<number | undefined>(160);
  const [newCategory, setNewCategory] = useState<ProductCategory>('Tops');
  const [newSizingType, setNewSizingType] = useState<SizingType>('apparel_alpha');
  const [sizingManuallyChanged, setSizingManuallyChanged] = useState(false);
  const [newCustomSizeInput, setNewCustomSizeInput] = useState('');
  const [newFormError, setNewFormError] = useState<string | null>(null);
  const [newDiscipline, setNewDiscipline] = useState<'Track & Field' | 'Pitch & Field' | 'Endurance' | 'Recovery' | 'All'>('Track & Field');
  const [newGsm, setNewGsm] = useState<number>(95);
  const [newImage, setNewImage] = useState<string>('/src/assets/images/product_stealth_jersey_1793037645515.jpg');
  const [newSizes, setNewSizes] = useState<GarmentSize[]>(['XS', 'S', 'M', 'L', 'XL']);
  const [newStockBySize, setNewStockBySize] = useState<Partial<Record<GarmentSize, number>>>({
    XS: 4,
    S: 8,
    M: 10,
    L: 8,
    XL: 4,
    XXL: 2,
  });
  const [newColors, setNewColors] = useState<{ name: string; hex: string }[]>([
    { name: 'Pitch Carbon', hex: '#0F1115' },
    { name: 'Monolith Grey', hex: '#2A2E35' },
  ]);
  const [newColorInputName, setNewColorInputName] = useState('');
  const [newColorInputHex, setNewColorInputHex] = useState('#CCFF00');
  const [newStockFloor, setNewStockFloor] = useState<number>(10);
  const [newStockCeiling, setNewStockCeiling] = useState<number>(80);
  const [newComposition, setNewComposition] = useState('80% Recycled Micro-Polyamide, 20% Elastane');
  const [newSeamType, setNewSeamType] = useState('Ultrasonic Thermo-Bonded (Zero-Chafe)');
  const [newBreathability, setNewBreathability] = useState('1,600 g/m²/24h');
  const [newFitNotes, setNewFitNotes] = useState('Athletic anatomical contour. Fits true to size with snug aerodynamic chest profile.');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Order Dispatch System state
  const [dispatchSearch, setDispatchSearch] = useState('');
  const [dispatchFilter, setDispatchFilter] = useState<'All' | OrderStatus>('All');
  const [expandedOrderNum, setExpandedOrderNum] = useState<string | null>(null);
  const [shippingByOrder, setShippingByOrder] = useState<Record<string, OrderPrivateShippingInfo | null>>({});
  const [dispatchDrafts, setDispatchDrafts] = useState<
    Record<
      string,
      {
        courier: string;
        trackingNumber: string;
        notes: string;
        deductStock: boolean;
      }
    >
  >({});
  const [dispatchingOrderNum, setDispatchingOrderNum] = useState<string | null>(null);

  // Integrations form state
  const [domain, setDomain] = useState(shopifyConfig.storeDomain);
  const [token, setToken] = useState(shopifyConfig.storefrontAccessToken);
  const [apiVersion, setApiVersion] = useState(shopifyConfig.apiVersion);
  const [isSyncing, setIsSyncing] = useState(false);
  const [targetSkuForWebhook, setTargetSkuForWebhook] = useState<string>(products[0]?.id || '');
  const [integrationSavedNotice, setIntegrationSavedNotice] = useState(false);

  // Keep draft stock rows synced with live Firestore products
  useEffect(() => {
    setStockDrafts((prev) => {
      const next: typeof prev = {};
      for (const p of products) {
        next[p.id] = {
          stockBySize: getEffectiveStockMap(p),
          floor: getProductFloor(p),
          ceiling: getProductCeiling(p),
        };
      }
      return next;
    });
  }, [products]);

  useEffect(() => {
    setDomain(shopifyConfig.storeDomain);
    setToken(shopifyConfig.storefrontAccessToken);
    setApiVersion(shopifyConfig.apiVersion);
  }, [shopifyConfig]);

  useEffect(() => {
    if (adminEmail) setAlarmRecipientEmail(adminEmail);
  }, [adminEmail]);

  useEffect(() => {
    if (!isOpen || !expandedOrderNum) return;
    if (expandedOrderNum in shippingByOrder) return;
    let cancelled = false;
    const matchedOrder = orders.find((o) => o.orderNumber === expandedOrderNum);

    const loadOrderShipping = async () => {
      if (matchedOrder?.source === 'server' && authToken) {
        const res = await fetchOrderShippingOnServerApi(authToken, expandedOrderNum);
        return res.shipping;
      }
      try {
        const fsInfo = await getOrderShippingDetailsFromFirestore(expandedOrderNum);
        if (fsInfo) return fsInfo;
      } catch {
        // Fallback to server lookup if Firebase Admin session isn't active
      }
      if (authToken) {
        const res = await fetchOrderShippingOnServerApi(authToken, expandedOrderNum);
        return res.shipping;
      }
      return null;
    };

    loadOrderShipping()
      .then((info) => {
        if (!cancelled) {
          setShippingByOrder((prev) => ({ ...prev, [expandedOrderNum]: info }));
        }
      })
      .catch((err) => {
        console.warn('Could not load order shipping info:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, expandedOrderNum, shippingByOrder, orders, authToken]);

  useEffect(() => {
    if (!isOpen) return;
    if (allowedTabs.length > 0 && !allowedTabs.includes(activeTab)) {
      setActiveTab(allowedTabs[0]);
    }
  }, [isOpen, allowedTabs, activeTab]);

  useEffect(() => {
    if (!isOpen || !isSuperuser || !authToken) {
      setStaffList([]);
      return;
    }
    let cancelled = false;
    setIsLoadingStaff(true);
    Promise.all([fetchStaffList(authToken), fetchRightsProfiles(authToken)])
      .then(([staffRes, profRes]) => {
        if (!cancelled) {
          setStaffList(staffRes.staff || []);
          if (Array.isArray(profRes.profiles) && profRes.profiles.length > 0) {
            setRightsProfiles(profRes.profiles);
          }
        }
      })
      .catch((err) => {
        if (!cancelled) setStaffError(err instanceof Error ? err.message : 'Failed to load staff directory.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingStaff(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, isSuperuser, authToken, activeTab]);

  if (!isOpen) return null;

  const permissionLabel = (perm: StaffPermission): string =>
    STAFF_PERMISSION_CATALOG.find((item) => item.key === perm)?.label || perm;

  const handleSelectProfileForNewStaff = (profileId: string) => {
    setNewStaffSelectedProfileId(profileId);
    const prof = rightsProfiles.find((p) => p.id === profileId);
    if (prof) {
      setNewStaffPermissions([...prof.permissions]);
      setNewStaffProfileName(prof.name);
    }
  };

  const toggleNewStaffPermission = (perm: StaffPermission) => {
    setNewStaffPermissions((prev) => {
      const next = prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm];
      const exactMatch = rightsProfiles.find(
        (p) =>
          p.permissions.length === next.length &&
          p.permissions.every((reqPerm) => next.includes(reqPerm))
      );
      if (exactMatch) {
        setNewStaffSelectedProfileId(exactMatch.id);
        setNewStaffProfileName(exactMatch.name);
      } else {
        setNewStaffSelectedProfileId('custom');
        setNewStaffProfileName(next.length === 0 ? 'Unassigned (No Access)' : 'Custom Rights Profile');
      }
      return next;
    });
  };

  const openStaffRightsEditor = (member: StaffMemberSummary) => {
    if (editingRightsStaffId === member.id) {
      setEditingRightsStaffId(null);
      return;
    }
    setEditingRightsStaffId(member.id);
    setEditStaffPermissions([...(member.permissions || [])]);
    setEditStaffProfileName(member.rightsProfileName || 'Custom Rights Profile');
    setStaffError(null);
  };

  const applyProfileToEditingStaff = (profileId: string) => {
    const prof = rightsProfiles.find((p) => p.id === profileId);
    if (!prof) return;
    setEditStaffPermissions([...prof.permissions]);
    setEditStaffProfileName(prof.name);
  };

  const toggleEditingStaffPermission = (perm: StaffPermission) => {
    setEditStaffPermissions((prev) => {
      const next = prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm];
      const exactMatch = rightsProfiles.find(
        (p) =>
          p.permissions.length === next.length &&
          p.permissions.every((reqPerm) => next.includes(reqPerm))
      );
      setEditStaffProfileName(
        exactMatch
          ? exactMatch.name
          : next.length === 0
          ? 'Unassigned (No Access)'
          : 'Custom Rights Profile'
      );
      return next;
    });
  };

  const handleSaveStaffRights = async (member: StaffMemberSummary) => {
    if (!authToken || !isSuperuser) return;
    setStaffError(null);
    setStaffNotice(null);
    setIsSavingStaffRights(true);
    try {
      const res = await updateStaffAccountApi(authToken, member.id, {
        permissions: editStaffPermissions,
        rightsProfileName: editStaffProfileName.trim() || undefined,
      });
      setStaffList((prev) => prev.map((s) => (s.id === member.id ? res.staff : s)));
      setEditingRightsStaffId(null);
      setStaffNotice(
        `Assigned rights profile "${res.staff.rightsProfileName}" (${res.staff.permissions.length} rights) to @${res.staff.username}.`
      );
    } catch (err: unknown) {
      setStaffError(err instanceof Error ? err.message : 'Failed to save user rights.');
    } finally {
      setIsSavingStaffRights(false);
    }
  };

  const handleCreateCustomProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken || !isSuperuser) return;
    setStaffError(null);
    setStaffNotice(null);
    setIsSavingProfile(true);
    try {
      const res = await createRightsProfileApi(authToken, {
        name: customProfileName,
        description: customProfileDesc,
        permissions: customProfilePerms,
      });
      setRightsProfiles((prev) => [...prev, res.profile]);
      setCustomProfileName('');
      setCustomProfileDesc('');
      setCustomProfilePerms(['view_stock_alarms']);
      setShowNewProfileBuilder(false);
      setStaffNotice(`Created reusable user rights profile "${res.profile.name}".`);
    } catch (err: unknown) {
      setStaffError(err instanceof Error ? err.message : 'Failed to save rights profile.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleDeleteCustomProfile = async (profile: RightsProfileDefinition) => {
    if (!authToken || !isSuperuser || profile.builtIn) return;
    setStaffError(null);
    try {
      await deleteRightsProfileApi(authToken, profile.id);
      setRightsProfiles((prev) => prev.filter((p) => p.id !== profile.id));
      setStaffNotice(`Removed custom rights profile "${profile.name}".`);
    } catch (err: unknown) {
      setStaffError(err instanceof Error ? err.message : 'Failed to delete profile.');
    }
  };

  const handleCreateStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken || !isSuperuser) return;
    setStaffError(null);
    setStaffNotice(null);
    setIsCreatingStaff(true);
    try {
      const res = await createStaffAccountApi(authToken, {
        fullName: newStaffFullName,
        username: newStaffUsername,
        email: newStaffEmail,
        password: newStaffPassword,
        permissions: newStaffPermissions,
        rightsProfileName: newStaffProfileName,
      });
      setStaffList((prev) => [res.staff, ...prev]);
      setNewStaffFullName('');
      setNewStaffUsername('');
      setNewStaffEmail('');
      setNewStaffPassword('');
      setStaffNotice(
        `Staff account @${res.staff.username} created with profile "${res.staff.rightsProfileName}" (${res.staff.permissions.length} rights).`
      );
    } catch (err: unknown) {
      setStaffError(err instanceof Error ? err.message : 'Failed to create staff account.');
    } finally {
      setIsCreatingStaff(false);
    }
  };

  const handleToggleStaffActive = async (member: StaffMemberSummary) => {
    if (!authToken || !isSuperuser) return;
    setStaffError(null);
    try {
      const res = await updateStaffAccountApi(authToken, member.id, { active: !member.active });
      setStaffList((prev) => prev.map((s) => (s.id === member.id ? res.staff : s)));
      setStaffNotice(
        `Staff account @${res.staff.username} is now ${res.staff.active ? 'Active' : 'Suspended'}.`
      );
    } catch (err: unknown) {
      setStaffError(err instanceof Error ? err.message : 'Failed to update staff status.');
    }
  };

  const handleDeleteStaffMember = async (staffId: string) => {
    if (!authToken || !isSuperuser) return;
    setStaffError(null);
    try {
      await deleteStaffAccountApi(authToken, staffId);
      setStaffList((prev) => prev.filter((s) => s.id !== staffId));
      setConfirmDeleteStaffId(null);
      if (editingRightsStaffId === staffId) setEditingRightsStaffId(null);
      setStaffNotice('Staff account permanently removed.');
    } catch (err: unknown) {
      setStaffError(err instanceof Error ? err.message : 'Failed to delete staff account.');
    }
  };

  // Stock & Alarm Metrics
  const totalUnits = products.reduce((acc, p) => acc + p.inventoryQuantity, 0);
  const breachedProducts = products.filter((p) => {
    const h = evaluateProductStockHealth(p);
    return h.state !== 'OPTIMAL';
  });
  const unacknowledgedAlarms = stockAlarms.filter((a) => !a.acknowledged);
  const totalValuation = products.reduce((acc, p) => acc + p.price * p.inventoryQuantity, 0);

  // Order Dispatch Metrics
  const pendingOrdersCount = orders.filter(
    (o) => o.status === 'Confirmed' || o.status === 'Preparing Shipment'
  ).length;
  const dispatchedOrdersCount = orders.filter((o) => o.status === 'Dispatched').length;
  const deliveredOrdersCount = orders.filter((o) => o.status === 'Delivered').length;

  // Filtered Products for Stock Management
  const filteredStockList = products.filter((p) => {
    const matchesSearch =
      p.title.toLowerCase().includes(stockSearch.toLowerCase()) ||
      p.category.toLowerCase().includes(stockSearch.toLowerCase()) ||
      p.discipline.toLowerCase().includes(stockSearch.toLowerCase());

    const matchesCategory = selectedCategoryFilter === 'all' || p.category === selectedCategoryFilter;
    const health = evaluateProductStockHealth(p);

    let matchesStatus = true;
    if (stockStatusFilter === 'below_floor') matchesStatus = health.state === 'BELOW_FLOOR' || health.state === 'OUT_OF_STOCK';
    if (stockStatusFilter === 'above_ceiling') matchesStatus = health.state === 'ABOVE_CEILING';
    if (stockStatusFilter === 'out') matchesStatus = health.state === 'OUT_OF_STOCK';
    if (stockStatusFilter === 'ok') matchesStatus = health.state === 'OPTIMAL';

    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Dynamic categories aggregated from predefined suggestions + live products
  const availableCategories = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const c of PREDEFINED_PRODUCT_CATEGORIES) {
      const clean = c.trim();
      if (clean && !seen.has(clean.toLowerCase())) {
        seen.add(clean.toLowerCase());
        list.push(clean);
      }
    }
    const extra: string[] = [];
    for (const p of products) {
      const clean = (p.category || '').trim();
      if (clean && !seen.has(clean.toLowerCase())) {
        seen.add(clean.toLowerCase());
        extra.push(clean);
      }
    }
    extra.sort((a, b) => a.localeCompare(b));
    return [...list, ...extra];
  }, [products]);

  const inUseCategories = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const p of products) {
      const clean = (p.category || '').trim();
      if (clean && !seen.has(clean.toLowerCase())) {
        seen.add(clean.toLowerCase());
        list.push(clean);
      }
    }
    return list;
  }, [products]);

  // Filtered Products for Inventory List View
  const filteredInventoryList = products.filter((p) => {
    const q = inventorySearch.trim().toLowerCase();
    const matchesSearch =
      !q ||
      p.title.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.discipline.toLowerCase().includes(q) ||
      p.colors.some((c) => c.name.toLowerCase().includes(q));
    const matchesCategory =
      inventoryCategoryFilter === 'all' ||
      p.category.toLowerCase() === inventoryCategoryFilter.toLowerCase();
    return matchesSearch && matchesCategory;
  });

  // Filtered Orders for Dispatch Tab
  const filteredDispatchOrders = orders.filter((o) => {
    const matchesStatus = dispatchFilter === 'All' || o.status === dispatchFilter;
    const q = dispatchSearch.trim().toLowerCase();
    const matchesQuery =
      !q ||
      o.orderNumber.toLowerCase().includes(q) ||
      o.items.some((i) => i.title.toLowerCase().includes(q));
    return matchesStatus && matchesQuery;
  });

  const getDraftForProduct = (p: Product) =>
    stockDrafts[p.id] || {
      stockBySize: getEffectiveStockMap(p),
      floor: getProductFloor(p),
      ceiling: getProductCeiling(p),
    };

  const handleDraftSizeChange = (product: Product, size: GarmentSize, value: number) => {
    const clamped = Math.max(0, Math.min(100000, Math.floor(Number.isNaN(value) ? 0 : value)));
    setStockDrafts((prev) => {
      const current = prev[product.id] || {
        stockBySize: getEffectiveStockMap(product),
        floor: getProductFloor(product),
        ceiling: getProductCeiling(product),
      };
      return {
        ...prev,
        [product.id]: {
          ...current,
          stockBySize: {
            ...current.stockBySize,
            [size]: clamped,
          },
        },
      };
    });
  };

  const handleDraftThresholdChange = (
    product: Product,
    field: 'floor' | 'ceiling',
    value: number
  ) => {
    const clamped = Math.max(0, Math.min(1000000, Math.floor(Number.isNaN(value) ? 0 : value)));
    setStockDrafts((prev) => {
      const current = prev[product.id] || {
        stockBySize: getEffectiveStockMap(product),
        floor: getProductFloor(product),
        ceiling: getProductCeiling(product),
      };
      return {
        ...prev,
        [product.id]: {
          ...current,
          [field]: clamped,
        },
      };
    });
  };

  const handleSaveRowStockAndThresholds = async (product: Product) => {
    const draft = getDraftForProduct(product);
    const safeFloor = Math.max(0, draft.floor);
    const safeCeiling = Math.max(Math.max(1, safeFloor), draft.ceiling);

    setSavingStockId(product.id);
    try {
      await onUpdateProductVariantsAndStock(product, {
        stockBySize: draft.stockBySize,
        stockFloor: safeFloor,
        stockCeiling: safeCeiling,
      });
    } finally {
      setSavingStockId(null);
    }
  };

  const handleTriggerManualAlarm = async (product: Product) => {
    const health = evaluateProductStockHealth(product);
    const alarmType: StockAlarmType =
      health.totalStock === 0
        ? 'OUT_OF_STOCK'
        : health.totalStock >= health.ceiling
        ? 'ABOVE_CEILING'
        : 'BELOW_FLOOR';
    const threshold =
      alarmType === 'ABOVE_CEILING' ? health.ceiling : health.floor;
    const message =
      alarmType === 'OUT_OF_STOCK'
        ? `MANUAL ALARM: ${product.title} has 0 units available across all sizes (Floor: ${health.floor}).`
        : alarmType === 'ABOVE_CEILING'
        ? `MANUAL CEILING ALARM: ${product.title} at ${health.totalStock} units vs Ceiling limit of ${health.ceiling}.`
        : `MANUAL FLOOR ALARM: ${product.title} at ${health.totalStock} units (Floor: ${health.floor}${
            health.emptySizes.length > 0 ? `, Out sizes: ${health.emptySizes.join(', ')}` : ''
          }).`;

    setSendingAlarmId(product.id);
    try {
      await onSendStockAlarm({
        productId: product.id,
        productTitle: product.title,
        alarmType,
        triggerScope: 'total',
        currentQuantity: health.totalStock,
        threshold,
        recipientEmail: alarmRecipientEmail.trim() || adminEmail || 'blujay1809@gmail.com',
        message,
      });
    } finally {
      setSendingAlarmId(null);
    }
  };

  // Variant Editor handlers
  const openProductVariantEditor = (product: Product) => {
    setEditingProduct(product);
    setEditCategory(product.category || 'Tops');
    setEditSizingType(inferSizingTypeFromProduct(product));
    setEditSizes([...product.sizes]);
    setEditCustomSizeInput('');
    setEditStockBySize(getEffectiveStockMap(product));
    setEditColors([...product.colors]);
    setEditFloor(getProductFloor(product));
    setEditCeiling(getProductCeiling(product));
    setEditColorName('');
    setEditColorHex('#CCFF00');
    setEditFormError(null);
  };

  const handleSelectEditSizingType = (nextType: SizingType) => {
    setEditSizingType(nextType);
    const preset = getSizingTypePreset(nextType);
    if (nextType !== 'custom' && preset.defaultSelectedSizes.length > 0) {
      const nextSizes = [...preset.defaultSelectedSizes];
      setEditSizes(nextSizes);
      setEditStockBySize((prev) => {
        const nextMap = { ...prev };
        for (const sz of nextSizes) {
          if (typeof nextMap[sz] !== 'number') {
            nextMap[sz] = nextType === 'accessories_one_size' ? 12 : 5;
          }
        }
        return nextMap;
      });
    } else if (editSizes.length === 0) {
      setEditSizes(['STD']);
      setEditStockBySize((prev) => ({ ...prev, STD: prev.STD ?? 5 }));
    }
  };

  const toggleEditSize = (sz: GarmentSize) => {
    if (editSizes.includes(sz)) {
      if (editSizes.length > 1) {
        setEditSizes(editSizes.filter((s) => s !== sz));
      }
    } else if (editSizes.length < 10) {
      setEditSizes([...editSizes, sz]);
      setEditStockBySize((prev) => ({
        ...prev,
        [sz]: prev[sz] ?? 5,
      }));
    }
  };

  const handleAddEditCustomSize = () => {
    const clean = editCustomSizeInput.trim().slice(0, 20);
    if (!clean || editSizes.length >= 10) return;
    if (editSizes.some((s) => s.toLowerCase() === clean.toLowerCase())) {
      setEditCustomSizeInput('');
      return;
    }
    setEditSizes([...editSizes, clean]);
    setEditStockBySize((prev) => ({ ...prev, [clean]: prev[clean] ?? 5 }));
    setEditCustomSizeInput('');
  };

  const handleAddEditColor = () => {
    const cleanName = editColorName.trim();
    if (!cleanName || editColors.length >= 6) return;
    if (editColors.some((c) => c.name.toLowerCase() === cleanName.toLowerCase())) return;
    setEditColors([...editColors, { name: cleanName.slice(0, 60), hex: editColorHex }]);
    setEditColorName('');
  };

  const handleSaveVariantEditor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    const safeCategory = editCategory.trim().slice(0, 60);
    if (safeCategory.length < 2) {
      setEditFormError('Category must be at least 2 characters.');
      return;
    }
    setEditFormError(null);
    setIsSavingEdit(true);
    try {
      const safeFloor = Math.max(0, editFloor);
      const safeCeiling = Math.max(Math.max(1, safeFloor), editCeiling);
      await onUpdateProductVariantsAndStock(editingProduct, {
        category: safeCategory,
        sizingType: editSizingType,
        sizes: editSizes,
        colors: editColors.length > 0 ? editColors : [{ name: 'Pitch Carbon', hex: '#0F1115' }],
        stockBySize: editStockBySize,
        stockFloor: safeFloor,
        stockCeiling: safeCeiling,
      });
      setEditingProduct(null);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // New Product Creator helpers
  const applyNewSizingPreset = (nextType: SizingType, markManual = true) => {
    setNewSizingType(nextType);
    if (markManual) setSizingManuallyChanged(true);
    const preset = getSizingTypePreset(nextType);
    if (nextType !== 'custom' && preset.defaultSelectedSizes.length > 0) {
      const nextSizes = [...preset.defaultSelectedSizes];
      setNewSizes(nextSizes);
      setNewStockBySize((prev) => {
        const nextMap = { ...prev };
        for (const sz of nextSizes) {
          if (typeof nextMap[sz] !== 'number') {
            nextMap[sz] = nextType === 'accessories_one_size' ? 12 : 6;
          }
        }
        return nextMap;
      });
    } else if (newSizes.length === 0) {
      setNewSizes(['STD']);
      setNewStockBySize((prev) => ({ ...prev, STD: prev.STD ?? 6 }));
    }
  };

  const handleNewCategoryChange = (nextCategoryValue: string, autoSyncSizing = true) => {
    setNewCategory(nextCategoryValue);
    setNewFormError(null);
    if (autoSyncSizing && !sizingManuallyChanged) {
      const suggested = suggestSizingTypeForCategory(nextCategoryValue);
      if (suggested !== newSizingType) {
        applyNewSizingPreset(suggested, false);
      }
    }
  };

  const toggleNewSize = (size: GarmentSize) => {
    if (newSizes.includes(size)) {
      if (newSizes.length > 1) {
        setNewSizes(newSizes.filter((s) => s !== size));
      }
    } else if (newSizes.length < 10) {
      setNewSizes([...newSizes, size]);
      setNewStockBySize((prev) => ({ ...prev, [size]: prev[size] ?? 6 }));
    }
  };

  const handleAddNewCustomSize = () => {
    const clean = newCustomSizeInput.trim().slice(0, 20);
    if (!clean || newSizes.length >= 10) return;
    if (newSizes.some((s) => s.toLowerCase() === clean.toLowerCase())) {
      setNewCustomSizeInput('');
      return;
    }
    setNewSizes([...newSizes, clean]);
    setNewStockBySize((prev) => ({ ...prev, [clean]: prev[clean] ?? 6 }));
    setNewCustomSizeInput('');
  };

  const handleAddNewColor = () => {
    const cleanName = newColorInputName.trim();
    if (!cleanName || newColors.length >= 6) return;
    if (newColors.some((c) => c.name.toLowerCase() === cleanName.toLowerCase())) return;
    setNewColors([...newColors, { name: cleanName.slice(0, 60), hex: newColorInputHex }]);
    setNewColorInputName('');
  };

  const computedNewTotalStock = getTotalFromStockMap(newSizes, newStockBySize);

  const handleCreateProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const safeCategory = newCategory.trim().slice(0, 60);
    if (safeCategory.length < 2) {
      setNewFormError('Please provide a category name (at least 2 characters).');
      return;
    }
    setNewFormError(null);

    const cleanSizeStock: Partial<Record<GarmentSize, number>> = {};
    for (const sz of newSizes) {
      cleanSizeStock[sz] = Math.max(0, Math.floor(Number(newStockBySize[sz] ?? 0)));
    }
    const totalQty = getTotalFromStockMap(newSizes, cleanSizeStock);
    const safeFloor = Math.max(0, Math.floor(Number(newStockFloor) || 0));
    const safeCeiling = Math.max(Math.max(1, safeFloor), Math.floor(Number(newStockCeiling) || 80));

    await onCreateProduct({
      title: newTitle.trim(),
      tagline: newTagline.trim() || 'Minimalist Performance Apparel',
      description: newDescription.trim() || 'Engineered for relentless competition with bonded seams.',
      price: Number(newPrice) || 120,
      compareAtPrice: newComparePrice ? Number(newComparePrice) : undefined,
      currency: 'USD',
      category: safeCategory,
      sizingType: newSizingType,
      discipline: newDiscipline,
      image: newImage,
      detailImage: '/src/assets/images/craft_technical_fabric_1793037647097.jpg',
      sizes: newSizes,
      colors: newColors.length > 0 ? newColors : [{ name: 'Pitch Carbon', hex: '#0F1115' }],
      inStock: totalQty > 0,
      inventoryQuantity: totalQty,
      stockBySize: cleanSizeStock,
      stockFloor: safeFloor,
      stockCeiling: safeCeiling,
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

    setNewTitle('');
    setNewTagline('');
    setNewDescription('');
    setNewCategory('Tops');
    setNewSizingType('apparel_alpha');
    setSizingManuallyChanged(false);
    setNewSizes(['XS', 'S', 'M', 'L', 'XL']);
    setNewCustomSizeInput('');
    setIsCreatingProduct(false);
  };

  const getDispatchDraft = (order: CustomerOrderRecord) =>
    dispatchDrafts[order.orderNumber] || {
      courier:
        order.dispatchCourier ||
        (order.shippingMethod === 'express'
          ? 'DHL Express Athlete Priority'
          : 'Carbon-Neutral Ground Fleet'),
      trackingNumber:
        order.trackingNumber || `DHL-EXP-${order.orderNumber.replace('OF-', '')}902-INT`,
      notes: order.dispatchNotes || '',
      deductStock: !order.stockDeducted,
    };

  const updateDispatchDraft = (
    order: CustomerOrderRecord,
    patch: Partial<{ courier: string; trackingNumber: string; notes: string; deductStock: boolean }>
  ) => {
    const current = getDispatchDraft(order);
    setDispatchDrafts((prev) => ({
      ...prev,
      [order.orderNumber]: { ...current, ...patch },
    }));
  };

  const handleDispatchAction = async (order: CustomerOrderRecord, nextStatus: OrderStatus) => {
    const draft = getDispatchDraft(order);
    setDispatchingOrderNum(order.orderNumber);
    try {
      await onDispatchOrder({
        order,
        nextStatus,
        courier: draft.courier,
        trackingNumber: draft.trackingNumber,
        dispatchNotes: draft.notes,
        deductStock: draft.deductStock,
      });
    } finally {
      setDispatchingOrderNum(null);
    }
  };

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

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-5">
      <div
        className="relative bg-[#0b0d12] border border-[#232936] w-full max-w-7xl h-[92vh] max-h-[94vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Admin Bar Header */}
        <div className="px-6 py-4 bg-[#10141c] border-b border-[#1d2330] flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#18202d] border border-[#2c374b] flex items-center justify-center text-[#ccff00]">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-white uppercase tracking-tight">
                  Offside HQ Operations Console
                </h2>
                <span className="text-[10px] font-mono bg-[#162111] text-[#ccff00] border border-[#ccff00]/40 px-1.5 py-0.5 uppercase font-bold">
                  {isSuperuser
                    ? `Superuser · @${sessionAccount?.username}`
                    : sessionAccount?.role === 'staff'
                    ? `Staff · @${sessionAccount.username} · ${
                        sessionAccount.rightsProfileName || 'Custom Profile'
                      }`
                    : 'Authorized Session'}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                {sessionAccount?.role === 'staff'
                  ? `Active Rights (${sessionAccount.permissions.length}/${ALL_STAFF_PERMISSIONS.length}): ${
                      sessionAccount.permissions.map(permissionLabel).join(' · ') || 'None Assigned'
                    }`
                  : `Inventory · Floor/Ceiling Alarms · Order Dispatch Hub · ${
                      isSuperuser ? 'Staff & User Rights Profiles · ' : ''
                    }Integrations`}
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

        {/* Main Workspace Split: Left Navigation Tabs + Right Content Pane */}
        <div className="flex flex-col sm:flex-row flex-1 min-h-0 overflow-hidden">
          {/* Left Tab Navigation (Dynamically filtered by employee User Rights Profile) */}
          <aside
            aria-label="Operations Console Navigation"
            className="w-full sm:w-56 md:w-64 lg:w-72 shrink-0 border-b sm:border-b-0 sm:border-r border-[#1d2330] bg-[#0d1017] p-3 flex flex-row sm:flex-col gap-1.5 overflow-x-auto sm:overflow-y-auto text-xs font-medium"
          >
            <span className="hidden sm:block px-3 pt-1 pb-2 text-[10px] font-mono uppercase tracking-widest text-slate-500 border-b border-[#191f2c] mb-1">
              Operations Modules
            </span>

            {canViewStock && (
              <button
                onClick={() => setActiveTab('stock')}
                className={`w-auto sm:w-full py-3 px-3.5 border-l-2 uppercase tracking-wider flex items-center justify-between gap-2 transition-colors cursor-pointer shrink-0 text-left ${
                  activeTab === 'stock'
                    ? 'border-[#ccff00] text-white font-bold bg-[#141925]'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#111520]'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Package className="w-4 h-4 text-[#ccff00] shrink-0" />
                  <span className="truncate">Stock &amp; Alarms ({products.length})</span>
                </span>
                {(breachedProducts.length > 0 || unacknowledgedAlarms.length > 0) && (
                  <span className="bg-amber-950 text-amber-300 border border-amber-600/40 px-1.5 py-0.5 text-[10px] font-mono font-bold flex items-center gap-1 shrink-0">
                    <BellRing className="w-3 h-3" />
                    {breachedProducts.length}
                  </span>
                )}
              </button>
            )}

            {canManageCatalog && (
              <button
                onClick={() => setActiveTab('products')}
                className={`w-auto sm:w-full py-3 px-3.5 border-l-2 uppercase tracking-wider flex items-center justify-between gap-2 transition-colors cursor-pointer shrink-0 text-left ${
                  activeTab === 'products'
                    ? 'border-[#ccff00] text-white font-bold bg-[#141925]'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#111520]'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Layers className="w-4 h-4 text-[#ccff00] shrink-0" />
                  <span className="truncate">Inventory ({products.length})</span>
                </span>
              </button>
            )}

            {canViewDispatch && (
              <button
                onClick={() => setActiveTab('dispatch')}
                className={`w-auto sm:w-full py-3 px-3.5 border-l-2 uppercase tracking-wider flex items-center justify-between gap-2 transition-colors cursor-pointer shrink-0 text-left ${
                  activeTab === 'dispatch'
                    ? 'border-[#ccff00] text-white font-bold bg-[#141925]'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#111520]'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Truck className="w-4 h-4 text-[#ccff00] shrink-0" />
                  <span className="truncate">Order Dispatch ({orders.length})</span>
                </span>
                {pendingOrdersCount > 0 && (
                  <span className="bg-[#1b2712] text-[#ccff00] border border-[#ccff00]/40 px-1.5 py-0.5 text-[10px] font-mono font-bold shrink-0">
                    {pendingOrdersCount}
                  </span>
                )}
              </button>
            )}

            {isSuperuser && (
              <button
                onClick={() => setActiveTab('staff')}
                className={`w-auto sm:w-full py-3 px-3.5 border-l-2 uppercase tracking-wider flex items-center justify-between gap-2 transition-colors cursor-pointer shrink-0 text-left ${
                  activeTab === 'staff'
                    ? 'border-[#ccff00] text-white font-bold bg-[#141925]'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#111520]'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Users className="w-4 h-4 text-[#ccff00] shrink-0" />
                  <span className="truncate">Staff &amp; Rights ({staffList.length})</span>
                </span>
              </button>
            )}

            {canManageIntegrations && (
              <button
                onClick={() => setActiveTab('integrations')}
                className={`w-auto sm:w-full py-3 px-3.5 border-l-2 uppercase tracking-wider flex items-center gap-2.5 transition-colors cursor-pointer shrink-0 text-left ${
                  activeTab === 'integrations'
                    ? 'border-[#ccff00] text-white font-bold bg-[#141925]'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#111520]'
                }`}
              >
                <Database className="w-4 h-4 text-[#ccff00] shrink-0" />
                <span className="truncate">Integrations</span>
              </button>
            )}
          </aside>

          {/* Right Tab Body */}
          <div className="p-6 overflow-y-auto flex-1 min-w-0">
          {/* ================= TAB 1: PER-SIZE STOCK MANAGEMENT & ALARMS ================= */}
          {activeTab === 'stock' && canViewStock && (
            <div className="space-y-6">
              {!canEditStock && (
                <div className="p-3 bg-[#121620] border border-amber-500/40 text-amber-200 text-xs font-mono flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    Read-Only Audit Mode: Your rights profile ({sessionAccount?.rightsProfileName}) permits viewing stock levels and alarms without modifying quantities or thresholds.
                  </span>
                </div>
              )}
              {/* Summary KPI Strips */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                <div className="p-4 bg-[#121620] border border-[#212735]">
                  <span className="text-[11px] uppercase font-mono text-slate-400 block mb-1">
                    Total Warehouse Units
                  </span>
                  <span className="text-2xl font-bold font-mono text-white tabular-nums">
                    {totalUnits}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    Summed across all sizes
                  </span>
                </div>

                <div className="p-4 bg-[#121620] border border-[#212735]">
                  <span className="text-[11px] uppercase font-mono text-slate-400 block mb-1">
                    Threshold Breaches
                  </span>
                  <span
                    className={`text-2xl font-bold font-mono tabular-nums ${
                      breachedProducts.length > 0 ? 'text-amber-300' : 'text-[#ccff00]'
                    }`}
                  >
                    {breachedProducts.length}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    Floor or Ceiling exceeded
                  </span>
                </div>

                <div className="p-4 bg-[#121620] border border-[#212735]">
                  <span className="text-[11px] uppercase font-mono text-amber-400 block mb-1 flex items-center gap-1">
                    <Bell className="w-3 h-3 text-amber-400" />
                    Active Stock Alarms
                  </span>
                  <span className="text-2xl font-bold font-mono text-amber-300 tabular-nums">
                    {unacknowledgedAlarms.length}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    {stockAlarms.length} total alarm logs
                  </span>
                </div>

                <div className="p-4 bg-[#121620] border border-[#212735]">
                  <span className="text-[11px] uppercase font-mono text-[#ccff00] block mb-1">
                    Inventory Valuation
                  </span>
                  <span className="text-2xl font-bold font-mono text-[#ccff00] tabular-nums">
                    ${totalValuation.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    Retail value equivalent
                  </span>
                </div>
              </div>

              {/* Floor / Ceiling Stock Alarm Center */}
              <div className="p-4 bg-[#11141d] border border-[#252d3e] space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <BellRing className="w-4 h-4 text-amber-400 shrink-0" />
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                        Stock Floor &amp; Ceiling Alarm Dispatch Center
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Automatic &amp; manual alerts fire when stock crosses your configured Floor or Ceiling limits.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400 font-mono text-[11px] shrink-0">Alarm Target:</span>
                    <input
                      type="email"
                      value={alarmRecipientEmail}
                      onChange={(e) => setAlarmRecipientEmail(e.target.value)}
                      className="bg-[#161a24] border border-[#283142] text-white px-2.5 py-1 text-xs font-mono focus:outline-none focus:border-[#ccff00] w-52"
                      placeholder="ops-alerts@offside.com"
                    />
                  </div>
                </div>

                {stockAlarms.length === 0 && breachedProducts.length === 0 ? (
                  <div className="p-3 bg-[#0e1218] border border-[#1d2432] text-xs font-mono text-slate-400 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-[#ccff00]" />
                    <span>All warehouse SKUs are within Floor and Ceiling bounds. No active alarms.</span>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {stockAlarms.slice(0, 8).map((alarm) => (
                      <div
                        key={alarm.id}
                        className={`p-2.5 border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
                          alarm.acknowledged
                            ? 'bg-[#0e1118] border-[#1d2330] opacity-70'
                            : alarm.alarmType === 'OUT_OF_STOCK'
                            ? 'bg-rose-950/30 border-rose-700/50'
                            : alarm.alarmType === 'ABOVE_CEILING'
                            ? 'bg-sky-950/30 border-sky-700/50'
                            : 'bg-amber-950/30 border-amber-700/50'
                        }`}
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 font-mono">
                            <span
                              className={`text-[10px] px-1.5 py-0.5 font-bold uppercase ${
                                alarm.alarmType === 'OUT_OF_STOCK'
                                  ? 'bg-rose-900/70 text-rose-200'
                                  : alarm.alarmType === 'ABOVE_CEILING'
                                  ? 'bg-sky-900/70 text-sky-200'
                                  : 'bg-amber-900/70 text-amber-200'
                              }`}
                            >
                              {alarm.alarmType.replace(/_/g, ' ')}
                            </span>
                            <span className="text-white font-sans font-semibold text-xs">
                              {alarm.productTitle}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              → Notified: {alarm.recipientEmail}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-300">{alarm.message}</p>
                        </div>

                        {canEditStock && (
                          <div className="flex items-center gap-2 shrink-0 font-mono">
                            {!alarm.acknowledged ? (
                              <button
                                type="button"
                                onClick={() => onAcknowledgeAlarm(alarm.id)}
                                className="px-2.5 py-1 bg-[#1b2414] hover:bg-[#27351b] text-[#ccff00] border border-[#ccff00]/40 text-[11px] uppercase font-bold cursor-pointer"
                              >
                                Acknowledge
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-400 uppercase px-2">
                                Acknowledged
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => onDeleteAlarm(alarm.id)}
                              className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer"
                              title="Remove alarm"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Toolbar */}
              <div className="p-4 bg-[#11141c] border border-[#1f2533] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
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
                    <option value="below_floor">Below Floor / Low</option>
                    <option value="above_ceiling">Above Ceiling</option>
                    <option value="ok">Within Floor–Ceiling Range</option>
                    <option value="out">Out of Stock (0)</option>
                  </select>

                  <select
                    value={selectedCategoryFilter}
                    onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                    className="bg-[#161a24] border border-[#262e3e] text-xs text-white px-2.5 py-1.5 focus:outline-none focus:border-[#ccff00]"
                  >
                    <option value="all">All Categories</option>
                    {availableCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                {(canEditStock || canManageCatalog) && (
                  <div className="flex items-center gap-2 shrink-0">
                    {canEditStock && (
                      <button
                        onClick={() => onBatchRestock(20)}
                        className="px-4 py-2 bg-[#1b2230] hover:bg-[#252f44] text-[#ccff00] border border-[#ccff00]/30 hover:border-[#ccff00] text-xs font-mono font-semibold uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Restock Below-Floor (+20)</span>
                      </button>
                    )}

                    {canManageCatalog && (
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
                    )}
                  </div>
                )}
              </div>

              {/* Per-Size Inventory & Threshold Control Cards */}
              <div className="space-y-3">
                {filteredStockList.length === 0 ? (
                  <div className="p-8 border border-[#1e2432] bg-[#0e1117] text-center text-slate-500 font-mono text-xs">
                    No inventory matches the active stock filters.
                  </div>
                ) : (
                  filteredStockList.map((prod) => {
                    const draft = getDraftForProduct(prod);
                    const draftTotal = getTotalFromStockMap(prod.sizes, draft.stockBySize);
                    const isBelowFloor = draftTotal > 0 && draftTotal <= draft.floor;
                    const isOut = draftTotal === 0;
                    const isAboveCeiling = draftTotal >= draft.ceiling;
                    const isSavingRow = savingStockId === prod.id;
                    const isSendingAlarm = sendingAlarmId === prod.id;

                    return (
                      <div
                        key={prod.id}
                        className="p-4 bg-[#0e1117] border border-[#1f2636] hover:border-[#2e384f] transition-colors space-y-4"
                      >
                        {/* Row Top: Product Summary & Status & Actions */}
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <img
                              src={prod.image}
                              alt={prod.title}
                              referrerPolicy="no-referrer"
                              className="w-12 h-12 object-cover bg-[#161a24] border border-[#242c3c] shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="text-white font-bold text-sm truncate">
                                  {prod.title}
                                </h4>
                                {isOut ? (
                                  <span className="bg-rose-950/80 text-rose-300 border border-rose-700/50 px-2 py-0.5 text-[10px] uppercase font-mono font-bold">
                                    Out of Stock
                                  </span>
                                ) : isBelowFloor ? (
                                  <span className="bg-amber-950/80 text-amber-300 border border-amber-600/50 px-2 py-0.5 text-[10px] uppercase font-mono font-bold">
                                    Below Floor Alarm ({draftTotal} ≤ {draft.floor})
                                  </span>
                                ) : isAboveCeiling ? (
                                  <span className="bg-sky-950/80 text-sky-300 border border-sky-600/50 px-2 py-0.5 text-[10px] uppercase font-mono font-bold">
                                    Above Ceiling ({draftTotal} ≥ {draft.ceiling})
                                  </span>
                                ) : (
                                  <span className="bg-[#142310] text-[#ccff00] border border-[#ccff00]/40 px-2 py-0.5 text-[10px] uppercase font-mono font-bold">
                                    Healthy ({draftTotal} units)
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-400 mt-1">
                                <span>{prod.category}</span>
                                <span>·</span>
                                <span>${prod.price}</span>
                                <span>·</span>
                                <span className="inline-flex items-center gap-1">
                                  {prod.colors.map((c) => (
                                    <span
                                      key={c.name}
                                      title={c.name}
                                      className="w-2.5 h-2.5 rounded-full border border-white/25 inline-block"
                                      style={{ backgroundColor: c.hex }}
                                    />
                                  ))}
                                  <span>{prod.colors.map((c) => c.name).join(', ')}</span>
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            {canEditStock && (
                              <button
                                type="button"
                                onClick={() => handleTriggerManualAlarm(prod)}
                                disabled={isSendingAlarm}
                                className="px-3 py-1.5 bg-[#231910] hover:bg-[#352414] text-amber-300 border border-amber-600/40 text-xs font-mono uppercase flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                              >
                                <BellRing className="w-3.5 h-3.5" />
                                <span>{isSendingAlarm ? 'Sending...' : 'Send Alarm'}</span>
                              </button>
                            )}

                            {canManageCatalog && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab('products');
                                  openProductVariantEditor(prod);
                                }}
                                className="px-3 py-1.5 bg-[#151a24] hover:bg-[#1e2534] text-slate-200 border border-[#2a3346] text-xs font-mono uppercase flex items-center gap-1.5 cursor-pointer"
                              >
                                <Edit className="w-3.5 h-3.5" />
                                <span>Variants</span>
                              </button>
                            )}

                            {canEditStock && (
                              <button
                                type="button"
                                onClick={() => handleSaveRowStockAndThresholds(prod)}
                                disabled={isSavingRow}
                                className="px-4 py-1.5 bg-[#ccff00] hover:bg-[#b8e600] text-black font-bold text-xs font-mono uppercase flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>{isSavingRow ? 'Saving...' : 'Save Stock'}</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Row Bottom: Per-Size Stock Grid + Floor / Ceiling Threshold Inputs */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-3 border-t border-[#181d29]">
                          {/* Size Breakdown Inputs */}
                          <div className="lg:col-span-8">
                            <span className="text-[10px] font-mono uppercase text-slate-400 block mb-2">
                              Available Stock by Garment Size (Total: {draftTotal} units)
                            </span>
                            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                              {prod.sizes.map((sz) => {
                                const qty = draft.stockBySize[sz] ?? 0;
                                return (
                                  <div
                                    key={sz}
                                    className={`p-2 border font-mono ${
                                      qty === 0
                                        ? 'bg-rose-950/20 border-rose-800/40'
                                        : qty <= 2
                                        ? 'bg-amber-950/20 border-amber-700/40'
                                        : 'bg-[#131722] border-[#252d3e]'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between text-[10px] mb-1">
                                      <span className="font-bold text-white">{sz}</span>
                                      <span
                                        className={
                                          qty === 0
                                            ? 'text-rose-400'
                                            : qty <= 2
                                            ? 'text-amber-300'
                                            : 'text-[#ccff00]'
                                        }
                                      >
                                        {qty === 0 ? 'OUT' : 'OK'}
                                      </span>
                                    </div>
                                    <input
                                      type="number"
                                      min={0}
                                      max={100000}
                                      disabled={!canEditStock}
                                      value={qty}
                                      onChange={(e) =>
                                        handleDraftSizeChange(prod, sz, parseInt(e.target.value, 10))
                                      }
                                      aria-label={`${prod.title} Size ${sz} Stock`}
                                      className="w-full bg-[#0b0e14] border border-[#283142] text-white px-2 py-1 text-xs text-center font-bold focus:outline-none focus:border-[#ccff00] disabled:opacity-70"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Stock Floor & Ceiling Limits */}
                          <div className="lg:col-span-4">
                            <span className="text-[10px] font-mono uppercase text-slate-400 block mb-2">
                              Alarm Thresholds (Floor / Ceiling)
                            </span>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="p-2 bg-[#131722] border border-[#252d3e] font-mono">
                                <label className="text-[10px] text-amber-300 uppercase block mb-1">
                                  Stock Floor (Min)
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  max={100000}
                                  disabled={!canEditStock}
                                  value={draft.floor}
                                  onChange={(e) =>
                                    handleDraftThresholdChange(
                                      prod,
                                      'floor',
                                      parseInt(e.target.value, 10)
                                    )
                                  }
                                  className="w-full bg-[#0b0e14] border border-[#283142] text-white px-2 py-1 text-xs text-center font-bold focus:outline-none focus:border-amber-400 disabled:opacity-70"
                                />
                              </div>

                              <div className="p-2 bg-[#131722] border border-[#252d3e] font-mono">
                                <label className="text-[10px] text-sky-300 uppercase block mb-1">
                                  Stock Ceiling (Max)
                                </label>
                                <input
                                  type="number"
                                  min={1}
                                  max={1000000}
                                  disabled={!canEditStock}
                                  value={draft.ceiling}
                                  onChange={(e) =>
                                    handleDraftThresholdChange(
                                      prod,
                                      'ceiling',
                                      parseInt(e.target.value, 10)
                                    )
                                  }
                                  className="w-full bg-[#0b0e14] border border-[#283142] text-white px-2 py-1 text-xs text-center font-bold focus:outline-none focus:border-sky-400 disabled:opacity-70"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ================= TAB 2: INVENTORY (PRODUCTS LIST, CATEGORIES, SIZES & COLORS) ================= */}
          {activeTab === 'products' && canManageCatalog && (
            <div className="space-y-6">
              {/* Top Banner */}
              <div className="p-4 bg-[#11141c] border border-[#1f2533] flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-tight">
                    Inventory
                  </h3>
                  <p className="text-xs text-slate-400">
                    All store products displayed in list view with flexible categories, sizing type presets, color variants, and stock thresholds.
                  </p>
                </div>

                <button
                  onClick={() => {
                    setEditingProduct(null);
                    setIsCreatingProduct(!isCreatingProduct);
                  }}
                  className="px-5 py-2.5 bg-[#ccff00] hover:bg-[#b8e600] text-black font-bold uppercase tracking-wider text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  <Plus className="w-4 h-4" />
                  <span>{isCreatingProduct ? 'Close Form' : 'Add Product'}</span>
                </button>
              </div>

              {/* Existing Product Variant / Category / Sizing Type / Size / Color / Stock Editor */}
              {editingProduct && (
                <form
                  onSubmit={handleSaveVariantEditor}
                  className="p-6 bg-[#0f131c] border border-[#ccff00]/50 shadow-xl space-y-5 text-xs"
                >
                  <div className="flex items-center justify-between pb-3 border-b border-[#1f2636]">
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal className="w-4 h-4 text-[#ccff00]" />
                      <h4 className="text-sm font-bold uppercase tracking-wider text-white">
                        Edit Inventory Item — {editingProduct.title}
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingProduct(null)}
                      className="text-slate-400 hover:text-white p-1 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {editFormError && (
                    <div className="p-2.5 bg-rose-950/60 border border-rose-700/60 text-rose-200 text-xs font-mono">
                      {editFormError}
                    </div>
                  )}

                  {/* Flexible Category Classification */}
                  <div className="p-3.5 bg-[#121620] border border-[#222938] space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label
                        htmlFor="inventory-edit-category"
                        className="block text-slate-200 uppercase font-mono font-bold"
                      >
                        Product Category *
                      </label>
                      <span className="text-[11px] font-mono text-[#ccff00]">
                        Assigned: {editCategory || '—'}
                      </span>
                    </div>
                    <input
                      id="inventory-edit-category"
                      type="text"
                      required
                      minLength={2}
                      maxLength={60}
                      value={editCategory}
                      onChange={(e) => {
                        setEditCategory(e.target.value);
                        setEditFormError(null);
                      }}
                      placeholder="Type a custom category or click a preset below..."
                      className="w-full bg-[#151924] border border-[#262e3e] text-white px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#ccff00]"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {availableCategories.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => {
                            setEditCategory(cat);
                            setEditFormError(null);
                          }}
                          className={`px-3 py-1 text-[11px] font-mono font-bold uppercase border cursor-pointer transition-colors ${
                            editCategory.trim().toLowerCase() === cat.toLowerCase()
                              ? 'bg-[#ccff00] text-black border-[#ccff00]'
                              : 'bg-[#151924] text-slate-300 border-[#262e3e] hover:text-white'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sizing Type Preset & Per-Size Stock */}
                  <div className="p-3.5 bg-[#121620] border border-[#222938] space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="block text-slate-200 uppercase font-mono font-bold">
                        1. Sizing Type &amp; Preset Sizes ({editSizes.length}/10 Selected)
                      </label>
                      <span className="text-[11px] font-mono text-[#ccff00]">
                        Preset: {getSizingTypePreset(editSizingType).label}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {SIZING_TYPE_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => handleSelectEditSizingType(preset.id)}
                          className={`p-2 border text-left transition-colors cursor-pointer ${
                            editSizingType === preset.id
                              ? 'bg-[#192312] border-[#ccff00] text-white'
                              : 'bg-[#151924] border-[#262e3e] text-slate-300 hover:border-slate-500'
                          }`}
                        >
                          <div className="text-[11px] font-mono font-bold text-[#ccff00]">
                            {preset.shortLabel}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {preset.defaultSelectedSizes.join(', ')}
                          </div>
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      {Array.from(
                        new Set([
                          ...getSizingTypePreset(editSizingType).availableSizes,
                          ...editSizes,
                        ])
                      ).map((sz) => {
                        const isChecked = editSizes.includes(sz);
                        return (
                          <button
                            type="button"
                            key={sz}
                            onClick={() => toggleEditSize(sz)}
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

                    {editSizes.length < 10 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={editCustomSizeInput}
                          onChange={(e) => setEditCustomSizeInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddEditCustomSize();
                            }
                          }}
                          maxLength={20}
                          placeholder="Add custom size label (e.g. US 10.5, 42 EU, Tall L)"
                          className="flex-1 min-w-[200px] bg-[#151924] border border-[#262e3e] text-white px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-[#ccff00]"
                        />
                        <button
                          type="button"
                          onClick={handleAddEditCustomSize}
                          className="px-3 py-1.5 bg-[#1b2414] hover:bg-[#27351b] text-[#ccff00] border border-[#ccff00]/40 font-mono uppercase text-xs font-bold cursor-pointer"
                        >
                          + Add Size
                        </button>
                      </div>
                    )}

                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5 pt-1">
                      {editSizes.map((sz) => (
                        <div key={sz} className="p-2.5 bg-[#141822] border border-[#262e3e] font-mono">
                          <label className="text-[10px] text-[#ccff00] font-bold block mb-1 truncate">
                            {sz} Stock
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={100000}
                            value={editStockBySize[sz] ?? 0}
                            onChange={(e) =>
                              setEditStockBySize((prev) => ({
                                ...prev,
                                [sz]: Math.max(0, parseInt(e.target.value, 10) || 0),
                              }))
                            }
                            className="w-full bg-[#0b0d12] border border-[#2c3547] text-white px-2 py-1 text-xs text-center font-bold focus:outline-none focus:border-[#ccff00]"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Color Variants Manager */}
                  <div className="space-y-3">
                    <label className="block text-slate-300 uppercase font-mono font-bold flex items-center gap-1.5">
                      <Palette className="w-3.5 h-3.5 text-[#ccff00]" />
                      <span>2. Color Variants (Up to 6)</span>
                    </label>

                    <div className="flex flex-wrap gap-2">
                      {editColors.map((col, idx) => (
                        <div
                          key={`${col.name}-${idx}`}
                          className="flex items-center gap-2 px-3 py-1.5 bg-[#151924] border border-[#2b3447]"
                        >
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-white/30"
                            style={{ backgroundColor: col.hex }}
                          />
                          <span className="text-white font-medium">{col.name}</span>
                          <span className="text-[10px] font-mono text-slate-400">{col.hex}</span>
                          {editColors.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setEditColors(editColors.filter((_, i) => i !== idx))
                              }
                              className="text-slate-400 hover:text-rose-400 ml-1 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {editColors.length < 6 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="color"
                          value={editColorHex}
                          onChange={(e) => setEditColorHex(e.target.value)}
                          className="w-9 h-8 bg-[#151924] border border-[#283244] cursor-pointer p-0.5"
                          title="Choose colorway hex"
                        />
                        <input
                          type="text"
                          value={editColorName}
                          onChange={(e) => setEditColorName(e.target.value)}
                          placeholder="Color variant name (e.g. Alpine Frost)"
                          className="flex-1 min-w-[200px] bg-[#151924] border border-[#262e3e] text-white px-3 py-1.5 text-xs focus:outline-none focus:border-[#ccff00]"
                        />
                        <button
                          type="button"
                          onClick={handleAddEditColor}
                          className="px-3.5 py-1.5 bg-[#1b2414] hover:bg-[#27351b] text-[#ccff00] border border-[#ccff00]/40 font-mono uppercase text-xs font-bold cursor-pointer"
                        >
                          + Add Color
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Floor & Ceiling Thresholds */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-3 bg-[#141822] border border-[#262e3e] font-mono">
                      <label className="text-[10px] text-amber-300 uppercase block mb-1">
                        Stock Floor (Low Alarm Limit)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100000}
                        value={editFloor}
                        onChange={(e) => setEditFloor(Math.max(0, parseInt(e.target.value, 10) || 0))}
                        className="w-full bg-[#0b0d12] border border-[#2c3547] text-white px-3 py-1.5 text-xs font-bold"
                      />
                    </div>
                    <div className="p-3 bg-[#141822] border border-[#262e3e] font-mono">
                      <label className="text-[10px] text-sky-300 uppercase block mb-1">
                        Stock Ceiling (Overstock Limit)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={1000000}
                        value={editCeiling}
                        onChange={(e) =>
                          setEditCeiling(Math.max(1, parseInt(e.target.value, 10) || 1))
                        }
                        className="w-full bg-[#0b0d12] border border-[#2c3547] text-white px-3 py-1.5 text-xs font-bold"
                      />
                    </div>
                    <div className="p-3 bg-[#141822] border border-[#262e3e] font-mono flex flex-col justify-center">
                      <span className="text-[10px] text-slate-400 uppercase">Computed Total</span>
                      <span className="text-lg font-bold text-[#ccff00] tabular-nums">
                        {getTotalFromStockMap(editSizes, editStockBySize)} units
                      </span>
                    </div>
                  </div>

                  <div className="pt-3 flex items-center justify-end gap-3 border-t border-[#1f2636]">
                    <button
                      type="button"
                      onClick={() => setEditingProduct(null)}
                      className="px-4 py-2 border border-[#283244] text-slate-300 hover:text-white uppercase font-mono text-xs cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingEdit}
                      className="px-6 py-2 bg-[#ccff00] hover:bg-[#b8e600] text-black font-bold uppercase tracking-wider text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" />
                      <span>{isSavingEdit ? 'Saving Inventory...' : 'Save Inventory Item'}</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Product Creation Form (Collapsible) */}
              {isCreatingProduct && (
                <div className="p-6 bg-[#0f121a] border border-[#242b3b] shadow-xl">
                  <div className="flex items-center justify-between pb-3 mb-5 border-b border-[#1f2535]">
                    <div className="flex items-center gap-2">
                      <Plus className="w-4 h-4 text-[#ccff00]" />
                      <h4 className="text-sm font-bold uppercase tracking-wider text-white">
                        Add Inventory Product
                      </h4>
                    </div>
                    <span className="text-xs font-mono text-[#ccff00]">
                      Total Stock: {computedNewTotalStock} units
                    </span>
                  </div>

                  <form onSubmit={handleCreateProductSubmit} className="space-y-4 text-xs">
                    {newFormError && (
                      <div className="p-2.5 bg-rose-950/60 border border-rose-700/60 text-rose-200 text-xs font-mono">
                        {newFormError}
                      </div>
                    )}

                    {/* Product Category Classification (Preset Chips or Custom Entry) */}
                    <div className="p-3.5 bg-[#121620] border border-[#222938] space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label
                          htmlFor="inventory-new-category"
                          className="block text-slate-200 uppercase font-mono font-bold"
                        >
                          Product Category Classification *
                        </label>
                        <span className="text-[11px] font-mono text-[#ccff00]">
                          Category: {newCategory || '—'}
                        </span>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <input
                          id="inventory-new-category"
                          type="text"
                          required
                          minLength={2}
                          maxLength={60}
                          value={newCategory}
                          onChange={(e) => handleNewCategoryChange(e.target.value, true)}
                          placeholder="Enter custom category (e.g. Track Spikes, Compression) or pick below..."
                          className="flex-1 bg-[#151924] border border-[#262e3e] text-white px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#ccff00]"
                        />
                        <span className="text-[11px] text-slate-400">
                          Auto-suggests matching sizing type
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {availableCategories.map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => handleNewCategoryChange(cat, true)}
                            className={`px-3 py-1.5 border text-[11px] font-mono font-bold uppercase transition-colors cursor-pointer ${
                              newCategory.trim().toLowerCase() === cat.toLowerCase()
                                ? 'bg-[#ccff00] text-black border-[#ccff00]'
                                : 'bg-[#161a24] text-slate-300 border-[#283144] hover:text-white hover:border-slate-500'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>

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

                    {/* Numeric and Threshold inputs */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
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
                          onChange={(e) =>
                            setNewComparePrice(e.target.value ? Number(e.target.value) : undefined)
                          }
                          placeholder="Optional"
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

                      <div>
                        <label className="block text-amber-300 uppercase font-medium mb-1">
                          Stock Floor (Min)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={newStockFloor}
                          onChange={(e) => setNewStockFloor(Math.max(0, Number(e.target.value)))}
                          className="w-full bg-[#151924] border border-[#262e3e] text-white px-3 py-2 text-xs font-mono focus:outline-none focus:border-amber-400"
                        />
                      </div>

                      <div>
                        <label className="block text-sky-300 uppercase font-medium mb-1">
                          Stock Ceiling (Max)
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={newStockCeiling}
                          onChange={(e) => setNewStockCeiling(Math.max(1, Number(e.target.value)))}
                          className="w-full bg-[#151924] border border-[#262e3e] text-white px-3 py-2 text-xs font-mono focus:outline-none focus:border-sky-400"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-400 uppercase font-medium mb-1">
                        Discipline Target *
                      </label>
                      <select
                        value={newDiscipline}
                        onChange={(e) => setNewDiscipline(e.target.value as Product['discipline'])}
                        className="w-full sm:w-64 bg-[#151924] border border-[#262e3e] text-white px-3 py-2 text-xs focus:outline-none focus:border-[#ccff00]"
                      >
                        <option value="Track & Field">Track &amp; Field</option>
                        <option value="Pitch & Field">Pitch &amp; Field</option>
                        <option value="Endurance">Endurance</option>
                        <option value="Recovery">Recovery</option>
                        <option value="All">All Disciplines</option>
                      </select>
                    </div>

                    {/* Sizing Type Preset + Per-Size Stock Upload */}
                    <div className="p-3.5 bg-[#121620] border border-[#222938] space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <label className="text-slate-200 uppercase font-mono font-bold block">
                            Sizing Type &amp; Preset Sizes ({newSizes.length}/10 Selected)
                          </label>
                          <span className="text-[11px] text-slate-400">
                            {getSizingTypePreset(newSizingType).description}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono text-[#ccff00]">
                          Combined Total: {computedNewTotalStock} units
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {SIZING_TYPE_PRESETS.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => applyNewSizingPreset(preset.id, true)}
                            className={`p-2 border text-left transition-colors cursor-pointer ${
                              newSizingType === preset.id
                                ? 'bg-[#192312] border-[#ccff00] text-white'
                                : 'bg-[#151924] border-[#262e3e] text-slate-300 hover:border-slate-500'
                            }`}
                          >
                            <div className="text-[11px] font-mono font-bold text-[#ccff00]">
                              {preset.shortLabel}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">
                              {preset.defaultSelectedSizes.length > 0
                                ? preset.defaultSelectedSizes.join(', ')
                                : 'Define custom labels'}
                            </div>
                          </button>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1">
                        {Array.from(
                          new Set([
                            ...getSizingTypePreset(newSizingType).availableSizes,
                            ...newSizes,
                          ])
                        ).map((sz) => {
                          const isChecked = newSizes.includes(sz);
                          return (
                            <button
                              type="button"
                              key={sz}
                              onClick={() => toggleNewSize(sz)}
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

                      {newSizes.length < 10 && (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={newCustomSizeInput}
                            onChange={(e) => setNewCustomSizeInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddNewCustomSize();
                              }
                            }}
                            maxLength={20}
                            placeholder="Add custom size label (e.g. US 10.5, 42 EU, Tall XL)"
                            className="flex-1 min-w-[200px] bg-[#151924] border border-[#262e3e] text-white px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-[#ccff00]"
                          />
                          <button
                            type="button"
                            onClick={handleAddNewCustomSize}
                            className="px-3 py-1.5 bg-[#1b2414] hover:bg-[#27351b] text-[#ccff00] border border-[#ccff00]/40 font-mono uppercase text-xs font-bold cursor-pointer"
                          >
                            + Add Size
                          </button>
                        </div>
                      )}

                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                        {newSizes.map((sz) => (
                          <div key={sz} className="p-2 bg-[#161a24] border border-[#262e3e] font-mono">
                            <span className="text-[10px] text-slate-300 block mb-1 truncate">
                              {sz} Units
                            </span>
                            <input
                              type="number"
                              min={0}
                              max={100000}
                              value={newStockBySize[sz] ?? 0}
                              onChange={(e) =>
                                setNewStockBySize((prev) => ({
                                  ...prev,
                                  [sz]: Math.max(0, parseInt(e.target.value, 10) || 0),
                                }))
                              }
                              className="w-full bg-[#0d1016] border border-[#2d3648] text-white px-2 py-1 text-xs text-center font-bold focus:outline-none focus:border-[#ccff00]"
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Color Variants Uploader */}
                    <div className="p-3.5 bg-[#121620] border border-[#222938] space-y-3">
                      <label className="text-slate-300 uppercase font-mono font-bold block">
                        Color Variants (Upload Up to 6 Swatches)
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {newColors.map((c, idx) => (
                          <div
                            key={`${c.name}-${idx}`}
                            className="flex items-center gap-2 px-3 py-1.5 bg-[#161a24] border border-[#2a3346]"
                          >
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-white/25"
                              style={{ backgroundColor: c.hex }}
                            />
                            <span className="text-white">{c.name}</span>
                            {newColors.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setNewColors(newColors.filter((_, i) => i !== idx))}
                                className="text-slate-400 hover:text-rose-400 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      {newColors.length < 6 && (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="color"
                            value={newColorInputHex}
                            onChange={(e) => setNewColorInputHex(e.target.value)}
                            className="w-9 h-8 bg-[#151924] border border-[#283244] cursor-pointer p-0.5"
                          />
                          <input
                            type="text"
                            value={newColorInputName}
                            onChange={(e) => setNewColorInputName(e.target.value)}
                            placeholder="Color name (e.g. Electric Volt)"
                            className="flex-1 min-w-[180px] bg-[#151924] border border-[#262e3e] text-white px-3 py-1.5 text-xs focus:outline-none focus:border-[#ccff00]"
                          />
                          <button
                            type="button"
                            onClick={handleAddNewColor}
                            className="px-3.5 py-1.5 bg-[#1b2414] hover:bg-[#27351b] text-[#ccff00] border border-[#ccff00]/40 font-mono uppercase text-xs font-bold cursor-pointer"
                          >
                            + Add Variant
                          </button>
                        </div>
                      )}
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
                        className="px-4 py-2 border border-[#283244] text-slate-300 hover:text-white uppercase font-mono text-xs cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-6 py-2.5 bg-[#ccff00] hover:bg-[#b8e600] text-black font-bold uppercase tracking-wider text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-md"
                      >
                        <Check className="w-4 h-4" />
                        <span>Add to Inventory</span>
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Inventory Search & Dynamic Category Filter Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative flex-1 min-w-[220px] max-w-sm">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={inventorySearch}
                    onChange={(e) => setInventorySearch(e.target.value)}
                    placeholder="Filter inventory list by title, category, color..."
                    className="w-full bg-[#121620] border border-[#222938] text-white pl-8 pr-3 py-2 text-xs focus:outline-none focus:border-[#ccff00]"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setInventoryCategoryFilter('all')}
                    className={`px-3 py-1.5 text-[11px] font-mono uppercase border cursor-pointer transition-colors ${
                      inventoryCategoryFilter === 'all'
                        ? 'bg-[#ccff00] text-black border-[#ccff00] font-bold'
                        : 'bg-[#121620] text-slate-300 border-[#222938] hover:text-white'
                    }`}
                  >
                    All ({products.length})
                  </button>
                  {inUseCategories.map((cat) => {
                    const count = products.filter(
                      (p) => p.category.toLowerCase() === cat.toLowerCase()
                    ).length;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setInventoryCategoryFilter(cat)}
                        className={`px-3 py-1.5 text-[11px] font-mono uppercase border cursor-pointer transition-colors ${
                          inventoryCategoryFilter.toLowerCase() === cat.toLowerCase()
                            ? 'bg-[#ccff00] text-black border-[#ccff00] font-bold'
                            : 'bg-[#121620] text-slate-300 border-[#222938] hover:text-white'
                        }`}
                      >
                        {cat} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* All Products List View */}
              <div className="border border-[#1f2636] bg-[#0e121a] divide-y divide-[#1b2230]">
                {/* List Column Header */}
                <div className="hidden lg:grid lg:grid-cols-12 gap-4 px-4 py-2.5 bg-[#121621] text-[10px] font-mono uppercase tracking-wider text-slate-400">
                  <div className="col-span-4">Product</div>
                  <div className="col-span-2">Category &amp; Sizing</div>
                  <div className="col-span-3">Sizes &amp; Stock</div>
                  <div className="col-span-2">Colors &amp; Health</div>
                  <div className="col-span-1 text-right">Actions</div>
                </div>

                {filteredInventoryList.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400 font-mono">
                    No inventory products match your current filter.
                  </div>
                ) : (
                  filteredInventoryList.map((p) => {
                    const health = evaluateProductStockHealth(p);
                    const sizeMap = getEffectiveStockMap(p);
                    const sizingPreset = getSizingTypePreset(inferSizingTypeFromProduct(p));
                    return (
                      <div
                        key={p.id}
                        className="p-4 hover:bg-[#121722] transition-colors grid grid-cols-1 lg:grid-cols-12 gap-4 items-center"
                      >
                        {/* Product Summary */}
                        <div className="lg:col-span-4 flex items-center gap-3 min-w-0">
                          <img
                            src={p.image}
                            alt={p.title}
                            referrerPolicy="no-referrer"
                            className="w-12 h-12 object-cover bg-black border border-[#252d3f] shrink-0"
                          />
                          <div className="min-w-0">
                            <h4 className="text-white font-bold text-xs truncate">{p.title}</h4>
                            <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] font-mono">
                              <span className="text-white font-bold">${p.price} USD</span>
                              <span className="text-slate-500">·</span>
                              <span className="text-slate-400">{p.discipline}</span>
                            </div>
                          </div>
                        </div>

                        {/* Category & Sizing Type */}
                        <div className="lg:col-span-2 flex flex-col items-start gap-1">
                          <span className="inline-block px-2.5 py-0.5 bg-[#171d29] border border-[#2c364a] text-[#ccff00] text-[11px] font-mono uppercase font-bold">
                            {p.category}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 uppercase">
                            {sizingPreset.shortLabel}
                          </span>
                        </div>

                        {/* Sizes & Per-Size Counts */}
                        <div className="lg:col-span-3 flex flex-wrap gap-1 font-mono text-[10px]">
                          {p.sizes.map((sz) => (
                            <span
                              key={sz}
                              className="px-1.5 py-0.5 bg-[#141822] border border-[#242c3c] text-slate-300"
                            >
                              {sz}: <strong className="text-white">{sizeMap[sz] ?? 0}</strong>
                            </span>
                          ))}
                        </div>

                        {/* Colors & Stock Total */}
                        <div className="lg:col-span-2 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-1">
                            {p.colors.map((c) => (
                              <span
                                key={c.name}
                                title={c.name}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#151923] border border-[#262e3e] text-[10px] text-slate-300 font-mono"
                              >
                                <span
                                  className="w-2 h-2 rounded-full border border-white/25"
                                  style={{ backgroundColor: c.hex }}
                                />
                                <span className="truncate max-w-[70px]">{c.name}</span>
                              </span>
                            ))}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400">
                            <span>Total: </span>
                            <strong
                              className={
                                health.state === 'OUT_OF_STOCK'
                                  ? 'text-rose-400'
                                  : health.state === 'BELOW_FLOOR'
                                  ? 'text-amber-300'
                                  : health.state === 'ABOVE_CEILING'
                                  ? 'text-sky-300'
                                  : 'text-[#ccff00]'
                              }
                            >
                              {health.totalStock}
                            </strong>
                            <span className="text-slate-500">
                              {' '}
                              (F:{health.floor} / C:{health.ceiling})
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="lg:col-span-1 flex items-center lg:justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openProductVariantEditor(p)}
                            className="px-2.5 py-1.5 bg-[#161b26] hover:bg-[#222a3a] text-[#ccff00] border border-[#2a3448] text-[10px] font-mono uppercase cursor-pointer flex items-center gap-1"
                            title="Edit product category, sizing type, sizes, colors, and stock"
                          >
                            <Edit className="w-3 h-3" />
                            <span>Edit</span>
                          </button>

                          {confirmDeleteId === p.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteProduct(p.id);
                                  setConfirmDeleteId(null);
                                }}
                                className="px-2 py-1 bg-rose-700 hover:bg-rose-600 text-white text-[10px] font-mono uppercase cursor-pointer"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-1.5 py-1 bg-[#181c26] text-slate-300 text-[10px] font-mono cursor-pointer"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(p.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                              title="Delete SKU"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="text-[11px] font-mono text-slate-500 flex flex-wrap items-center justify-between gap-2">
                <span>
                  Showing {filteredInventoryList.length} of {products.length} inventory products
                </span>
                <span>Active Categories: {inUseCategories.join(' · ') || 'None'}</span>
              </div>
            </div>
          )}

          {/* ================= TAB 3: ADMIN ORDER DISPATCH SYSTEM ================= */}
          {activeTab === 'dispatch' && canViewDispatch && (
            <div className="space-y-6">
              {!canExecuteDispatch && (
                <div className="p-3 bg-[#121620] border border-amber-500/40 text-amber-200 text-xs font-mono flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    Read-Only Order Queue: Your rights profile ({sessionAccount?.rightsProfileName}) allows inspecting order manifests and shipping destinations without dispatching orders.
                  </span>
                </div>
              )}
              {/* Dispatch KPI Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                <div className="p-4 bg-[#121620] border border-[#212735]">
                  <span className="text-[11px] uppercase font-mono text-slate-400 block mb-1">
                    Total Database Orders
                  </span>
                  <span className="text-2xl font-bold font-mono text-white tabular-nums">
                    {orders.length}
                  </span>
                </div>

                <div className="p-4 bg-[#121620] border border-[#212735]">
                  <span className="text-[11px] uppercase font-mono text-amber-300 block mb-1">
                    Awaiting Dispatch
                  </span>
                  <span className="text-2xl font-bold font-mono text-amber-300 tabular-nums">
                    {pendingOrdersCount}
                  </span>
                </div>

                <div className="p-4 bg-[#121620] border border-[#212735]">
                  <span className="text-[11px] uppercase font-mono text-[#ccff00] block mb-1">
                    Dispatched to Athletes
                  </span>
                  <span className="text-2xl font-bold font-mono text-[#ccff00] tabular-nums">
                    {dispatchedOrdersCount}
                  </span>
                </div>

                <div className="p-4 bg-[#121620] border border-[#212735]">
                  <span className="text-[11px] uppercase font-mono text-emerald-300 block mb-1">
                    Delivered
                  </span>
                  <span className="text-2xl font-bold font-mono text-emerald-300 tabular-nums">
                    {deliveredOrdersCount}
                  </span>
                </div>
              </div>

              {/* Filter & Search Bar */}
              <div className="p-4 bg-[#11141c] border border-[#1f2533] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    value={dispatchSearch}
                    onChange={(e) => setDispatchSearch(e.target.value)}
                    placeholder="Search Order # (OF-...) or garment..."
                    className="w-full bg-[#161a24] border border-[#262e3e] text-white pl-8 pr-3 py-1.5 text-xs font-mono focus:outline-none focus:border-[#ccff00]"
                  />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {(['All', 'Confirmed', 'Preparing Shipment', 'Dispatched', 'Delivered'] as const).map(
                    (st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setDispatchFilter(st)}
                        className={`px-3 py-1 text-[11px] font-mono uppercase border transition-colors cursor-pointer ${
                          dispatchFilter === st
                            ? 'bg-[#ccff00] text-black border-[#ccff00] font-bold'
                            : 'bg-[#161a24] text-slate-300 border-[#262e3e] hover:border-slate-400'
                        }`}
                      >
                        {st}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Orders Dispatch List */}
              {filteredDispatchOrders.length === 0 ? (
                <div className="p-10 bg-[#0e1117] border border-[#1e2432] text-center space-y-2">
                  <Truck className="w-8 h-8 text-slate-500 mx-auto" />
                  <p className="text-sm font-bold text-white uppercase">
                    {orders.length === 0 ? 'No Customer Orders Placed Yet' : 'No Matching Orders'}
                  </p>
                  <p className="text-xs text-slate-400">
                    Orders placed via Custom Checkout will stream here live for dispatch fulfillment.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredDispatchOrders.map((order) => {
                    const isExpanded = expandedOrderNum === order.orderNumber;
                    const shippingInfo = shippingByOrder[order.orderNumber];
                    const draft = getDispatchDraft(order);
                    const isDispatching = dispatchingOrderNum === order.orderNumber;

                    return (
                      <div
                        key={order.orderNumber}
                        className="bg-[#0e1117] border border-[#202736] transition-colors"
                      >
                        <div
                          onClick={() =>
                            setExpandedOrderNum(isExpanded ? null : order.orderNumber)
                          }
                          className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-[#131722]"
                        >
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <span className="font-mono font-bold text-sm text-white">
                                #{order.orderNumber}
                              </span>
                              <span
                                className={`px-2 py-0.5 text-[10px] font-mono uppercase font-bold border ${
                                  order.status === 'Delivered'
                                    ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/40'
                                    : order.status === 'Dispatched'
                                    ? 'bg-[#1a2411] text-[#ccff00] border-[#ccff00]/40'
                                    : order.status === 'Preparing Shipment'
                                    ? 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                                    : 'bg-[#171d2b] text-slate-200 border-[#2e394f]'
                                }`}
                              >
                                {order.status}
                              </span>
                              <span className="text-xs font-mono text-slate-400">
                                {order.date}
                              </span>
                              {order.stockDeducted && (
                                <span className="text-[10px] font-mono text-slate-400 bg-[#151a24] border border-[#262f40] px-1.5 py-0.5">
                                  Stock Synced
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-slate-300">
                              {order.items
                                .map((it) => `${it.quantity}× ${it.title} (${it.size})`)
                                .join(' · ')}
                            </p>
                          </div>

                          <div className="flex items-center gap-4 shrink-0">
                            <div className="text-right font-mono">
                              <span className="text-sm font-bold text-white block">
                                ${order.total} USD
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {order.shippingMethod === 'express' ? 'Express Air' : 'Standard'}
                              </span>
                            </div>

                            <button
                              type="button"
                              className="px-3 py-1.5 bg-[#161c27] border border-[#283245] text-xs font-mono text-[#ccff00] uppercase cursor-pointer"
                            >
                              {isExpanded ? 'Hide Console' : 'Manage Dispatch'}
                            </button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="p-5 border-t border-[#1c2332] bg-[#0b0d13] space-y-4 text-xs">
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                              {/* Customer Destination & Line Items */}
                              <div className="md:col-span-5 space-y-3">
                                <div className="p-3 bg-[#11151f] border border-[#1f2635]">
                                  <span className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1.5 mb-2">
                                    <MapPin className="w-3.5 h-3.5 text-[#ccff00]" />
                                    <span>Customer Dispatch Destination</span>
                                  </span>
                                  {shippingInfo ? (
                                    <div className="font-mono text-[11px] text-slate-300 space-y-0.5">
                                      <p className="text-white font-sans font-bold text-xs">
                                        {shippingInfo.firstName} {shippingInfo.lastName}
                                      </p>
                                      <p>{shippingInfo.email} · {shippingInfo.phone}</p>
                                      <p>
                                        {shippingInfo.address}
                                        {shippingInfo.apartment ? `, ${shippingInfo.apartment}` : ''}
                                      </p>
                                      <p>
                                        {shippingInfo.city}, {shippingInfo.postalCode} · {shippingInfo.country}
                                      </p>
                                    </div>
                                  ) : (
                                    <p className="font-mono text-[11px] text-slate-400">
                                      Loading private recipient address...
                                    </p>
                                  )}
                                </div>

                                <div className="p-3 bg-[#11151f] border border-[#1f2635] space-y-1.5">
                                  <span className="text-[10px] font-mono uppercase text-slate-400 block">
                                    Order Picking Manifest
                                  </span>
                                  {order.items.map((it, idx) => (
                                    <div
                                      key={idx}
                                      className="flex justify-between font-mono text-[11px] text-slate-200 border-b border-[#19202e] pb-1 last:border-b-0 last:pb-0"
                                    >
                                      <span>
                                        {it.title} ({it.size}{it.color ? ` · ${it.color}` : ''})
                                      </span>
                                      <span className="text-[#ccff00] font-bold">×{it.quantity}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Dispatch Carrier & Action Controls */}
                              <div className="md:col-span-7 p-4 bg-[#11151f] border border-[#22293a] space-y-3">
                                <span className="text-[11px] font-mono uppercase text-[#ccff00] font-bold block">
                                  {canExecuteDispatch
                                    ? 'Dispatch Fulfillment Execution'
                                    : 'Dispatch Status (Read-Only View)'}
                                </span>

                                {!canExecuteDispatch ? (
                                  <div className="p-3 bg-[#0e1219] border border-amber-500/30 text-[11px] font-mono text-amber-200 space-y-1.5">
                                    <p className="flex items-center gap-1.5">
                                      <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                      <span>
                                        Your rights profile ({sessionAccount?.rightsProfileName}) does not include shipment dispatch execution.
                                      </span>
                                    </p>
                                    <p className="text-slate-300">
                                      Courier: {draft.courier} · Tracking: {draft.trackingNumber}
                                    </p>
                                  </div>
                                ) : (
                                  <>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                      <div>
                                        <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                                          Courier / Fleet
                                        </label>
                                        <input
                                          type="text"
                                          value={draft.courier}
                                          onChange={(e) =>
                                            updateDispatchDraft(order, { courier: e.target.value })
                                          }
                                          className="w-full bg-[#161b26] border border-[#293244] text-white px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-[#ccff00]"
                                        />
                                      </div>

                                      <div>
                                        <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                                          Tracking / Airbill #
                                        </label>
                                        <input
                                          type="text"
                                          value={draft.trackingNumber}
                                          onChange={(e) =>
                                            updateDispatchDraft(order, { trackingNumber: e.target.value })
                                          }
                                          className="w-full bg-[#161b26] border border-[#293244] text-white px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-[#ccff00]"
                                        />
                                      </div>
                                    </div>

                                    <div>
                                      <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                                        Dispatch Note (Visible on Shipment Timeline)
                                      </label>
                                      <input
                                        type="text"
                                        value={draft.notes}
                                        onChange={(e) =>
                                          updateDispatchDraft(order, { notes: e.target.value })
                                        }
                                        placeholder="e.g. Dispatched from Zurich Performance Lab via Priority Airfreight"
                                        className="w-full bg-[#161b26] border border-[#293244] text-white px-3 py-1.5 text-xs focus:outline-none focus:border-[#ccff00]"
                                      />
                                    </div>

                                    {!order.stockDeducted && (
                                      <label className="flex items-center gap-2 text-[11px] font-mono text-slate-300 cursor-pointer pt-1">
                                        <input
                                          type="checkbox"
                                          checked={draft.deductStock}
                                          onChange={(e) =>
                                            updateDispatchDraft(order, { deductStock: e.target.checked })
                                          }
                                          className="accent-[#ccff00]"
                                        />
                                        <span>
                                          Deduct purchased size quantities from Firestore stock upon dispatch
                                        </span>
                                      </label>
                                    )}

                                    <div className="pt-2 flex flex-wrap items-center gap-2">
                                      <button
                                        type="button"
                                        disabled={isDispatching}
                                        onClick={() => handleDispatchAction(order, 'Preparing Shipment')}
                                        className="px-3.5 py-2 bg-[#1a202d] hover:bg-[#242c3e] text-amber-300 border border-amber-500/40 font-mono uppercase text-[11px] font-bold cursor-pointer disabled:opacity-50"
                                      >
                                        Prepare Shipment
                                      </button>

                                      <button
                                        type="button"
                                        disabled={isDispatching}
                                        onClick={() => handleDispatchAction(order, 'Dispatched')}
                                        className="px-4 py-2 bg-[#ccff00] hover:bg-[#b8e600] text-black font-bold font-mono uppercase text-[11px] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                      >
                                        <Send className="w-3.5 h-3.5" />
                                        <span>
                                          {isDispatching ? 'Dispatching...' : 'Dispatch to Customer'}
                                        </span>
                                      </button>

                                      <button
                                        type="button"
                                        disabled={isDispatching}
                                        onClick={() => handleDispatchAction(order, 'Delivered')}
                                        className="px-3.5 py-2 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/40 font-mono uppercase text-[11px] font-bold cursor-pointer disabled:opacity-50"
                                      >
                                        Mark Delivered
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ================= TAB 4: INTEGRATIONS (SHOPIFY & WEBHOOKS) ================= */}
          {activeTab === 'integrations' && canManageIntegrations && (
            <div className="space-y-6">
              <div className="p-4 bg-[#11141c] border border-[#1f2533] flex items-start gap-3">
                <Database className="w-5 h-5 text-[#ccff00] shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-tight">
                    Shopify Storefront API &amp; Webhook Control Hub
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    All external e-commerce integrations, synchronization protocols, GraphQL endpoints,
                    and real-time webhook listeners are isolated in this secure administrative console.
                  </p>
                </div>
              </div>

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
                    Last handshake:{' '}
                    {shopifyConfig.lastSyncedAt
                      ? new Date(shopifyConfig.lastSyncedAt).toLocaleString()
                      : 'Active'}
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

              <div className="p-4 bg-[#0d1017] border border-[#1b2130]">
                <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-3">
                  Integration &amp; Webhook Event Audit Log ({syncLogs.length})
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

          {/* ================= TAB 5: STAFF ACCOUNTS & USER RIGHTS PROFILES (SUPERUSER ONLY) ================= */}
          {activeTab === 'staff' && isSuperuser && (
            <div className="space-y-6">
              <div className="p-4 bg-[#11141c] border border-[#1f2533] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <Key className="w-5 h-5 text-[#ccff00] shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-tight">
                      Staff Accounts &amp; User Rights Assignment Profiles
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Provision employees, assign reusable role profiles, and customize granular system rights per employee. Changes apply immediately on the server.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowNewProfileBuilder(!showNewProfileBuilder)}
                  className="px-4 py-2 bg-[#162012] hover:bg-[#1f2e18] text-[#ccff00] border border-[#ccff00]/40 text-xs font-mono uppercase font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <BookmarkPlus className="w-4 h-4" />
                  <span>{showNewProfileBuilder ? 'Close Profile Builder' : 'New Rights Profile'}</span>
                </button>
              </div>

              {staffError && (
                <div className="p-3 bg-[#241313] border border-rose-500/40 text-rose-300 text-xs font-mono flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <span>{staffError}</span>
                </div>
              )}

              {staffNotice && (
                <div className="p-3 bg-[#152110] border border-[#ccff00]/40 text-[#ccff00] text-xs font-mono flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>{staffNotice}</span>
                </div>
              )}

              {/* Reusable Rights Profiles Library & Custom Builder */}
              <div className="p-5 bg-[#0e1118] border border-[#21293a] space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white font-mono">
                    User Rights Assignment Profiles ({rightsProfiles.length})
                  </h4>
                  <span className="text-[11px] font-mono text-slate-400">
                    Templates available when creating or updating employees
                  </span>
                </div>

                {showNewProfileBuilder && (
                  <form
                    onSubmit={handleCreateCustomProfile}
                    className="p-4 bg-[#121722] border border-[#ccff00]/40 space-y-3 text-xs"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-mono uppercase text-slate-300 mb-1">
                          Profile Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={customProfileName}
                          onChange={(e) => setCustomProfileName(e.target.value)}
                          placeholder="e.g. Warehouse Picker & Packer"
                          className="w-full bg-[#0c0f16] border border-[#293346] text-white px-3 py-2 text-xs focus:outline-none focus:border-[#ccff00]"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-mono uppercase text-slate-300 mb-1">
                          Description
                        </label>
                        <input
                          type="text"
                          value={customProfileDesc}
                          onChange={(e) => setCustomProfileDesc(e.target.value)}
                          placeholder="Short summary of employee job scope..."
                          className="w-full bg-[#0c0f16] border border-[#293346] text-white px-3 py-2 text-xs focus:outline-none focus:border-[#ccff00]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {STAFF_PERMISSION_CATALOG.map((meta) => {
                        const checked = customProfilePerms.includes(meta.key);
                        return (
                          <label
                            key={meta.key}
                            className={`p-2.5 border cursor-pointer flex items-start gap-2 ${
                              checked
                                ? 'bg-[#172112] border-[#ccff00]/50 text-white'
                                : 'bg-[#0e121a] border-[#252d3e] text-slate-300'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setCustomProfilePerms((prev) =>
                                  prev.includes(meta.key)
                                    ? prev.filter((p) => p !== meta.key)
                                    : [...prev, meta.key]
                                )
                              }
                              className="accent-[#ccff00] mt-0.5"
                            />
                            <div>
                              <span className="text-[10px] font-mono uppercase text-[#ccff00] block">
                                {meta.module}
                              </span>
                              <span className="font-semibold block">{meta.label}</span>
                            </div>
                          </label>
                        );
                      })}
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowNewProfileBuilder(false)}
                        className="px-3 py-1.5 border border-[#2a3346] text-slate-300 text-xs font-mono uppercase cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSavingProfile}
                        className="px-4 py-1.5 bg-[#ccff00] hover:bg-[#b8e600] text-black font-bold text-xs font-mono uppercase cursor-pointer disabled:opacity-50"
                      >
                        {isSavingProfile ? 'Saving...' : 'Save Rights Profile'}
                      </button>
                    </div>
                  </form>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {rightsProfiles.map((prof) => (
                    <div
                      key={prof.id}
                      className="p-3 bg-[#121621] border border-[#222a3a] flex flex-col justify-between gap-2 text-xs"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-bold text-white">{prof.name}</span>
                          {prof.builtIn ? (
                            <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 bg-[#19202e] text-slate-300 border border-[#2c374c]">
                              Standard
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleDeleteCustomProfile(prof)}
                              className="text-slate-400 hover:text-rose-400 cursor-pointer"
                              title="Delete custom profile"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                          {prof.description}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-1 pt-1">
                        {prof.permissions.map((perm) => (
                          <span
                            key={perm}
                            className="text-[10px] font-mono px-1.5 py-0.5 bg-[#0e121a] border border-[#273145] text-[#ccff00]"
                          >
                            {permissionLabel(perm)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Create Staff Form with Profile & Granular Rights Selector */}
              <form
                onSubmit={handleCreateStaffSubmit}
                className="p-5 bg-[#0f131b] border border-[#242c3d] space-y-4 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-[#ccff00]" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                      Add New Staff Member &amp; Assign Initial Rights
                    </h4>
                  </div>
                  <span className="text-[11px] font-mono text-[#ccff00]">
                    Selected: {newStaffProfileName} ({newStaffPermissions.length} rights)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={newStaffFullName}
                      onChange={(e) => setNewStaffFullName(e.target.value)}
                      placeholder="Alex Mercer"
                      className="w-full bg-[#151a24] border border-[#283144] text-white px-3 py-2 text-xs focus:outline-none focus:border-[#ccff00]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                      Username *
                    </label>
                    <input
                      type="text"
                      required
                      value={newStaffUsername}
                      onChange={(e) => setNewStaffUsername(e.target.value)}
                      placeholder="amercer_ops"
                      className="w-full bg-[#151a24] border border-[#283144] text-white px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#ccff00]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                      Work Email *
                    </label>
                    <input
                      type="email"
                      required
                      value={newStaffEmail}
                      onChange={(e) => setNewStaffEmail(e.target.value)}
                      placeholder="alex@offside.com"
                      className="w-full bg-[#151a24] border border-[#283144] text-white px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#ccff00]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                      Temporary Password (Min 8) *
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={newStaffPassword}
                      onChange={(e) => setNewStaffPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-[#151a24] border border-[#283144] text-white px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#ccff00]"
                    />
                  </div>
                </div>

                {/* User Rights Profile Selection for New Employee */}
                <div className="p-3.5 bg-[#121622] border border-[#232b3d] space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="text-[11px] font-mono uppercase font-bold text-slate-200">
                      Assign User Rights Profile
                    </label>
                    <select
                      value={newStaffSelectedProfileId}
                      onChange={(e) => handleSelectProfileForNewStaff(e.target.value)}
                      aria-label="Select initial user rights profile"
                      className="bg-[#0d1017] border border-[#2a3347] text-white px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-[#ccff00]"
                    >
                      {rightsProfiles.map((prof) => (
                        <option key={prof.id} value={prof.id}>
                          {prof.name} ({prof.permissions.length} rights)
                        </option>
                      ))}
                      {newStaffSelectedProfileId === 'custom' && (
                        <option value="custom">Custom Selection ({newStaffPermissions.length} rights)</option>
                      )}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {STAFF_PERMISSION_CATALOG.map((meta) => {
                      const checked = newStaffPermissions.includes(meta.key);
                      return (
                        <label
                          key={meta.key}
                          className={`p-2.5 border cursor-pointer flex items-start gap-2 transition-colors ${
                            checked
                              ? 'bg-[#172212] border-[#ccff00]/50 text-white'
                              : 'bg-[#0e121a] border-[#242c3c] text-slate-400'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleNewStaffPermission(meta.key)}
                            className="accent-[#ccff00] mt-0.5"
                          />
                          <div className="min-w-0">
                            <span className="text-[10px] font-mono uppercase text-[#ccff00] block">
                              {meta.module}
                            </span>
                            <span className="font-semibold text-xs block">{meta.label}</span>
                            <span className="text-[10px] text-slate-400 block leading-tight mt-0.5">
                              {meta.description}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isCreatingStaff}
                    className="px-5 py-2.5 bg-[#ccff00] hover:bg-[#b8e600] text-black font-bold uppercase tracking-wider text-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>{isCreatingStaff ? 'Provisioning...' : 'Create Staff Account'}</span>
                  </button>
                </div>
              </form>

              {/* Staff List with Live User Rights Assignment Editor */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
                  Authorized Staff Accounts &amp; Assigned Profiles ({staffList.length})
                </h4>

                {isLoadingStaff ? (
                  <div className="p-8 bg-[#0e1117] border border-[#1e2432] text-center text-xs font-mono text-slate-400">
                    Loading staff directory...
                  </div>
                ) : staffList.length === 0 ? (
                  <div className="p-8 bg-[#0e1117] border border-[#1e2432] text-center text-xs font-mono text-slate-400">
                    No staff accounts have been added yet. Use the form above to provision your team and assign user rights.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {staffList.map((member) => {
                      const isEditingRights = editingRightsStaffId === member.id;
                      const memberPerms = member.permissions || [];
                      return (
                        <div
                          key={member.id}
                          className="p-4 bg-[#0e1117] border border-[#202736] space-y-3 text-xs"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-bold text-white text-sm">{member.fullName}</span>
                                <span className="font-mono text-[#ccff00]">@{member.username}</span>
                                <span
                                  className={`px-2 py-0.5 text-[10px] font-mono uppercase font-bold border ${
                                    member.active
                                      ? 'bg-[#152311] text-[#ccff00] border-[#ccff00]/40'
                                      : 'bg-rose-950/70 text-rose-300 border-rose-700/50'
                                  }`}
                                >
                                  {member.active ? 'Active' : 'Suspended'}
                                </span>
                                <span className="px-2 py-0.5 text-[10px] font-mono uppercase bg-[#151c2b] text-sky-300 border border-sky-500/40 font-bold">
                                  Profile: {member.rightsProfileName || 'Custom'}
                                </span>
                              </div>

                              <p className="text-[11px] font-mono text-slate-400">
                                {member.email} · Added {new Date(member.createdAt).toLocaleDateString()}
                                {member.createdBy ? ` by @${member.createdBy}` : ''}
                              </p>

                              <div className="flex flex-wrap gap-1 pt-0.5">
                                {memberPerms.length === 0 ? (
                                  <span className="text-[10px] font-mono text-amber-300 bg-amber-950/40 border border-amber-600/40 px-2 py-0.5">
                                    No operational rights assigned
                                  </span>
                                ) : (
                                  memberPerms.map((perm) => (
                                    <span
                                      key={perm}
                                      className="px-2 py-0.5 text-[10px] font-mono bg-[#141925] border border-[#273146] text-slate-200"
                                    >
                                      {permissionLabel(perm)}
                                    </span>
                                  ))
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 shrink-0 font-mono">
                              <button
                                type="button"
                                onClick={() => openStaffRightsEditor(member)}
                                className={`px-3 py-1.5 border text-[11px] uppercase font-bold flex items-center gap-1.5 cursor-pointer ${
                                  isEditingRights
                                    ? 'bg-[#ccff00] text-black border-[#ccff00]'
                                    : 'bg-[#162011] hover:bg-[#1e2c17] text-[#ccff00] border-[#ccff00]/40'
                                }`}
                              >
                                <Key className="w-3.5 h-3.5" />
                                <span>{isEditingRights ? 'Close Rights' : 'Assign Rights Profile'}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleToggleStaffActive(member)}
                                className="px-3 py-1.5 bg-[#151a24] hover:bg-[#1e2534] text-slate-200 border border-[#2a3346] text-[11px] uppercase cursor-pointer"
                              >
                                {member.active ? 'Suspend' : 'Activate'}
                              </button>

                              {confirmDeleteStaffId === member.id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteStaffMember(member.id)}
                                    className="px-2.5 py-1.5 bg-rose-700 hover:bg-rose-600 text-white text-[11px] uppercase cursor-pointer"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteStaffId(null)}
                                    className="px-2 py-1.5 bg-[#171c26] text-slate-300 text-[11px] cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteStaffId(member.id)}
                                  className="p-1.5 text-slate-400 hover:text-rose-400 cursor-pointer"
                                  title="Remove Staff Account"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Expandable User Rights Assignment Matrix for this Employee */}
                          {isEditingRights && (
                            <div className="p-4 bg-[#121722] border border-[#ccff00]/40 space-y-4">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#222b3d]">
                                <div>
                                  <span className="text-xs font-bold uppercase text-white block">
                                    User Rights Assignment Profile — @{member.username}
                                  </span>
                                  <span className="text-[11px] text-slate-400">
                                    Apply a job role template or toggle individual module permissions.
                                  </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditStaffPermissions([...ALL_STAFF_PERMISSIONS]);
                                      setEditStaffProfileName('Full Operations Staff');
                                    }}
                                    className="px-2.5 py-1 bg-[#182112] text-[#ccff00] border border-[#ccff00]/40 text-[10px] font-mono uppercase cursor-pointer"
                                  >
                                    Grant All
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditStaffPermissions([]);
                                      setEditStaffProfileName('Unassigned (No Access)');
                                    }}
                                    className="px-2.5 py-1 bg-[#1b161c] text-slate-300 border border-[#2d3546] text-[10px] font-mono uppercase cursor-pointer"
                                  >
                                    Revoke All
                                  </button>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                                    Apply Quick Profile Template
                                  </label>
                                  <select
                                    value=""
                                    onChange={(e) => {
                                      if (e.target.value) applyProfileToEditingStaff(e.target.value);
                                    }}
                                    className="w-full bg-[#0d1017] border border-[#2a3347] text-white px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-[#ccff00]"
                                  >
                                    <option value="">Choose a profile template...</option>
                                    {rightsProfiles.map((prof) => (
                                      <option key={prof.id} value={prof.id}>
                                        {prof.name} ({prof.permissions.length} rights)
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div>
                                  <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                                    Assigned Profile Title
                                  </label>
                                  <input
                                    type="text"
                                    value={editStaffProfileName}
                                    onChange={(e) => setEditStaffProfileName(e.target.value)}
                                    placeholder="e.g. Dispatch Coordinator"
                                    className="w-full bg-[#0d1017] border border-[#2a3347] text-white px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-[#ccff00]"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {PERMISSION_MODULES.map((moduleName) => {
                                  const modulePerms = STAFF_PERMISSION_CATALOG.filter(
                                    (p) => p.module === moduleName
                                  );
                                  return (
                                    <div
                                      key={moduleName}
                                      className="p-3 bg-[#0d1017] border border-[#222a3a] space-y-2"
                                    >
                                      <span className="text-[10px] font-mono uppercase text-[#ccff00] font-bold block">
                                        {moduleName}
                                      </span>
                                      {modulePerms.map((meta) => {
                                        const checked = editStaffPermissions.includes(meta.key);
                                        return (
                                          <label
                                            key={meta.key}
                                            className={`p-2 border cursor-pointer flex items-start gap-2 transition-colors ${
                                              checked
                                                ? 'bg-[#162111] border-[#ccff00]/50 text-white'
                                                : 'bg-[#121620] border-[#252d3e] text-slate-400'
                                            }`}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={checked}
                                              onChange={() => toggleEditingStaffPermission(meta.key)}
                                              className="accent-[#ccff00] mt-0.5"
                                            />
                                            <div>
                                              <span className="font-semibold text-xs block">
                                                {meta.label}
                                              </span>
                                              <span className="text-[10px] text-slate-400 block leading-tight">
                                                {meta.description}
                                              </span>
                                            </div>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  );
                                })}
                              </div>

                              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#222b3d]">
                                <button
                                  type="button"
                                  onClick={() => setEditingRightsStaffId(null)}
                                  className="px-4 py-1.5 border border-[#2a3346] text-slate-300 hover:text-white text-xs font-mono uppercase cursor-pointer"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  disabled={isSavingStaffRights}
                                  onClick={() => handleSaveStaffRights(member)}
                                  className="px-5 py-1.5 bg-[#ccff00] hover:bg-[#b8e600] text-black font-bold text-xs font-mono uppercase flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>
                                    {isSavingStaffRights ? 'Saving Rights...' : 'Save Rights Assignment'}
                                  </span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
          </div>
        </div>

        {/* Admin Modal Footer */}
        <div className="px-6 py-3 bg-[#0e1118] border-t border-[#1d2330] flex items-center justify-between text-xs text-slate-400 font-mono">
          <span className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-[#ccff00]" />
            <span>Offside Apparel Operational Core · Per-Size Stock, Alarms &amp; Dispatch Synced</span>
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
