import React from 'react';
import { ArrowDown, ShieldCheck, Flame, Sparkles } from 'lucide-react';

interface HeroProps {
  onExploreClick: () => void;
  onViewSpecials: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onExploreClick, onViewSpecials }) => {
  return (
    <section className="relative bg-[#0b0c0e] border-b border-[#1b1f28] overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 py-12 md:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          {/* Left Column: Clean Brand Statement */}
          <div className="lg:col-span-7 flex flex-col justify-center">
            {/* Unboxed category line */}
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-slate-400 mb-5 font-medium">
              <span className="text-[#ccff00] font-semibold">Technical Athletic Systems</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span>Sub-100g Aeroweave</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span>Ultrasonic Bonded Seams</span>
            </div>

            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white mb-6 uppercase"
              style={{
                fontSize: 'clamp(2.4rem, 4.5vw, 3.8rem)',
                lineHeight: 1.05,
                textWrap: 'balance',
              }}
            >
              Stripped of Excess.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-slate-400">
                Calibrated for Velocity.
              </span>
            </h1>

            <p className="text-base sm:text-lg text-slate-300 max-w-xl mb-8 leading-relaxed font-normal">
              Offside Apparel crafts precision minimalist sportswear for Olympic competitors and professional athletes.
              Zero friction. Zero distraction. Engineered in Zurich for athletes who compete at the physical limit.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-4 mb-8">
              <button
                onClick={onExploreClick}
                className="px-8 py-3.5 bg-white hover:bg-slate-100 text-black text-xs font-bold uppercase tracking-wider transition-all active:scale-95 flex items-center gap-2 shadow-sm cursor-pointer"
              >
                <span>Explore 2026 Issue</span>
                <ArrowDown className="w-4 h-4" />
              </button>

              <button
                onClick={onViewSpecials}
                className="px-6 py-3.5 border border-[#2b303c] hover:border-[#ccff00] text-slate-200 hover:text-white text-xs font-semibold uppercase tracking-wider transition-all flex items-center gap-2 bg-[#12151b]/80 cursor-pointer"
              >
                <Flame className="w-3.5 h-3.5 text-[#ccff00]" />
                <span>View Specials & Promotions</span>
              </button>
            </div>

            {/* Evidence Row - Stripped of any Shopify mention */}
            <div className="pt-6 border-t border-[#1b1f28] flex flex-wrap items-center gap-6 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#ccff00]" />
                <span>Olympic Standard Verified</span>
              </div>
              <span aria-hidden="true" className="text-slate-700">·</span>
              <div>
                <span>Wind Tunnel Tested</span>{' '}
                <span className="font-mono text-slate-300">0.024 Cd</span>
              </div>
              <span aria-hidden="true" className="text-slate-700">·</span>
              <div>
                <span>Seam Technology</span>{' '}
                <span className="font-mono text-slate-300">Ultrasonic Zero-Chafe</span>
              </div>
            </div>
          </div>

          {/* Right Column: Hero Visual Anchor */}
          <div className="lg:col-span-5 relative">
            <div className="relative aspect-[4/5] overflow-hidden bg-[#12151a] border border-[#232934] group">
              <img
                src="/src/assets/images/hero_athlete_campaign_1793037644855.jpg"
                alt="Offside Apparel professional athlete in minimalist performance gear"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover object-center filter grayscale contrast-110 group-hover:scale-[1.02] transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

              {/* Bottom Image Caption */}
              <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between text-xs text-slate-300 pointer-events-none">
                <div>
                  <p className="font-bold text-white uppercase tracking-wider text-[11px]">Zurich Aero Lab // Specimen 01</p>
                  <p className="text-slate-400 text-[10px]">AeroCarbon Matrix at 35km/h sprint drag test</p>
                </div>
                <span className="font-mono text-[11px] text-[#ccff00] tabular-nums">0.0g FRICTION</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
