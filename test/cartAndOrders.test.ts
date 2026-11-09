import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCartSubtotalPaise,
  calculateCartItemCount,
  calculateDeliveryFeePaise,
  addToCart,
  removeFromCart,
  updateCartQuantity,
} from '../src/utils/cart';
import { formatINRPlain, rupeesToPaise, paiseToRupees } from '../src/utils/currency';
import { generateWhatsAppOrderMessage } from '../src/utils/whatsapp';
import { CartItem, Product } from '../src/types/cafe';

const sampleProduct1: Product = {
  id: 'prod-kulhad-chai',
  name: 'Special Adrak Elaichi Kulhad Chai',
  slug: 'adrak-elaichi-kulhad-chai',
  description: 'Slow-simmered whole milk chai',
  pricePaise: 3000, // ₹30
  categoryId: 'tea-snacks',
  dietary: 'veg',
  image: '/src/assets/images/chai_bun_maska_samosa_1793454952038.jpg',
  isAvailable: true,
  isFeatured: true,
  displayOrder: 1,
};

const sampleProduct2: Product = {
  id: 'prod-special-thali',
  name: 'Natkhat Special Maharaja Thali',
  slug: 'natkhat-special-maharaja-thali',
  description: 'Complete royal feast',
  pricePaise: 19000, // ₹190
  categoryId: 'lunch-dinner-thali',
  dietary: 'veg',
  image: '/src/assets/images/deluxe_indian_thali_1793454952202.jpg',
  isAvailable: true,
  isFeatured: true,
  displayOrder: 1,
};

test('Currency conversion: rupees to paise and paise to rupees', () => {
  assert.equal(rupeesToPaise(100), 10000);
  assert.equal(rupeesToPaise(250), 25000);
  assert.equal(paiseToRupees(3000), 30);
  assert.equal(paiseToRupees(19000), 190);
  assert.equal(formatINRPlain(25000), '₹250');
  assert.equal(formatINRPlain(3000), '₹30');
});

test('Cart calculations: subtotal and item count', () => {
  const cart: CartItem[] = [
    { product: sampleProduct1, quantity: 2 }, // 2 * 3000 = 6000
    { product: sampleProduct2, quantity: 1 }, // 1 * 19000 = 19000
  ];

  const subtotal = calculateCartSubtotalPaise(cart);
  const itemCount = calculateCartItemCount(cart);

  assert.equal(subtotal, 25000); // 25000 paise = ₹250
  assert.equal(itemCount, 3);
});

test('Delivery fee calculation: free delivery above threshold', () => {
  const deliveryFee = 3000; // ₹30
  const threshold = 25000;  // ₹250

  // 1. Pickup always has zero delivery fee
  assert.equal(calculateDeliveryFeePaise(10000, 'pickup', deliveryFee, threshold), 0);
  assert.equal(calculateDeliveryFeePaise(50000, 'pickup', deliveryFee, threshold), 0);

  // 2. Delivery under ₹250 incurs ₹30 delivery fee
  assert.equal(calculateDeliveryFeePaise(24900, 'delivery', deliveryFee, threshold), 3000);
  assert.equal(calculateDeliveryFeePaise(10000, 'delivery', deliveryFee, threshold), 3000);

  // 3. Delivery at or above ₹250 gets free delivery
  assert.equal(calculateDeliveryFeePaise(25000, 'delivery', deliveryFee, threshold), 0);
  assert.equal(calculateDeliveryFeePaise(34000, 'delivery', deliveryFee, threshold), 0);
});

test('Cart modifications: add, update quantity, remove', () => {
  let cart: CartItem[] = [];

  // Add 1 chai
  cart = addToCart(cart, sampleProduct1, 1);
  assert.equal(cart.length, 1);
  assert.equal(cart[0].quantity, 1);

  // Add another chai (should increment quantity)
  cart = addToCart(cart, sampleProduct1, 1);
  assert.equal(cart.length, 1);
  assert.equal(cart[0].quantity, 2);

  // Add thali
  cart = addToCart(cart, sampleProduct2, 1);
  assert.equal(cart.length, 2);

  // Update quantity of chai to 3
  cart = updateCartQuantity(cart, sampleProduct1.id, 3);
  assert.equal(cart.find((i) => i.product.id === sampleProduct1.id)?.quantity, 3);

  // Update quantity to 0 removes item
  cart = updateCartQuantity(cart, sampleProduct1.id, 0);
  assert.equal(cart.length, 1);
  assert.equal(cart[0].product.id, sampleProduct2.id);

  // Remove remaining item
  cart = removeFromCart(cart, sampleProduct2.id);
  assert.equal(cart.length, 0);
});

test('WhatsApp message format contains order reference, customer, and items', () => {
  const message = generateWhatsAppOrderMessage({
    cafeName: 'Natkhat Café',
    referenceId: 'NC-348176',
    customer: {
      name: 'Rohan Sharma',
      phone: '9876543210',
      orderType: 'delivery',
      address: 'Flat 101, Galaxy Tower, Sector 4',
    },
    items: [
      { product: sampleProduct1, quantity: 2 },
      { product: sampleProduct2, quantity: 1 },
    ],
    subtotalPaise: 25000,
    deliveryFeePaise: 0,
    totalPaise: 25000,
  });

  assert.match(message, /NC-348176/);
  assert.match(message, /Rohan Sharma/);
  assert.match(message, /9876543210/);
  assert.match(message, /Special Adrak Elaichi Kulhad Chai/);
  assert.match(message, /Natkhat Special Maharaja Thali/);
  assert.match(message, /₹250/);
});

test('PostgreSQL BIGINT range check: Number.MAX_SAFE_INTEGER accommodates paise safely', () => {
  const maxSafePaise = Number.MAX_SAFE_INTEGER;
  // Over 90 trillion rupees
  assert.ok(maxSafePaise > 9_000_000_000_000_000);
  
  // Normal café order in paise
  const orderPaise = 25000;
  assert.equal(typeof orderPaise, 'number');
  assert.ok(Number.isSafeInteger(orderPaise));
});
