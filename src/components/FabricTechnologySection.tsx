import React from 'react';
import { ShieldCheck, Wind, Droplets, Flame } from 'lucide-react';

export const FabricTechnologySection: React.FC = () => {
  return (
    <section id="technology" className="bg-[#090a0d] py-16 md:py-24 px-6 border-b border-[#1b1f28]">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column: Macro Textile Specimen Image */}
          <div className="lg:col-span-6 relative">
            <div className="relative aspect-[16/10] bg-[#12151b] border border-[#232934] overflow-hidden group">
              <img
                src="/src/assets/images/craft_technical_fabric_1793037647097.jpg"
                alt="Offside Apparel micro-perforated technical fabric with ultrasonic bonded seam taping"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-xs font-mono text-slate-300">
                <span className="text-[#ccff00]">8mm Ultrasonic Welded Taping</span>
                <span>Zero-Thread Seam Architecture</span>
              </div>
            </div>

            {/* Quick Proof Metrics Row */}
            <div className="grid grid-cols-3 gap-3 mt-4">
              <div className="p-3 bg-[#0f1217] border border-[#1d222b]">
                <span className="text-xl font-bold font-mono text-white block tabular-nums">0.024</span>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider">Cd Drag Coefficient</span>
              </div>
              <div className="p-3 bg-[#0f1217] border border-[#1d222b]">
                <span className="text-xl font-bold font-mono text-white block tabular-nums">&lt;88g</span>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider">Aero Top Weight</span>
              </div>
              <div className="p-3 bg-[#0f1217] border border-[#1d222b]">
                <span className="text-xl font-bold font-mono text-[#ccff00] block tabular-nums">20,000</span>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider">Hydrostatic Head (mm)</span>
              </div>
            </div>
          </div>

          {/* Right Column: Lab Innovations */}
          <div className="lg:col-span-6">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-slate-400 mb-2 font-medium">
              <span>Textile Engineering Lab</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span>Zurich Aerodynamics Test Facility</span>
            </div>

            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white uppercase mb-6">
              Anatomy of Zero Friction.
            </h2>

            <p className="text-sm sm:text-base text-slate-300 leading-relaxed mb-8">
              Every garment in the Offside collection eliminates traditional needle-and-thread construction.
              Using high-frequency ultrasonic welding and thermo-reactive bonding films, we create seamless transitions
              that prevent chafing over 42-kilometer marathon routes or 90-minute championship matches.
            </p>

            {/* Matrix Items */}
            <div className="space-y-4">
              <div className="p-4 bg-[#11141a] border border-[#1e232e] flex items-start gap-3.5">
                <div className="p-2 bg-[#181d26] text-[#ccff00] shrink-0 border border-[#2b3342]">
                  <Wind className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white uppercase tracking-tight">
                    AeroCarbon™ Micro-Perforated Grid
                  </h4>
                  <p className="text-xs text-slate-400 mt-1 leading-normal">
                    Laser-drilled airflow micro-ducts aligned with chest and back sweat channels to release thermal build-up without sacrificing aerodynamic laminarity.
                  </p>
                </div>
              </div>

              <div className="p-4 bg-[#11141a] border border-[#1e232e] flex items-start gap-3.5">
                <div className="p-2 bg-[#181d26] text-[#ccff00] shrink-0 border border-[#2b3342]">
                  <Droplets className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white uppercase tracking-tight">
                    HydroZero™ Nanotech Membrane
                  </h4>
                  <p className="text-xs text-slate-400 mt-1 leading-normal">
                    Porous non-fluorocarbon waterproof barrier allowing vaporized perspiration to evacuate while completely resisting horizontal storm-force precipitation.
                  </p>
                </div>
              </div>

              <div className="p-4 bg-[#11141a] border border-[#1e232e] flex items-start gap-3.5">
                <div className="p-2 bg-[#181d26] text-[#ccff00] shrink-0 border border-[#2b3342]">
                  <Flame className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white uppercase tracking-tight">
                    Dynamic Muscle Compression Mapping
                  </h4>
                  <p className="text-xs text-slate-400 mt-1 leading-normal">
                    Variable gauge knitting stabilizes quad and hamstring muscles against high-impact ground reaction forces to expedite intra-race recovery.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
