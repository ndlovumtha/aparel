import React, { useState } from 'react';
import { Product } from '../types/store';
import { X, Check, ShieldCheck, Ruler, Truck, ChevronRight } from 'lucide-react';

interface ProductDetailModalProps {
  product: Product | null;
  onClose: () => void;
  onAddToCart: (product: Product, size: string, color: string, quantity: number) => void;
  onOpenFitGuide: () => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  onClose,
  onAddToCart,
  onOpenFitGuide,
}) => {
  if (!product) return null;

  const [selectedSize, setSelectedSize] = useState<string>(product.sizes[0] || 'M');
  const [selectedColor, setSelectedColor] = useState<string>(product.colors[0]?.name || 'Pitch Carbon');
  const [quantity, setQuantity] = useState<number>(1);
  const [activeImageTab, setActiveImageTab] = useState<'main' | 'fabric'>('main');
  const [addedNotice, setAddedNotice] = useState(false);

  const handleAdd = () => {
    onAddToCart(product, selectedSize, selectedColor, quantity);
    setAddedNotice(true);
    setTimeout(() => setAddedNotice(false), 2000);
  };

  const currentDisplayImage = activeImageTab === 'fabric' && product.detailImage
    ? product.detailImage
    : product.image;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 md:p-6">
      <div
        className="relative bg-[#0d0f14] border border-[#232934] w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Close Product View"
          className="absolute top-4 right-4 z-20 p-2 bg-black/60 hover:bg-black text-slate-300 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Left Column: Gallery / High-Res View with Fabric Switcher */}
        <div className="md:w-1/2 bg-[#12151b] p-6 flex flex-col justify-between border-b md:border-b-0 md:border-r border-[#1e232e]">
          <div className="relative aspect-square w-full overflow-hidden bg-black/40 border border-[#202530]">
            <img
              src={currentDisplayImage}
              alt={product.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-center transition-all duration-300"
            />
            {activeImageTab === 'fabric' && (
              <div className="absolute bottom-2 left-2 bg-black/80 text-[10px] uppercase font-mono px-2 py-1 text-[#ccff00]">
                Macro Weave Specimen
              </div>
            )}
          </div>

          {/* Image Switcher if macro fabric image exists */}
          {product.detailImage && (
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setActiveImageTab('main')}
                className={`flex-1 py-1.5 px-3 text-xs uppercase font-medium border text-center transition-colors ${
                  activeImageTab === 'main'
                    ? 'border-[#ccff00] text-white bg-[#1b202a]'
                    : 'border-[#232934] text-slate-400 hover:text-white'
                }`}
              >
                Silouhette
              </button>
              <button
                onClick={() => setActiveImageTab('fabric')}
                className={`flex-1 py-1.5 px-3 text-xs uppercase font-medium border text-center transition-colors ${
                  activeImageTab === 'fabric'
                    ? 'border-[#ccff00] text-[#ccff00] bg-[#1b202a]'
                    : 'border-[#232934] text-slate-400 hover:text-white'
                }`}
              >
                Macro Fabric Detail
              </button>
            </div>
          )}

          {/* Quick Technical Fabric Callout */}
          <div className="mt-6 pt-4 border-t border-[#1b1f28] space-y-2 text-xs text-slate-400">
            <div className="flex justify-between font-mono">
              <span className="text-slate-400">Garment Weight:</span>
              <span className="text-white tabular-nums">{product.weightGsm} GSM (Ultra-Light)</span>
            </div>
            <div className="flex justify-between font-mono">
              <span className="text-slate-400">Seam Technology:</span>
              <span className="text-white">{product.fabricSpecs.seamType}</span>
            </div>
            <div className="flex justify-between font-mono">
              <span className="text-slate-400">Air Permeability:</span>
              <span className="text-white">{product.fabricSpecs.breathabilityRating}</span>
            </div>
          </div>
        </div>

        {/* Right Column: Contiguous Purchase Module */}
        <div className="md:w-1/2 p-6 md:p-8 flex flex-col justify-between">
          <div>
            {/* Unboxed category line */}
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-400 font-medium mb-1.5">
              <span>{product.discipline}</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span>{product.category}</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-[#ccff00] font-mono">Lab Verified Specimen</span>
            </div>

            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white uppercase">
              {product.title}
            </h2>

            {/* Price Line */}
            <div className="flex items-baseline gap-3 mt-2 mb-4">
              <span className="text-2xl font-bold font-mono text-white tabular-nums">
                ${product.price}
              </span>
              {product.compareAtPrice && (
                <span className="text-sm font-mono text-slate-500 line-through tabular-nums">
                  ${product.compareAtPrice}
                </span>
              )}
              <span className="text-xs text-slate-400 font-mono">
                USD (Excl. Tax)
              </span>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed mb-6">
              {product.description}
            </p>

            {/* Colorway Selection */}
            <div className="mb-6">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-slate-400 uppercase font-medium">Colorway:</span>
                <span className="text-white font-medium">{selectedColor}</span>
              </div>
              <div className="flex gap-2">
                {product.colors.map((color) => {
                  const isSelected = selectedColor === color.name;
                  return (
                    <button
                      key={color.name}
                      onClick={() => setSelectedColor(color.name)}
                      className={`flex items-center gap-2 px-3 py-1.5 border text-xs font-medium transition-all ${
                        isSelected
                          ? 'border-[#ccff00] text-white bg-[#1a1f29]'
                          : 'border-[#262c37] text-slate-400 hover:text-white'
                      }`}
                    >
                      <span
                        className="w-3 h-3 rounded-full border border-white/20"
                        style={{ backgroundColor: color.hex }}
                      />
                      <span>{color.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Size Selector */}
            <div className="mb-6">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-slate-400 uppercase font-medium">Athlete Size:</span>
                <button
                  onClick={onOpenFitGuide}
                  className="text-[#ccff00] hover:underline flex items-center gap-1 font-medium"
                >
                  <Ruler className="w-3 h-3" />
                  <span>Size & Compression Guide</span>
                </button>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {product.sizes.map((size) => {
                  const isSelected = selectedSize === size;
                  return (
                    <button
                      key={size}
                      onClick={() => setSelectedSize(size)}
                      className={`py-2 text-xs font-mono font-bold uppercase transition-all ${
                        isSelected
                          ? 'bg-[#ccff00] text-black border-2 border-[#ccff00]'
                          : 'bg-[#14171f] text-slate-300 border border-[#232934] hover:border-slate-400'
                      }`}
                    >
                      {size}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Athlete Fit Notes */}
            <div className="p-3 bg-[#12151b] border border-[#1e232e] mb-6 text-xs text-slate-300">
              <span className="font-semibold text-white block mb-0.5">Ergonomic Fit Directive:</span>
              <p className="text-slate-400">{product.athleteFitNotes}</p>
            </div>
          </div>

          {/* Action Module: Quantity & Add to Cart */}
          <div className="pt-4 border-t border-[#1e232e]">
            <div className="flex items-center gap-3 mb-3">
              {/* Quantity Stepper */}
              <div className="flex items-center border border-[#262c37] bg-[#14171f]">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="px-3 py-2 text-slate-400 hover:text-white font-mono text-sm"
                >
                  -
                </button>
                <span className="px-3 py-2 text-xs font-mono text-white font-bold tabular-nums">
                  {quantity}
                </span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="px-3 py-2 text-slate-400 hover:text-white font-mono text-sm"
                >
                  +
                </button>
              </div>

              {/* Primary Buy Button */}
              <button
                onClick={handleAdd}
                className="flex-1 py-3 px-6 bg-[#ccff00] hover:bg-[#b8e600] active:scale-[0.99] text-black font-bold uppercase tracking-wider text-xs transition-all flex items-center justify-center gap-2"
              >
                {addedNotice ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Added to Bag</span>
                  </>
                ) : (
                  <>
                    <span>Add to Bag · ${(product.price * quantity).toFixed(0)}</span>
                  </>
                )}
              </button>
            </div>

            {/* Express dispatch & guarantee footnote */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 font-mono">
              <span className="flex items-center gap-1">
                <Truck className="w-3.5 h-3.5 text-slate-400" />
                <span>Priority courier dispatch within 4h</span>
              </span>
              <span className="tabular-nums text-slate-400">
                {product.inventoryQuantity} units available
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
