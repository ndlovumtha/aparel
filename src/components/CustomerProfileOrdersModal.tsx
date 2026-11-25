import React, { useState, useEffect } from 'react';
import { User, signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import {
  CustomerOrderRecord,
  OrderPrivateShippingInfo,
  SessionAccount,
} from '../types/store';
import {
  subscribeToCustomerOrders,
  getOrderShippingDetailsFromFirestore,
} from '../services/firestore';
import {
  fetchMyServerOrdersApi,
  fetchOrderShippingOnServerApi,
} from '../services/authApi';
import {
  X,
  User as UserIcon,
  Package,
  Truck,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  Search,
  LogOut,
  ShieldCheck,
  MapPin,
  CreditCard,
  ShoppingBag,
  AlertTriangle,
  LogIn,
} from 'lucide-react';

interface CustomerProfileOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  sessionAccount: SessionAccount | null;
  authToken: string | null;
  onOpenLoginModal: (mode?: 'login' | 'signup') => void;
  onLogoutAll: () => Promise<void> | void;
  onTrackOrder: (orderNumber: string) => void;
  onExploreCollection: () => void;
}

const STATUS_FILTERS = ['All', 'Confirmed', 'Preparing Shipment', 'Dispatched', 'Delivered'] as const;

export const CustomerProfileOrdersModal: React.FC<CustomerProfileOrdersModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  sessionAccount,
  authToken,
  onOpenLoginModal,
  onLogoutAll,
  onTrackOrder,
  onExploreCollection,
}) => {
  const [firestoreOrders, setFirestoreOrders] = useState<CustomerOrderRecord[]>([]);
  const [serverOrders, setServerOrders] = useState<CustomerOrderRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('All');
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [shippingByOrder, setShippingByOrder] = useState<
    Record<string, OrderPrivateShippingInfo | null>
  >({});
  const [loadingShippingFor, setLoadingShippingFor] = useState<string | null>(null);

  const isFirebaseVerified = Boolean(currentUser && currentUser.emailVerified);
  const isAuthenticated = Boolean(sessionAccount || isFirebaseVerified);

  useEffect(() => {
    if (!isOpen || !isFirebaseVerified || !currentUser) {
      setFirestoreOrders([]);
      return;
    }

    setIsLoading(true);
    const unsub = subscribeToCustomerOrders(currentUser.uid, (fetched) => {
      setFirestoreOrders(fetched);
      setIsLoading(false);
    });

    return () => unsub();
  }, [isOpen, isFirebaseVerified, currentUser]);

  useEffect(() => {
    if (!isOpen || !sessionAccount || !authToken) {
      setServerOrders([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    fetchMyServerOrdersApi(authToken)
      .then((res) => {
        if (!cancelled) {
          setServerOrders(res.orders || []);
        }
      })
      .catch((err) => {
        console.warn('Could not load account orders:', err);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, sessionAccount, authToken]);

  const orders: CustomerOrderRecord[] = React.useMemo(() => {
    const map = new Map<string, CustomerOrderRecord>();
    for (const o of firestoreOrders) map.set(o.orderNumber, { ...o, source: 'firestore' });
    for (const o of serverOrders) map.set(o.orderNumber, { ...o, source: 'server' });
    return Array.from(map.values()).sort((a, b) => b.createdAtMillis - a.createdAtMillis);
  }, [firestoreOrders, serverOrders]);

  useEffect(() => {
    if (isOpen && orders.length > 0 && !expandedOrder) {
      setExpandedOrder(orders[0].orderNumber);
    }
  }, [isOpen, orders, expandedOrder]);

  useEffect(() => {
    if (!isOpen || !expandedOrder || !isAuthenticated) return;
    if (expandedOrder in shippingByOrder) return;

    const targetOrder = orders.find((o) => o.orderNumber === expandedOrder);
    let cancelled = false;
    setLoadingShippingFor(expandedOrder);

    const loadShipping = async (): Promise<OrderPrivateShippingInfo | null> => {
      if (targetOrder?.source === 'server' && authToken) {
        const srv = await fetchOrderShippingOnServerApi(authToken, expandedOrder);
        return srv.shipping;
      }
      if (isFirebaseVerified) {
        const fsInfo = await getOrderShippingDetailsFromFirestore(expandedOrder);
        if (fsInfo) return fsInfo;
      }
      if (authToken) {
        const srv = await fetchOrderShippingOnServerApi(authToken, expandedOrder);
        return srv.shipping;
      }
      return null;
    };

    loadShipping()
      .then((info) => {
        if (!cancelled) {
          setShippingByOrder((prev) => ({ ...prev, [expandedOrder]: info }));
        }
      })
      .catch((err) => {
        console.warn('Could not load private shipping info:', err);
      })
      .finally(() => {
        if (!cancelled) setLoadingShippingFor(null);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, expandedOrder, isAuthenticated, isFirebaseVerified, authToken, orders, shippingByOrder]);

  if (!isOpen) return null;

  const handleSignIn = async () => {
    setAuthError(null);
    setIsSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed.';
      if (!msg.includes('popup-closed-by-user')) {
        setAuthError(msg);
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await onLogoutAll();
      setFirestoreOrders([]);
      setServerOrders([]);
      setShippingByOrder({});
      setExpandedOrder(null);
    } catch (err) {
      console.error('Sign out failed:', err);
    }
  };

  const filteredOrders = orders.filter((ord) => {
    const matchesStatus = statusFilter === 'All' || ord.status === statusFilter;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      ord.orderNumber.toLowerCase().includes(q) ||
      ord.items.some((it) => it.title.toLowerCase().includes(q));
    return matchesStatus && matchesSearch;
  });

  const totalSpend = orders.reduce((sum, o) => sum + o.total, 0);
  const activeShipments = orders.filter((o) => o.status !== 'Delivered').length;

  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'Delivered':
        return 'bg-emerald-950/70 text-emerald-300 border-emerald-500/40';
      case 'Dispatched':
        return 'bg-[#1a2411] text-[#ccff00] border-[#ccff00]/40';
      case 'Preparing Shipment':
        return 'bg-amber-950/60 text-amber-300 border-amber-500/40';
      default:
        return 'bg-[#171d2b] text-slate-200 border-[#2e394f]';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Delivered':
        return <CheckCircle2 className="w-3.5 h-3.5" />;
      case 'Dispatched':
        return <Truck className="w-3.5 h-3.5" />;
      case 'Preparing Shipment':
        return <Clock className="w-3.5 h-3.5" />;
      default:
        return <Package className="w-3.5 h-3.5" />;
    }
  };

  const displayName =
    sessionAccount?.fullName || currentUser?.displayName || 'Verified Athlete';
  const displayEmail =
    sessionAccount?.email || currentUser?.email || '';

  const initials = (displayName || displayEmail || 'OA')
    .split(/\s+/)
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-md flex items-center justify-center p-4 md:p-6">
      <div
        className="relative bg-[#0d0f14] border border-[#232934] w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-[#12151b] border-b border-[#1f242e] flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#181d26] border border-[#2b3240] flex items-center justify-center text-[#ccff00]">
              <UserIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white uppercase tracking-tight flex items-center gap-2">
                <span>Athlete Profile &amp; Customer Order History</span>
                <span className="text-[10px] font-mono bg-[#162111] text-[#ccff00] border border-[#ccff00]/30 px-1.5 py-0.5">
                  Account Sync
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Real-Time Order Summaries, Itemized Receipts &amp; Dispatch Status
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close Order History"
            className="p-1.5 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 md:p-8 space-y-6 flex-1">
          {!isAuthenticated ? (
            <div className="p-8 bg-[#101319] border border-[#202634] text-center max-w-lg mx-auto space-y-5">
              <div className="w-12 h-12 bg-[#161c26] border border-[#2b3547] flex items-center justify-center mx-auto text-[#ccff00]">
                <ShieldCheck className="w-6 h-6" />
              </div>

              <div>
                <h4 className="text-lg font-bold text-white uppercase tracking-tight">
                  Sign In to Access Your Order History
                </h4>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  Log in or sign up for an Offside Athlete account (or use Google Sign-In) to view
                  your saved orders, delivery addresses, and live shipment dispatch updates.
                </p>
              </div>

              {authError && (
                <div className="p-3 bg-[#241313] border border-rose-500/40 text-rose-300 text-xs font-mono flex items-start gap-2 text-left">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <span>{authError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenLoginModal('login');
                  }}
                  className="w-full py-3 bg-[#ccff00] hover:bg-[#b8e600] text-black font-bold uppercase tracking-wider text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Login</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenLoginModal('signup');
                  }}
                  className="w-full py-3 bg-[#171d14] hover:bg-[#222c1d] text-[#ccff00] border border-[#ccff00]/40 font-bold uppercase tracking-wider text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <UserIcon className="w-4 h-4" />
                  <span>Sign Up</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleSignIn}
                disabled={isSigningIn}
                className="w-full py-2.5 bg-[#151923] hover:bg-[#1c2230] text-slate-200 border border-[#283144] font-mono uppercase tracking-wider text-xs transition-all flex items-center justify-center gap-2.5 disabled:opacity-50 cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z"
                  />
                </svg>
                <span>{isSigningIn ? 'Authenticating...' : 'Sign in with Google'}</span>
              </button>
            </div>
          ) : (
            <>
              {/* Athlete Account Strip & KPIs */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-6 p-4 bg-[#11151d] border border-[#1f2634] flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    {currentUser?.photoURL && !sessionAccount ? (
                      <img
                        src={currentUser.photoURL}
                        alt={displayName}
                        referrerPolicy="no-referrer"
                        className="w-11 h-11 object-cover border border-[#ccff00]/40 shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-11 bg-[#1b2213] border border-[#ccff00]/40 text-[#ccff00] flex items-center justify-center font-mono font-bold text-sm shrink-0">
                        {initials}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">
                        {displayName}
                        {sessionAccount && (
                          <span className="ml-1.5 text-[11px] font-mono text-[#ccff00]">
                            @{sessionAccount.username}
                          </span>
                        )}
                      </p>
                      <p className="text-xs font-mono text-slate-400 truncate">{displayEmail}</p>
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono text-[#ccff00] mt-0.5 uppercase">
                        <ShieldCheck className="w-3 h-3" />
                        <span>
                          {sessionAccount ? `${sessionAccount.role} Account` : 'Verified Google Profile'}
                        </span>
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="px-3 py-1.5 bg-[#171c27] hover:bg-rose-950/40 text-slate-300 hover:text-rose-300 border border-[#283142] hover:border-rose-800 text-[11px] font-mono uppercase tracking-wider transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <LogOut className="w-3 h-3" />
                    <span>Sign Out</span>
                  </button>
                </div>

                <div className="md:col-span-2 p-4 bg-[#11151d] border border-[#1f2634]">
                  <span className="text-[10px] font-mono uppercase text-slate-400 block">
                    Total Orders
                  </span>
                  <span className="text-2xl font-extrabold font-mono text-white tabular-nums mt-1 block">
                    {orders.length}
                  </span>
                </div>

                <div className="md:col-span-2 p-4 bg-[#11151d] border border-[#1f2634]">
                  <span className="text-[10px] font-mono uppercase text-slate-400 block">
                    In Progress
                  </span>
                  <span className="text-2xl font-extrabold font-mono text-[#ccff00] tabular-nums mt-1 block">
                    {activeShipments}
                  </span>
                </div>

                <div className="md:col-span-2 p-4 bg-[#11151d] border border-[#1f2634]">
                  <span className="text-[10px] font-mono uppercase text-slate-400 block">
                    Total Spent
                  </span>
                  <span className="text-2xl font-extrabold font-mono text-white tabular-nums mt-1 block">
                    ${totalSpend}
                  </span>
                </div>
              </div>

              {/* Filter & Search Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#101319] border border-[#1c212b] p-3.5">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by order # (OF-...) or garment name"
                    className="w-full bg-[#151923] border border-[#252c3b] text-white pl-8 pr-3 py-1.5 text-xs font-mono focus:outline-none focus:border-[#ccff00]"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {STATUS_FILTERS.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatusFilter(st)}
                      className={`px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider border transition-colors cursor-pointer ${
                        statusFilter === st
                          ? 'bg-[#ccff00] text-black border-[#ccff00] font-bold'
                          : 'bg-[#151923] text-slate-300 border-[#252c3b] hover:border-slate-400'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Orders List */}
              {isLoading ? (
                <div className="py-12 text-center text-xs font-mono text-slate-400">
                  Loading order history from Firestore...
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="p-10 bg-[#101319] border border-[#1e232e] text-center space-y-4">
                  <ShoppingBag className="w-8 h-8 text-slate-500 mx-auto" />
                  <div>
                    <p className="text-sm font-bold text-white uppercase">
                      {orders.length === 0 ? 'No Completed Orders Yet' : 'No Matching Orders'}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {orders.length === 0
                        ? 'Orders you complete at checkout will automatically appear here with live dispatch status.'
                        : 'Try clearing your search filter to view all past orders.'}
                    </p>
                  </div>
                  {orders.length === 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onExploreCollection();
                      }}
                      className="px-6 py-2.5 bg-[#ccff00] hover:bg-[#b8e600] text-black font-bold uppercase tracking-wider text-xs transition-colors cursor-pointer"
                    >
                      Explore Collection
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredOrders.map((order) => {
                    const isExpanded = expandedOrder === order.orderNumber;
                    const shippingInfo = shippingByOrder[order.orderNumber];
                    const itemCount = order.items.reduce((acc, i) => acc + i.quantity, 0);

                    return (
                      <div
                        key={order.orderNumber}
                        className="bg-[#101319] border border-[#202633] transition-colors"
                      >
                        {/* Order Summary Row */}
                        <div
                          onClick={() =>
                            setExpandedOrder(isExpanded ? null : order.orderNumber)
                          }
                          className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:bg-[#141822] transition-colors"
                        >
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <span className="font-mono font-bold text-sm text-white">
                                #{order.orderNumber}
                              </span>
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono uppercase font-bold border ${getStatusBadgeStyle(
                                  order.status
                                )}`}
                              >
                                {getStatusIcon(order.status)}
                                <span>{order.status}</span>
                              </span>
                              <span className="text-xs font-mono text-slate-400">
                                {order.date}
                              </span>
                            </div>
                            <p className="text-xs text-slate-300">
                              {itemCount} {itemCount === 1 ? 'garment' : 'garments'} ·{' '}
                              <span className="text-slate-400">
                                {order.shippingMethod === 'express'
                                  ? 'DHL Express Athlete Priority'
                                  : 'Carbon-Neutral Standard'}
                              </span>{' '}
                              · Est. Delivery:{' '}
                              <span className="font-mono text-[#ccff00]">
                                {order.estimatedDelivery}
                              </span>
                            </p>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-4">
                            <div className="text-left sm:text-right">
                              <span className="text-[10px] font-mono uppercase text-slate-400 block">
                                Total Paid
                              </span>
                              <span className="text-base font-extrabold font-mono text-white tabular-nums">
                                ${order.total} USD
                              </span>
                            </div>

                            <div className="p-1.5 bg-[#171c27] border border-[#252d3d] text-slate-300">
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Expanded Order Summary Details */}
                        {isExpanded && (
                          <div className="px-4 sm:px-5 pb-5 pt-4 border-t border-[#1c222e] bg-[#0c0e13] space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                              {/* Itemized Line Items */}
                              <div className="md:col-span-7 space-y-2.5">
                                <h5 className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                                  Order Line Items ({order.items.length})
                                </h5>
                                <div className="space-y-2">
                                  {order.items.map((item, idx) => (
                                    <div
                                      key={`${order.orderNumber}-${idx}`}
                                      className="p-3 bg-[#12161f] border border-[#1f2533] flex items-center justify-between text-xs"
                                    >
                                      <div>
                                        <p className="font-semibold text-white">{item.title}</p>
                                        <span className="text-[11px] font-mono text-slate-400">
                                          Size: {item.size}
                                          {item.color ? ` · ${item.color}` : ''} · Qty:{' '}
                                          {item.quantity}
                                        </span>
                                      </div>
                                      <span className="font-mono font-bold text-slate-200 tabular-nums">
                                        ${item.price * item.quantity}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Cost Breakdown & Shipping Summary */}
                              <div className="md:col-span-5 space-y-4">
                                <div className="p-3.5 bg-[#12161f] border border-[#1f2533] text-xs font-mono space-y-1.5">
                                  <span className="text-[10px] uppercase text-slate-400 block pb-1 border-b border-[#1d2330]">
                                    Payment Summary
                                  </span>
                                  <div className="flex justify-between text-slate-400">
                                    <span>Subtotal</span>
                                    <span className="text-white">${order.subtotal}</span>
                                  </div>
                                  {order.discountAmount > 0 && (
                                    <div className="flex justify-between text-[#ccff00]">
                                      <span>
                                        Discount
                                        {order.discountCode ? ` (${order.discountCode})` : ''}
                                      </span>
                                      <span>-${order.discountAmount}</span>
                                    </div>
                                  )}
                                  <div className="flex justify-between text-slate-400">
                                    <span>Courier</span>
                                    <span className="text-white">${order.shippingAmount}</span>
                                  </div>
                                  <div className="flex justify-between text-slate-400">
                                    <span>Tax</span>
                                    <span className="text-white">${order.taxAmount}</span>
                                  </div>
                                  <div className="flex justify-between font-bold text-white pt-1.5 border-t border-[#1d2330]">
                                    <span>Total</span>
                                    <span className="text-[#ccff00]">${order.total} USD</span>
                                  </div>
                                  <div className="pt-1 text-[11px] text-slate-400 flex items-center gap-1.5">
                                    <CreditCard className="w-3 h-3 text-slate-400" />
                                    <span>
                                      Method:{' '}
                                      {order.paymentMethod === 'shopify_pay'
                                        ? 'Shop Pay'
                                        : order.paymentMethod === 'apple_pay'
                                        ? 'Apple Pay'
                                        : 'Credit / Debit Card'}
                                    </span>
                                  </div>
                                </div>

                                <div className="p-3.5 bg-[#12161f] border border-[#1f2533] text-xs space-y-1">
                                  <span className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1.5 pb-1 border-b border-[#1d2330]">
                                    <MapPin className="w-3 h-3 text-[#ccff00]" />
                                    <span>Delivery Destination</span>
                                  </span>
                                  {loadingShippingFor === order.orderNumber && !shippingInfo ? (
                                    <p className="text-[11px] font-mono text-slate-400">
                                      Loading shipping details...
                                    </p>
                                  ) : shippingInfo ? (
                                    <div className="text-[11px] font-mono text-slate-300 space-y-0.5 pt-1">
                                      <p className="text-white font-sans font-semibold">
                                        {shippingInfo.firstName} {shippingInfo.lastName}
                                      </p>
                                      <p>
                                        {shippingInfo.address}
                                        {shippingInfo.apartment ? `, ${shippingInfo.apartment}` : ''}
                                      </p>
                                      <p>
                                        {shippingInfo.city}, {shippingInfo.postalCode} ·{' '}
                                        {shippingInfo.country}
                                      </p>
                                      {shippingInfo.athleteId && (
                                        <p className="text-[#ccff00]">
                                          Athlete ID: {shippingInfo.athleteId}
                                        </p>
                                      )}
                                    </div>
                                  ) : (
                                    <p className="text-[11px] font-mono text-slate-400 pt-1">
                                      Ref: {order.shopifyOrderRef}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="pt-3 border-t border-[#1c222e] flex flex-wrap items-center justify-between gap-3">
                              <span className="text-[11px] font-mono text-slate-400">
                                Storefront Ref: {order.shopifyOrderRef}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  onTrackOrder(order.orderNumber);
                                }}
                                className="px-5 py-2 bg-[#ccff00] hover:bg-[#b8e600] text-black font-bold uppercase tracking-wider text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                              >
                                <Truck className="w-3.5 h-3.5" />
                                <span>Track Live Shipment</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#111319] border-t border-[#1f242e] flex items-center justify-between text-xs text-slate-400 font-mono">
          <span>Orders synchronized live with Cloud Firestore</span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-white text-black font-sans font-bold uppercase text-xs hover:bg-slate-200 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
