import React, { useState, useMemo } from 'react';
import { Product } from '../types/store';
import { ProductCard } from './ProductCard';
import { Filter, Sparkles, CheckCircle2 } from 'lucide-react';

interface ProductGridProps {
  products: Product[];
  onSelectProduct: (product: Product) => void;
  onQuickAdd: (product: Product) => void;
}

type DisciplineFilter = 'All' | 'Track & Field' | 'Pitch & Field' | 'Endurance' | 'Recovery';

export const ProductGrid: React.FC<ProductGridProps> = ({
  products,
  onSelectProduct,
  onQuickAdd,
}) => {
  const [selectedDiscipline, setSelectedDiscipline] = useState<DisciplineFilter>('All');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'featured' | 'price-asc' | 'price-desc' | 'weight'>('featured');

  const disciplines: DisciplineFilter[] = ['All', 'Track & Field', 'Pitch & Field', 'Endurance', 'Recovery'];
  const categories = ['All', 'Tops', 'Bottoms', 'Outerwear'];

  const filteredProducts = useMemo(() => {
    return products
      .filter((p) => {
        const matchesDiscipline = selectedDiscipline === 'All' || p.discipline === selectedDiscipline;
        const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
        return matchesDiscipline && matchesCategory;
      })
      .sort((a, b) => {
        if (sortBy === 'price-asc') return a.price - b.price;
        if (sortBy === 'price-desc') return b.price - a.price;
        if (sortBy === 'weight') return a.weightGsm - b.weightGsm;
        return (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
      });
  }, [products, selectedDiscipline, selectedCategory, sortBy]);

  return (
    <section id="collection" className="bg-[#0b0c0e] py-16 px-6 border-b border-[#1b1f28]">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-slate-400 mb-2 font-medium">
              <span>Minimalist Athletic System</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span>Lab Certified Competition Series</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white uppercase">
              Current Issue 01
            </h2>
          </div>

          <p className="text-sm text-slate-400 max-w-md">
            Every garment stripped to functional perfection. Zero extraneous trims, laser-cut ventilation,
            and proprietary micro-woven synthetics calibrated for peak output.
          </p>
        </div>

        {/* Filter & Sorting Bar */}
        <div className="bg-[#0f1217] border border-[#1e232e] p-3 mb-8 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Discipline Segmented Control (Functional Buttons) */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
            <span className="text-xs uppercase text-slate-400 font-medium px-2 flex items-center gap-1.5 shrink-0">
              <Filter className="w-3.5 h-3.5" />
              <span>Discipline:</span>
            </span>
            {disciplines.map((discipline) => {
              const active = selectedDiscipline === discipline;
              return (
                <button
                  key={discipline}
                  onClick={() => setSelectedDiscipline(discipline)}
                  className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-white text-black font-semibold'
                      : 'text-slate-300 hover:text-white hover:bg-[#1a1e26]'
                  }`}
                >
                  {discipline}
                </button>
              );
            })}
          </div>

          {/* Secondary Filter & Sort controls */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Category selection */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-slate-400 uppercase font-medium">Type:</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-[#14171f] border border-[#232934] text-xs text-white px-2.5 py-1.5 focus:outline-none focus:border-[#ccff00]"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Sorting */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-slate-400 uppercase font-medium">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-[#14171f] border border-[#232934] text-xs text-white px-2.5 py-1.5 focus:outline-none focus:border-[#ccff00]"
              >
                <option value="featured">Featured Athletes</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
                <option value="weight">Lowest Weight (g)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Product Grid */}
        {filteredProducts.length === 0 ? (
          <div className="py-20 text-center border border-dashed border-[#232934] bg-[#0f1217]">
            <p className="text-slate-400 text-sm mb-3">No technical gear found matching active filters.</p>
            <button
              onClick={() => {
                setSelectedDiscipline('All');
                setSelectedCategory('All');
              }}
              className="px-4 py-2 bg-white text-black text-xs font-semibold uppercase tracking-wider"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onSelect={onSelectProduct}
                onQuickAdd={onQuickAdd}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
