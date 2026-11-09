import express from 'express';
import { db, initDatabase } from './db';
import {
  hashPassword,
  verifyPassword,
  createSession,
  requireAuth,
  requireAdminAuth,
  checkLoginRateLimit,
  recordLoginAttempt,
} from './auth';
import { validateAndCreateOrder } from './orderValidator';
import { trackOrder, changeOrderStatus, trackRateLimiter, describeError } from './orderTracking';
import { getClientKey } from './rateLimit';
import { normalizeOrderReference } from '../utils/orderStatus';
import { getPostgresClient, isPostgresConfigured } from './pgDb';
import { supabaseAdmin, supabaseAuth, isSupabaseConfigured } from './supabase';
import { useLocalSqlite, isProductionRuntime } from './config';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';

// Initialize SQLite database (local development only)
if (useLocalSqlite()) initDatabase();

export const app = express();
app.use(express.json());

// ----------------------------------------------------
// PUBLIC API ROUTES
// ----------------------------------------------------

// 1. Health check
app.get('/api/health', (req, res) => {
  if (isProductionRuntime()) {
    return res.json({ status: 'ok' });
  }
  res.json({
    status: 'ok',
    service: 'Natkhat Café API',
    database: isPostgresConfigured() ? 'Supabase PostgreSQL' : 'SQLite (Local)',
    timestamp: new Date().toISOString(),
  });
});

// 2. Store Settings
app.get('/api/settings', async (req, res) => {
  try {
    const pg = getPostgresClient();
    if (isPostgresConfigured() && pg) {
      const [row] = await pg.select().from(schema.storeSettings).limit(1);
      if (!row) {
        return res.status(404).json({ error: 'Store settings not found' });
      }
      return res.json({
        cafeName: row.cafeName,
        tagline: row.tagline,
        contactPhone: row.contactPhone,
        whatsappNumber: row.whatsappNumber,
        address: row.address,
        city: row.city,
        landmark: row.landmark,
        openingHours: row.openingHours,
        announcementText: row.announcementText,
        deliveryEnabled: row.deliveryEnabled,
        pickupEnabled: row.pickupEnabled,
        minOrderDeliveryPaise: row.minOrderDeliveryPaise,
        deliveryFeePaise: row.deliveryFeePaise,
        freeDeliveryThresholdPaise: row.freeDeliveryThresholdPaise,
        fssaiNumber: row.fssaiNumber,
      });
    }

    const row = db.prepare('SELECT * FROM store_settings WHERE id = 1').get() as any;
    if (!row) {
      return res.status(404).json({ error: 'Store settings not found' });
    }

    res.json({
      cafeName: row.cafe_name,
      tagline: row.tagline,
      contactPhone: row.contact_phone,
      whatsappNumber: row.whatsapp_number,
      address: row.address,
      city: row.city,
      landmark: row.landmark,
      openingHours: row.opening_hours,
      announcementText: row.announcement_text,
      deliveryEnabled: row.delivery_enabled === 1,
      pickupEnabled: row.pickup_enabled === 1,
      minOrderDeliveryPaise: row.min_order_delivery_paise,
      deliveryFeePaise: row.delivery_fee_paise,
      freeDeliveryThresholdPaise: row.free_delivery_threshold_paise,
      fssaiNumber: row.fssai_number,
    });
  } catch (err: any) {
    console.error('Error fetching settings:', err);
    res.status(500).json({ error: 'Failed to retrieve store settings' });
  }
});

// 3. Categories List
app.get('/api/categories', async (req, res) => {
  try {
    const pg = getPostgresClient();
    if (isPostgresConfigured() && pg) {
      const rows = await pg.select().from(schema.categories).orderBy(schema.categories.displayOrder);
      const categories = rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        description: r.description,
        displayOrder: r.displayOrder,
        active: r.active,
        image: r.image,
      }));
      return res.json(categories);
    }

    const rows = db.prepare('SELECT * FROM categories ORDER BY display_order ASC').all() as any[];
    const categories = rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      displayOrder: r.display_order,
      active: r.active === 1,
      image: r.image,
    }));
    res.json(categories);
  } catch (err: any) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ error: 'Failed to retrieve categories' });
  }
});

