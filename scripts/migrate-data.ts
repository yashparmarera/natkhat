import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import * as dotenv from 'dotenv';
import { sql } from 'drizzle-orm';
dotenv.config();

import { getPostgresClient, isPostgresConfigured } from '../src/server/pgDb';
import * as schema from '../src/db/schema';

const DATA_MIGRATION_LOCK_ID = 894729104859125n;

async function runMigration() {
  console.log('=== NATKHAT CAFÉ: SQLITE TO SUPABASE POSTGRESQL DATA MIGRATION ===\n');

  if (!isPostgresConfigured()) {
    console.error('ERROR: DATABASE_URL is not set or empty. Please set DATABASE_URL in .env before running migration.');
    process.exit(1);
  }

  const pg = getPostgresClient();
  if (!pg) {
    console.error('ERROR: Could not initialize PostgreSQL client.');
    process.exit(1);
  }

  // 1. Authoritative Source: Verified pre-migration backup holding the 6 baseline historical orders
  const sqlitePath = path.resolve(process.cwd(), 'data/natkhat_backup_pre_migration.db');
  console.log(`[Source] Reading SQLite DB from verified backup: ${sqlitePath}`);
  const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });

  let lockAcquired = false;

  try {
    // 2. Preflight: Check PostgreSQL Schema
    console.log('[Preflight] Verifying schema and advisory lock...');
    await pg.execute(sql`SELECT pg_advisory_lock(${DATA_MIGRATION_LOCK_ID})`);
    lockAcquired = true;
    console.log('✔ Data migration advisory lock acquired.');

    // Verify _schema_migrations exists
    const migrationsCheck = await pg.execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = '_schema_migrations'
      ) as exists
    `);
    const schemaExists = (migrationsCheck as any)[0]?.exists;
    if (!schemaExists) {
      throw new Error(
        'Database schema not initialized! Table _schema_migrations was not found.\n' +
        'You must run "npm run db:migrate" to apply schema migrations before migrating data.'
      );
    }

    // 3. Conflict Detection: Inspect Existing Orders in Destination Database
    console.log('[Preflight] Checking destination orders table for conflicts...');
    const existingOrders = await pg.select().from(schema.orders);
    const baselineOrderRefs = ['NC-348176', 'NC-512660', 'NC-289212', 'NC-569859', 'NC-369171', 'NC-968790'];

    if (existingOrders.length > 0) {
      console.log(`[Notice] Destination database contains ${existingOrders.length} existing order(s).`);
      
      const foreignOrders = existingOrders.filter((o) => !baselineOrderRefs.includes(o.referenceId));
      if (foreignOrders.length > 0) {
        console.warn(
          `[Warning] Destination database contains ${foreignOrders.length} non-baseline orders ` +
          `(e.g., ${foreignOrders.map((o) => o.referenceId).slice(0, 3).join(', ')}). ` +
          `Baseline migration will use onConflictDoNothing and will not touch foreign records.`
        );
      }

      // Check for conflicting values in baseline orders
      const sqliteOrders = sqlite.prepare('SELECT * FROM orders').all() as any[];
      for (const sqlOrd of sqliteOrders) {
        const match = existingOrders.find((eo) => eo.referenceId === sqlOrd.reference_id);
        if (match) {
          if (match.totalPaise !== sqlOrd.total_paise) {
            throw new Error(
              `FATAL CONFLICT: Order ${match.referenceId} already exists in destination PostgreSQL ` +
              `with total ${match.totalPaise} paise, but backup source has ${sqlOrd.total_paise} paise! ` +
              `Halting migration to prevent data inconsistency.`
            );
          }
          console.log(`  ✔ Existing baseline order ${match.referenceId} verified (identical financial total).`);
        }
      }
    }

    console.log('\n[Migration] Beginning transaction in PostgreSQL...');

    await pg.transaction(async (tx) => {
      // 1. Settings (1 record)
      const settings = sqlite.prepare('SELECT * FROM store_settings WHERE id = 1').get() as any;
      if (settings) {
        await tx.insert(schema.storeSettings).values({
          id: 1,
          cafeName: settings.cafe_name,
          tagline: settings.tagline,
          contactPhone: settings.contact_phone,
          whatsappNumber: settings.whatsapp_number,
          address: settings.address,
          city: settings.city,
          landmark: settings.landmark,
          openingHours: settings.opening_hours,
          announcementText: settings.announcement_text,
          deliveryEnabled: settings.delivery_enabled === 1,
          pickupEnabled: settings.pickup_enabled === 1,
          minOrderDeliveryPaise: settings.min_order_delivery_paise,
          deliveryFeePaise: settings.delivery_fee_paise,
          freeDeliveryThresholdPaise: settings.free_delivery_threshold_paise,
          fssaiNumber: settings.fssai_number,
        }).onConflictDoUpdate({
          target: schema.storeSettings.id,
          set: { updatedAt: new Date() },
        });
        console.log('✔ Migrated store_settings (ID: 1)');
      }

      // 2. Categories (7 records)
      const categories = sqlite.prepare('SELECT * FROM categories ORDER BY display_order ASC').all() as any[];
      for (const cat of categories) {
        await tx.insert(schema.categories).values({
          id: cat.id,
          name: cat.name,
          slug: cat.slug,
          description: cat.description || '',
          displayOrder: cat.display_order,
          active: cat.active === 1,
          image: cat.image,
        }).onConflictDoUpdate({
          target: schema.categories.id,
          set: {
            name: cat.name,
            slug: cat.slug,
            description: cat.description || '',
            displayOrder: cat.display_order,
            active: cat.active === 1,
            image: cat.image,
            updatedAt: new Date(),
          },
        });
      }
      console.log(`✔ Migrated ${categories.length} categories`);

      // 3. Products (27 records)
      const products = sqlite.prepare('SELECT * FROM products ORDER BY display_order ASC').all() as any[];
      for (const prod of products) {
        await tx.insert(schema.products).values({
          id: prod.id,
          name: prod.name,
          slug: prod.slug,
          description: prod.description || '',
          pricePaise: prod.price_paise,
          categoryId: prod.category_id,
          categoryName: prod.category_name,
          dietary: prod.dietary || 'veg',
          image: prod.image,
          isAvailable: prod.is_available === 1,
          isFeatured: prod.is_featured === 1,
          displayOrder: prod.display_order,
          portionInfo: prod.portion_info,
          prepTimeMinutes: prod.prep_time_minutes,
        }).onConflictDoUpdate({
          target: schema.products.id,
          set: {
            name: prod.name,
            slug: prod.slug,
            description: prod.description || '',
            pricePaise: prod.price_paise,
            categoryId: prod.category_id,
            categoryName: prod.category_name,
            dietary: prod.dietary || 'veg',
            image: prod.image,
            isAvailable: prod.is_available === 1,
            isFeatured: prod.is_featured === 1,
            displayOrder: prod.display_order,
            portionInfo: prod.portion_info,
            prepTimeMinutes: prod.prep_time_minutes,
            updatedAt: new Date(),
          },
        });
      }
      console.log(`✔ Migrated ${products.length} products`);

      // 4. Orders (Dynamic: all records from SQLite pre-migration backup)
      const orders = sqlite.prepare('SELECT * FROM orders ORDER BY created_at ASC').all() as any[];
      let totalItemsMigrated = 0;

      for (const ord of orders) {
        const items = JSON.parse(ord.items_json);

        // onConflictDoNothing: IMMUTABILITY GUARANTEE for historical financial orders
        await tx.insert(schema.orders).values({
          referenceId: ord.reference_id,
          customerName: ord.customer_name,
          customerPhone: ord.customer_phone,
          orderType: ord.order_type,
          address: ord.address,
          landmark: ord.landmark,
          instructions: ord.instructions,
          subtotalPaise: ord.subtotal_paise,
          deliveryFeePaise: ord.delivery_fee_paise,
          totalPaise: ord.total_paise,
          status: ord.status,
          itemsJson: items,
          createdAt: new Date(ord.created_at),
        }).onConflictDoNothing();

        // 5. Populate Authoritative order_items Table from items_json
        for (const it of items) {
          const prod = it.product;
          const itemId = `item-${ord.reference_id}-${prod.id}`;

          await tx.insert(schema.orderItems).values({
            id: itemId,
            orderReferenceId: ord.reference_id,
            productId: prod.id,
            productNameSnapshot: prod.name,
            unitPricePaise: prod.pricePaise,
            quantity: it.quantity,
            totalPaise: prod.pricePaise * it.quantity,
            portionInfoSnapshot: prod.portionInfo || null,
          }).onConflictDoNothing();

          totalItemsMigrated++;
        }
      }
      console.log(`✔ Migrated ${orders.length} orders and populated ${totalItemsMigrated} relational order_items`);
    });

    console.log('\n[Migration] COMPLETED SUCCESSFULLY.');
  } catch (err: any) {
    console.error('\n[Migration] FAILED with error:', err.message);
    process.exit(1);
  } finally {
    if (lockAcquired) {
      try {
        await pg.execute(sql`SELECT pg_advisory_unlock(${DATA_MIGRATION_LOCK_ID})`);
        console.log('[Lock] Data migration advisory lock released.');
      } catch (unlockErr: any) {
        console.error('[Lock] Warning: Failed to release advisory lock:', unlockErr.message);
      }
    }
  }
}

// Only execute when run directly from CLI
if (process.argv[1]?.endsWith('migrate-data.ts')) {
  runMigration();
}

export { runMigration };
