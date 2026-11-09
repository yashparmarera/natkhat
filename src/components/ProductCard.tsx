import React from 'react';
import { Product } from '../types/cafe';
import { useCafe } from '../context/CafeContext';
import { formatINRPlain } from '../utils/currency';
import { Plus, Minus, Check, Clock } from 'lucide-react';

interface ProductCardProps {
  product: Product;
  onOpenDetails: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onOpenDetails,
}) => {
  const { cart, addToCart, updateCartQuantity } = useCafe();

  const cartItem = cart.find((item) => item.product.id === product.id);
  const currentQuantity = cartItem ? cartItem.quantity : 0;

  return (
    <article className="group bg-white rounded-xl border border-[#234C35]/10 overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col h-full">
      {/* Product Image & Badges */}
      <div
        className="relative aspect-4/3 w-full bg-[#F7F1E4]/50 overflow-hidden cursor-pointer"
        onClick={() => onOpenDetails(product)}
      >
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-104 transition-transform duration-300"
          loading="lazy"
          referrerPolicy="no-referrer"
        />

        {/* Veg Indicator Badge (FSSAI standard) */}
        <div className="absolute top-2.5 left-2.5 bg-white/90 backdrop-blur-xs p-1 rounded-sm shadow-xs border border-gray-200">
          <div className="w-3.5 h-3.5 border-2 border-emerald-600 flex items-center justify-center p-0.5">
            <div className="w-2 h-2 rounded-full bg-emerald-600" />
          </div>
        </div>

        {/* Featured Tag */}
        {product.isFeatured && (
          <div className="absolute top-2.5 right-2.5 bg-[#234C35] text-[#F7F1E4] text-[10px] font-bold px-2 py-0.5 rounded shadow-xs uppercase tracking-wider">
            Popular
          </div>
        )}

        {/* Out of Stock Scrim */}
        {!product.isAvailable && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-2xs flex items-center justify-center">
            <span className="bg-red-600 text-white text-xs font-bold uppercase tracking-wider px-3 py-1 rounded shadow-md">
              Sold Out For Today
            </span>
          </div>
        )}
      </div>

      {/* Product Content Details */}
      <div className="p-4 flex flex-col flex-1 justify-between gap-3">
        <div>
          {/* Category & Portion Tag */}
          <div className="flex items-center justify-between text-xs text-[#242820]/60 mb-1">
            <span>{product.categoryName || 'Café Special'}</span>
            {product.portionInfo && (
              <span className="font-mono text-[11px] text-[#242820]/50">
                {product.portionInfo}
              </span>
            )}
          </div>

          {/* Product Title */}
          <h3
            onClick={() => onOpenDetails(product)}
            className="font-serif font-bold text-base text-[#242820] group-hover:text-[#234C35] transition-colors cursor-pointer line-clamp-1"
          >
            {product.name}
          </h3>

          {/* Description */}
          <p className="text-xs text-[#242820]/75 line-clamp-2 mt-1 leading-relaxed">
            {product.description}
          </p>
        </div>

        {/* Footer: Price & Add to Cart */}
        <div className="pt-2 border-t border-[#234C35]/5 flex items-center justify-between gap-2">
          <div>
            <span className="text-base sm:text-lg font-bold font-mono text-[#234C35] tabular-nums">
              {formatINRPlain(product.pricePaise)}
            </span>
          </div>

          <div>
            {!product.isAvailable ? (
              <button
                disabled
                className="px-3 py-1.5 text-xs text-gray-400 bg-gray-100 rounded-lg cursor-not-allowed font-medium"
              >
                Unavailable
              </button>
            ) : currentQuantity > 0 ? (
              /* Quantity Stepper */
              <div className="flex items-center gap-1.5 bg-[#234C35] text-white rounded-lg p-0.5 shadow-xs">
                <button
                  onClick={() => updateCartQuantity(product.id, currentQuantity - 1)}
                  aria-label={`Decrease ${product.name} quantity`}
                  className="w-7 h-7 flex items-center justify-center hover:bg-white/20 rounded-md transition-colors cursor-pointer"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-5 text-center text-xs font-mono font-bold tabular-nums">
                  {currentQuantity}
                </span>
                <button
                  onClick={() => updateCartQuantity(product.id, currentQuantity + 1)}
                  aria-label={`Increase ${product.name} quantity`}
                  className="w-7 h-7 flex items-center justify-center hover:bg-white/20 rounded-md transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              /* Add to Cart Button */
              <button
                onClick={() => addToCart(product, 1)}
                aria-label={`Add ${product.name} to cart`}
                className="px-3.5 py-1.5 bg-[#234C35]/10 hover:bg-[#234C35] text-[#234C35] hover:text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
};