// 4. Products List
app.get('/api/products', async (req, res) => {
  try {
    const pg = getPostgresClient();
    if (isPostgresConfigured() && pg) {
      const rows = await pg.select().from(schema.products).orderBy(schema.products.displayOrder);
      const products = rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        description: r.description,
        pricePaise: r.pricePaise,
        categoryId: r.categoryId,
        categoryName: r.categoryName,
        dietary: r.dietary,
        image: r.image,
        isAvailable: r.isAvailable,
        isFeatured: r.isFeatured,
        displayOrder: r.displayOrder,
        portionInfo: r.portionInfo,
        prepTimeMinutes: r.prepTimeMinutes,
      }));
      return res.json(products);
    }

    const rows = db.prepare('SELECT * FROM products ORDER BY display_order ASC').all() as any[];
    const products = rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      pricePaise: r.price_paise,
      categoryId: r.category_id,
      categoryName: r.category_name,
      dietary: r.dietary,
      image: r.image,
      isAvailable: r.is_available === 1,
      isFeatured: r.is_featured === 1,
      displayOrder: r.display_order,
      portionInfo: r.portion_info,
      prepTimeMinutes: r.prep_time_minutes,
    }));
    res.json(products);
  } catch (err: any) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: 'Failed to retrieve products' });
  }
});

// 5. Submit Order (SERVER-SIDE PRICE VALIDATION & TRANSACTIONAL PERSISTENCE)
app.post('/api/orders', async (req, res) => {
  try {
    const result = await validateAndCreateOrder(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.status(201).json(result.order);
  } catch (err: any) {
    console.error('Failed to validate order:', err);
    res.status(500).json({ error: 'Server error while validating order' });
  }
});

// 5b. Track a takeaway order (public, rate limited). The response never contains customer
// details, items or totals, and delivery orders do not expose their status.
app.get('/api/orders/:referenceId/track', async (req, res) => {
  res.set('Cache-Control', 'no-store');

  const limit = trackRateLimiter.check(getClientKey(req, Boolean(process.env.VERCEL)));
  if (!limit.allowed) {
    res.set('Retry-After', String(limit.retryAfterSeconds));
    return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
  }

  const referenceId = normalizeOrderReference(req.params.referenceId);
  if (!referenceId) {
    return res.status(400).json({ error: 'Invalid order number. Order numbers look like NC-123456.' });
  }

  try {
    const tracking = await trackOrder(referenceId);
    if (!tracking) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json(tracking);
  } catch (err) {
    console.error('Error tracking order:', describeError(err));
    res.status(500).json({ error: 'Failed to retrieve order status' });
  }
});

// 6. Admin Authentication Login (RATE-LIMITED & HASHED)
app.post('/api/auth/login', async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const { allowed, retryAfterSeconds } = checkLoginRateLimit(ip);

  if (!allowed) {
    return res.status(429).json({
      error: `Too many failed login attempts. Please try again in ${retryAfterSeconds} seconds.`,
    });
  }

  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  // Branch A: Supabase Auth Login
  if (!useLocalSqlite()) {
    // Sign-in uses the anon-key client only; the service-role client never signs users in.
    if (!isSupabaseConfigured || !supabaseAuth) {
      return res.status(503).json({ error: 'Service misconfigured' });
    }
    try {
      const email = username.includes('@') ? username : `${username}@natkhatcafe.com`;
      const { data: authData, error: authErr } = await supabaseAuth.auth.signInWithPassword({
        email,
        password,
      });

      if (authErr || !authData.session) {
        recordLoginAttempt(ip, false);
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const pg = getPostgresClient();
      const [profile] = pg
        ? await pg.select().from(schema.profiles).where(eq(schema.profiles.id, authData.user.id)).limit(1)
        : [];
      if (!profile || !profile.isActive) {
        recordLoginAttempt(ip, false);
        return res.status(403).json({ error: 'Account is not authorised for the admin portal' });
      }

      recordLoginAttempt(ip, true);
      return res.json({
        success: true,
        token: authData.session.access_token,
        user: { id: authData.user.id, username: authData.user.email, role: profile.role },
      });
    } catch (err) {
      console.error('[Login] Supabase sign-in failed');
      return res.status(500).json({ error: 'Login failed' });
    }
  }

  // Branch B: Local SQLite Admin Login
  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username) as any;
  if (!user) {
    recordLoginAttempt(ip, false);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const isValid = verifyPassword(password, user.password_hash, user.salt);
  if (!isValid) {
    recordLoginAttempt(ip, false);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  recordLoginAttempt(ip, true);
  const token = createSession(user.id, user.username, user.role);

  res.json({
    success: true,
    token,
    user: { id: user.id, username: user.username, role: user.role },
  });
});

// ----------------------------------------------------
// PROTECTED ADMINISTRATIVE ROUTES (requireAuth)
// ----------------------------------------------------

// Verify Active Session
app.get('/api/auth/me', requireAuth(['admin', 'manager', 'staff']), (req, res) => {
  res.json({ success: true, user: req.user });
});

// Change Admin Password
app.post('/api/auth/change-password', requireAdminAuth, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters long' });
  }

  if (isSupabaseConfigured && supabaseAdmin && req.user?.id) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(req.user.id, { password: newPassword });
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    return res.json({ success: true, message: 'Password updated successfully in Supabase Auth' });
  }

  const { hash, salt } = hashPassword(newPassword);
  db.prepare('UPDATE admin_users SET password_hash = ?, salt = ? WHERE username = ?').run(
    hash,
    salt,
    req.user?.username || 'admin'
  );

  res.json({ success: true, message: 'Password updated successfully' });
});

