import type { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { initialSettings, initialCategories, initialProducts } from '../data/initialData';
import { hashPassword } from './auth';
import { useLocalSqlite } from './config';

// SQLite is LOCAL DEVELOPMENT ONLY. Nothing touches the filesystem or loads node:sqlite
// until the first use, and never in production / Postgres mode (see config.ts).
let instance: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (!useLocalSqlite()) {
    throw new Error('SQLite is disabled outside local development');
  }
  if (!instance) {
    const dbPath = process.env.SQLITE_DB_PATH
      ? path.resolve(process.env.SQLITE_DB_PATH)
      : path.join(path.resolve(process.cwd(), 'data'), 'natkhat.db');
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const { DatabaseSync: Sqlite } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
    instance = new Sqlite(dbPath);
  }
  return instance;
}

export const db = new Proxy({} as DatabaseSync, {
  get(_target, prop) {
    const d = getDb();
    const value = (d as any)[prop];
    return typeof value === 'function' ? value.bind(d) : value;
  },
});

// Initialize Tables
export function initDatabase() {
  if (!useLocalSqlite()) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS store_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      cafe_name TEXT NOT NULL,
      tagline TEXT,
      contact_phone TEXT NOT NULL,
      whatsapp_number TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT,
      landmark TEXT,
      opening_hours TEXT NOT NULL,
      announcement_text TEXT,
      delivery_enabled INTEGER NOT NULL DEFAULT 1,
      pickup_enabled INTEGER NOT NULL DEFAULT 1,
      min_order_delivery_paise INTEGER NOT NULL DEFAULT 10000,
      delivery_fee_paise INTEGER NOT NULL DEFAULT 3000,
      free_delivery_threshold_paise INTEGER NOT NULL DEFAULT 25000,
      fssai_number TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT,
      display_order INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      image TEXT
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT,
      price_paise INTEGER NOT NULL,
      category_id TEXT NOT NULL,
      category_name TEXT,
      dietary TEXT NOT NULL DEFAULT 'veg',
      image TEXT,
      is_available INTEGER NOT NULL DEFAULT 1,
      is_featured INTEGER NOT NULL DEFAULT 0,
      display_order INTEGER NOT NULL,
      portion_info TEXT,
      prep_time_minutes INTEGER,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      reference_id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      order_type TEXT NOT NULL,
      address TEXT,
      landmark TEXT,
      instructions TEXT,
      subtotal_paise INTEGER NOT NULL,
      delivery_fee_paise INTEGER NOT NULL,
      total_paise INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_confirmation',
      created_at TEXT NOT NULL,
      items_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at TEXT NOT NULL
    );
  `);

  // Seed settings if empty
  const settingsCount = (db.prepare('SELECT COUNT(*) as count FROM store_settings').get() as { count: number }).count;
  if (settingsCount === 0) {
    db.prepare(`
      INSERT INTO store_settings (
        id, cafe_name, tagline, contact_phone, whatsapp_number, address, city, landmark,
        opening_hours, announcement_text, delivery_enabled, pickup_enabled, min_order_delivery_paise,
        delivery_fee_paise, free_delivery_threshold_paise, fssai_number, updated_at
      ) VALUES (
        1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `).run(
      initialSettings.cafeName,
      initialSettings.tagline,
      initialSettings.contactPhone,
      initialSettings.whatsappNumber,
      initialSettings.address,
      initialSettings.city,
      initialSettings.landmark,
      initialSettings.openingHours,
      initialSettings.announcementText,
      initialSettings.deliveryEnabled ? 1 : 0,
      initialSettings.pickupEnabled ? 1 : 0,
      initialSettings.minOrderDeliveryPaise,
      initialSettings.deliveryFeePaise,
      initialSettings.freeDeliveryThresholdPaise,
      initialSettings.fssaiNumber,
      new Date().toISOString()
    );
  }

  // Seed categories if empty
  const categoriesCount = (db.prepare('SELECT COUNT(*) as count FROM categories').get() as { count: number }).count;
  if (categoriesCount === 0) {
    const insertCat = db.prepare(`
      INSERT INTO categories (id, name, slug, description, display_order, active, image)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const cat of initialCategories) {
      insertCat.run(cat.id, cat.name, cat.slug, cat.description, cat.displayOrder, cat.active ? 1 : 0, cat.image || null);
    }
  }

  // Seed products if empty
  const productsCount = (db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number }).count;
  if (productsCount === 0) {
    const insertProd = db.prepare(`
      INSERT INTO products (
        id, name, slug, description, price_paise, category_id, category_name,
        dietary, image, is_available, is_featured, display_order, portion_info, prep_time_minutes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const prod of initialProducts) {
      insertProd.run(
        prod.id,
        prod.name,
        prod.slug,
        prod.description,
        prod.pricePaise,
        prod.categoryId,
        prod.categoryName || '',
        prod.dietary,
        prod.image,
        prod.isAvailable ? 1 : 0,
        prod.isFeatured ? 1 : 0,
        prod.displayOrder,
        prod.portionInfo || null,
        prod.prepTimeMinutes || null
      );
    }
  }

  // Seed default admin user if none exists
  const adminCount = (db.prepare('SELECT COUNT(*) as count FROM admin_users').get() as { count: number }).count;
  if (adminCount === 0) {
    // Default admin: username 'admin', password 'NatkhatCafe@2026' (Secure password, can be changed in settings)
    const { hash, salt } = hashPassword('NatkhatCafe@2026');
    db.prepare(`
      INSERT INTO admin_users (id, username, password_hash, salt, role, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('admin-1', 'admin', hash, salt, 'admin', new Date().toISOString());
  }
}
