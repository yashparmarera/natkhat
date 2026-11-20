function clean(value: string | undefined): string {
  return (value || '').trim();
}

async function supabaseRequest(path: string, options: { method?: string; body?: unknown } = {}) {
  const supabaseUrl = clean(process.env.SUPABASE_URL) || clean(process.env.VITE_SUPABASE_URL);
  const serviceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Service misconfigured');
  }

  const response = await fetch(`${supabaseUrl}/rest/v1${path}`, {
    method: options.method || 'GET',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: options.method === 'POST' ? 'return=minimal' : 'return=representation',
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!response.ok) {
    const responseBody = await response.text();
    let detail = responseBody;
    try {
      const parsed = JSON.parse(responseBody);
      detail = parsed.message || parsed.error_description || parsed.error || responseBody;
    } catch {}
    throw new Error(`Supabase ${response.status}: ${detail}`);
  }
  if (response.status === 204 || response.status === 201) return [];
  return response.json();
}

function formatPrice(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function generateWhatsAppMessage(
  cafeName: string,
  referenceId: string,
  customer: any,
  items: Array<{ product: any; quantity: number }>,
  subtotalPaise: number,
  deliveryFeePaise: number,
  totalPaise: number
): string {
  const itemLines = items
    .map((item, index) => `${index + 1}. *${item.product.name}* x ${item.quantity} — ${formatPrice(item.product.pricePaise * item.quantity)}`)
    .join('\n');
  const address = customer.orderType === 'delivery'
    ? `\n📍 *Delivery Address:* ${customer.address || 'Not specified'}${customer.landmark ? `\n📌 *Landmark:* ${customer.landmark}` : ''}`
    : '';
  const instructions = customer.instructions ? `\n📝 *Special Instructions:* ${customer.instructions}` : '';
  const deliveryLine = customer.orderType === 'delivery'
    ? deliveryFeePaise > 0
      ? `\n• Delivery Charge: ${formatPrice(deliveryFeePaise)}`
      : '\n• Delivery Charge: FREE'
    : '';

  return `👋 Hello *${cafeName}*!\nI would like to place an order.\n\n🧾 *Order Ref:* #${referenceId}\n👤 *Customer Name:* ${customer.name}\n📞 *Contact Phone:* ${customer.phone}\n📦 *Order Type:* ${customer.orderType === 'delivery' ? '🛵 Home Delivery' : '🥡 Takeaway / Pickup'}${address}${instructions}\n\n📋 *ORDER ITEMS:*\n${itemLines}\n\n💰 *BILL SUMMARY:*\n• Items Subtotal: ${formatPrice(subtotalPaise)}${deliveryLine}\n*TOTAL PAYABLE:* ${formatPrice(totalPaise)}\n\n⏳ *Please confirm availability and estimated preparation time.*\nThank you!`;
}

export default async function orders(req: any, res: any) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    let payload = req.body;
    if (typeof payload === 'string') payload = JSON.parse(payload);
    const customer = payload?.customer;
    const requestedItems = payload?.items;
    if (!customer?.name?.trim()) throw { status: 400, message: 'Customer name is required' };

    const cleanPhone = (customer.phone || '').replace(/\D/g, '');
    if (cleanPhone.length < 10) throw { status: 400, message: 'A valid 10-digit mobile number is required' };
    if (customer.orderType === 'delivery' && !customer.address?.trim()) {
      throw { status: 400, message: 'Delivery address is required for home delivery' };
    }
    if (!Array.isArray(requestedItems) || requestedItems.length === 0) {
      throw { status: 400, message: 'Your cart contains no items' };
    }

    const settingsRows = await supabaseRequest('/store_settings?select=cafe_name,whatsapp_number,min_order_delivery_paise,delivery_fee_paise,free_delivery_threshold_paise&id=eq.1');
    if (!Array.isArray(settingsRows) || settingsRows.length === 0) {
      throw { status: 400, message: 'Store configuration not found' };
    }
    const settings = settingsRows[0];

    const validatedItems: Array<{ product: any; quantity: number }> = [];
    let subtotalPaise = 0;
    for (const requested of requestedItems) {
      const quantity = Math.floor(requested.quantity);
      if (quantity <= 0) continue;
      const productRows = await supabaseRequest(
        `/products?select=id,name,slug,description,price_paise,category_id,category_name,dietary,image,is_available,is_featured,display_order,portion_info,prep_time_minutes&id=eq.${encodeURIComponent(requested.productId)}`
      );
      if (!Array.isArray(productRows) || productRows.length === 0) {
        throw { status: 400, message: `Product ID "${requested.productId}" does not exist in menu` };
      }
      const row = productRows[0];
      if (!row.is_available) throw { status: 400, message: `"${row.name}" is currently sold out and cannot be ordered` };

      const pricePaise = Number(row.price_paise);
      const product = {
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
      validatedItems.push({ product, quantity });
    }
    if (validatedItems.length === 0) throw { status: 400, message: 'No valid dishes in order' };

    const minDeliveryPaise = Number(settings.min_order_delivery_paise);
    if (customer.orderType === 'delivery' && subtotalPaise < minDeliveryPaise) {
      throw { status: 400, message: `Minimum delivery order amount is ₹${minDeliveryPaise / 100}` };
    }
    const freeThresholdPaise = Number(settings.free_delivery_threshold_paise);
    const deliveryFeePaise = customer.orderType === 'delivery' && subtotalPaise < freeThresholdPaise
      ? Number(settings.delivery_fee_paise)
      : 0;
    const totalPaise = subtotalPaise + deliveryFeePaise;
    const referenceId = `NC-${Date.now().toString().slice(-4)}${Math.floor(10 + Math.random() * 90)}`;
    const createdAt = new Date().toISOString();

    await supabaseRequest('/orders', {
      method: 'POST',
      body: {
        reference_id: referenceId,
        customer_name: customer.name.trim(),
        customer_phone: cleanPhone,
        order_type: customer.orderType,
        address: customer.orderType === 'delivery' ? (customer.address || '').trim() : null,
        landmark: customer.landmark?.trim() || null,
        instructions: customer.instructions?.trim() || null,
        subtotal_paise: subtotalPaise,
        delivery_fee_paise: deliveryFeePaise,
        total_paise: totalPaise,
        status: 'pending_confirmation',
        items_json: validatedItems,
        created_at: createdAt,
      },
    });

    const orderItems = validatedItems.map((item) => ({
      id: `item-${referenceId}-${item.product.id}-${cryptoRandomId()}`,
      order_reference_id: referenceId,
      product_id: item.product.id,
      product_name_snapshot: item.product.name,
      unit_price_paise: item.product.pricePaise,
      quantity: item.quantity,
      total_paise: item.product.pricePaise * item.quantity,
      portion_info_snapshot: item.product.portionInfo || null,
    }));
    await supabaseRequest('/order_items', { method: 'POST', body: orderItems });

    const whatsappMessage = generateWhatsAppMessage(
      settings.cafe_name,
      referenceId,
      { ...customer, phone: cleanPhone },
      validatedItems,
      subtotalPaise,
      deliveryFeePaise,
      totalPaise
    );
    const whatsappNumber = (settings.whatsapp_number || '917042653174').replace(/\D/g, '');
    const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`;

    res.statusCode = 201;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({
      referenceId,
      subtotalPaise,
      deliveryFeePaise,
      totalPaise,
      customer: { ...customer, phone: cleanPhone },
      items: validatedItems,
      createdAt,
      status: 'pending_confirmation',
      whatsappMessage,
      whatsappUrl,
    }));
  } catch (err: any) {
    const status = err?.status || (String(err?.message).includes('misconfigured') ? 503 : 500);
    const message = err?.message || 'Server error while validating order';
    if (status === 500) {
      console.error('[Natkhat Cafe] Order API failed:', message);
    }
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: status === 500
        ? 'Server error while validating order'
        : message,
    }));
  }
}

function cryptoRandomId(): string {
  const bytes = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    bytes[0] = Math.floor(Math.random() * 0xffffffff);
  }
  return bytes[0].toString(16).padStart(8, '0');
}
