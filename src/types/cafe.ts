/**
 * Core types for Natkhat Café
 */

import type { OrderStatus } from '../utils/orderStatus';

export type DietaryType = 'veg' | 'non-veg';

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  displayOrder: number;
  active: boolean;
  image?: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  pricePaise: number; // Integer representation of currency (e.g., ₹120 = 12000 paise)
  categoryId: string;
  categoryName?: string;
  dietary: DietaryType;
  image: string;
  isAvailable: boolean;
  isFeatured: boolean;
  displayOrder: number;
  portionInfo?: string; // e.g., "Serves 1-2", "2 Pieces", "Single Clay Cup"
  prepTimeMinutes?: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export type OrderType = 'delivery' | 'pickup';

export interface CustomerDetails {
  name: string;
  phone: string;
  orderType: OrderType;
  address?: string;
  landmark?: string;
  instructions?: string;
}

export interface OrderSubmission {
  referenceId: string;
  customer: CustomerDetails;
  items: CartItem[];
  subtotalPaise: number;
  deliveryFeePaise: number;
  totalPaise: number;
  createdAt: string;
  status: OrderStatus;
}

export interface StoreSettings {
  cafeName: string;
  tagline: string;
  contactPhone: string;
  whatsappNumber: string; // e.g. "919876543210" without spaces or '+' for wa.me
  address: string;
  city: string;
  landmark: string;
  openingHours: string;
  announcementText: string;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  minOrderDeliveryPaise: number;
  deliveryFeePaise: number;
  freeDeliveryThresholdPaise: number;
  fssaiNumber: string;
  socialInstagram?: string;
  socialFacebook?: string;
}

export interface BulkEnquiry {
  name: string;
  phone: string;
  companyOrGroup?: string;
  eventType: string; // "Corporate Lunch", "College Fest", "Family Gathering", "Industrial Shift"
  estimatedPeople: number;
  preferredDate: string;
  preferredTime: string;
  dietaryRequirements?: string;
  notes?: string;
}
