export type GarmentSize = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';

export const ALL_GARMENT_SIZES: GarmentSize[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

export interface Product {
  id: string;
  shopifyId: string;
  title: string;
  handle: string;
  tagline: string;
  description: string;
  price: number;
  compareAtPrice?: number;
  currency: string;
  category: 'Tops' | 'Bottoms' | 'Outerwear' | 'Accessories';
  discipline: 'Track & Field' | 'Pitch & Field' | 'Endurance' | 'Recovery' | 'All';
  image: string;
  detailImage?: string;
  sizes: GarmentSize[];
  colors: { name: string; hex: string }[];
  inStock: boolean;
  inventoryQuantity: number;
  stockBySize?: Partial<Record<GarmentSize, number>>;
  stockFloor?: number;
  stockCeiling?: number;
  weightGsm: number;
  fabricSpecs: {
    composition: string;
    treatment: string;
    seamType: string;
    breathabilityRating: string;
  };
  athleteFitNotes: string;
  featured?: boolean;
}

export type StockAlarmType = 'BELOW_FLOOR' | 'ABOVE_CEILING' | 'OUT_OF_STOCK';

export interface StockAlarm {
  id: string;
  productId: string;
  productTitle: string;
  alarmType: StockAlarmType;
  triggerScope: 'total' | 'size';
  size?: GarmentSize;
  currentQuantity: number;
  threshold: number;
  acknowledged: boolean;
  recipientEmail: string;
  message: string;
  createdAtMillis: number;
}

export interface CartItem {
  id: string; // unique item line id
  productId: string;
  title: string;
  price: number;
  size: string;
  color: string;
  quantity: number;
  image: string;
}

export interface ShopifyConfig {
  storeDomain: string;
  storefrontAccessToken: string;
  apiVersion: string;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'error';
  lastSyncedAt: string | null;
  mode: 'synced-cache' | 'live-shopify';
  autoSync: boolean;
  itemsCount: number;
}

export interface SyncLogEntry {
  id: string;
  timestamp: string;
  event: string;
  details: string;
  status: 'success' | 'info' | 'warning';
}

export interface CheckoutCustomerInfo {
  email: string;
  firstName: string;
  lastName: string;
  athleteId?: string;
  clubOrTeam?: string;
  address: string;
  apartment?: string;
  city: string;
  postalCode: string;
  country: string;
  phone: string;
  shippingMethod: 'express' | 'standard';
  paymentMethod: 'card' | 'shopify_pay' | 'apple_pay';
  discountCode: string;
  discountPercentage: number;
}

export type OrderStatus = 'Confirmed' | 'Preparing Shipment' | 'Dispatched' | 'Delivered';

export interface ConfirmedOrder {
  orderNumber: string;
  shopifyOrderRef: string;
  date: string;
  items: CartItem[];
  customer: CheckoutCustomerInfo;
  subtotal: number;
  discountAmount: number;
  shippingAmount: number;
  taxAmount: number;
  total: number;
  estimatedDelivery: string;
  status: OrderStatus;
  dispatchCourier?: string;
  trackingNumber?: string;
  dispatchNotes?: string;
  dispatchedAt?: string;
  stockDeducted?: boolean;
}

export type ShipmentStatus = 'Ordered' | 'Processing' | 'Shipped' | 'Delivered';

export interface TrackingCheckpoint {
  step: ShipmentStatus;
  timestamp: string;
  location: string;
  description: string;
  completed: boolean;
  active: boolean;
}

export interface ShipmentTrackingRecord {
  orderNumber: string;
  shopifyOrderRef: string;
  currentStatus: ShipmentStatus;
  courier: string;
  trackingNumber: string;
  orderDate: string;
  estimatedDelivery: string;
  athleteName: string;
  athleteId?: string;
  destination: string;
  items: { title: string; size: string; quantity: number }[];
  checkpoints: TrackingCheckpoint[];
}

export type AccountRole = 'superuser' | 'staff' | 'customer';

export type StaffPermission =
  | 'view_stock_alarms'
  | 'manage_stock_thresholds'
  | 'manage_catalog_variants'
  | 'view_dispatch_orders'
  | 'execute_order_dispatch'
  | 'manage_integrations';

export const ALL_STAFF_PERMISSIONS: StaffPermission[] = [
  'view_stock_alarms',
  'manage_stock_thresholds',
  'manage_catalog_variants',
  'view_dispatch_orders',
  'execute_order_dispatch',
  'manage_integrations',
];

export interface StaffPermissionMeta {
  key: StaffPermission;
  label: string;
  module: 'Stock & Alarms' | 'Catalog & Variants' | 'Order Dispatch' | 'Integrations';
  description: string;
}

export const STAFF_PERMISSION_CATALOG: StaffPermissionMeta[] = [
  {
    key: 'view_stock_alarms',
    label: 'View Stock & Alarms',
    module: 'Stock & Alarms',
    description: 'Inspect per-size warehouse stock counts, floor/ceiling limits, and active alarms.',
  },
  {
    key: 'manage_stock_thresholds',
    label: 'Edit Stock & Trigger Alarms',
    module: 'Stock & Alarms',
    description: 'Adjust per-size quantities, batch restock, set floor/ceiling limits, and dispatch/clear alarms.',
  },
  {
    key: 'manage_catalog_variants',
    label: 'Manage Catalog, Sizes & Colors',
    module: 'Catalog & Variants',
    description: 'Upload new SKUs, edit sizes, manage color swatches, and remove discontinued products.',
  },
  {
    key: 'view_dispatch_orders',
    label: 'View Dispatch Queue & Addresses',
    module: 'Order Dispatch',
    description: 'Inspect customer order manifests, line items, and private shipping destinations.',
  },
  {
    key: 'execute_order_dispatch',
    label: 'Execute Shipments & Tracking',
    module: 'Order Dispatch',
    description: 'Assign couriers/airbills, advance shipment statuses, and mark orders dispatched or delivered.',
  },
  {
    key: 'manage_integrations',
    label: 'Manage Storefront Integrations',
    module: 'Integrations',
    description: 'Configure Shopify API endpoints, trigger catalog syncs, run webhooks, and view audit logs.',
  },
];

export interface RightsProfileDefinition {
  id: string;
  name: string;
  description: string;
  permissions: StaffPermission[];
  builtIn?: boolean;
}

export const DEFAULT_RIGHTS_PROFILES: RightsProfileDefinition[] = [
  {
    id: 'profile-inventory-specialist',
    name: 'Inventory & Alarms Specialist',
    description: 'Monitors warehouse levels, adjusts per-size stock, and handles floor/ceiling alarms.',
    permissions: ['view_stock_alarms', 'manage_stock_thresholds'],
    builtIn: true,
  },
  {
    id: 'profile-dispatch-coordinator',
    name: 'Order Dispatch Coordinator',
    description: 'Reviews customer destinations, prepares picking manifests, and dispatches shipments.',
    permissions: ['view_dispatch_orders', 'execute_order_dispatch'],
    builtIn: true,
  },
  {
    id: 'profile-catalog-merchandiser',
    name: 'Catalog & Variants Merchandiser',
    description: 'Uploads new garments, configures sizes and color variants, and monitors stock status.',
    permissions: ['view_stock_alarms', 'manage_catalog_variants'],
    builtIn: true,
  },
  {
    id: 'profile-integrations-specialist',
    name: 'Integrations & Sync Specialist',
    description: 'Maintains Shopify API credentials, webhook simulations, and catalog sync handshakes.',
    permissions: ['manage_integrations'],
    builtIn: true,
  },
  {
    id: 'profile-warehouse-auditor',
    name: 'Operations Viewer (Read-Only)',
    description: 'Audits stock counts, alarms, and order queues without modifying inventory or shipments.',
    permissions: ['view_stock_alarms', 'view_dispatch_orders'],
    builtIn: true,
  },
  {
    id: 'profile-full-operations',
    name: 'Full Operations Staff',
    description: 'Complete day-to-day operational access across stock, catalog, dispatch, and integrations.',
    permissions: [...ALL_STAFF_PERMISSIONS],
    builtIn: true,
  },
];

export interface SessionAccount {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: AccountRole;
  active: boolean;
  createdAt: string;
  permissions: StaffPermission[];
  rightsProfileName?: string;
}

export interface StaffMemberSummary {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: 'staff';
  active: boolean;
  createdAt: string;
  createdBy?: string;
  permissions: StaffPermission[];
  rightsProfileName?: string;
}

export interface CustomerOrderItem {
  productId: string;
  title: string;
  price: number;
  size: string;
  color: string;
  quantity: number;
}

export interface CustomerOrderRecord {
  orderNumber: string;
  userId: string;
  shopifyOrderRef: string;
  date: string;
  items: CustomerOrderItem[];
  shippingMethod: 'express' | 'standard';
  paymentMethod: 'card' | 'shopify_pay' | 'apple_pay';
  discountCode?: string;
  discountPercentage?: number;
  subtotal: number;
  discountAmount: number;
  shippingAmount: number;
  taxAmount: number;
  total: number;
  estimatedDelivery: string;
  status: OrderStatus;
  dispatchCourier?: string;
  trackingNumber?: string;
  dispatchNotes?: string;
  dispatchedAt?: string;
  stockDeducted?: boolean;
  createdAtMillis: number;
  source?: 'firestore' | 'server';
}

export interface OrderPrivateShippingInfo {
  email: string;
  firstName: string;
  lastName: string;
  athleteId?: string;
  clubOrTeam?: string;
  address: string;
  apartment?: string;
  city: string;
  postalCode: string;
  country: string;
  phone: string;
}
