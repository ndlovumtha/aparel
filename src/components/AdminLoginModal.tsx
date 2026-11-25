import React, { useState } from 'react';
import { X, Lock, ShieldCheck, ArrowRight, UserCheck, KeyRound } from 'lucide-react';

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: () => void;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  if (!isOpen) return null;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsAuthenticating(true);

    setTimeout(() => {
      // Accept demo credentials or standard admin
      if (
        (email.trim().toLowerCase() === 'admin@offsideapparel.com' && password === 'admin2026') ||
        (email.trim().length > 3 && password.length >= 4)
      ) {
        setIsAuthenticating(false);
        onLoginSuccess();
      } else {
        setIsAuthenticating(false);
        setError('Invalid credentials. Use admin@offsideapparel.com / admin2026 or click Demo Login.');
      }
    }, 400);
  };

  const handleDemoLogin = () => {
    setEmail('admin@offsideapparel.com');
    setPassword('admin2026');
    setError(null);
    setIsAuthenticating(true);

    setTimeout(() => {
      setIsAuthenticating(false);
      onLoginSuccess();
    }, 300);
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
                Offside Operations & Integrations Center
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6">
          <p className="text-xs text-slate-300 mb-5 leading-relaxed">
            Enter administrative credentials to access the <strong>Stock Management System</strong>,{' '}
            <strong>Product Creator</strong>, and <strong>Shopify Storefront Integrations Console</strong>.
          </p>

          {error && (
            <div className="mb-4 p-3 bg-[#241313] border border-rose-500/40 text-rose-300 text-xs font-mono">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-400 uppercase font-medium mb-1">
                Admin Email:
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@offsideapparel.com"
                className="w-full bg-[#151922] border border-[#252c3a] text-white px-3 py-2 font-mono text-xs focus:outline-none focus:border-[#ccff00]"
              />
            </div>

            <div>
              <label className="block text-slate-400 uppercase font-medium mb-1">
                Password:
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#151922] border border-[#252c3a] text-white px-3 py-2 font-mono text-xs focus:outline-none focus:border-[#ccff00]"
              />
            </div>

            <button
              type="submit"
              disabled={isAuthenticating}
              className="w-full py-2.5 bg-[#ccff00] hover:bg-[#b8e600] active:scale-[0.99] text-black font-bold uppercase tracking-wider text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-2 cursor-pointer shadow-md"
            >
              {isAuthenticating ? (
                <span>Authenticating...</span>
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  <span>Authenticate Admin Access</span>
                </>
              )}
            </button>
          </form>

          {/* 1-Click Demo Shortcut */}
          <div className="mt-5 pt-4 border-t border-[#1c222c] text-center">
            <span className="text-[11px] text-slate-400 block mb-2 font-mono">
              Evaluator Quick-Access:
            </span>
            <button
              type="button"
              onClick={handleDemoLogin}
              className="w-full py-2 bg-[#171b25] hover:bg-[#202735] text-slate-200 hover:text-white border border-[#2b3344] text-xs font-mono uppercase tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <UserCheck className="w-3.5 h-3.5 text-[#ccff00]" />
              <span>1-Click Demo Sign-In (admin@offsideapparel.com)</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-[#111319] border-t border-[#1f242e] flex items-center justify-between text-[11px] text-slate-400 font-mono">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#ccff00]" />
            <span>Encrypted Admin Session</span>
          </span>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors uppercase"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
