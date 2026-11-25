import React from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { SessionAccount } from '../types/store';
import { ShoppingBag, User, Search, X, LogIn, UserPlus, LogOut, Shield } from 'lucide-react';

interface NavbarProps {
  cartCount: number;
  onOpenCart: () => void;
  onOpenLogin: (mode?: 'login' | 'signup') => void;
  onOpenOperations: () => void;
  onLogoutAll: () => void;
  onOpenFitGuide: () => void;
  onOpenOrderTracker: () => void;
  onOpenOrderHistory: () => void;
  onOpenSpecials: () => void;
  canAccessOperations: boolean;
  sessionAccount: SessionAccount | null;
  currentUser: FirebaseUser | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSearchSubmit?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  cartCount,
  onOpenCart,
  onOpenLogin,
  onOpenOperations,
  onLogoutAll,
  onOpenOrderTracker,
  onOpenOrderHistory,
  onOpenSpecials,
  canAccessOperations,
  sessionAccount,
  currentUser,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
}) => {
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearchSubmit?.();
  };

  const isSignedIn = Boolean(sessionAccount || currentUser);
  const accountLabel = sessionAccount
    ? `@${sessionAccount.username}`
    : currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Athlete';

  return (
    <header className="sticky top-0 z-40 bg-[#0b0c0e]/90 backdrop-blur-md border-b border-[#1b1f28]">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 px-6 py-4">
        {/* Zone 1: Wordmark */}
        <a
          href="#"
          className="text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0 hover:text-[#ccff00] transition-colors"
          style={{ letterSpacing: '0.08em' }}
        >
          OFFSIDE APPAREL
        </a>

        {/* Zone 2: Clean navigation links (No public Admin Portal button) */}
        <nav className="hidden lg:flex items-center gap-5 text-sm font-medium text-slate-300">
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
            <span>Specials</span>
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
        </nav>

        {/* Zone 3: Search + Login/Account + My Orders + Bag */}
        <div className="flex items-center gap-2 shrink-0">
          <form onSubmit={handleFormSubmit} className="hidden md:block relative w-44 xl:w-56">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search title or category..."
              aria-label="Search catalog by title or category"
              className="w-full bg-[#141821] border border-[#262d3c] text-white placeholder:text-slate-500 pl-8 pr-7 py-2 text-xs font-mono focus:outline-none focus:border-[#ccff00] transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label="Clear catalog search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </form>

          <button
            onClick={onOpenOrderHistory}
            aria-label="Open Customer Order History & Profile"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-mono uppercase tracking-wider text-slate-200 bg-[#141821] hover:bg-[#1b212e] border border-[#262d3c] hover:border-slate-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <User className="w-3.5 h-3.5 text-[#ccff00]" />
            <span className="hidden sm:inline">{isSignedIn ? 'My Orders' : 'Orders'}</span>
          </button>

          {!isSignedIn ? (
            <>
              <button
                type="button"
                onClick={() => onOpenLogin('login')}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-mono uppercase tracking-wider text-white bg-[#171c27] hover:bg-[#222938] border border-[#2d3648] hover:border-[#ccff00]/60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5 text-[#ccff00]" />
                <span>Login</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenLogin('signup')}
                className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-xs font-mono uppercase tracking-wider text-[#ccff00] bg-[#151d11] hover:bg-[#1e2a18] border border-[#ccff00]/40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Sign Up</span>
              </button>
            </>
          ) : (
            <div className="flex items-center gap-1.5">
              {canAccessOperations && (
                <button
                  type="button"
                  onClick={onOpenOperations}
                  className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-mono uppercase tracking-wider text-[#ccff00] bg-[#162011] hover:bg-[#1e2c17] border border-[#ccff00]/40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  title="Open Operations Console"
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline">Operations</span>
                </button>
              )}

              <button
                type="button"
                onClick={onLogoutAll}
                title={`Signed in as ${accountLabel} — Click to Log Out`}
                className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-mono text-slate-200 bg-[#141821] hover:bg-rose-950/40 hover:text-rose-200 border border-[#262d3c] hover:border-rose-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span className="hidden sm:inline max-w-[110px] truncate">{accountLabel}</span>
                <LogOut className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>
          )}

          <button
            onClick={onOpenCart}
            aria-label="Open Shopping Bag"
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold uppercase tracking-wider text-black bg-[#ccff00] hover:bg-[#b8e600] active:scale-95 transition-all rounded-none whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Bag</span>
            <span className="font-mono tabular-nums bg-black text-[#ccff00] px-1.5 py-0.2 text-[11px] font-bold">
              {cartCount}
            </span>
          </button>
        </div>
      </div>

      {/* Mobile / Tablet Compact Search Bar */}
      <div className="md:hidden px-6 pb-3">
        <form onSubmit={handleFormSubmit} className="relative w-full">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search catalog by title or category..."
            aria-label="Search catalog by title or category"
            className="w-full bg-[#141821] border border-[#262d3c] text-white placeholder:text-slate-500 pl-8 pr-8 py-2 text-xs font-mono focus:outline-none focus:border-[#ccff00] transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Clear catalog search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </form>
      </div>
    </header>
  );
};
