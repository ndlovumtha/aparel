import React from 'react';
import { Database, ShieldCheck, ExternalLink } from 'lucide-react';
import { ShopifyConfig } from '../types/store';

interface FooterProps {
  onOpenAdmin: () => void;
  onOpenOrderTracker?: () => void;
  onOpenSpecials?: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenAdmin, onOpenOrderTracker, onOpenSpecials }) => {
  return (
    <footer className="bg-[#08090b] border-t border-[#181c24] text-slate-400 text-xs py-14 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
          {/* Brand Col */}
          <div className="md:col-span-1 space-y-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              OFFSIDE APPAREL
            </h3>
            <p className="text-slate-400 leading-relaxed text-xs">
              Minimalist performance sportswear engineered for professional and Olympic competitors.
              Stripped of ornamentation. Optimized for biometric efficiency.
            </p>
            <div className="pt-2 flex flex-col gap-1.5">
              <button
                onClick={onOpenAdmin}
                className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[#ccff00] hover:underline cursor-pointer"
              >
                <span>🔒 Admin Operations Portal</span>
              </button>
              {onOpenOrderTracker && (
                <button
                  onClick={onOpenOrderTracker}
                  className="inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-300 hover:text-white cursor-pointer text-left"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#ccff00]" />
                  <span>Shipment Order Tracker</span>
                </button>
              )}
            </div>
          </div>

          {/* Navigation */}
          <div>
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider mb-3">
              Performance Series
            </h4>
            <ul className="space-y-2">
              <li><a href="#collection" className="hover:text-white transition-colors">AeroCarbon™ Tops</a></li>
              <li><a href="#collection" className="hover:text-white transition-colors">Kinetic Compression</a></li>
              <li><a href="#collection" className="hover:text-white transition-colors">HydroZero™ Outerwear</a></li>
              <li><a href="#collection" className="hover:text-white transition-colors">Post-Match Recovery</a></li>
              {onOpenSpecials && (
                <li>
                  <button onClick={onOpenSpecials} className="hover:text-[#ccff00] transition-colors cursor-pointer text-left">
                    Specials & Promotions
                  </button>
                </li>
              )}
            </ul>
          </div>

          {/* Standards & Athlete Lab */}
          <div>
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider mb-3">
              Athletics & Standards
            </h4>
            <ul className="space-y-2">
              <li><span className="text-slate-300">Zurich Aerodynamic Testing</span></li>
              <li><span className="text-slate-300">WADA Compliant Fabric Weaves</span></li>
              <li><span className="text-slate-300">Sub-100g Weight Standard</span></li>
              <li><span className="text-slate-300">Ultrasonic Welded Seams</span></li>
            </ul>
          </div>

          {/* Logistics & Security */}
          <div>
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider mb-3">
              Logistics & Distribution
            </h4>
            <div className="space-y-2 font-mono text-[11px]">
              <p className="text-slate-400">Hubs: Zurich CH &amp; Eugene US</p>
              <p className="text-slate-400">Airfreight: <span className="text-slate-200">DHL Express Priority</span></p>
              <p className="text-slate-400">Dispatch: <span className="text-[#ccff00]">Same-Day Athlete Handoff</span></p>
              <p className="text-slate-400">Security: <span className="text-emerald-400">256-Bit Encrypted Protocol</span></p>
            </div>
          </div>
        </div>

        {/* Bottom Line */}
        <div className="pt-8 border-t border-[#151820] flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px]">
          <p>© {new Date().getFullYear()} Offside Apparel Inc. All rights reserved. Precision sportswear for professional athletes.</p>
          <div className="flex items-center gap-4">
            <span className="text-slate-400">Privacy Protocol</span>
            <span aria-hidden="true" className="text-slate-400">·</span>
            <span className="text-slate-400">Terms of Supply</span>
            <span aria-hidden="true" className="text-slate-400">·</span>
            <span className="text-slate-400">Athlete Federation Portal</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
