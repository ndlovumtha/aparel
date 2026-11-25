import React, { useState } from 'react';
import { X, Ruler, CheckCircle, ArrowRight } from 'lucide-react';

interface AthleteFitGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AthleteFitGuideModal: React.FC<AthleteFitGuideModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const [heightCm, setHeightCm] = useState<number>(182);
  const [weightKg, setWeightKg] = useState<number>(76);
  const [fitPreference, setFitPreference] = useState<'race' | 'training'>('race');

  // Compute recommended size
  const calculateSize = (): { size: string; notes: string; factor: string } => {
    const bmi = weightKg / ((heightCm / 100) * (heightCm / 100));
    let base = 'M';
    if (heightCm < 172 || weightKg < 65) base = 'XS';
    else if (heightCm < 178 || weightKg < 72) base = 'S';
    else if (heightCm < 185 && weightKg < 82) base = 'M';
    else if (heightCm < 192 || weightKg < 90) base = 'L';
    else if (heightCm < 198 || weightKg < 100) base = 'XL';
    else base = 'XXL';

    if (fitPreference === 'training' && base !== 'XXL') {
      const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
      const idx = sizes.indexOf(base);
      base = sizes[Math.min(sizes.length - 1, idx + 1)];
    }

    return {
      size: base,
      notes: fitPreference === 'race'
        ? 'Maximum skin-lock compression. Zero flutter at sprint velocities (>30km/h).'
        : 'Relaxed athletic drape for warmups, travel, and high-volume training blocks.',
      factor: fitPreference === 'race' ? '22-26 mmHg (Active Lock)' : '16-18 mmHg (Adaptive Regular)',
    };
  };

  const recommendation = calculateSize();

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md flex items-center justify-center p-4 md:p-6">
      <div
        className="relative bg-[#0d0f14] border border-[#232934] w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-[#12151b] border-b border-[#1f242e] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Ruler className="w-4 h-4 text-[#ccff00]" />
            <h3 className="text-base font-bold text-white uppercase tracking-tight">
              Pro Athlete Ergonomic Sizing Engine
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 md:p-8 space-y-8 overflow-y-auto max-h-[75vh]">
          {/* Interactive Calculator */}
          <div className="p-5 bg-[#12151c] border border-[#202532]">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-4">
              Step 1: Input Athlete Metrics
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 text-xs">
              <div>
                <label className="block text-slate-400 uppercase font-medium mb-1 font-mono">
                  Height: {heightCm} cm ({Math.floor(heightCm / 30.48)}&apos;{Math.round((heightCm % 30.48) / 2.54)}&quot;)
                </label>
                <input
                  type="range"
                  min="160"
                  max="210"
                  value={heightCm}
                  onChange={(e) => setHeightCm(Number(e.target.value))}
                  className="w-full accent-[#ccff00] cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-slate-400 uppercase font-medium mb-1 font-mono">
                  Weight: {weightKg} kg ({Math.round(weightKg * 2.20462)} lbs)
                </label>
                <input
                  type="range"
                  min="55"
                  max="120"
                  value={weightKg}
                  onChange={(e) => setWeightKg(Number(e.target.value))}
                  className="w-full accent-[#ccff00] cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-slate-400 uppercase font-medium mb-1 font-mono">
                  Fit Profile:
                </label>
                <div className="grid grid-cols-2 gap-1 border border-[#252b38] p-0.5 bg-[#171a22]">
                  <button
                    onClick={() => setFitPreference('race')}
                    className={`py-1 text-[11px] font-bold uppercase tracking-wider ${
                      fitPreference === 'race'
                        ? 'bg-[#ccff00] text-black'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Race Aero
                  </button>
                  <button
                    onClick={() => setFitPreference('training')}
                    className={`py-1 text-[11px] font-bold uppercase tracking-wider ${
                      fitPreference === 'training'
                        ? 'bg-[#ccff00] text-black'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Training
                  </button>
                </div>
              </div>
            </div>

            {/* Recommendation Result Callout */}
            <div className="mt-6 pt-5 border-t border-[#1c222c] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-[11px] text-slate-400 uppercase font-mono block">
                  Recommended Offside Size:
                </span>
                <span className="text-3xl font-extrabold font-mono text-[#ccff00]">
                  Size {recommendation.size}
                </span>
                <span className="text-xs text-slate-300 block mt-0.5">
                  Compression Factor: <span className="font-mono text-white">{recommendation.factor}</span>
                </span>
              </div>

              <div className="max-w-xs text-xs text-slate-400 bg-[#0c0e12] p-3 border border-[#1b1f27]">
                <p>{recommendation.notes}</p>
              </div>
            </div>
          </div>

          {/* Reference Table */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-3">
              Standard Athlete Benchmark Dimensions
            </h4>
            <div className="overflow-x-auto border border-[#1e232e]">
              <table className="w-full text-xs text-left font-mono">
                <thead className="bg-[#12151b] text-slate-400 uppercase text-[10px] border-b border-[#1e232e]">
                  <tr>
                    <th className="p-2.5">Size</th>
                    <th className="p-2.5">Chest (cm)</th>
                    <th className="p-2.5">Waist (cm)</th>
                    <th className="p-2.5">Hips (cm)</th>
                    <th className="p-2.5">Target Discipline</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#181c24] text-slate-300">
                  <tr className={recommendation.size === 'XS' ? 'bg-[#182410] text-[#ccff00]' : ''}>
                    <td className="p-2.5 font-bold">XS</td>
                    <td className="p-2.5 tabular-nums">84 - 89</td>
                    <td className="p-2.5 tabular-nums">68 - 73</td>
                    <td className="p-2.5 tabular-nums">84 - 88</td>
                    <td className="p-2.5">Distance / Steeplechase</td>
                  </tr>
                  <tr className={recommendation.size === 'S' ? 'bg-[#182410] text-[#ccff00]' : ''}>
                    <td className="p-2.5 font-bold">S</td>
                    <td className="p-2.5 tabular-nums">90 - 95</td>
                    <td className="p-2.5 tabular-nums">74 - 79</td>
                    <td className="p-2.5 tabular-nums">89 - 94</td>
                    <td className="p-2.5">Middle Distance / Wingers</td>
                  </tr>
                  <tr className={recommendation.size === 'M' ? 'bg-[#182410] text-[#ccff00]' : ''}>
                    <td className="p-2.5 font-bold">M</td>
                    <td className="p-2.5 tabular-nums">96 - 102</td>
                    <td className="p-2.5 tabular-nums">80 - 85</td>
                    <td className="p-2.5 tabular-nums">95 - 100</td>
                    <td className="p-2.5">Sprinters / Midfielders</td>
                  </tr>
                  <tr className={recommendation.size === 'L' ? 'bg-[#182410] text-[#ccff00]' : ''}>
                    <td className="p-2.5 font-bold">L</td>
                    <td className="p-2.5 tabular-nums">103 - 110</td>
                    <td className="p-2.5 tabular-nums">86 - 92</td>
                    <td className="p-2.5 tabular-nums">101 - 107</td>
                    <td className="p-2.5">Decathletes / Strikers</td>
                  </tr>
                  <tr className={recommendation.size === 'XL' ? 'bg-[#182410] text-[#ccff00]' : ''}>
                    <td className="p-2.5 font-bold">XL</td>
                    <td className="p-2.5 tabular-nums">111 - 118</td>
                    <td className="p-2.5 tabular-nums">93 - 99</td>
                    <td className="p-2.5 tabular-nums">108 - 114</td>
                    <td className="p-2.5">Field / Throws / Backs</td>
                  </tr>
                  <tr className={recommendation.size === 'XXL' ? 'bg-[#182410] text-[#ccff00]' : ''}>
                    <td className="p-2.5 font-bold">XXL</td>
                    <td className="p-2.5 tabular-nums">119 - 128</td>
                    <td className="p-2.5 tabular-nums">100 - 108</td>
                    <td className="p-2.5 tabular-nums">115 - 122</td>
                    <td className="p-2.5">Heavy Athletics</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#111319] border-t border-[#1f242e] flex items-center justify-between">
          <span className="text-xs text-slate-400 font-mono">
            Complimentary returns & size swaps for verified professional athletes
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-white text-black font-bold uppercase text-xs hover:bg-slate-200 transition-colors"
          >
            Apply to Selection
          </button>
        </div>
      </div>
    </div>
  );
};
