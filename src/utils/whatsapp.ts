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

  const orderTypeLabel = customer.orderType === 'delivery'
    ? '\u{1F6F5} Home Delivery'
    : '\u{1F961} Takeaway / Pickup';

  const itemLines = items.map((item, index) => {
    const itemTotal = item.product.pricePaise * item.quantity;
    return `${index + 1}. *${item.product.name}* x ${item.quantity} — ${formatINRPlain(itemTotal)}`;
  }).join('\n');

  let addressBlock = '';
  if (customer.orderType === 'delivery') {
    addressBlock = `\n\u{1F4CD} *Delivery Address:* ${customer.address || 'Not specified'}`;
    if (customer.landmark && customer.landmark.trim()) {
      addressBlock += `\n\u{1F4CC} *Landmark:* ${customer.landmark.trim()}`;
    }
  }

  let instructionsBlock = '';
  if (customer.instructions && customer.instructions.trim()) {
    instructionsBlock = `\n\u{1F4DD} *Special Instructions:* ${customer.instructions.trim()}`;
  }

  let deliveryFeeLine = '';
  if (customer.orderType === 'delivery') {
    deliveryFeeLine = deliveryFeePaise > 0 
      ? `\n• Delivery Charge: ${formatINRPlain(deliveryFeePaise)}` 
      : '\n• Delivery Charge: FREE';
  }

  const message = 
`\u{1F44B} Hello *${cafeName}*!
I would like to place an order.

\u{1F9FE} *Order Ref:* #${referenceId}
\u{1F464} *Customer Name:* ${customer.name}
\u{1F4DE} *Contact Phone:* ${customer.phone}
\u{1F4E6} *Order Type:* ${orderTypeLabel}
${addressBlock}${instructionsBlock}

\u{1F4CB} *ORDER ITEMS:*
${itemLines}

\u{1F4B0} *BILL SUMMARY:*
• Items Subtotal: ${formatINRPlain(subtotalPaise)}${deliveryFeeLine}
*TOTAL PAYABLE:* ${formatINRPlain(totalPaise)}

\u{23F3} *Please confirm availability and estimated preparation time.*
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
`\u{1F44B} Hello *${cafeName}* Team!
I would like to enquire about a *Bulk Food Order / Catering*.

\u{1F464} *Name:* ${enquiry.name}
\u{1F4DE} *Phone:* ${enquiry.phone}
\u{1F3E2} *Organization / Occasion:* ${enquiry.companyOrGroup || 'Personal / Family Gathering'}
\u{1F389} *Event Type:* ${enquiry.eventType}
\u{1F465} *Estimated Guests:* ${enquiry.estimatedPeople} People
\u{1F4C5} *Preferred Date:* ${enquiry.preferredDate}
\u{23F0} *Preferred Time:* ${enquiry.preferredTime}
\u{1F957} *Dietary Preferences:* ${enquiry.dietaryRequirements || 'Standard Café Menu'}
${enquiry.notes ? `\n\u{1F4DD} *Details / Requirements:* ${enquiry.notes}` : ''}

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
