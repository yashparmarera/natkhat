import { CartItem, Product } from '../types/cafe';

export function calculateCartSubtotalPaise(items: CartItem[]): number {
  return items.reduce((sum, item) => {
    return sum + item.product.pricePaise * item.quantity;
  }, 0);
}

export function calculateCartItemCount(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

export function calculateDeliveryFeePaise(
  subtotalPaise: number,
  orderType: 'delivery' | 'pickup',
  feePaise: number,
  freeThresholdPaise: number
): number {
  if (orderType === 'pickup') return 0;
  if (subtotalPaise >= freeThresholdPaise) return 0;
  return feePaise;
}

export function addToCart(
  items: CartItem[],
  product: Product,
  quantity = 1
): CartItem[] {
  if (quantity <= 0) return items;
  const existingIndex = items.findIndex((item) => item.product.id === product.id);

  if (existingIndex > -1) {
    const updated = [...items];
    updated[existingIndex] = {
      ...updated[existingIndex],
      quantity: updated[existingIndex].quantity + quantity,
    };
    return updated;
  }

  return [...items, { product, quantity }];
}

export function updateCartQuantity(
  items: CartItem[],
  productId: string,
  newQuantity: number
): CartItem[] {
  if (newQuantity <= 0) {
    return removeFromCart(items, productId);
  }

  return items.map((item) =>
    item.product.id === productId ? { ...item, quantity: newQuantity } : item
  );
}

export function removeFromCart(items: CartItem[], productId: string): CartItem[] {
  return items.filter((item) => item.product.id !== productId);
}
