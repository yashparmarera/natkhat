import React from 'react';
import { Category } from '../types/cafe';

interface CategoryNavProps {
  categories: Category[];
  selectedCategory: string;
  onSelectCategory: (id: string) => void;
  productsCountByCategory: Record<string, number>;
  totalProductsCount: number;
}

export const CategoryNav: React.FC<CategoryNavProps> = ({
  categories,
  selectedCategory,
  onSelectCategory,
  productsCountByCategory,
  totalProductsCount,
}) => {
  return (
    <div className="w-full overflow-x-auto scrollbar-none py-2 -mx-4 px-4 sm:mx-0 sm:px-0">
      <div className="flex items-center gap-2 min-w-max">
        {/* All Items Button */}
        <button
          onClick={() => onSelectCategory('all')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
            selectedCategory === 'all'
              ? 'bg-[#234C35] text-white shadow-xs'
              : 'bg-white hover:bg-[#F7F1E4] text-[#242820]/80 border border-[#234C35]/15'
          }`}
        >
          <span>All Delicacies</span>
          <span
            className={`text-[10px] font-mono tabular-nums px-1.5 py-0.2 rounded-full ${
              selectedCategory === 'all'
                ? 'bg-white/20 text-white'
                : 'bg-black/5 text-[#242820]/60'
            }`}
          >
            {totalProductsCount}
          </span>
        </button>

        {/* Categories */}
        {categories
          .filter((cat) => cat.active)
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((cat) => {
            const count = productsCountByCategory[cat.id] || 0;
            const isSelected = selectedCategory === cat.id;

            return (
              <button
                key={cat.id}
                onClick={() => onSelectCategory(cat.id)}
                className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-[#234C35] text-white shadow-xs'
                    : 'bg-white hover:bg-[#F7F1E4] text-[#242820]/80 border border-[#234C35]/15'
                }`}
              >
                <span>{cat.name}</span>
                {count > 0 && (
                  <span
                    className={`text-[10px] font-mono tabular-nums px-1.5 py-0.2 rounded-full ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-black/5 text-[#242820]/60'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
      </div>
    </div>
  );
};
