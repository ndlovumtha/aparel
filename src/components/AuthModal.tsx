import React, { useState, useEffect } from 'react';
import { signInWithPopup, User } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import {
  BootstrapStatus,
  claimSuperuser,
  getAuthBootstrapStatus,
  loginWithCredentials,
  signupCustomer,
} from '../services/authApi';
import type { SessionAccount } from '../types/store';
import {
  X,
  Lock,
  UserPlus,
  LogIn,
  ShieldCheck,
  AlertTriangle,
  KeyRound,
  Eye,
  EyeOff,
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: 'login' | 'signup';
  onClose: () => void;
  onAuthSuccess: (user: SessionAccount, token: string) => void;
  onGoogleLoginSuccess?: (user: User) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode = 'login',
  onClose,
  onAuthSuccess,
  onGoogleLoginSuccess,
}) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'claim_superuser'>(initialMode);
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Login form
  const [identifier, setIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Customer Sign Up form
  const [fullName, setFullName] = useState('');
  const [signupUsername, setSignupUsername] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');

  // First-Run Superuser Claim form
  const [claimUsername, setClaimUsername] = useState('ndlovumtha');
  const [claimPassword, setClaimPassword] = useState('');
  const [claimConfirmPassword, setClaimConfirmPassword] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setMode(initialMode);
    getAuthBootstrapStatus()
      .then((status) => {
        setBootstrapStatus(status);
        if (status.suggestedUsername) {
          setClaimUsername(status.suggestedUsername);
        }
      })
      .catch(() => {
        setBootstrapStatus(null);
      });
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const { user, token } = await loginWithCredentials({
        identifier,
        password: loginPassword,
      });
      setLoginPassword('');
      onAuthSuccess(user, token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (signupPassword !== signupConfirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setIsSubmitting(true);
    try {
      const { user, token } = await signupCustomer({
        fullName,
        username: signupUsername,
        email: signupEmail,
        password: signupPassword,
      });
      setSignupPassword('');
      setSignupConfirmPassword('');
      onAuthSuccess(user, token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClaimSuperuserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (claimPassword !== claimConfirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setIsSubmitting(true);
    try {
      const { user, token } = await claimSuperuser({
        username: claimUsername,
        password: claimPassword,
      });
      setClaimPassword('');
      setClaimConfirmPassword('');
      onAuthSuccess(user, token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Superuser setup failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await signInWithPopup(auth, googleProvider);
      onGoogleLoginSuccess?.(res.user);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed.';
      if (!msg.includes('popup-closed-by-user')) {
        setError(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
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
            <div className="w-8 h-8 bg-[#181d26] border border-[#2b3240] flex items-center justify-center text-[#ccff00]">
              {mode === 'signup' ? (
                <UserPlus className="w-4 h-4" />
              ) : mode === 'claim_superuser' ? (
                <KeyRound className="w-4 h-4" />
              ) : (
                <Lock className="w-4 h-4" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-tight">
                {mode === 'signup'
                  ? 'Create Athlete Account'
                  : mode === 'claim_superuser'
                  ? 'Initialize Superuser Account'
                  : 'Offside Account Login'}
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                {mode === 'signup'
                  ? 'Track Orders & Checkout Faster'
                  : mode === 'claim_superuser'
                  ? 'One-Time First-Run Operations Claim'
                  : 'Customer, Staff & Operations Access'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Login Modal"
            className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switch Tabs */}
        {mode !== 'claim_superuser' && (
          <div className="grid grid-cols-2 border-b border-[#1f242e] bg-[#0f1218] text-xs font-mono uppercase">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setMode('login');
              }}
              className={`py-3 font-bold tracking-wider transition-colors cursor-pointer ${
                mode === 'login'
                  ? 'text-[#ccff00] border-b-2 border-[#ccff00] bg-[#141822]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setMode('signup');
              }}
              className={`py-3 font-bold tracking-wider transition-colors cursor-pointer ${
                mode === 'signup'
                  ? 'text-[#ccff00] border-b-2 border-[#ccff00] bg-[#141822]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sign Up
            </button>
          </div>
        )}

        {/* Body */}
        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-[#241313] border border-rose-500/40 text-rose-300 text-xs font-mono flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {mode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 uppercase font-mono text-[11px] mb-1">
                  Username or Email
                </label>
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="username or athlete@domain.com"
                  autoComplete="username"
                  className="w-full bg-[#141821] border border-[#262e3d] text-white px-3 py-2.5 text-xs font-mono focus:outline-none focus:border-[#ccff00]"
                />
              </div>

              <div>
                <label className="block text-slate-400 uppercase font-mono text-[11px] mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    className="w-full bg-[#141821] border border-[#262e3d] text-white pl-3 pr-9 py-2.5 text-xs font-mono focus:outline-none focus:border-[#ccff00]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white cursor-pointer"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-[#ccff00] hover:bg-[#b8e600] text-black font-bold uppercase tracking-wider text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>{isSubmitting ? 'Signing In...' : 'Log In'}</span>
              </button>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-[#1e2430]" />
                <span className="shrink mx-3 text-[10px] font-mono uppercase text-slate-500">
                  Or Continue With
                </span>
                <div className="flex-grow border-t border-[#1e2430]" />
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isSubmitting}
                className="w-full py-2.5 bg-[#151923] hover:bg-[#1c2230] text-slate-200 border border-[#283144] font-mono uppercase tracking-wider text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z"
                  />
                </svg>
                <span>Sign in with Google</span>
              </button>

              {bootstrapStatus?.needsSuperuserClaim && (
                <div className="pt-2 border-t border-[#1b202b] text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setMode('claim_superuser');
                    }}
                    className="text-[11px] font-mono text-[#ccff00] hover:underline cursor-pointer"
                  >
                    First-Run Setup: Initialize Superuser (@{bootstrapStatus.suggestedUsername})
                  </button>
                </div>
              )}
            </form>
          )}

          {mode === 'signup' && (
            <form onSubmit={handleSignupSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-400 uppercase font-mono text-[11px] mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Marcus Vance"
                  className="w-full bg-[#141821] border border-[#262e3d] text-white px-3 py-2 text-xs focus:outline-none focus:border-[#ccff00]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 uppercase font-mono text-[11px] mb-1">
                    Username *
                  </label>
                  <input
                    type="text"
                    required
                    value={signupUsername}
                    onChange={(e) => setSignupUsername(e.target.value)}
                    placeholder="mvance"
                    autoComplete="username"
                    className="w-full bg-[#141821] border border-[#262e3d] text-white px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#ccff00]"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 uppercase font-mono text-[11px] mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    placeholder="athlete@domain.com"
                    autoComplete="email"
                    className="w-full bg-[#141821] border border-[#262e3d] text-white px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#ccff00]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 uppercase font-mono text-[11px] mb-1">
                  Password (Min 8 characters) *
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  placeholder="Create a strong password"
                  autoComplete="new-password"
                  className="w-full bg-[#141821] border border-[#262e3d] text-white px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#ccff00]"
                />
              </div>

              <div>
                <label className="block text-slate-400 uppercase font-mono text-[11px] mb-1">
                  Confirm Password *
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={signupConfirmPassword}
                  onChange={(e) => setSignupConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  autoComplete="new-password"
                  className="w-full bg-[#141821] border border-[#262e3d] text-white px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#ccff00]"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-[#ccff00] hover:bg-[#b8e600] text-black font-bold uppercase tracking-wider text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>{isSubmitting ? 'Creating Account...' : 'Create Customer Account'}</span>
              </button>
            </form>
          )}

          {mode === 'claim_superuser' && (
            <form onSubmit={handleClaimSuperuserSubmit} className="space-y-4 text-xs">
              <div className="p-3 bg-[#121720] border border-[#263042] text-slate-300 leading-relaxed text-[11px]">
                Set the initial password for the Superuser operations account (
                <span className="font-mono text-[#ccff00]">@{claimUsername}</span>). Once claimed,
                this setup locks permanently and grants staff provisioning privileges.
              </div>

              <div>
                <label className="block text-slate-400 uppercase font-mono text-[11px] mb-1">
                  Superuser Username
                </label>
                <input
                  type="text"
                  required
                  value={claimUsername}
                  onChange={(e) => setClaimUsername(e.target.value)}
                  className="w-full bg-[#141821] border border-[#262e3d] text-white px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#ccff00]"
                />
              </div>

              <div>
                <label className="block text-slate-400 uppercase font-mono text-[11px] mb-1">
                  Superuser Password (Min 8 characters) *
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={claimPassword}
                  onChange={(e) => setClaimPassword(e.target.value)}
                  placeholder="Set Superuser password"
                  autoComplete="new-password"
                  className="w-full bg-[#141821] border border-[#262e3d] text-white px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#ccff00]"
                />
              </div>

              <div>
                <label className="block text-slate-400 uppercase font-mono text-[11px] mb-1">
                  Confirm Password *
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={claimConfirmPassword}
                  onChange={(e) => setClaimConfirmPassword(e.target.value)}
                  placeholder="Confirm Superuser password"
                  autoComplete="new-password"
                  className="w-full bg-[#141821] border border-[#262e3d] text-white px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#ccff00]"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setMode('login');
                  }}
                  className="px-4 py-2.5 bg-[#151923] border border-[#283144] text-slate-300 hover:text-white font-mono uppercase text-xs cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-[#ccff00] hover:bg-[#b8e600] text-black font-bold uppercase tracking-wider text-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Initializing...' : 'Initialize & Log In'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-[#111319] border-t border-[#1f242e] flex items-center justify-between text-[11px] text-slate-400 font-mono">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#ccff00]" />
            <span>Scrypt Salted &amp; Token Verified</span>
          </span>
          <button
            type="button"
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
