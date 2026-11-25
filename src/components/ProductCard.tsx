import React from 'react';
import { Product } from '../types/store';
import { Plus } from 'lucide-react';

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
          className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
        />

        {/* Subtle status tag if featured */}
        {product.featured && (
          <div className="absolute top-3 left-3 bg-[#0b0c0e]/90 border border-[#232934] px-2 py-0.5 text-[10px] uppercase font-mono tracking-wider text-slate-200">
            Field Certified
          </div>
        )}

        {/* Quick Add Overlay on desktop hover */}
        <div className="absolute inset-x-3 bottom-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onQuickAdd(product);
            }}
            className="w-full py-2.5 bg-[#ccff00] text-black text-xs font-bold uppercase tracking-wider hover:bg-white transition-colors flex items-center justify-center gap-1.5 shadow-md"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Select Size & Add</span>
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

          <span className="text-[11px] font-mono text-slate-400 tabular-nums">
            {product.inventoryQuantity > 0 ? `${product.inventoryQuantity} units in stock` : 'Backorder'}
          </span>
        </div>
      </div>
    </div>
  );
};
