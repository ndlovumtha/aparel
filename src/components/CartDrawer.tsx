import React, { useState } from 'react';
import { CartItem } from '../types/store';
import { X, Trash2, ArrowRight, ShieldCheck, Tag, ShoppingBag } from 'lucide-react';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQuantity: (id: string, delta: number) => void;
  onRemoveItem: (id: string) => void;
  onCheckout: () => void;
  discountCode: string;
  discountPercentage: number;
  onApplyDiscount: (code: string) => { success: boolean; message: string };
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  items,
  onUpdateQuantity,
  onRemoveItem,
  onCheckout,
  discountCode,
  discountPercentage,
  onApplyDiscount,
}) => {
  const [inputCode, setInputCode] = useState(discountCode || '');
  const [codeMessage, setCodeMessage] = useState<{ text: string; isError: boolean } | null>(null);

  if (!isOpen) return null;

  const subtotal = items.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const discountAmount = Math.round(subtotal * (discountPercentage / 100));
  const finalSubtotal = subtotal - discountAmount;
  const freeShippingThreshold = 150;
  const amountToFreeShipping = Math.max(0, freeShippingThreshold - subtotal);
  const progressPercent = Math.min(100, (subtotal / freeShippingThreshold) * 100);

  const handleApplyCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCode.trim()) return;
    const res = onApplyDiscount(inputCode.trim());
    if (res.success) {
      setCodeMessage({ text: res.message, isError: false });
    } else {
      setCodeMessage({ text: res.message, isError: true });
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/75 backdrop-blur-sm flex justify-end">
      <div
        className="w-full max-w-md bg-[#0d0f14] border-l border-[#202530] h-full flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="p-5 bg-[#12151b] border-b border-[#1f242e] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-[#ccff00]" />
            <h3 className="text-base font-bold text-white uppercase tracking-tight">
              Athlete Bag ({items.reduce((acc, i) => acc + i.quantity, 0)})
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Free Priority Shipping Bar */}
        <div className="px-5 py-3 bg-[#131720] border-b border-[#1e232e]">
          <div className="flex items-center justify-between text-xs mb-1.5 font-mono">
            <span className="text-slate-300">
              {amountToFreeShipping > 0
                ? `Add $${amountToFreeShipping} for Free DHL Priority Courier`
                : 'Unlocked: Free Global DHL Priority Courier'}
            </span>
            <span className="text-[#ccff00] font-bold tabular-nums">
              {progressPercent.toFixed(0)}%
            </span>
          </div>
          <div className="w-full bg-[#1e2430] h-1.5 overflow-hidden">
            <div
              className="bg-[#ccff00] h-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Itemized List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {items.length === 0 ? (
            <div className="py-24 text-center">
              <ShoppingBag className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-300 text-sm font-medium mb-1">Your bag is currently empty.</p>
              <p className="text-slate-500 text-xs mb-6">
                Explore our minimalist high-performance collection engineered for professional athletes.
              </p>
              <button
                onClick={onClose}
                className="px-6 py-2.5 bg-white text-black text-xs font-bold uppercase tracking-wider hover:bg-slate-200 transition-colors"
              >
                Shop Collection
              </button>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="p-3 bg-[#11141a] border border-[#1b2029] flex gap-3.5 items-center"
              >
                <div className="w-16 h-16 bg-[#161a22] overflow-hidden shrink-0 border border-[#202530]">
                  <img
                    src={item.image}
                    alt={item.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover object-center"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-bold text-white uppercase truncate">
                    {item.title}
                  </h4>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5 font-mono">
                    <span>Size: {item.size}</span>
                    <span>·</span>
                    <span>{item.color}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center border border-[#252b37] bg-[#161a22]">
                      <button
                        onClick={() => onUpdateQuantity(item.id, -1)}
                        className="px-2 py-0.5 text-xs text-slate-400 hover:text-white font-mono"
                      >
                        -
                      </button>
                      <span className="px-2 text-xs font-mono text-white tabular-nums font-bold">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => onUpdateQuantity(item.id, 1)}
                        className="px-2 py-0.5 text-xs text-slate-400 hover:text-white font-mono"
                      >
                        +
                      </button>
                    </div>

                    <span className="text-xs font-mono font-bold text-white tabular-nums">
                      ${item.price * item.quantity}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => onRemoveItem(item.id)}
                  aria-label="Remove item"
                  className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer & Checkout Area */}
        {items.length > 0 && (
          <div className="p-5 bg-[#12151b] border-t border-[#1f242e] space-y-4">
            {/* Promo / Athlete Code form */}
            <form onSubmit={handleApplyCode} className="space-y-1">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Tag className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value)}
                    placeholder="Athlete code (e.g. PRO15)"
                    className="w-full bg-[#161922] border border-[#232936] text-white pl-8 pr-3 py-1.5 text-xs uppercase font-mono focus:outline-none focus:border-[#ccff00]"
                  />
                </div>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-[#1f2430] hover:bg-[#2b3342] text-xs font-mono uppercase text-slate-200 border border-[#2e3646] transition-colors"
                >
                  Apply
                </button>
              </div>
              {codeMessage && (
                <p className={`text-[11px] font-mono ${codeMessage.isError ? 'text-rose-400' : 'text-[#ccff00]'}`}>
                  {codeMessage.text}
                </p>
              )}
            </form>

            {/* Calculations Breakdown */}
            <div className="space-y-1.5 text-xs font-mono pt-2 border-t border-[#1a1e27]">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal</span>
                <span className="text-white tabular-nums">${subtotal}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-[#ccff00]">
                  <span>Athlete Privilege ({discountPercentage}%)</span>
                  <span className="tabular-nums">-${discountAmount}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-400">
                <span>Shipping</span>
                <span>{subtotal >= freeShippingThreshold ? 'FREE' : 'Calculated at Checkout'}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-white pt-2 border-t border-[#1e232e]">
                <span className="font-sans uppercase">Total (Est.)</span>
                <span className="text-[#ccff00] tabular-nums">${finalSubtotal} USD</span>
              </div>
            </div>

            {/* Proceed Button */}
            <button
              onClick={() => {
                onClose();
                onCheckout();
              }}
              className="w-full py-3.5 px-6 bg-[#ccff00] hover:bg-[#b8e600] active:scale-[0.99] text-black font-bold uppercase tracking-wider text-xs transition-all flex items-center justify-center gap-2 shadow-lg"
            >
              <span>Proceed to Custom Checkout</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="flex items-center justify-center gap-2 text-[10px] text-slate-500 font-mono">
              <ShieldCheck className="w-3 h-3 text-[#ccff00]" />
              <span>Shopify Storefront Encrypted · 30-Day Pro Fit Guarantee</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
