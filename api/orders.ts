import crypto from 'node:crypto';
import postgres from 'postgres';
import { getMissingConfig } from '../src/server/config';
import { buildWhatsAppOrderUrl, generateWhatsAppOrderMessage } from '../src/utils/whatsapp';
import type { CartItem, CustomerDetails, Product } from '../src/types/cafe';

export default async function orders(req: any, res: any) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const missing = getMissingConfig();
  if (missing.length > 0) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Service misconfigured' }));
    return;
  }

  try {
    let payload = req.body;
    if (typeof payload === 'string') {
      payload = JSON.parse(payload);
    }
    const customer = payload?.customer as CustomerDetails | undefined;
    const items = payload?.items as Array<{ productId: string; quantity: number }> | undefined;

    if (!customer?.name?.trim()) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Customer name is required' }));
      return;
    }
    const cleanPhone = (customer.phone || '').replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'A valid 10-digit mobile number is required' }));
      return;
    }
    if (customer.orderType === 'delivery' && !customer.address?.trim()) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Delivery address is required for home delivery' }));
      return;
    }
    if (!Array.isArray(items) || items.length === 0) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Your cart contains no items' }));
      return;
    }

    const sql = postgres(process.env.DATABASE_URL!, {
      prepare: false,
      max: 1,
      idle_timeout: 15,
      connect_timeout: 10,
    });

    const referenceId = `NC-${Date.now().toString().slice(-4)}${Math.floor(10 + Math.random() * 90)}`;
    const createdAt = new Date().toISOString();
    const result = await sql.begin(async (tx) => {
      const settingsRows = await tx`
        SELECT cafe_name, tagline, whatsapp_number, min_order_delivery_paise,
               delivery_fee_paise, free_delivery_threshold_paise
        FROM public.store_settings
        WHERE id = 1
        LIMIT 1
      `;
      if (settingsRows.length === 0) throw new Error('Store configuration not found');
      const settings = settingsRows[0];

      const validatedCartItems: CartItem[] = [];
      let subtotalPaise = 0;
      for (const requested of items) {
        const quantity = Math.floor(requested.quantity);
        if (quantity <= 0) continue;
        const productRows = await tx`
          SELECT id, name, slug, description, price_paise, category_id, category_name,
                 dietary, image, is_available, is_featured, display_order,
                 portion_info, prep_time_minutes
          FROM public.products
          WHERE id = ${requested.productId}
          LIMIT 1
        `;
        if (productRows.length === 0) throw new Error(`Product ID "${requested.productId}" does not exist in menu`);
        const row = productRows[0];
        if (!row.is_available) throw new Error(`"${row.name}" is currently sold out and cannot be ordered`);

        const pricePaise = Number(row.price_paise);
        const product: Product = {
          id: row.id,
          name: row.name,
          slug: row.slug,
          description: row.description,
          pricePaise,
          categoryId: row.category_id,
          categoryName: row.category_name || '',
          dietary: row.dietary === 'non-veg' ? 'non-veg' : 'veg',
          image: row.image || '/images/natkhat_hero_feast_1793454950947.jpg',
          isAvailable: row.is_available,
          isFeatured: row.is_featured,
          displayOrder: row.display_order,
          portionInfo: row.portion_info || undefined,
          prepTimeMinutes: row.prep_time_minutes ?? undefined,
        };
        subtotalPaise += pricePaise * quantity;
        validatedCartItems.push({ product, quantity });
      }

      if (validatedCartItems.length === 0) throw new Error('No valid dishes in order');
      const minDeliveryPaise = Number(settings.min_order_delivery_paise);
      if (customer.orderType === 'delivery' && subtotalPaise < minDeliveryPaise) {
        throw new Error(`Minimum delivery order amount is ₹${minDeliveryPaise / 100}`);
      }
      const freeThresholdPaise = Number(settings.free_delivery_threshold_paise);
      const deliveryFeePaise = customer.orderType === 'delivery' && subtotalPaise < freeThresholdPaise
        ? Number(settings.delivery_fee_paise)
        : 0;
      const totalPaise = subtotalPaise + deliveryFeePaise;

      await tx`
        INSERT INTO public.orders (
          reference_id, customer_name, customer_phone, order_type, address, landmark,
          instructions, subtotal_paise, delivery_fee_paise, total_paise, status, items_json, created_at
        ) VALUES (
          ${referenceId}, ${customer.name.trim()}, ${cleanPhone}, ${customer.orderType},
          ${customer.orderType === 'delivery' ? (customer.address || '').trim() : null},
          ${customer.landmark?.trim() || null}, ${customer.instructions?.trim() || null},
          ${subtotalPaise}, ${deliveryFeePaise}, ${totalPaise}, 'pending_confirmation',
          ${tx.json(validatedCartItems)}, ${createdAt}
        )
      `;

      for (const item of validatedCartItems) {
        await tx`
          INSERT INTO public.order_items (
            id, order_reference_id, product_id, product_name_snapshot,
            unit_price_paise, quantity, total_paise, portion_info_snapshot
          ) VALUES (
            ${`item-${referenceId}-${item.product.id}-${crypto.randomBytes(4).toString('hex')}`},
            ${referenceId}, ${item.product.id}, ${item.product.name},
            ${item.product.pricePaise}, ${item.quantity},
            ${item.product.pricePaise * item.quantity}, ${item.product.portionInfo || null}
          )
        `;
      }

      const messageParams = {
        cafeName: settings.cafe_name,
        referenceId,
        customer: { ...customer, phone: cleanPhone },
        items: validatedCartItems,
        subtotalPaise,
        deliveryFeePaise,
        totalPaise,
      };
      return {
        referenceId,
        subtotalPaise,
        deliveryFeePaise,
        totalPaise,
        customer: { ...customer, phone: cleanPhone },
        items: validatedCartItems,
        createdAt,
        status: 'pending_confirmation',
        whatsappMessage: generateWhatsAppOrderMessage(messageParams),
        whatsappUrl: buildWhatsAppOrderUrl(settings.whatsapp_number, messageParams),
      };
    });
    await sql.end();

    res.statusCode = 201;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(result));
  } catch (err: any) {
    const message = err instanceof Error ? err.message : '';
    if (
      message.includes('does not exist in menu') ||
      message.includes('currently sold out') ||
      message.includes('Minimum delivery order amount') ||
      message.includes('No valid dishes') ||
      message.includes('Store configuration not found')
    ) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: message }));
      return;
    }
    console.error('[Natkhat Cafe] Order API failed:', err instanceof Error ? err.message : 'Unknown error');
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Server error while validating order' }));
  }
}