// Update Store Settings (Admin Only)
app.post('/api/settings', requireAdminAuth, async (req, res) => {
  const b = req.body;
  const pg = getPostgresClient();

  if (isPostgresConfigured() && pg) {
    await pg
      .update(schema.storeSettings)
      .set({
        cafeName: b.cafeName,
        tagline: b.tagline,
        contactPhone: b.contactPhone,
        whatsappNumber: b.whatsappNumber,
        address: b.address,
        city: b.city,
        landmark: b.landmark,
        openingHours: b.openingHours,
        announcementText: b.announcementText,
        deliveryEnabled: b.deliveryEnabled,
        pickupEnabled: b.pickupEnabled,
        minOrderDeliveryPaise: b.minOrderDeliveryPaise,
        deliveryFeePaise: b.deliveryFeePaise,
        freeDeliveryThresholdPaise: b.freeDeliveryThresholdPaise,
        fssaiNumber: b.fssaiNumber,
        updatedAt: new Date(),
      })
      .where(eq(schema.storeSettings.id, 1));

    return res.json({ success: true, message: 'Settings saved to PostgreSQL database' });
  }

  db.prepare(`
    UPDATE store_settings SET
      cafe_name = COALESCE(?, cafe_name),
      tagline = COALESCE(?, tagline),
      contact_phone = COALESCE(?, contact_phone),
      whatsapp_number = COALESCE(?, whatsapp_number),
      address = COALESCE(?, address),
      city = COALESCE(?, city),
      landmark = COALESCE(?, landmark),
      opening_hours = COALESCE(?, opening_hours),
      announcement_text = COALESCE(?, announcement_text),
      delivery_enabled = COALESCE(?, delivery_enabled),
      pickup_enabled = COALESCE(?, pickup_enabled),
      min_order_delivery_paise = COALESCE(?, min_order_delivery_paise),
      delivery_fee_paise = COALESCE(?, delivery_fee_paise),
      free_delivery_threshold_paise = COALESCE(?, free_delivery_threshold_paise),
      fssai_number = COALESCE(?, fssai_number),
      updated_at = ?
    WHERE id = 1
  `).run(
    b.cafeName,
    b.tagline,
    b.contactPhone,
    b.whatsappNumber,
    b.address,
    b.city,
    b.landmark,
    b.openingHours,
    b.announcementText,
    b.deliveryEnabled !== undefined ? (b.deliveryEnabled ? 1 : 0) : null,
    b.pickupEnabled !== undefined ? (b.pickupEnabled ? 1 : 0) : null,
    b.minOrderDeliveryPaise,
    b.deliveryFeePaise,
    b.freeDeliveryThresholdPaise,
    b.fssaiNumber,
    new Date().toISOString()
  );

  res.json({ success: true, message: 'Settings saved to SQLite database' });
});

