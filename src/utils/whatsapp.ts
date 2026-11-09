import { CartItem, CustomerDetails, BulkEnquiry } from '../types/cafe';
import { formatINRPlain } from './currency';

/**
 * Clean WhatsApp phone number ensuring only digits are passed to wa.me
 */
export function sanitizeWhatsAppNumber(phone: string): string {
  const digitsOnly = phone.replace(/\D/g, '');
  // Default to adding India country code 91 if 10 digits provided
  if (digitsOnly.length === 10) {
    return `91${digitsOnly}`;
  }
  return digitsOnly;
}

export interface WhatsAppOrderMessageParams {
  cafeName: string;
  referenceId: string;
  customer: CustomerDetails;
  items: CartItem[];
  subtotalPaise: number;
  deliveryFeePaise: number;
  totalPaise: number;
}

/**
 * Builds a readable, beautifully formatted WhatsApp message for order placement
 */
export function generateWhatsAppOrderMessage(params: WhatsAppOrderMessageParams): string {
  const {
    cafeName,
    referenceId,
    customer,
    items,
    subtotalPaise,
    deliveryFeePaise,
    totalPaise,
  } = params;

  const orderTypeLabel = customer.orderType === 'delivery' ? '🛵 Home Delivery' : '🥡 Takeaway / Pickup';

  const itemLines = items.map((item, index) => {
    const itemTotal = item.product.pricePaise * item.quantity;
    return `${index + 1}. *${item.product.name}* x ${item.quantity} — ${formatINRPlain(itemTotal)}`;
  }).join('\n');

  let addressBlock = '';
  if (customer.orderType === 'delivery') {
    addressBlock = `\n📍 *Delivery Address:* ${customer.address || 'Not specified'}`;
    if (customer.landmark && customer.landmark.trim()) {
      addressBlock += `\n📌 *Landmark:* ${customer.landmark.trim()}`;
    }
  }

  let instructionsBlock = '';
  if (customer.instructions && customer.instructions.trim()) {
    instructionsBlock = `\n📝 *Special Instructions:* ${customer.instructions.trim()}`;
  }

  let deliveryFeeLine = '';
  if (customer.orderType === 'delivery') {
    deliveryFeeLine = deliveryFeePaise > 0 
      ? `\n• Delivery Charge: ${formatINRPlain(deliveryFeePaise)}` 
      : '\n• Delivery Charge: FREE';
  }

  const message = 
`👋 Hello *${cafeName}*!
I would like to place an order.

🧾 *Order Ref:* #${referenceId}
👤 *Customer Name:* ${customer.name}
📞 *Contact Phone:* ${customer.phone}
📦 *Order Type:* ${orderTypeLabel}
${addressBlock}${instructionsBlock}

📋 *ORDER ITEMS:*
${itemLines}

💰 *BILL SUMMARY:*
• Items Subtotal: ${formatINRPlain(subtotalPaise)}${deliveryFeeLine}
*TOTAL PAYABLE:* ${formatINRPlain(totalPaise)}

⏳ *Please confirm availability and estimated preparation time.*
Thank you!`;

  return message;
}

/**
 * Generates the wa.me click-to-chat URL
 */
export function buildWhatsAppOrderUrl(
  whatsappNumber: string,
  params: WhatsAppOrderMessageParams
): string {
  const cleanNumber = sanitizeWhatsAppNumber(whatsappNumber);
  const message = generateWhatsAppOrderMessage(params);
  return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`;
}

/**
 * Builds WhatsApp message for Bulk Catering / Party enquiries
 */
export function generateBulkEnquiryMessage(cafeName: string, enquiry: BulkEnquiry): string {
  const message = 
`👋 Hello *${cafeName}* Team!
I would like to enquire about a *Bulk Food Order / Catering*.

👤 *Name:* ${enquiry.name}
📞 *Phone:* ${enquiry.phone}
🏢 *Organization / Occasion:* ${enquiry.companyOrGroup || 'Personal / Family Gathering'}
🎉 *Event Type:* ${enquiry.eventType}
👥 *Estimated Guests:* ${enquiry.estimatedPeople} People
📅 *Preferred Date:* ${enquiry.preferredDate}
⏰ *Preferred Time:* ${enquiry.preferredTime}
🥗 *Dietary Preferences:* ${enquiry.dietaryRequirements || 'Standard Café Menu'}
${enquiry.notes ? `\n📝 *Details / Requirements:* ${enquiry.notes}` : ''}

Please let me know package pricing and availability. Thank you!`;

  return message;
}

export function buildBulkEnquiryWhatsAppUrl(
  whatsappNumber: string,
  cafeName: string,
  enquiry: BulkEnquiry
): string {
  const cleanNumber = sanitizeWhatsAppNumber(whatsappNumber);
  const message = generateBulkEnquiryMessage(cafeName, enquiry);
  return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`;
}
