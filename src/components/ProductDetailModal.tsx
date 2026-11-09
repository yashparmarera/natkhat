import React, { useState } from 'react';
import { Product } from '../types/cafe';
import { useCafe } from '../context/CafeContext';
import { formatINRPlain } from '../utils/currency';
import { X, Plus, Minus, Clock, Utensils, Check } from 'lucide-react';

interface ProductDetailModalProps {
  product: Product | null;
  onClose: () => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  onClose,
}) => {
  const { cart, addToCart, updateCartQuantity } = useCafe();
  const [selectedQty, setSelectedQty] = useState(1);

  if (!product) return null;

  const cartItem = cart.find((item) => item.product.id === product.id);
  const alreadyInCart = !!cartItem;

  const handleAdd = () => {
    if (alreadyInCart) {
      updateCartQuantity(product.id, (cartItem?.quantity || 0) + selectedQty);
    } else {
      addToCart(product, selectedQty);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-[#234C35]/15 relative max-h-[90vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-product-title"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-white/80 hover:bg-white text-[#242820] flex items-center justify-center shadow-md transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Image */}
        <div className="relative aspect-16/10 w-full bg-[#F7F1E4] shrink-0">
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-xs px-2 py-1 rounded shadow-xs flex items-center gap-1.5 text-xs font-medium text-emerald-800">
            <div className="w-3 h-3 border-2 border-emerald-600 flex items-center justify-center p-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
            </div>
            <span>Pure Vegetarian</span>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          <div>
            <span className="text-xs font-semibold text-[#D98235] uppercase tracking-wider">
              {product.categoryName}
            </span>
            <h2 id="modal-product-title" className="font-serif text-2xl font-bold text-[#234C35] mt-0.5">
              {product.name}
            </h2>
            <p className="text-xl font-bold font-mono text-[#242820] mt-1 tabular-nums">
              {formatINRPlain(product.pricePaise)}
            </p>
          </div>

          <p className="text-sm text-[#242820]/80 leading-relaxed">
            {product.description}
          </p>

          <div className="grid grid-cols-2 gap-3 py-2 border-y border-[#234C35]/10 text-xs">
            {product.portionInfo && (
              <div>
                <span className="text-[#242820]/60 block">Serving Size</span>
                <span className="font-semibold text-[#242820]">{product.portionInfo}</span>
              </div>
            )}
            <div>
              <span className="text-[#242820]/60 block">Preparation</span>
              <span className="font-semibold text-[#242820]">Made Fresh to Order</span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-[#F7F1E4]/50 border-t border-[#234C35]/10 flex items-center justify-between gap-4 shrink-0">
          {product.isAvailable ? (
            <>
              {/* Quantity Selector */}
              <div className="flex items-center gap-2 bg-white border border-[#234C35]/20 rounded-lg p-1">
                <button
                  onClick={() => setSelectedQty(Math.max(1, selectedQty - 1))}
                  aria-label="Decrease quantity"
                  className="w-8 h-8 rounded flex items-center justify-center hover:bg-gray-100 text-[#242820] cursor-pointer"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-8 text-center font-mono font-bold text-sm tabular-nums">
                  {selectedQty}
                </span>
                <button
                  onClick={() => setSelectedQty(selectedQty + 1)}
                  aria-label="Increase quantity"
                  className="w-8 h-8 rounded flex items-center justify-center hover:bg-gray-100 text-[#242820] cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Add CTA */}
              <button
                onClick={handleAdd}
                className="flex-1 py-3 px-4 bg-[#234C35] hover:bg-[#1a3827] text-white font-semibold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
              >
                <span>{alreadyInCart ? 'Update In Cart' : 'Add to Cart'}</span>
                <span className="font-mono tabular-nums text-xs opacity-90">
                  ({formatINRPlain(product.pricePaise * selectedQty)})
                </span>
              </button>
            </>
          ) : (
            <div className="w-full text-center py-2 text-sm font-semibold text-red-600 bg-red-50 rounded-lg border border-red-200">
              Currently Unavailable For Today
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