// Toggle Product Availability (Staff, Manager, Admin)
app.patch('/api/products/:id/availability', requireAuth(['admin', 'manager', 'staff']), async (req, res) => {
  const { id } = req.params;
  const pg = getPostgresClient();

  if (isPostgresConfigured() && pg) {
    const [current] = await pg.select().from(schema.products).where(eq(schema.products.id, id)).limit(1);
    if (!current) {
      return res.status(404).json({ error: 'Product not found' });
    }
    const nextVal = !current.isAvailable;
    await pg.update(schema.products).set({ isAvailable: nextVal, updatedAt: new Date() }).where(eq(schema.products.id, id));
    return res.json({ success: true, id, isAvailable: nextVal });
  }

  const current = db.prepare('SELECT is_available FROM products WHERE id = ?').get(id) as any;
  if (!current) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const nextVal = current.is_available === 1 ? 0 : 1;
  db.prepare('UPDATE products SET is_available = ? WHERE id = ?').run(nextVal, id);
  res.json({ success: true, id, isAvailable: nextVal === 1 });
});

// Update Product (Manager, Admin)
app.put('/api/products/:id', requireAuth(['admin', 'manager']), async (req, res) => {
  const { id } = req.params;
  const b = req.body;
  const pg = getPostgresClient();

  if (isPostgresConfigured() && pg) {
    await pg
      .update(schema.products)
      .set({
        name: b.name,
        description: b.description,
        pricePaise: b.pricePaise,
        categoryId: b.categoryId,
        categoryName: b.categoryName,
        isFeatured: b.isFeatured,
        portionInfo: b.portionInfo,
        updatedAt: new Date(),
      })
      .where(eq(schema.products.id, id));
    return res.json({ success: true, id });
  }

  db.prepare(`
    UPDATE products SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      price_paise = COALESCE(?, price_paise),
      category_id = COALESCE(?, category_id),
      category_name = COALESCE(?, category_name),
      is_featured = COALESCE(?, is_featured),
      portion_info = COALESCE(?, portion_info)
    WHERE id = ?
  `).run(
    b.name,
    b.description,
    b.pricePaise,
    b.categoryId,
    b.categoryName,
    b.isFeatured !== undefined ? (b.isFeatured ? 1 : 0) : null,
    b.portionInfo,
    id
  );

  res.json({ success: true, id });
});

// Create Product (Manager, Admin)
app.post('/api/products', requireAuth(['admin', 'manager']), async (req, res) => {
  const b = req.body;
  const id = `prod-${Date.now()}`;
  const slug = b.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const pg = getPostgresClient();

  if (isPostgresConfigured() && pg) {
    await pg.insert(schema.products).values({
      id,
      name: b.name,
      slug,
      description: b.description || '',
      pricePaise: b.pricePaise,
      categoryId: b.categoryId,
      categoryName: b.categoryName || '',
      dietary: b.dietary || 'veg',
      image: b.image || '/src/assets/images/natkhat_hero_feast_1793454950947.jpg',
      isAvailable: true,
      isFeatured: b.isFeatured ? true : false,
      displayOrder: b.displayOrder || 99,
      portionInfo: b.portionInfo || null,
      prepTimeMinutes: b.prepTimeMinutes || 10,
    });
    return res.status(201).json({ success: true, id });
  }

  db.prepare(`
    INSERT INTO products (
      id, name, slug, description, price_paise, category_id, category_name,
      dietary, image, is_available, is_featured, display_order, portion_info, prep_time_minutes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    b.name,
    slug,
    b.description || '',
    b.pricePaise,
    b.categoryId,
    b.categoryName || '',
    b.dietary || 'veg',
    b.image || '/src/assets/images/natkhat_hero_feast_1793454950947.jpg',
    1,
    b.isFeatured ? 1 : 0,
    b.displayOrder || 99,
    b.portionInfo || null,
    b.prepTimeMinutes || 10
  );

  res.status(201).json({ success: true, id });
});

// Delete Product (Admin Only)
app.delete('/api/products/:id', requireAdminAuth, async (req, res) => {
  const { id } = req.params;
  const pg = getPostgresClient();

  if (isPostgresConfigured() && pg) {
    try {
      await pg.delete(schema.products).where(eq(schema.products.id, id));
      return res.json({ success: true, message: 'Product deleted from database' });
    } catch (err: any) {
      if (err.message?.includes('foreign key constraint') || err.code === '23503') {
        return res.status(400).json({ error: 'Cannot delete product because it is referenced in past orders.' });
      }
      throw err;
    }
  }

  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  res.json({ success: true, message: 'Product deleted from database' });
});

// Categories Management
app.post('/api/categories', requireAuth(['admin', 'manager']), async (req, res) => {
  const b = req.body;
  const id = `cat-${Date.now()}`;
  const slug = b.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const pg = getPostgresClient();

  if (isPostgresConfigured() && pg) {
    await pg.insert(schema.categories).values({
      id,
      name: b.name,
      slug,
      description: b.description || '',
      displayOrder: b.displayOrder || 99,
      active: true,
      image: b.image || null,
    });
    return res.status(201).json({ success: true, id });
  }

  db.prepare(`
    INSERT INTO categories (id, name, slug, description, display_order, active, image)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, b.name, slug, b.description || '', b.displayOrder || 99, 1, b.image || null);

  res.status(201).json({ success: true, id });
});

