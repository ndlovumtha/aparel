import React from 'react';
import { Product } from '../types/store';
import { evaluateProductStockHealth, getProductSizeStock } from '../utils/inventory';
import { Plus, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';

interface ProductCardProps {
  product: Product;
  onSelect: (product: Product) => void;
  onQuickAdd: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onSelect,
  onQuickAdd,
}) => {
  const { totalStock, floor } = evaluateProductStockHealth(product);
  const isOut = totalStock <= 0;
  const isLow = totalStock > 0 && totalStock <= floor;

  return (
    <div
      onClick={() => onSelect(product)}
      className="group flex flex-col bg-[#0f1217] border border-[#1e232e] hover:border-[#384152] transition-all duration-300 cursor-pointer overflow-hidden"
    >
      {/* 65-75% Card Height Image Container */}
      <div className="relative aspect-[4/3] w-full bg-[#13161c] overflow-hidden">
        <img
          src={product.image}
          alt={product.title}
          referrerPolicy="no-referrer"
          className={`w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500 ${
            isOut ? 'opacity-50 grayscale-[40%]' : ''
          }`}
        />

        {/* Subtle status tag if featured */}
        {product.featured && (
          <div className="absolute top-3 left-3 bg-[#0b0c0e]/90 border border-[#232934] px-2 py-0.5 text-[10px] uppercase font-mono tracking-wider text-slate-200">
            Field Certified
          </div>
        )}

        {/* Real-Time Stock Availability Badge */}
        <div
          className={`absolute top-3 right-3 px-2 py-0.5 text-[10px] uppercase font-mono font-bold tracking-wider border flex items-center gap-1 ${
            isOut
              ? 'bg-rose-950/90 text-rose-300 border-rose-600/50'
              : isLow
              ? 'bg-amber-950/90 text-amber-300 border-amber-500/50'
              : 'bg-[#0b0c0e]/90 text-[#ccff00] border-[#ccff00]/40'
          }`}
        >
          {isOut ? (
            <>
              <XCircle className="w-3 h-3" />
              <span>Out of Stock</span>
            </>
          ) : isLow ? (
            <>
              <AlertCircle className="w-3 h-3" />
              <span>Low Stock · {totalStock} Left</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-3 h-3" />
              <span>In Stock</span>
            </>
          )}
        </div>

        {/* Quick Add Overlay on desktop hover */}
        <div className="absolute inset-x-3 bottom-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button
            disabled={isOut}
            onClick={(e) => {
              e.stopPropagation();
              if (!isOut) onQuickAdd(product);
            }}
            className={`w-full py-2.5 text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 shadow-md ${
              isOut
                ? 'bg-[#1a1f28] text-slate-400 cursor-not-allowed border border-[#2a3140]'
                : 'bg-[#ccff00] text-black hover:bg-white cursor-pointer'
            }`}
          >
            {isOut ? (
              <span>Currently Out of Stock</span>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                <span>Quick Add Available Size</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Card Content & Metadata */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          {/* Unboxed metadata line with typographic separator */}
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-slate-400 mb-1.5 font-medium">
            <span>{product.discipline}</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span>{product.category}</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span className="font-mono text-slate-300">{product.weightGsm}g</span>
          </div>

          <h3 className="text-base font-semibold text-white tracking-tight group-hover:text-[#ccff00] transition-colors">
            {product.title}
          </h3>

          <p className="text-xs text-slate-400 mt-1 line-clamp-1">
            {product.tagline}
          </p>

          {/* Colorways & Per-Size Availability Matrix */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5" title="Available Color Variants">
              {product.colors.map((c) => (
                <span
                  key={c.name}
                  title={c.name}
                  className="w-3 h-3 rounded-full border border-white/25 inline-block"
                  style={{ backgroundColor: c.hex }}
                />
              ))}
              <span className="text-[10px] font-mono text-slate-400 ml-0.5">
                {product.colors.length} {product.colors.length === 1 ? 'color' : 'colors'}
              </span>
            </div>

            <div className="flex items-center gap-1 font-mono text-[10px]">
              {product.sizes.map((sz) => {
                const qty = getProductSizeStock(product, sz);
                return (
                  <span
                    key={sz}
                    title={`${sz}: ${qty} in stock`}
                    className={`px-1 py-0.2 border ${
                      qty > 0
                        ? 'border-[#273042] text-slate-200 bg-[#141822]'
                        : 'border-[#1d222c] text-slate-600 line-through bg-[#0c0e13]'
                    }`}
                  >
                    {sz}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* Price & Stock info */}
        <div className="mt-4 pt-3 border-t border-[#1a1e27] flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-base font-bold text-white font-mono tabular-nums">
              ${product.price}
            </span>
            {product.compareAtPrice && (
              <span className="text-xs text-slate-500 line-through font-mono tabular-nums">
                ${product.compareAtPrice}
              </span>
            )}
          </div>

          <span
            className={`text-[11px] font-mono tabular-nums ${
              isOut
                ? 'text-rose-400'
                : isLow
                ? 'text-amber-300'
                : 'text-[#ccff00]'
            }`}
          >
            {isOut
              ? '0 units available'
              : `${totalStock} ${totalStock === 1 ? 'unit' : 'units'} in stock`}
          </span>
        </div>
      </div>
    </div>
  );
};
