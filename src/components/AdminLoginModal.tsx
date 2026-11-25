import React, { useState } from 'react';
import { signInWithPopup, signOut, User } from 'firebase/auth';
import { auth, googleProvider, ADMIN_BOOTSTRAP_EMAIL } from '../lib/firebase';
import { checkIsUserAdmin } from '../services/firestore';
import { X, Lock, ShieldCheck, LogOut, AlertTriangle } from 'lucide-react';

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: () => void;
  currentUser: User | null;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  currentUser,
}) => {
  if (!isOpen) return null;

  const [error, setError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsAuthenticating(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const isAdmin = await checkIsUserAdmin(result.user);
      if (isAdmin) {
        onLoginSuccess();
      } else {
        setError(
          `Account "${result.user.email}" does not have admin privileges. Sign in with the authorized admin account (${ADMIN_BOOTSTRAP_EMAIL}).`
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed.';
      if (!msg.includes('popup-closed-by-user')) {
        setError(msg);
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSwitchAccount = async () => {
    await signOut(auth);
    await handleGoogleSignIn();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div
        className="relative bg-[#0d0f14] border border-[#232934] w-full max-w-md shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-[#12151b] border-b border-[#1f242e] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-[#191e28] border border-[#293244] flex items-center justify-center text-[#ccff00]">
              <Lock className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-tight">
                Admin Control Portal
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                Offside Operations &amp; Integrations Center
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          <p className="text-xs text-slate-300 leading-relaxed">
            Authenticate via Google Sign-In to manage the{' '}
            <strong className="text-white">Firestore Stock Management System</strong>,{' '}
            <strong className="text-white">Product Catalog Creator</strong>, and{' '}
            <strong className="text-white">Shopify Integrations Console</strong>.
          </p>

          {error && (
            <div className="p-3 bg-[#241313] border border-rose-500/40 text-rose-300 text-xs font-mono flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {currentUser && (
            <div className="p-3 bg-[#141822] border border-[#242c3d] text-xs space-y-1">
              <span className="text-[10px] font-mono uppercase text-slate-400 block">
                Currently Signed In As
              </span>
              <span className="text-white font-mono block">{currentUser.email}</span>
            </div>
          )}

          <div className="space-y-3">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isAuthenticating}
              className="w-full py-3 bg-[#ccff00] hover:bg-[#b8e600] active:scale-[0.99] text-black font-bold uppercase tracking-wider text-xs transition-all flex items-center justify-center gap-2.5 disabled:opacity-50 cursor-pointer shadow-md"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z"
                />
              </svg>
              <span>
                {isAuthenticating ? 'Verifying with Google...' : 'Sign in with Google'}
              </span>
            </button>

            {currentUser && (
              <button
                type="button"
                onClick={handleSwitchAccount}
                disabled={isAuthenticating}
                className="w-full py-2.5 bg-[#171b25] hover:bg-[#202735] text-slate-200 border border-[#2b3344] text-xs font-mono uppercase tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5 text-slate-400" />
                <span>Switch Google Account</span>
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-[#111319] border-t border-[#1f242e] flex items-center justify-between text-[11px] text-slate-400 font-mono">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#ccff00]" />
            <span>Firebase Verified Auth</span>
          </span>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors uppercase cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