app.put('/api/categories/:id', requireAuth(['admin', 'manager']), async (req, res) => {
  const { id } = req.params;
  const b = req.body;
  const pg = getPostgresClient();

  if (isPostgresConfigured() && pg) {
    await pg
      .update(schema.categories)
      .set({
        name: b.name,
        description: b.description,
        active: b.active,
        updatedAt: new Date(),
      })
      .where(eq(schema.categories.id, id));
    return res.json({ success: true, id });
  }

  db.prepare(`
    UPDATE categories SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      active = COALESCE(?, active)
    WHERE id = ?
  `).run(b.name, b.description, b.active !== undefined ? (b.active ? 1 : 0) : null, id);

  res.json({ success: true, id });
});

// View Submitted Orders (Staff, Manager, Admin)
app.get('/api/orders', requireAuth(['admin', 'manager', 'staff']), async (req, res) => {
  try {
    const pg = getPostgresClient();
    if (isPostgresConfigured() && pg) {
      const rows = await pg.select().from(schema.orders).orderBy(schema.orders.createdAt);
      const formatted = rows.map((r) => ({
        referenceId: r.referenceId,
        customer: {
          name: r.customerName,
          phone: r.customerPhone,
          orderType: r.orderType,
          address: r.address || undefined,
          landmark: r.landmark || undefined,
          instructions: r.instructions || undefined,
        },
        subtotalPaise: r.subtotalPaise,
        deliveryFeePaise: r.deliveryFeePaise,
        totalPaise: r.totalPaise,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        items: r.itemsJson,
      }));
      return res.json(formatted.reverse());
    }

    const rows = db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 50').all() as any[];
    const orders = rows.map((r) => ({
      referenceId: r.reference_id,
      customer: {
        name: r.customer_name,
        phone: r.customer_phone,
        orderType: r.order_type,
        address: r.address,
        landmark: r.landmark,
        instructions: r.instructions,
      },
      subtotalPaise: r.subtotal_paise,
      deliveryFeePaise: r.delivery_fee_paise,
      totalPaise: r.total_paise,
      status: r.status,
      createdAt: r.created_at,
      items: JSON.parse(r.items_json),
    }));

    res.json(orders);
  } catch (err: any) {
    console.error('Error fetching admin orders:', err);
    res.status(500).json({ error: 'Failed to retrieve orders' });
  }
});

// Update Order Status (Staff, Manager, Admin). Allowed moves are defined in utils/orderStatus.
// Only status and updated_at are written, so customer details, totals and items are never touched.
app.patch('/api/orders/:referenceId/status', requireAuth(['admin', 'manager', 'staff']), async (req, res) => {
  const referenceId = normalizeOrderReference(req.params.referenceId);
  if (!referenceId) {
    return res.status(400).json({ error: 'Invalid order number' });
  }

  try {
    const result = await changeOrderStatus(referenceId, req.body?.status);
    if (result.ok) {
      return res.json({
        success: true,
        referenceId: result.referenceId,
        status: result.status,
        updatedAt: result.updatedAt,
      });
    }
    const httpStatus = result.code === 'not_found' ? 404 : result.code === 'conflict' ? 409 : 400;
    return res
      .status(httpStatus)
      .json({ error: result.message, ...(result.currentStatus ? { currentStatus: result.currentStatus } : {}) });
  } catch (err) {
    console.error('Error updating order status:', describeError(err));
    res.status(500).json({ error: 'Failed to update order status' });
  }
});
