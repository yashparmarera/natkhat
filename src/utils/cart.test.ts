import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCartSubtotalPaise,
  calculateCartItemCount,
  calculateDeliveryFeePaise,
  addToCart,
  updateCartQuantity,
  removeFromCart,
} from './cart';
import { paiseToRupees, rupeesToPaise, formatINRPlain } from './currency';
import { Product, CartItem } from '../types/cafe';

const mockProduct1: Product = {
  id: 'prod-1',
  name: 'Special Kulhad Chai',
  slug: 'kulhad-chai',
  description: 'Slow-brewed spiced ginger cardamom tea in clay cup',
  pricePaise: 3000, // ₹30
  categoryId: 'tea-snacks',
  dietary: 'veg',
  image: '/images/chai.jpg',
  isAvailable: true,
  isFeatured: true,
  displayOrder: 1,
};

const mockProduct2: Product = {
  id: 'prod-2',
  name: 'Aloo Paratha with Amul Butter',
  slug: 'aloo-paratha',
  description: 'Golden tandoor-style paratha stuffed with spiced potatoes',
  pricePaise: 8000, // ₹80
  categoryId: 'breakfast-parathas',
  dietary: 'veg',
  image: '/images/paratha.jpg',
  isAvailable: true,
  isFeatured: true,
  displayOrder: 2,
};

test('Currency conversion handles paise and rupees accurately', () => {
  assert.equal(paiseToRupees(3000), 30);
  assert.equal(rupeesToPaise(80), 8000);
  assert.equal(formatINRPlain(12550), '₹125.5');
  assert.equal(formatINRPlain(5000), '₹50');
});

test('Cart addition and item counting calculates correct quantities', () => {
  let cart: CartItem[] = [];
  cart = addToCart(cart, mockProduct1, 2);
  assert.equal(cart.length, 1);
  assert.equal(calculateCartItemCount(cart), 2);
  assert.equal(calculateCartSubtotalPaise(cart), 6000);

  // Add same item again -> increments quantity
  cart = addToCart(cart, mockProduct1, 1);
  assert.equal(cart.length, 1);
  assert.equal(cart[0].quantity, 3);
  assert.equal(calculateCartSubtotalPaise(cart), 9000);

  // Add different item
  cart = addToCart(cart, mockProduct2, 1);
  assert.equal(cart.length, 2);
  assert.equal(calculateCartItemCount(cart), 4);
  assert.equal(calculateCartSubtotalPaise(cart), 17000); // 9000 + 8000
});

test('Cart quantity updates and item removal work accurately', () => {
  let cart: CartItem[] = [
    { product: mockProduct1, quantity: 2 },
    { product: mockProduct2, quantity: 1 },
  ];

  cart = updateCartQuantity(cart, 'prod-1', 4);
  assert.equal(cart[0].quantity, 4);
  assert.equal(calculateCartSubtotalPaise(cart), 20000); // 4*3000 + 8000

  // Set to 0 -> should remove item
  cart = updateCartQuantity(cart, 'prod-1', 0);
  assert.equal(cart.length, 1);
  assert.equal(cart[0].product.id, 'prod-2');

  // Explicit remove
  cart = removeFromCart(cart, 'prod-2');
  assert.equal(cart.length, 0);
  assert.equal(calculateCartSubtotalPaise(cart), 0);
});

test('Delivery fee calculation obeys order type and threshold', () => {
  const deliveryFee = 4000; // ₹40
  const freeThreshold = 25000; // ₹250

  // Pickup has zero delivery charge
  assert.equal(calculateDeliveryFeePaise(10000, 'pickup', deliveryFee, freeThreshold), 0);

  // Delivery below threshold incurs fee
  assert.equal(calculateDeliveryFeePaise(15000, 'delivery', deliveryFee, freeThreshold), 4000);

  // Delivery above threshold is free
  assert.equal(calculateDeliveryFeePaise(25000, 'delivery', deliveryFee, freeThreshold), 0);
  assert.equal(calculateDeliveryFeePaise(35000, 'delivery', deliveryFee, freeThreshold), 0);
});
