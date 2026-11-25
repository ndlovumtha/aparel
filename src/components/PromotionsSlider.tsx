import React, { useState, useEffect } from 'react';
import { FirestorePromotion, INITIAL_PROMOTIONS } from '../services/firestore';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  ArrowRight,
  Flame,
  Sparkles,
} from 'lucide-react';

export interface PromotionSlide {
  id: string;
  badge: string;
  tagline: string;
  title: string;
  description: string;
  promoCode: string;
  discountValue: string;
  validUntil: string;
  image: string;
  highlightPill: string;
  categoryLink: string;
}

interface PromotionsSliderProps {
  promotions?: FirestorePromotion[];
  onApplyPromoCode: (code: string) => void;
  onExploreCategory: (category: string) => void;
}

export const PromotionsSlider: React.FC<PromotionsSliderProps> = ({
  promotions,
  onApplyPromoCode,
  onExploreCategory,
}) => {
  const slides = promotions && promotions.length > 0 ? promotions : INITIAL_PROMOTIONS;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const safeIndex = currentIndex % slides.length;

  // Auto-slide every 5.5 seconds when not hovered
  useEffect(() => {
    if (isPaused || slides.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % slides.length);
    }, 5500);
    return () => clearInterval(interval);
  }, [isPaused, slides.length]);

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev === 0 ? slides.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % slides.length);
  };

  const handleCopyAndApply = (code: string) => {
    navigator.clipboard?.writeText(code);
    setCopiedCode(code);
    onApplyPromoCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const activePromo = slides[safeIndex];

  return (
    <section
      id="promotions-slider"
      className="relative bg-[#0d0f14] border-b border-[#1b1f28] overflow-hidden"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="max-w-7xl mx-auto px-6 py-10 md:py-14">
        {/* Header Title with unboxed separator */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-slate-400 mb-1.5 font-medium">
              <span className="text-[#ccff00] font-semibold flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-[#ccff00]" />
                Athlete Specials
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span>Limited Competition Allotments</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white uppercase">
              Current Promotions & Athlete Allocations
            </h2>
          </div>

          {/* Navigation Controls & Slide Index */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-slate-400 tabular-nums">
              0{safeIndex + 1} / 0{slides.length}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handlePrev}
                aria-label="Previous Promotion"
                className="p-2 bg-[#141822] border border-[#242b38] text-slate-300 hover:text-white hover:border-slate-400 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handleNext}
                aria-label="Next Promotion"
                className="p-2 bg-[#141822] border border-[#242b38] text-slate-300 hover:text-white hover:border-slate-400 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Featured Promotion Slide Card */}
        <div className="relative bg-[#0f1218] border border-[#202633] overflow-hidden shadow-2xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
            {/* Left Content Column */}
            <div className="lg:col-span-7 p-6 sm:p-8 md:p-10 flex flex-col justify-between">
              <div>
                {/* Meta Badge & Expiry */}
                <div className="flex flex-wrap items-center gap-2.5 mb-4 text-xs">
                  <span className="bg-[#1c2413] text-[#ccff00] border border-[#ccff00]/40 px-2.5 py-0.5 uppercase font-mono font-bold tracking-wider text-[11px]">
                    {activePromo.badge}
                  </span>
                  <span className="text-slate-400 font-mono text-[11px]">
                    {activePromo.validUntil}
                  </span>
                </div>

                {/* Main Heading */}
                <h3 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white uppercase mb-4 leading-tight">
                  {activePromo.title}
                </h3>

                <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-xl mb-6">
                  {activePromo.description}
                </p>

                {/* Highlight attribute */}
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#141822] border border-[#242b38] text-xs font-mono text-slate-300 mb-8">
                  <Sparkles className="w-3.5 h-3.5 text-[#ccff00]" />
                  <span>Technical Advantage: {activePromo.highlightPill}</span>
                </div>
              </div>

              {/* Action & Code Bar */}
              <div className="pt-6 border-t border-[#1c222c] flex flex-wrap items-center gap-4">
                {/* Promo Code Box */}
                <div className="flex items-center bg-[#151924] border border-[#293242] p-1 pl-3.5">
                  <div className="flex flex-col pr-3">
                    <span className="text-[9px] uppercase font-mono text-slate-400">Coupon Code</span>
                    <span className="text-sm font-bold font-mono text-[#ccff00] tracking-wider">
                      {activePromo.promoCode}
                    </span>
                  </div>
                  <button
                    onClick={() => handleCopyAndApply(activePromo.promoCode)}
                    className="p-2 bg-[#202737] hover:bg-[#2c364c] text-white transition-colors flex items-center gap-1.5 text-xs font-mono font-semibold"
                    title="Copy & Apply to Cart"
                  >
                    {copiedCode === activePromo.promoCode ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-[#ccff00]" />
                        <span className="text-[#ccff00]">Applied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-300" />
                        <span>Apply</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Explore Category Button */}
                <button
                  onClick={() => onExploreCategory(activePromo.categoryLink)}
                  className="px-6 py-3 bg-white hover:bg-slate-200 text-black font-bold uppercase tracking-wider text-xs transition-colors flex items-center gap-2 active:scale-95 shadow-md"
                >
                  <span>Shop This Promotion</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Right Media Preview Column */}
            <div className="lg:col-span-5 relative bg-[#131720] border-t lg:border-t-0 lg:border-l border-[#202633] min-h-[260px] sm:min-h-[340px] flex items-center justify-center p-6 overflow-hidden group">
              <img
                src={activePromo.image}
                alt={activePromo.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover object-center max-h-[380px] transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

              {/* Floating Discount Tag */}
              <div className="absolute top-4 right-4 bg-black/85 border border-[#ccff00]/40 px-3 py-1.5 text-right backdrop-blur-sm">
                <span className="text-xs uppercase font-mono text-slate-400 block text-[10px]">
                  Value Benefit
                </span>
                <span className="text-base font-extrabold font-mono text-[#ccff00] tabular-nums">
                  {activePromo.discountValue}
                </span>
              </div>

              {/* Bottom Tagline */}
              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-xs font-mono text-slate-300">
                <span className="text-[#ccff00] font-semibold">{activePromo.tagline}</span>
                <span className="text-[11px] text-slate-400">Offside Technical Series</span>
              </div>
            </div>
          </div>

          {/* Progress Indicators */}
          <div className="grid grid-cols-2 sm:grid-cols-4 bg-[#141822] border-t border-[#1e2430]">
            {slides.map((promo, idx) => {
              const isActive = idx === safeIndex;
              return (
                <button
                  key={promo.id}
                  onClick={() => setCurrentIndex(idx)}
                  className={`py-2 px-3 text-left transition-all relative ${
                    isActive ? 'bg-[#1b2230]' : 'hover:bg-[#181d29]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-[10px] font-mono uppercase tracking-wider ${
                        isActive ? 'text-[#ccff00] font-bold' : 'text-slate-400'
                      }`}
                    >
                      Special 0{idx + 1}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 hidden sm:inline">
                      {promo.discountValue}
                    </span>
                  </div>
                  <p
                    className={`text-xs font-semibold truncate ${
                      isActive ? 'text-white' : 'text-slate-400'
                    }`}
                  >
                    {promo.promoCode}
                  </p>
                  {/* Active bottom border line */}
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#ccff00]" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
