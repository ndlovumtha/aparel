import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { ShipmentStatus, ShipmentTrackingRecord, TrackingCheckpoint } from '../types/store';
import { getOrderTracking, updateOrderTrackingStatus, getStoredOrders } from '../services/shopify';
import {
  getOrderTrackingFromFirestore,
  updateOrderTrackingStatusInFirestore,
  getUserOrdersFromFirestore,
} from '../services/firestore';
import {
  X,
  Search,
  Package,
  Truck,
  CheckCircle2,
  Clock,
  MapPin,
  ShieldCheck,
  RotateCw,
  Sparkles,
} from 'lucide-react';

interface OrderTrackerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialOrderNumber?: string;
  currentUser: User | null;
  isAdmin?: boolean;
}

const STATUS_STEPS: { key: ShipmentStatus; label: string; desc: string }[] = [
  { key: 'Ordered', label: 'Ordered', desc: 'Order confirmed & logged in database' },
  { key: 'Processing', label: 'Processing', desc: 'Garment QA pass & ultrasonic inspection' },
  { key: 'Shipped', label: 'Shipped', desc: 'In flight / temperature-controlled transit' },
  { key: 'Delivered', label: 'Delivered', desc: 'Signed for at athlete facility' },
];

export const OrderTrackerModal: React.FC<OrderTrackerModalProps> = ({
  isOpen,
  onClose,
  initialOrderNumber = 'OF-849102',
  currentUser,
  isAdmin = false,
}) => {
  const [inputOrderNumber, setInputOrderNumber] = useState(initialOrderNumber || 'OF-849102');
  const [trackingRecord, setTrackingRecord] = useState<ShipmentTrackingRecord | null>(null);
  const [isFirestoreBacked, setIsFirestoreBacked] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [userOrders, setUserOrders] = useState<
    { orderNumber: string; date: string; total: number; status: string }[]
  >([]);

  const storedOrders = getStoredOrders();

  const handleTrack = async (orderNumToSearch: string) => {
    const clean = orderNumToSearch.trim();
    if (!clean) return;
    setIsSearching(true);
    setStatusMessage(null);

    try {
      const firestoreRecord = await getOrderTrackingFromFirestore(clean);
      if (firestoreRecord) {
        setTrackingRecord(firestoreRecord);
        setIsFirestoreBacked(true);
        setIsSearching(false);
        return;
      }
    } catch (err) {
      console.warn('Firestore tracking lookup fallback:', err);
    }

    const fallbackRecord = getOrderTracking(clean);
    setTrackingRecord(fallbackRecord);
    setIsFirestoreBacked(false);
    setIsSearching(false);
  };

  useEffect(() => {
    if (!isOpen) return;
    const target = initialOrderNumber || 'OF-849102';
    setInputOrderNumber(target);
    handleTrack(target);
  }, [isOpen, initialOrderNumber]);

  useEffect(() => {
    if (!isOpen || !currentUser || !currentUser.emailVerified) {
      setUserOrders([]);
      return;
    }
    let cancelled = false;
    getUserOrdersFromFirestore(currentUser.uid)
      .then((orders) => {
        if (!cancelled) setUserOrders(orders);
      })
      .catch((err) => {
        console.warn('Could not load user orders:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const handleStatusChange = async (newStatus: ShipmentStatus) => {
    if (!trackingRecord) return;

    if (isFirestoreBacked) {
      const statusOrder: ShipmentStatus[] = ['Ordered', 'Processing', 'Shipped', 'Delivered'];
      const newIndex = statusOrder.indexOf(newStatus);
      const updatedCheckpoints: TrackingCheckpoint[] = trackingRecord.checkpoints.map((cp) => {
        const cpIndex = statusOrder.indexOf(cp.step);
        const isCompleted = cpIndex <= newIndex;
        const isActive = cpIndex === newIndex;
        return {
          ...cp,
          completed: isCompleted,
          active: isActive,
          timestamp:
            isCompleted && (cp.timestamp.includes('Estimated') || cp.timestamp.includes('Scheduled') || cp.timestamp.includes('Pending'))
              ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : cp.timestamp,
        };
      });

      const updatedLocal: ShipmentTrackingRecord = {
        ...trackingRecord,
        currentStatus: newStatus,
        checkpoints: updatedCheckpoints,
      };
      setTrackingRecord(updatedLocal);

      if (isAdmin) {
        try {
          await updateOrderTrackingStatusInFirestore(
            trackingRecord.orderNumber,
            newStatus,
            updatedCheckpoints
          );
          setStatusMessage(`Shipment status saved to database: "${newStatus}".`);
        } catch (err) {
          console.error(err);
          setStatusMessage(`Preview updated to "${newStatus}" (admin sync retry required).`);
        }
      } else {
        setStatusMessage(
          `Previewing "${newStatus}" step. Sign in as Admin to persist shipment updates in database.`
        );
      }
    } else {
      const updated = updateOrderTrackingStatus(trackingRecord.orderNumber, newStatus);
      setTrackingRecord(updated);
      setStatusMessage(`Sample shipment preview updated to "${newStatus}".`);
    }

    setTimeout(() => setStatusMessage(null), 3500);
  };

  const currentStepIndex = trackingRecord
    ? STATUS_STEPS.findIndex((s) => s.key === trackingRecord.currentStatus)
    : 0;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-md flex items-center justify-center p-4 md:p-6">
      <div
        className="relative bg-[#0d0f14] border border-[#232934] w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-[#12151b] border-b border-[#1f242e] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#181d26] border border-[#2b3240] flex items-center justify-center text-[#ccff00]">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white uppercase tracking-tight flex items-center gap-2">
                <span>Athlete Order & Shipment Tracker</span>
                <span className="text-[10px] font-mono bg-[#162111] text-[#ccff00] border border-[#ccff00]/30 px-1.5 py-0.5">
                  {isFirestoreBacked ? 'Live Database' : 'Live Dispatch'}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Real-Time Courier & Order Lifecycle Synchronization
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Input Bar */}
        <div className="p-6 bg-[#101319] border-b border-[#1c212a]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleTrack(inputOrderNumber);
            }}
            className="space-y-3"
          >
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                <input
                  type="text"
                  value={inputOrderNumber}
                  onChange={(e) => setInputOrderNumber(e.target.value)}
                  placeholder="Enter Order Number (e.g. OF-849102)"
                  className="w-full bg-[#151922] border border-[#262e3d] text-white pl-9 pr-3 py-2.5 text-xs uppercase font-mono tracking-wider focus:outline-none focus:border-[#ccff00]"
                />
              </div>

              <button
                type="submit"
                disabled={isSearching}
                className="px-6 py-2.5 bg-[#ccff00] hover:bg-[#b8e600] active:scale-95 text-black font-bold uppercase tracking-wider text-xs transition-all flex items-center gap-1.5 shrink-0 disabled:opacity-50"
              >
                {isSearching ? (
                  <>
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Searching...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-3.5 h-3.5" />
                    <span>Track Shipment</span>
                  </>
                )}
              </button>
            </div>

            {/* Quick-Select Demo & Saved Database Orders */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500 font-mono text-[11px] uppercase">
                Shipments:
              </span>
              <button
                type="button"
                onClick={() => {
                  setInputOrderNumber('OF-849102');
                  handleTrack('OF-849102');
                }}
                className="text-[11px] font-mono text-slate-300 hover:text-white bg-[#171b25] border border-[#242b38] px-2 py-0.5"
              >
                OF-849102 (Shipped)
              </button>
              <button
                type="button"
                onClick={() => {
                  setInputOrderNumber('OF-391820');
                  handleTrack('OF-391820');
                }}
                className="text-[11px] font-mono text-slate-300 hover:text-white bg-[#171b25] border border-[#242b38] px-2 py-0.5"
              >
                OF-391820 (Delivered)
              </button>

              {userOrders.slice(0, 3).map((ord) => (
                <button
                  key={ord.orderNumber}
                  type="button"
                  onClick={() => {
                    setInputOrderNumber(ord.orderNumber);
                    handleTrack(ord.orderNumber);
                  }}
                  className="text-[11px] font-mono text-[#ccff00] hover:text-white bg-[#1a2312] border border-[#ccff00]/40 px-2 py-0.5"
                >
                  {ord.orderNumber} (${ord.total})
                </button>
              ))}

              {userOrders.length === 0 && storedOrders.length > 0 && storedOrders[0].orderNumber !== 'OF-849102' && (
                <button
                  type="button"
                  onClick={() => {
                    setInputOrderNumber(storedOrders[0].orderNumber);
                    handleTrack(storedOrders[0].orderNumber);
                  }}
                  className="text-[11px] font-mono text-[#ccff00] hover:text-white bg-[#1a2312] border border-[#ccff00]/40 px-2 py-0.5"
                >
                  Your Recent: {storedOrders[0].orderNumber}
                </button>
              )}
            </div>
          </form>

          {/* Feedback banner */}
          {statusMessage && (
            <div className="mt-3 p-2.5 bg-[#172212] border border-[#ccff00]/40 text-[#ccff00] text-xs font-mono flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}
        </div>

        {/* Tracking Details View */}
        {trackingRecord && (
          <div className="p-6 md:p-8 space-y-8">
            {/* Top Shipment Meta Card */}
            <div className="p-4 bg-[#12151c] border border-[#1e2430] flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs uppercase font-mono text-slate-400">Order</span>
                  <span className="text-base font-bold text-white font-mono">{trackingRecord.orderNumber}</span>
                  <span className="text-slate-600">·</span>
                  <span className="text-xs font-mono text-[#ccff00] font-semibold">{trackingRecord.currentStatus}</span>
                </div>
                <p className="text-xs text-slate-400">
                  Carrier: <span className="text-slate-200">{trackingRecord.courier}</span> · Airbill:{' '}
                  <span className="font-mono text-slate-200">{trackingRecord.trackingNumber}</span>
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Athlete Recipient: <span className="text-slate-200">{trackingRecord.athleteName}</span> (
                  <span className="font-mono text-[#ccff00]">{trackingRecord.athleteId}</span>)
                </p>
              </div>

              <div className="text-left md:text-right border-t md:border-t-0 pt-2 md:pt-0 border-[#1f242e]">
                <span className="text-[11px] text-slate-400 uppercase font-mono block">Estimated Arrival</span>
                <span className="text-lg font-extrabold text-white font-mono tabular-nums">
                  {trackingRecord.estimatedDelivery}
                </span>
                <span className="text-[11px] text-slate-400 block font-mono">
                  Destination: {trackingRecord.destination}
                </span>
              </div>
            </div>

            {/* Visual 4-Step Status Progress Bar */}
            <div className="bg-[#10131a] border border-[#1e2430] p-6">
              <div className="flex items-center justify-between mb-6">
                <span className="text-xs uppercase font-bold text-white tracking-wider">
                  Shipment Progression (Status Steps)
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  Step {currentStepIndex + 1} of 4: <span className="text-[#ccff00] font-semibold">{trackingRecord.currentStatus}</span>
                </span>
              </div>

              {/* Progress Line and Nodes */}
              <div className="relative mb-6">
                {/* Connecting Track */}
                <div className="absolute top-4 left-6 right-6 h-0.5 bg-[#1f2533] -z-0" />
                <div
                  className="absolute top-4 left-6 h-0.5 bg-[#ccff00] transition-all duration-500 -z-0"
                  style={{ width: `${(currentStepIndex / (STATUS_STEPS.length - 1)) * 90}%` }}
                />

                <div className="grid grid-cols-4 relative z-10">
                  {STATUS_STEPS.map((step, idx) => {
                    const isCompleted = idx <= currentStepIndex;
                    const isCurrent = idx === currentStepIndex;
                    return (
                      <div
                        key={step.key}
                        onClick={() => handleStatusChange(step.key)}
                        className="flex flex-col items-center text-center group cursor-pointer"
                        title={`Click to set status to ${step.label}`}
                      >
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs font-bold transition-all ${
                            isCompleted
                              ? 'bg-[#ccff00] text-black shadow-lg shadow-[#ccff00]/20'
                              : 'bg-[#181d27] text-slate-500 border border-[#2b3342] group-hover:border-slate-300'
                          } ${isCurrent ? 'ring-4 ring-[#ccff00]/30' : ''}`}
                        >
                          {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                        </div>

                        <span
                          className={`text-xs font-bold uppercase mt-2.5 tracking-tight transition-colors ${
                            isCurrent
                              ? 'text-[#ccff00]'
                              : isCompleted
                              ? 'text-white'
                              : 'text-slate-500 group-hover:text-slate-300'
                          }`}
                        >
                          {step.label}
                        </span>

                        <span className="hidden sm:block text-[10px] text-slate-400 mt-0.5 max-w-[120px] leading-tight">
                          {step.desc}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Status Update Simulator Buttons */}
              <div className="pt-4 border-t border-[#1a1f28] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <span className="text-slate-400 font-mono text-[11px]">
                  Simulate Shipment Progress:
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {STATUS_STEPS.map((step) => {
                    const active = trackingRecord.currentStatus === step.key;
                    return (
                      <button
                        key={step.key}
                        onClick={() => handleStatusChange(step.key)}
                        className={`px-3 py-1 text-xs font-mono uppercase tracking-wider transition-all border ${
                          active
                            ? 'bg-[#ccff00] text-black border-[#ccff00] font-bold'
                            : 'bg-[#141822] text-slate-300 border-[#232a38] hover:border-slate-400'
                        }`}
                      >
                        {step.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Checkpoint Timeline & Manifest */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Checkpoint Timeline */}
              <div className="md:col-span-7 bg-[#101319] border border-[#1e2430] p-5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-4 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#ccff00]" />
                  <span>Telemetry & Transit Checkpoints</span>
                </h4>

                <div className="space-y-4">
                  {trackingRecord.checkpoints.map((cp, idx) => (
                    <div key={idx} className="flex items-start gap-3 relative">
                      {/* Vertical line connecting checkpoints */}
                      {idx < trackingRecord.checkpoints.length - 1 && (
                        <div
                          className={`absolute left-2.5 top-6 bottom-0 w-0.5 ${
                            cp.completed ? 'bg-[#ccff00]/40' : 'bg-[#1e232e]'
                          }`}
                        />
                      )}

                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                          cp.completed
                            ? 'bg-[#ccff00] text-black'
                            : 'bg-[#181c25] text-slate-500 border border-[#272f3d]'
                        }`}
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-current" />
                      </div>

                      <div className="flex-1 pb-1">
                        <div className="flex items-center justify-between text-xs">
                          <span
                            className={`font-semibold uppercase tracking-tight ${
                              cp.active
                                ? 'text-[#ccff00]'
                                : cp.completed
                                ? 'text-white'
                                : 'text-slate-500'
                            }`}
                          >
                            {cp.step}
                          </span>
                          <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                            {cp.timestamp}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 mt-0.5 leading-snug">
                          {cp.description}
                        </p>
                        <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400 mt-1">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          <span>{cp.location}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Package Manifest */}
              <div className="md:col-span-5 bg-[#101319] border border-[#1e2430] p-5 flex flex-col justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-3 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-[#ccff00]" />
                    <span>Garment Manifest ({trackingRecord.items.length})</span>
                  </h4>

                  <div className="space-y-2 text-xs font-mono">
                    {trackingRecord.items.map((it, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 bg-[#141822] border border-[#212735] flex justify-between items-center"
                      >
                        <div>
                          <p className="text-white font-sans font-medium text-xs">{it.title}</p>
                          <span className="text-slate-400 text-[11px]">
                            Size: {it.size} · Qty: {it.quantity}
                          </span>
                        </div>
                        <span className="text-[#ccff00] text-[11px] font-bold">Bonded QA ✓</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#1e232e] text-[11px] font-mono text-slate-400 space-y-1">
                    <p>Shopify Storefront Ref: {trackingRecord.shopifyOrderRef}</p>
                    <p>Packaging: 100% Compostable Matte Sleeve</p>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#1e232e] text-[11px] text-slate-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#ccff00] shrink-0" />
                  <span>Olympic Federation Transit Insurance</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 bg-[#111319] border-t border-[#1f242e] flex items-center justify-between text-xs text-slate-400 font-mono">
          <span>Courier updates refresh automatically every 15 minutes</span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-white text-black font-sans font-bold uppercase text-xs hover:bg-slate-200 transition-colors"
          >
            Close Tracker
          </button>
        </div>
      </div>
    </div>
  );
};
