import React from 'react';
import { ShoppingBag, RefreshCw, SlidersHorizontal, Ruler } from 'lucide-react';
import { ShopifyConfig } from '../types/store';

interface NavbarProps {
  cartCount: number;
  onOpenCart: () => void;
  onOpenAdmin: () => void;
  onOpenFitGuide: () => void;
  onOpenOrderTracker: () => void;
  onOpenSpecials: () => void;
  isAdminLoggedIn: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  cartCount,
  onOpenCart,
  onOpenAdmin,
  onOpenFitGuide,
  onOpenOrderTracker,
  onOpenSpecials,
  isAdminLoggedIn,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-[#0b0c0e]/90 backdrop-blur-md border-b border-[#1b1f28]">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-8 px-6 py-4">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#"
          className="text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0 hover:text-[#ccff00] transition-colors"
          style={{ letterSpacing: '0.08em' }}
        >
          OFFSIDE APPAREL
        </a>

        {/* Zone 2: 4–5 clean single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300">
          <a
            href="#collection"
            className="hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Collection
          </a>
          <button
            onClick={onOpenSpecials}
            className="hover:text-[#ccff00] text-slate-200 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#ccff00]" />
            <span>Specials & Promotions</span>
          </button>
          <button
            onClick={onOpenOrderTracker}
            className="hover:text-white flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>Order Tracker</span>
          </button>
          <a
            href="#technology"
            className="hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Textile Lab
          </a>
          <button
            onClick={onOpenAdmin}
            className="hover:text-white text-slate-300 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer font-mono text-xs"
          >
            <span className="text-[#ccff00]">{isAdminLoggedIn ? '●' : '🔒'}</span>
            <span>{isAdminLoggedIn ? 'Admin Panel' : 'Admin'}</span>
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onOpenCart}
            aria-label="Open Shopping Bag"
            className="flex items-center gap-2.5 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-black bg-[#ccff00] hover:bg-[#b8e600] active:scale-95 transition-all rounded-none whitespace-nowrap shrink-0"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Bag</span>
            <span className="font-mono tabular-nums bg-black text-[#ccff00] px-1.5 py-0.2 text-[11px] font-bold">
              {cartCount}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
