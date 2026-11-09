import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeWhatsAppNumber,
  generateWhatsAppOrderMessage,
  buildWhatsAppOrderUrl,
  generateBulkEnquiryMessage,
  buildBulkEnquiryWhatsAppUrl,
} from './whatsapp';
import { Product, CartItem, CustomerDetails, BulkEnquiry } from '../types/cafe';

const mockProduct: Product = {
  id: 'prod-thali',
  name: 'Natkhat Special Thali',
  slug: 'natkhat-special-thali',
  description: 'Complete Indian meal with 2 Sabzi, Dal Tadka, Jeera Rice, 4 Rotis, Raita & Gulab Jamun',
  pricePaise: 18000, // ₹180
  categoryId: 'lunch-dinner-thali',
  dietary: 'veg',
  image: '/images/thali.jpg',
  isAvailable: true,
  isFeatured: true,
  displayOrder: 1,
};

test('sanitizeWhatsAppNumber properly handles formatting and adds 91 when 10 digits given', () => {
  assert.equal(sanitizeWhatsAppNumber('9876543210'), '919876543210');
  assert.equal(sanitizeWhatsAppNumber('+91 98765 43210'), '919876543210');
  assert.equal(sanitizeWhatsAppNumber('919876543210'), '919876543210');
});

test('generateWhatsAppOrderMessage formats complete order details and instructions', () => {
  const customer: CustomerDetails = {
    name: 'Aarav Sharma',
    phone: '9876543210',
    orderType: 'delivery',
    address: 'Flat 402, Royal Residency, Sector 4',
    landmark: 'Opposite State Bank',
    instructions: 'Make food medium spicy, extra salad please',
  };

  const items: CartItem[] = [
    { product: mockProduct, quantity: 2 },
  ];

  const message = generateWhatsAppOrderMessage({
    cafeName: 'Natkhat Café',
    referenceId: 'NC-5021',
    customer,
    items,
    subtotalPaise: 36000,
    deliveryFeePaise: 0,
    totalPaise: 36000,
  });

  assert.match(message, /Natkhat Café/);
  assert.match(message, /#NC-5021/);
  assert.match(message, /Aarav Sharma/);
  assert.match(message, /9876543210/);
  assert.match(message, /Natkhat Special Thali/);
  assert.match(message, /₹360/);
  assert.match(message, /Royal Residency/);
  assert.match(message, /Opposite State Bank/);
  assert.match(message, /Make food medium spicy/);
});

test('buildWhatsAppOrderUrl generates a valid wa.me URI with encodeURIComponent', () => {
  const customer: CustomerDetails = {
    name: 'Pooja',
    phone: '9811122233',
    orderType: 'pickup',
  };

  const items: CartItem[] = [
    { product: mockProduct, quantity: 1 },
  ];

  const url = buildWhatsAppOrderUrl('919876543210', {
    cafeName: 'Natkhat Café',
    referenceId: 'NC-1001',
    customer,
    items,
    subtotalPaise: 18000,
    deliveryFeePaise: 0,
    totalPaise: 18000,
  });

  assert.ok(url.startsWith('https://wa.me/919876543210?text='));
  assert.ok(url.includes(encodeURIComponent('Natkhat Café')));
  assert.ok(url.includes(encodeURIComponent('#NC-1001')));
});

test('buildBulkEnquiryWhatsAppUrl formats bulk catering details', () => {
  const enquiry: BulkEnquiry = {
    name: 'Sunil Verma',
    phone: '9988776655',
    companyOrGroup: 'Infosys Tech Park, Team B',
    eventType: 'Corporate Lunch',
    estimatedPeople: 45,
    preferredDate: '2026-11-05',
    preferredTime: '1:00 PM',
    dietaryRequirements: 'Pure Vegetarian with Jain Options',
    notes: 'Require packaged individual box meals',
  };

  const message = generateBulkEnquiryMessage('Natkhat Café', enquiry);
  assert.match(message, /Bulk Food Order \/ Catering/);
  assert.match(message, /45 People/);
  assert.match(message, /Infosys Tech Park/);

  const url = buildBulkEnquiryWhatsAppUrl('9876543210', 'Natkhat Café', enquiry);
  assert.ok(url.startsWith('https://wa.me/919876543210?text='));
});
