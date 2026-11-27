import React, { useState, useEffect } from 'react';
import { Product } from '../types/store';
import {
  evaluateProductStockHealth,
  getProductSizeStock,
  getSizingTypePreset,
  inferSizingTypeFromProduct,
} from '../utils/inventory';
import { X, Check, Ruler, Truck, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';

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
  const [selectedSize, setSelectedSize] = useState<string>('M');
  const [selectedColor, setSelectedColor] = useState<string>('Pitch Carbon');
  const [quantity, setQuantity] = useState<number>(1);
  const [activeImageTab, setActiveImageTab] = useState<'main' | 'fabric'>('main');
  const [addedNotice, setAddedNotice] = useState(false);

  useEffect(() => {
    if (!product) return;
    const firstAvailableSize =
      product.sizes.find((sz) => getProductSizeStock(product, sz) > 0) ||
      product.sizes[0] ||
      'M';
    setSelectedSize(firstAvailableSize);
    setSelectedColor(product.colors[0]?.name || 'Pitch Carbon');
    setQuantity(1);
    setActiveImageTab('main');
    setAddedNotice(false);
  }, [product?.id]);

  if (!product) return null;

  const { totalStock, floor } = evaluateProductStockHealth(product);
  const selectedSizeStock = getProductSizeStock(product, selectedSize);
  const isSizeOut = selectedSizeStock <= 0;
  const isSizeLow = selectedSizeStock > 0 && selectedSizeStock <= Math.max(2, Math.floor(floor / Math.max(1, product.sizes.length)));

  const handleSizeSelect = (sz: string) => {
    setSelectedSize(sz);
    const szStock = getProductSizeStock(product, sz);
    if (szStock > 0 && quantity > szStock) {
      setQuantity(szStock);
    } else if (szStock > 0 && quantity < 1) {
      setQuantity(1);
    }
  };

  const handleAdd = () => {
    if (isSizeOut) return;
    const safeQty = Math.max(1, Math.min(selectedSizeStock, quantity));
    onAddToCart(product, selectedSize, selectedColor, safeQty);
    setAddedNotice(true);
    setTimeout(() => setAddedNotice(false), 2000);
  };

  const currentDisplayImage =
    activeImageTab === 'fabric' && product.detailImage
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
          className="absolute top-4 right-4 z-20 p-2 bg-black/60 hover:bg-black text-slate-300 hover:text-white transition-colors cursor-pointer"
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
                className={`flex-1 py-1.5 px-3 text-xs uppercase font-medium border text-center transition-colors cursor-pointer ${
                  activeImageTab === 'main'
                    ? 'border-[#ccff00] text-white bg-[#1b202a]'
                    : 'border-[#232934] text-slate-400 hover:text-white'
                }`}
              >
                Silhouette
              </button>
              <button
                onClick={() => setActiveImageTab('fabric')}
                className={`flex-1 py-1.5 px-3 text-xs uppercase font-medium border text-center transition-colors cursor-pointer ${
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

            {/* Price Line & Global Availability */}
            <div className="flex flex-wrap items-center justify-between gap-2 mt-2 mb-4">
              <div className="flex items-baseline gap-3">
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

              {/* Overall Live Stock Status */}
              <div
                className={`px-2.5 py-1 text-[11px] font-mono font-bold uppercase border flex items-center gap-1.5 ${
                  totalStock <= 0
                    ? 'bg-rose-950/70 text-rose-300 border-rose-600/50'
                    : totalStock <= floor
                    ? 'bg-amber-950/70 text-amber-300 border-amber-500/50'
                    : 'bg-[#152211] text-[#ccff00] border-[#ccff00]/40'
                }`}
              >
                {totalStock <= 0 ? (
                  <>
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Out of Stock</span>
                  </>
                ) : totalStock <= floor ? (
                  <>
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Low Stock · {totalStock} Total</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>In Stock · {totalStock} Available</span>
                  </>
                )}
              </div>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed mb-5">
              {product.description}
            </p>

            {/* Colorway Selection */}
            <div className="mb-5">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-slate-400 uppercase font-medium">Color Variant:</span>
                <span className="text-white font-medium">{selectedColor}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {product.colors.map((color) => {
                  const isSelected = selectedColor === color.name;
                  return (
                    <button
                      key={color.name}
                      type="button"
                      onClick={() => setSelectedColor(color.name)}
                      className={`flex items-center gap-2 px-3 py-1.5 border text-xs font-medium transition-all cursor-pointer ${
                        isSelected
                          ? 'border-[#ccff00] text-white bg-[#1a1f29]'
                          : 'border-[#262c37] text-slate-400 hover:text-white'
                      }`}
                    >
                      <span
                        className="w-3 h-3 rounded-full border border-white/25"
                        style={{ backgroundColor: color.hex }}
                      />
                      <span>{color.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Size Selector with Per-Size Availability */}
            <div className="mb-5">
              <div className="flex items-center justify-between text-xs mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 uppercase font-medium">
                    Size (Live Stock):
                  </span>
                  <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 bg-[#161a23] border border-[#252c3b] text-[#ccff00]">
                    {getSizingTypePreset(inferSizingTypeFromProduct(product)).shortLabel}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onOpenFitGuide}
                  className="text-[#ccff00] hover:underline flex items-center gap-1 font-medium cursor-pointer"
                >
                  <Ruler className="w-3 h-3" />
                  <span>Size &amp; Compression Guide</span>
                </button>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {product.sizes.map((size) => {
                  const isSelected = selectedSize === size;
                  const sizeStock = getProductSizeStock(product, size);
                  const sizeOut = sizeStock <= 0;

                  return (
                    <button
                      key={size}
                      type="button"
                      disabled={sizeOut}
                      onClick={() => handleSizeSelect(size)}
                      className={`py-2 px-1 flex flex-col items-center justify-center font-mono transition-all ${
                        sizeOut
                          ? 'bg-[#0e1015] text-slate-600 border border-[#1a1e26] cursor-not-allowed'
                          : isSelected
                          ? 'bg-[#ccff00] text-black border-2 border-[#ccff00] cursor-pointer'
                          : 'bg-[#14171f] text-slate-200 border border-[#232934] hover:border-slate-400 cursor-pointer'
                      }`}
                    >
                      <span className={`text-xs font-bold uppercase ${sizeOut ? 'line-through' : ''}`}>
                        {size}
                      </span>
                      <span
                        className={`text-[10px] tabular-nums mt-0.5 ${
                          sizeOut
                            ? 'text-rose-400/80'
                            : isSelected
                            ? 'text-black/80 font-bold'
                            : sizeStock <= 3
                            ? 'text-amber-300'
                            : 'text-slate-400'
                        }`}
                      >
                        {sizeOut ? 'Out' : `${sizeStock} avail`}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Selected size stock confirmation */}
              <div className="mt-2 text-[11px] font-mono">
                {isSizeOut ? (
                  <span className="text-rose-400 flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" />
                    Size {selectedSize} is currently out of stock. Select another available size.
                  </span>
                ) : isSizeLow ? (
                  <span className="text-amber-300 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Low stock in Size {selectedSize} — only {selectedSizeStock} units remaining.
                  </span>
                ) : (
                  <span className="text-[#ccff00] flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Size {selectedSize} in stock ({selectedSizeStock} units ready for dispatch).
                  </span>
                )}
              </div>
            </div>

            {/* Athlete Fit Notes */}
            <div className="p-3 bg-[#12151b] border border-[#1e232e] mb-5 text-xs text-slate-300">
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
                  type="button"
                  disabled={isSizeOut || quantity <= 1}
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="px-3 py-2 text-slate-400 hover:text-white font-mono text-sm disabled:opacity-30 cursor-pointer"
                >
                  -
                </button>
                <span className="px-3 py-2 text-xs font-mono text-white font-bold tabular-nums">
                  {isSizeOut ? 0 : quantity}
                </span>
                <button
                  type="button"
                  disabled={isSizeOut || quantity >= selectedSizeStock}
                  onClick={() => setQuantity(Math.min(selectedSizeStock, quantity + 1))}
                  className="px-3 py-2 text-slate-400 hover:text-white font-mono text-sm disabled:opacity-30 cursor-pointer"
                >
                  +
                </button>
              </div>

              {/* Primary Buy Button */}
              <button
                type="button"
                disabled={isSizeOut}
                onClick={handleAdd}
                className={`flex-1 py-3 px-6 font-bold uppercase tracking-wider text-xs transition-all flex items-center justify-center gap-2 ${
                  isSizeOut
                    ? 'bg-[#1a1f28] text-slate-400 border border-[#293141] cursor-not-allowed'
                    : 'bg-[#ccff00] hover:bg-[#b8e600] active:scale-[0.99] text-black cursor-pointer'
                }`}
              >
                {isSizeOut ? (
                  <span>Size {selectedSize} Out of Stock</span>
                ) : addedNotice ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Added to Bag</span>
                  </>
                ) : (
                  <span>
                    Add Size {selectedSize} · ${(product.price * quantity).toFixed(0)}
                  </span>
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
                {selectedSize}: {selectedSizeStock} avail · Total: {totalStock}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
