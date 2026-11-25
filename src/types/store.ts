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
  sizes: ('XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL')[];
  colors: { name: string; hex: string }[];
  inStock: boolean;
  inventoryQuantity: number;
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
  status: 'Confirmed' | 'Preparing Shipment' | 'Dispatched';
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

