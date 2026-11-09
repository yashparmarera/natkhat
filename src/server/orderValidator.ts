import { db } from './db';
import { getPostgresClient, isPostgresConfigured } from './pgDb';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import { CustomerDetails, CartItem, Product } from '../types/cafe';
import { generateWhatsAppOrderMessage, buildWhatsAppOrderUrl } from '../utils/whatsapp';
import crypto from 'node:crypto';

export interface SubmitOrderPayload {
  customer: CustomerDetails;
  items: Array<{ productId: string; quantity: number }>;
}

export interface ValidatedOrderResult {
  success: boolean;
  error?: string;
  order?: {
    referenceId: string;
    subtotalPaise: number;
    deliveryFeePaise: number;
    totalPaise: number;
    customer: CustomerDetails;
    items: CartItem[];
    createdAt: string;
    status: string;
    whatsappMessage: string;
    whatsappUrl: string;
  };
}

export async function validateAndCreateOrder(payload: SubmitOrderPayload): Promise<ValidatedOrderResult> {
  const { customer, items } = payload;

  if (!customer || !customer.name || !customer.name.trim()) {
    return { success: false, error: 'Customer name is required' };
  }

  const cleanPhone = (customer.phone || '').replace(/\D/g, '');
  if (!cleanPhone || cleanPhone.length < 10) {
    return { success: false, error: 'A valid 10-digit mobile number is required' };
  }

  if (customer.orderType === 'delivery') {
    if (!customer.address || !customer.address.trim()) {
      return { success: false, error: 'Delivery address is required for home delivery' };
    }
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return { success: false, error: 'Your cart contains no items' };
  }

  // Generate unique order reference ID: NC-XXXXXX
  const referenceId = `NC-${Date.now().toString().slice(-4)}${Math.floor(10 + Math.random() * 90)}`;
  const createdAt = new Date().toISOString();

  const pg = getPostgresClient();

  // Branch A: PostgreSQL Transactional Order Creation (Production)
  if (isPostgresConfigured() && pg) {
    try {
      const result = await pg.transaction(async (tx) => {
        // Fetch store settings
        const [settingsRow] = await tx.select().from(schema.storeSettings).limit(1);
        if (!settingsRow) {
          throw new Error('Store configuration not found');
        }

        const validatedCartItems: CartItem[] = [];
        let calculatedSubtotalPaise = 0;

        for (const requestedItem of items) {
          const qty = Math.floor(requestedItem.quantity);
          if (qty <= 0) continue;

          // Query product directly in transaction
          const [productRow] = await tx
            .select()
            .from(schema.products)
            .where(eq(schema.products.id, requestedItem.productId))
            .limit(1);

          if (!productRow) {
            throw new Error(`Product ID "${requestedItem.productId}" does not exist in menu`);
          }

          if (!productRow.isAvailable) {
            throw new Error(`"${productRow.name}" is currently sold out and cannot be ordered`);
          }

          const product: Product = {
            id: productRow.id,
            name: productRow.name,
            slug: productRow.slug,
            description: productRow.description,
            pricePaise: productRow.pricePaise, // Trusted DB price
            categoryId: productRow.categoryId,
            categoryName: productRow.categoryName || '',
            dietary: (productRow.dietary as any) || 'veg',
            image: productRow.image || '/src/assets/images/natkhat_hero_feast_1793454950947.jpg',
            isAvailable: productRow.isAvailable,
            isFeatured: productRow.isFeatured,
            displayOrder: productRow.displayOrder,
            portionInfo: productRow.portionInfo || undefined,
            prepTimeMinutes: productRow.prepTimeMinutes || undefined,
          };

          calculatedSubtotalPaise += product.pricePaise * qty;
          validatedCartItems.push({ product, quantity: qty });
        }

        if (validatedCartItems.length === 0) {
          throw new Error('No valid dishes in order');
        }

        // Delivery minimum check
        if (customer.orderType === 'delivery') {
          if (calculatedSubtotalPaise < settingsRow.minOrderDeliveryPaise) {
            throw new Error(`Minimum delivery order amount is ₹${settingsRow.minOrderDeliveryPaise / 100}`);
          }
        }

        // Delivery Fee calculation
        let calculatedDeliveryFeePaise = 0;
        if (customer.orderType === 'delivery') {
          if (calculatedSubtotalPaise < settingsRow.freeDeliveryThresholdPaise) {
            calculatedDeliveryFeePaise = settingsRow.deliveryFeePaise;
          }
        }

        const calculatedTotalPaise = calculatedSubtotalPaise + calculatedDeliveryFeePaise;

        // 1. Insert into orders table (with immutable itemsJson snapshot)
        await tx.insert(schema.orders).values({
          referenceId,
          customerName: customer.name.trim(),
          customerPhone: cleanPhone,
          orderType: customer.orderType,
          address: customer.orderType === 'delivery' ? (customer.address || '').trim() : null,
          landmark: customer.landmark ? customer.landmark.trim() : null,
          instructions: customer.instructions ? customer.instructions.trim() : null,
          subtotalPaise: calculatedSubtotalPaise,
          deliveryFeePaise: calculatedDeliveryFeePaise,
          totalPaise: calculatedTotalPaise,
          status: 'pending_confirmation',
          itemsJson: validatedCartItems,
          createdAt: new Date(createdAt),
        });

        // 2. Insert into authoritative order_items table
        for (const it of validatedCartItems) {
          await tx.insert(schema.orderItems).values({
            id: `item-${referenceId}-${it.product.id}-${crypto.randomBytes(4).toString('hex')}`,
            orderReferenceId: referenceId,
            productId: it.product.id,
            productNameSnapshot: it.product.name,
            unitPricePaise: it.product.pricePaise,
            quantity: it.quantity,
            totalPaise: it.product.pricePaise * it.quantity,
            portionInfoSnapshot: it.product.portionInfo || null,
          });
        }

        const whatsappMessage = generateWhatsAppOrderMessage({
          cafeName: settingsRow.cafeName,
          referenceId,
          customer: { ...customer, phone: cleanPhone },
          items: validatedCartItems,
          subtotalPaise: calculatedSubtotalPaise,
          deliveryFeePaise: calculatedDeliveryFeePaise,
          totalPaise: calculatedTotalPaise,
        });

        const whatsappUrl = buildWhatsAppOrderUrl(settingsRow.whatsappNumber, {
          cafeName: settingsRow.cafeName,
          referenceId,
          customer: { ...customer, phone: cleanPhone },
          items: validatedCartItems,
          subtotalPaise: calculatedSubtotalPaise,
          deliveryFeePaise: calculatedDeliveryFeePaise,
          totalPaise: calculatedTotalPaise,
        });

        return {
          referenceId,
          subtotalPaise: calculatedSubtotalPaise,
          deliveryFeePaise: calculatedDeliveryFeePaise,
          totalPaise: calculatedTotalPaise,
          customer,
          items: validatedCartItems,
          createdAt,
          status: 'pending_confirmation',
          whatsappMessage,
          whatsappUrl,
        };
      });

      return { success: true, order: result };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error processing order' };
    }
  }

  // Branch B: SQLite Order Creation (Local Development / Fallback)
  const settingsRow = db.prepare('SELECT * FROM store_settings WHERE id = 1').get() as any;
  if (!settingsRow) {
    return { success: false, error: 'Store configuration not found' };
  }

  const validatedCartItems: CartItem[] = [];
  let calculatedSubtotalPaise = 0;
  const getProductStmt = db.prepare('SELECT * FROM products WHERE id = ?');

  for (const requestedItem of items) {
    const qty = Math.floor(requestedItem.quantity);
    if (qty <= 0) continue;

    const productRow = getProductStmt.get(requestedItem.productId) as any;
    if (!productRow) {
      return { success: false, error: `Product ID "${requestedItem.productId}" does not exist in menu` };
    }

    if (productRow.is_available === 0) {
      return { success: false, error: `"${productRow.name}" is currently sold out and cannot be ordered` };
    }

    const product: Product = {
      id: productRow.id,
      name: productRow.name,
      slug: productRow.slug,
      description: productRow.description,
      pricePaise: productRow.price_paise,
      categoryId: productRow.category_id,
      categoryName: productRow.category_name,
      dietary: productRow.dietary,
      image: productRow.image,
      isAvailable: productRow.is_available === 1,
      isFeatured: productRow.is_featured === 1,
      displayOrder: productRow.display_order,
      portionInfo: productRow.portion_info,
      prepTimeMinutes: productRow.prep_time_minutes,
    };

    calculatedSubtotalPaise += product.pricePaise * qty;
    validatedCartItems.push({ product, quantity: qty });
  }

  if (validatedCartItems.length === 0) {
    return { success: false, error: 'No valid dishes in order' };
  }

  if (customer.orderType === 'delivery') {
    if (calculatedSubtotalPaise < settingsRow.min_order_delivery_paise) {
      return {
        success: false,
        error: `Minimum delivery order amount is ₹${settingsRow.min_order_delivery_paise / 100}`,
      };
    }
  }

  let calculatedDeliveryFeePaise = 0;
  if (customer.orderType === 'delivery') {
    if (calculatedSubtotalPaise < settingsRow.free_delivery_threshold_paise) {
      calculatedDeliveryFeePaise = settingsRow.delivery_fee_paise;
    }
  }

  const calculatedTotalPaise = calculatedSubtotalPaise + calculatedDeliveryFeePaise;

  db.prepare(`
    INSERT INTO orders (
      reference_id, customer_name, customer_phone, order_type, address,
      landmark, instructions, subtotal_paise, delivery_fee_paise, total_paise,
      status, created_at, items_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    referenceId,
    customer.name.trim(),
    cleanPhone,
    customer.orderType,
    customer.orderType === 'delivery' ? (customer.address || '').trim() : null,
    customer.landmark ? customer.landmark.trim() : null,
    customer.instructions ? customer.instructions.trim() : null,
    calculatedSubtotalPaise,
    calculatedDeliveryFeePaise,
    calculatedTotalPaise,
    'pending_confirmation',
    createdAt,
    JSON.stringify(validatedCartItems)
  );

  const whatsappMessage = generateWhatsAppOrderMessage({
    cafeName: settingsRow.cafe_name,
    referenceId,
    customer: { ...customer, phone: cleanPhone },
    items: validatedCartItems,
    subtotalPaise: calculatedSubtotalPaise,
    deliveryFeePaise: calculatedDeliveryFeePaise,
    totalPaise: calculatedTotalPaise,
  });

  const whatsappUrl = buildWhatsAppOrderUrl(settingsRow.whatsapp_number, {
    cafeName: settingsRow.cafe_name,
    referenceId,
    customer: { ...customer, phone: cleanPhone },
    items: validatedCartItems,
    subtotalPaise: calculatedSubtotalPaise,
    deliveryFeePaise: calculatedDeliveryFeePaise,
    totalPaise: calculatedTotalPaise,
  });

  return {
    success: true,
    order: {
      referenceId,
      subtotalPaise: calculatedSubtotalPaise,
      deliveryFeePaise: calculatedDeliveryFeePaise,
      totalPaise: calculatedTotalPaise,
      customer,
      items: validatedCartItems,
      createdAt,
      status: 'pending_confirmation',
      whatsappMessage,
      whatsappUrl,
    },
  };
}
