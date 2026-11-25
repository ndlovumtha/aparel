import React, { useState, useEffect } from 'react';
import { User, signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { CartItem, CheckoutCustomerInfo, ConfirmedOrder } from '../types/store';
import {
  X,
  CheckCircle2,
  Lock,
  Truck,
  CreditCard,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Package,
  Printer,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';

interface CustomCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  discountPercentage: number;
  discountCode: string;
  currentUser: User | null;
  onProcessOrder: (customer: CheckoutCustomerInfo) => Promise<ConfirmedOrder>;
  onOrderSuccess: () => void;
  onTrackOrder?: (orderNumber: string) => void;
}

export const CustomCheckoutModal: React.FC<CustomCheckoutModalProps> = ({
  isOpen,
  onClose,
  items,
  discountPercentage,
  discountCode,
  currentUser,
  onProcessOrder,
  onOrderSuccess,
  onTrackOrder,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [confirmedOrder, setConfirmedOrder] = useState<ConfirmedOrder | null>(null);

  // Form State
  const [formData, setFormData] = useState<CheckoutCustomerInfo>({
    email: '',
    firstName: '',
    lastName: '',
    athleteId: '',
    clubOrTeam: '',
    address: '',
    apartment: '',
    city: '',
    postalCode: '',
    country: 'United States',
    phone: '',
    shippingMethod: 'express',
    paymentMethod: 'card',
    discountCode: discountCode || '',
    discountPercentage,
  });

  const [cardNumber, setCardNumber] = useState('•••• •••• •••• 4242');
  const [cardExpiry, setCardExpiry] = useState('11/28');
  const [cardCvc, setCardCvc] = useState('892');

  useEffect(() => {
    if (isOpen) {
      setCheckoutError(null);
      if (currentUser?.email) {
        const nameParts = (currentUser.displayName || '').trim().split(/\s+/);
        setFormData((prev) => ({
          ...prev,
          email: prev.email || currentUser.email || '',
          firstName: prev.firstName || nameParts[0] || '',
          lastName: prev.lastName || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : ''),
          discountCode: discountCode || prev.discountCode,
          discountPercentage,
        }));
      }
    }
  }, [isOpen, currentUser, discountCode, discountPercentage]);

  if (!isOpen) return null;

  const subtotal = items.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const discountAmount = Math.round(subtotal * (discountPercentage / 100));
  const shippingAmount = formData.shippingMethod === 'express' ? 24 : subtotal >= 150 ? 0 : 12;
  const estimatedTax = Math.round((subtotal - discountAmount) * 0.08);
  const grandTotal = Math.max(0, subtotal - discountAmount) + shippingAmount + estimatedTax;

  // Autofill button for instant testing
  const handleAutofillDemo = () => {
    setCheckoutError(null);
    setFormData({
      ...formData,
      email: currentUser?.email || 'marcus.vance@eliteathletics.org',
      firstName: 'Marcus',
      lastName: 'Vance',
      athleteId: 'OLY-TRACK-2026',
      clubOrTeam: 'National Sprint Academy',
      address: '742 Olympic Boulevard, Suite 400',
      apartment: 'Training Facility Bay 2',
      city: 'Eugene',
      postalCode: '97401',
      country: 'United States',
      phone: '+1 (541) 555-0198',
    });
  };

  const handleGoogleSignInForCheckout = async (): Promise<User | null> => {
    setCheckoutError(null);
    setIsSigningIn(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      return result.user;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In was cancelled.';
      if (!msg.includes('popup-closed-by-user')) {
        setCheckoutError(msg);
      }
      return null;
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    setCheckoutError(null);
    if (step === 1) {
      if (!formData.email || !formData.firstName || !formData.lastName || !formData.address || !formData.city || !formData.postalCode) {
        setCheckoutError('Please complete all mandatory delivery fields.');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    } else if (step === 3) {
      handleSubmitPayment();
    }
  };

  const handleSubmitPayment = async () => {
    setCheckoutError(null);
    let activeUser = currentUser || auth.currentUser;
    if (!activeUser || !activeUser.emailVerified) {
      activeUser = await handleGoogleSignInForCheckout();
      if (!activeUser) {
        setCheckoutError('Please sign in with Google to save your order to the database.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const order = await onProcessOrder({
        ...formData,
        discountCode: discountCode || formData.discountCode,
        discountPercentage,
      });
      setConfirmedOrder(order);
      setStep(4);
      onOrderSuccess();
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Checkout error occurred. Please try again.';
      setCheckoutError(msg.startsWith('{') ? 'Failed to persist order in database. Please verify your details and try again.' : msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-md flex items-center justify-center p-4 md:p-6">
      <div
        className="relative bg-[#0d0f14] border border-[#232934] w-full max-w-4xl max-h-[94vh] overflow-y-auto shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Checkout Header */}
        <div className="px-6 py-4 bg-[#12151b] border-b border-[#1f242e] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-bold tracking-tight text-white text-base">OFFSIDE APPAREL</span>
            <span className="text-slate-600">/</span>
            <span className="text-xs uppercase font-mono text-[#ccff00]">Custom Express Checkout</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
              <Lock className="w-3.5 h-3.5 text-[#ccff00]" />
              <span className="hidden sm:inline">256-Bit Encrypted</span>
            </div>
            {step !== 4 && (
              <button
                onClick={onClose}
                className="p-1 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Step Indicator (Steps 1-3) */}
        {step < 4 && (
          <div className="bg-[#0f1218] border-b border-[#1b2029] px-6 py-3 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2 sm:gap-6">
              <span className={`flex items-center gap-1.5 ${step === 1 ? 'text-[#ccff00] font-bold' : step > 1 ? 'text-slate-300' : 'text-slate-600'}`}>
                <span>01.</span>
                <span>Athlete & Shipping</span>
              </span>
              <span className="text-slate-700">→</span>
              <span className={`flex items-center gap-1.5 ${step === 2 ? 'text-[#ccff00] font-bold' : step > 2 ? 'text-slate-300' : 'text-slate-600'}`}>
                <span>02.</span>
                <span>Priority Courier</span>
              </span>
              <span className="text-slate-700">→</span>
              <span className={`flex items-center gap-1.5 ${step === 3 ? 'text-[#ccff00] font-bold' : 'text-slate-600'}`}>
                <span>03.</span>
                <span>Payment</span>
              </span>
            </div>

            {step === 1 && (
              <button
                type="button"
                onClick={handleAutofillDemo}
                className="hidden sm:flex items-center gap-1.5 text-[11px] text-[#ccff00] hover:underline cursor-pointer"
              >
                <Sparkles className="w-3 h-3" />
                <span>Fill Sample Athlete Data</span>
              </button>
            )}
          </div>
        )}

        {/* Step Content */}
        <div className="p-6 md:p-8">
          {checkoutError && (
            <div className="mb-5 p-3 bg-[#241313] border border-rose-500/40 text-rose-300 text-xs font-mono flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{checkoutError}</span>
            </div>
          )}

          {step === 1 && (
            <form onSubmit={handleNextStep} className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white uppercase tracking-tight">
                  Athlete Credentials & Delivery Address
                </h3>
                <button
                  type="button"
                  onClick={handleAutofillDemo}
                  className="sm:hidden text-[11px] text-[#ccff00] font-mono underline"
                >
                  Quick Autofill
                </button>
              </div>

              {/* Contact Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-slate-400 uppercase font-medium mb-1">
                    Contact Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="athlete@domain.com"
                    className="w-full bg-[#141720] border border-[#232936] text-white px-3 py-2 focus:outline-none focus:border-[#ccff00]"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 uppercase font-medium mb-1">
                    Phone for Courier SMS *
                  </label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+1 (555) 000-0000"
                    className="w-full bg-[#141720] border border-[#232936] text-white px-3 py-2 focus:outline-none focus:border-[#ccff00]"
                  />
                </div>
              </div>

              {/* Athlete Privilege Row */}
              <div className="p-3.5 bg-[#12151c] border border-[#1e232e] grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Pro Athlete / Federation License ID (Optional)
                  </label>
                  <input
                    type="text"
                    value={formData.athleteId}
                    onChange={(e) => setFormData({ ...formData, athleteId: e.target.value })}
                    placeholder="e.g. USATF-94182 / FIFA-PRO"
                    className="w-full bg-[#161a24] border border-[#282f3d] text-white px-3 py-2 font-mono uppercase focus:outline-none focus:border-[#ccff00]"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Unlocks prioritized batch queue & personalized garment labeling.
                  </span>
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Affiliated Team / Training Camp
                  </label>
                  <input
                    type="text"
                    value={formData.clubOrTeam}
                    onChange={(e) => setFormData({ ...formData, clubOrTeam: e.target.value })}
                    placeholder="e.g. Bowerman TC / National Centre"
                    className="w-full bg-[#161a24] border border-[#282f3d] text-white px-3 py-2 focus:outline-none focus:border-[#ccff00]"
                  />
                </div>
              </div>

              {/* Delivery Address */}
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-400 uppercase font-medium mb-1">
                      First Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      placeholder="Marcus"
                      className="w-full bg-[#141720] border border-[#232936] text-white px-3 py-2 focus:outline-none focus:border-[#ccff00]"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 uppercase font-medium mb-1">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      placeholder="Vance"
                      className="w-full bg-[#141720] border border-[#232936] text-white px-3 py-2 focus:outline-none focus:border-[#ccff00]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 uppercase font-medium mb-1">
                    Street Address *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="100 Olympic Way"
                    className="w-full bg-[#141720] border border-[#232936] text-white px-3 py-2 focus:outline-none focus:border-[#ccff00]"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-400 uppercase font-medium mb-1">
                      City *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      placeholder="Eugene"
                      className="w-full bg-[#141720] border border-[#232936] text-white px-3 py-2 focus:outline-none focus:border-[#ccff00]"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 uppercase font-medium mb-1">
                      Postal Code *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.postalCode}
                      onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                      placeholder="97401"
                      className="w-full bg-[#141720] border border-[#232936] text-white px-3 py-2 font-mono focus:outline-none focus:border-[#ccff00]"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 uppercase font-medium mb-1">
                      Country
                    </label>
                    <select
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                      className="w-full bg-[#141720] border border-[#232936] text-white px-3 py-2 focus:outline-none focus:border-[#ccff00]"
                    >
                      <option value="United States">United States</option>
                      <option value="United Kingdom">United Kingdom</option>
                      <option value="Germany">Germany</option>
                      <option value="Switzerland">Switzerland</option>
                      <option value="Canada">Canada</option>
                      <option value="Australia">Australia</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Action */}
              <div className="pt-4 border-t border-[#1e232e] flex items-center justify-between">
                <button
                  type="button"
                  onClick={onClose}
                  className="text-xs uppercase text-slate-400 hover:text-white"
                >
                  Return to Bag
                </button>
                <button
                  type="submit"
                  className="px-8 py-3 bg-[#ccff00] hover:bg-[#b8e600] text-black font-bold uppercase tracking-wider text-xs transition-all flex items-center gap-2"
                >
                  <span>Continue to Shipping Method</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-white uppercase tracking-tight">
                Select Courier Speed
              </h3>

              <div className="space-y-3">
                <div
                  onClick={() => setFormData({ ...formData, shippingMethod: 'express' })}
                  className={`p-4 border cursor-pointer transition-all flex items-start justify-between ${
                    formData.shippingMethod === 'express'
                      ? 'border-[#ccff00] bg-[#141920]'
                      : 'border-[#232934] bg-[#0f1217] hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Truck className="w-5 h-5 text-[#ccff00] mt-0.5" />
                    <div>
                      <h4 className="text-sm font-bold text-white uppercase">
                        DHL Express Athlete Priority (2 Business Days)
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Guaranteed temperature-controlled delivery to team accommodation or private address.
                      </p>
                      <span className="text-[11px] font-mono text-[#ccff00] block mt-1">
                        GPS Tracked · Direct Signature Required
                      </span>
                    </div>
                  </div>
                  <span className="font-mono text-sm font-bold text-white tabular-nums">
                    $24.00 USD
                  </span>
                </div>

                <div
                  onClick={() => setFormData({ ...formData, shippingMethod: 'standard' })}
                  className={`p-4 border cursor-pointer transition-all flex items-start justify-between ${
                    formData.shippingMethod === 'standard'
                      ? 'border-[#ccff00] bg-[#141920]'
                      : 'border-[#232934] bg-[#0f1217] hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Package className="w-5 h-5 text-slate-400 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-bold text-white uppercase">
                        Carbon-Neutral Standard Courier (4–5 Business Days)
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Zero-emission electric transit fleet delivery.
                      </p>
                      <span className="text-[11px] font-mono text-slate-400 block mt-1">
                        {subtotal >= 150 ? 'Complimentary on orders over $150' : 'Standard Rate'}
                      </span>
                    </div>
                  </div>
                  <span className="font-mono text-sm font-bold text-white tabular-nums">
                    {subtotal >= 150 ? 'FREE' : '$12.00 USD'}
                  </span>
                </div>
              </div>

              {/* Order Summary Snapshot */}
              <div className="p-4 bg-[#111319] border border-[#1e232e] text-xs font-mono space-y-1.5">
                <div className="flex justify-between text-slate-400">
                  <span>Cart Items ({items.length})</span>
                  <span>${subtotal}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-[#ccff00]">
                    <span>Athlete Privilege Discount</span>
                    <span>-${discountAmount}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-400">
                  <span>Selected Courier</span>
                  <span>{formData.shippingMethod === 'express' ? '$24' : subtotal >= 150 ? '$0' : '$12'}</span>
                </div>
                <div className="flex justify-between font-bold text-white pt-2 border-t border-[#1e232e] text-sm">
                  <span>Estimated Total</span>
                  <span className="text-[#ccff00]">${grandTotal} USD</span>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-4 border-t border-[#1e232e] flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-xs uppercase text-slate-400 hover:text-white flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to Address</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="px-8 py-3 bg-[#ccff00] hover:bg-[#b8e600] text-black font-bold uppercase tracking-wider text-xs transition-all flex items-center gap-2"
                >
                  <span>Proceed to Payment</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-white uppercase tracking-tight">
                Secure Payment Authorization
              </h3>

              {/* Payment Methods */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, paymentMethod: 'card' })}
                    className={`py-3 px-4 border text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                      formData.paymentMethod === 'card'
                        ? 'border-[#ccff00] bg-[#141920] text-white'
                        : 'border-[#232934] bg-[#0f1217] text-slate-400 hover:text-white'
                    }`}
                  >
                    <CreditCard className="w-4 h-4 text-[#ccff00]" />
                    <span>Credit / Debit Card</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, paymentMethod: 'shopify_pay' })}
                    className={`py-3 px-4 border text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                      formData.paymentMethod === 'shopify_pay'
                        ? 'border-[#ccff00] bg-[#141920] text-white'
                        : 'border-[#232934] bg-[#0f1217] text-slate-400 hover:text-white'
                    }`}
                  >
                    <span className="text-[#ccff00] font-black">Shop</span>
                    <span>Pay 1-Click</span>
                  </button>
                </div>

                {formData.paymentMethod === 'card' ? (
                  <div className="p-4 bg-[#13161f] border border-[#232936] space-y-3 text-xs">
                    <div>
                      <label className="block text-slate-400 uppercase font-medium mb-1">
                        Card Number
                      </label>
                      <input
                        type="text"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        placeholder="4242 4242 4242 4242"
                        className="w-full bg-[#171b26] border border-[#2b3342] text-white px-3 py-2 font-mono text-sm focus:outline-none focus:border-[#ccff00]"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 uppercase font-medium mb-1">
                          Expiration (MM/YY)
                        </label>
                        <input
                          type="text"
                          value={cardExpiry}
                          onChange={(e) => setCardExpiry(e.target.value)}
                          placeholder="MM/YY"
                          className="w-full bg-[#171b26] border border-[#2b3342] text-white px-3 py-2 font-mono text-sm focus:outline-none focus:border-[#ccff00]"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 uppercase font-medium mb-1">
                          Security CVC
                        </label>
                        <input
                          type="text"
                          value={cardCvc}
                          onChange={(e) => setCardCvc(e.target.value)}
                          placeholder="CVC"
                          className="w-full bg-[#171b26] border border-[#2b3342] text-white px-3 py-2 font-mono text-sm focus:outline-none focus:border-[#ccff00]"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-[#13161f] border border-[#232936] text-xs text-slate-300">
                    <p className="font-semibold text-white mb-1">Shopify Pay Fast Authentication</p>
                    <p className="text-slate-400 mb-2">
                      Connected to authorized Shopify merchant vault. Payment will be synchronized with single-tap biometric confirmation.
                    </p>
                    <span className="text-[11px] font-mono text-[#ccff00]">
                      Shopify Vault Token: Verified for {formData.email || 'athlete@domain.com'}
                    </span>
                  </div>
                )}
              </div>

              {/* Final Total Calculation Table */}
              <div className="p-4 bg-[#101218] border border-[#1c212a] text-xs font-mono space-y-1.5">
                <div className="flex justify-between text-slate-400">
                  <span>Recipient:</span>
                  <span className="text-white">{formData.firstName} {formData.lastName}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Destination:</span>
                  <span className="text-white">{formData.city}, {formData.country}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal:</span>
                  <span className="text-white">${subtotal}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-[#ccff00]">
                    <span>Athlete Privilege ({discountPercentage}%):</span>
                    <span>-${discountAmount}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-400">
                  <span>Estimated Tax (8%):</span>
                  <span className="text-white">${estimatedTax}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Shipping:</span>
                  <span className="text-white">${shippingAmount}</span>
                </div>
                <div className="flex justify-between text-base font-bold text-white pt-2 border-t border-[#1e232e]">
                  <span className="font-sans uppercase">Final Charge:</span>
                  <span className="text-[#ccff00]">${grandTotal} USD</span>
                </div>
              </div>

              {/* Athlete Account Verification for Order Persistence */}
              <div className="p-4 bg-[#11151d] border border-[#222938] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-[#ccff00] shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-white uppercase tracking-tight">
                      {currentUser && currentUser.emailVerified
                        ? 'Verified Athlete Account Linked'
                        : 'Google Verification Required to Save Order'}
                    </p>
                    <p className="text-slate-400 font-mono text-[11px] mt-0.5">
                      {currentUser && currentUser.emailVerified
                        ? `Signed in as ${currentUser.email} — receipt & shipment tracking synced to database.`
                        : 'Sign in with Google to bind your order receipt & live shipment tracker securely.'}
                    </p>
                  </div>
                </div>
                {(!currentUser || !currentUser.emailVerified) && (
                  <button
                    type="button"
                    onClick={handleGoogleSignInForCheckout}
                    disabled={isSigningIn}
                    className="px-4 py-2 bg-[#1c2330] hover:bg-[#263042] border border-[#ccff00]/50 text-[#ccff00] font-mono font-bold uppercase text-[11px] tracking-wider transition-colors shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    {isSigningIn ? 'Connecting...' : 'Sign in with Google'}
                  </button>
                )}
              </div>

              {/* Actions */}
              <div className="pt-4 border-t border-[#1e232e] flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="text-xs uppercase text-slate-400 hover:text-white flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to Shipping</span>
                </button>
                <button
                  type="button"
                  onClick={handleSubmitPayment}
                  disabled={isSubmitting || isSigningIn}
                  className="px-8 py-3.5 bg-[#ccff00] hover:bg-[#b8e600] text-black font-bold uppercase tracking-wider text-xs transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50 shadow-xl"
                >
                  {isSubmitting ? (
                    <>
                      <span className="animate-spin">◌</span>
                      <span>Authorizing &amp; Saving Order...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      <span>Authorize Payment · ${grandTotal} USD</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {step === 4 && confirmedOrder && (
            <div className="space-y-6 text-center py-4">
              <div className="w-16 h-16 bg-[#162310] border border-[#ccff00]/40 flex items-center justify-center mx-auto text-[#ccff00]">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <span className="text-xs font-mono uppercase tracking-widest text-[#ccff00]">
                  Payment Authorized · Order Confirmed
                </span>
                <h3 className="text-2xl md:text-3xl font-bold text-white uppercase tracking-tight mt-1">
                  Order #{confirmedOrder.orderNumber}
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-1">
                  Shopify Order Reference: {confirmedOrder.shopifyOrderRef}
                </p>
              </div>

              {/* Order Status Timeline */}
              <div className="p-4 bg-[#12151c] border border-[#202530] text-left max-w-xl mx-auto">
                <div className="flex items-center justify-between text-xs font-mono mb-3">
                  <span className="text-slate-300">Estimated Delivery:</span>
                  <span className="text-[#ccff00] font-bold">{confirmedOrder.estimatedDelivery}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-mono">
                  <div className="p-2 bg-[#1b2214] text-[#ccff00] border border-[#ccff00]/30 font-bold">
                    ✓ Verified & Synced
                  </div>
                  <div className="p-2 bg-[#181d27] text-slate-300 border border-[#252c38]">
                    Preparing Cut & Pack
                  </div>
                  <div className="p-2 bg-[#181d27] text-slate-400 border border-[#252c38]">
                    DHL Express Handover
                  </div>
                </div>
              </div>

              {/* Itemized Order Receipt */}
              <div className="p-4 bg-[#101217] border border-[#1b2029] text-left max-w-xl mx-auto space-y-2 text-xs font-mono">
                <div className="text-slate-400 uppercase text-[10px] pb-1 border-b border-[#1b2029]">
                  Receipt Summary ({confirmedOrder.items.length} Items)
                </div>
                {confirmedOrder.items.map((it) => (
                  <div key={it.id} className="flex justify-between items-center py-1">
                    <div>
                      <span className="text-white font-sans font-medium">{it.title}</span>
                      <span className="text-slate-400 text-[11px] block">
                        Size: {it.size} · Qty: {it.quantity}
                      </span>
                    </div>
                    <span className="text-slate-200 tabular-nums">
                      ${it.price * it.quantity}
                    </span>
                  </div>
                ))}
                <div className="pt-2 border-t border-[#1b2029] space-y-1 text-slate-400">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span className="text-white">${confirmedOrder.subtotal}</span>
                  </div>
                  {confirmedOrder.discountAmount > 0 && (
                    <div className="flex justify-between text-[#ccff00]">
                      <span>Athlete Privilege Discount:</span>
                      <span>-${confirmedOrder.discountAmount}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Courier Delivery:</span>
                    <span className="text-white">${confirmedOrder.shippingAmount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tax:</span>
                    <span className="text-white">${confirmedOrder.taxAmount}</span>
                  </div>
                  <div className="flex justify-between font-bold text-white pt-2 border-t border-[#232936] text-sm">
                    <span className="font-sans uppercase">Total Paid:</span>
                    <span className="text-[#ccff00]">${confirmedOrder.total} USD</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                {onTrackOrder && (
                  <button
                    onClick={() => {
                      onClose();
                      onTrackOrder(confirmedOrder.orderNumber);
                    }}
                    className="px-6 py-2.5 bg-[#ccff00] hover:bg-[#b8e600] text-black font-bold uppercase tracking-wider text-xs transition-colors flex items-center gap-1.5 shadow-md"
                  >
                    <Truck className="w-4 h-4" />
                    <span>Track Live Shipment</span>
                  </button>
                )}
                <button
                  onClick={() => window.print()}
                  className="px-5 py-2.5 border border-[#2c3342] hover:border-slate-300 text-slate-200 hover:text-white text-xs font-mono uppercase tracking-wider flex items-center gap-2 transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Receipt</span>
                </button>
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 bg-white hover:bg-slate-200 text-black font-bold uppercase tracking-wider text-xs transition-colors"
                >
                  Return to Storefront
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
