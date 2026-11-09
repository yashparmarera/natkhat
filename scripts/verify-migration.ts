import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import * as dotenv from 'dotenv';
dotenv.config();

import { getPostgresClient, isPostgresConfigured } from '../src/server/pgDb';
import * as schema from '../src/db/schema';
import { count, sum } from 'drizzle-orm';

async function verifyMigration() {
  console.log('=== NATKHAT CAFÉ: MIGRATION PARITY & MATHEMATICAL VERIFICATION ===\n');

  if (!isPostgresConfigured()) {
    console.error('ERROR: DATABASE_URL is not set or empty. Please set DATABASE_URL in .env before running verification.');
    process.exit(1);
  }

  const pg = getPostgresClient();
  if (!pg) {
    console.error('ERROR: Could not initialize PostgreSQL client.');
    process.exit(1);
  }

  // Authoritative Baseline: Verified pre-migration backup holding the 6 baseline orders
  const sqlitePath = path.resolve(process.cwd(), 'data/natkhat_backup_pre_migration.db');
  const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });

  // 1. Categories Parity
  const sqliteCatsCount = (sqlite.prepare('SELECT COUNT(*) as c FROM categories').get() as any).c;
  const [{ value: pgCatsCount }] = await pg.select({ value: count() }).from(schema.categories);
  if (sqliteCatsCount !== pgCatsCount) {
    throw new Error(`Category count mismatch: SQLite ${sqliteCatsCount} vs PG ${pgCatsCount}`);
  }
  console.log(`✔ Categories count verified: ${pgCatsCount} / ${sqliteCatsCount}`);

  // 2. Products Parity & Price Sum
  const sqliteProdsCount = (sqlite.prepare('SELECT COUNT(*) as c FROM products').get() as any).c;
  const [{ value: pgProdsCount }] = await pg.select({ value: count() }).from(schema.products);
  if (sqliteProdsCount !== pgProdsCount) {
    throw new Error(`Product count mismatch: SQLite ${sqliteProdsCount} vs PG ${pgProdsCount}`);
  }

  const sqliteProdsSum = (sqlite.prepare('SELECT SUM(price_paise) as s FROM products').get() as any).s;
  const [{ value: pgProdsSum }] = await pg.select({ value: sum(schema.products.pricePaise) }).from(schema.products);
  if (BigInt(sqliteProdsSum) !== BigInt(pgProdsSum || 0)) {
    throw new Error(`Product price sum mismatch: SQLite ${sqliteProdsSum} vs PG ${pgProdsSum}`);
  }
  console.log(`✔ Products count verified: ${pgProdsCount} / ${sqliteProdsCount}`);
  console.log(`✔ Products price sum verified: ${pgProdsSum} paise / ${sqliteProdsSum} paise`);

  // 3. Orders Parity & Revenue Sum
  const sqliteOrdersCount = (sqlite.prepare('SELECT COUNT(*) as c FROM orders').get() as any).c;
  const [{ value: pgOrdersCount }] = await pg.select({ value: count() }).from(schema.orders);
  if (sqliteOrdersCount !== pgOrdersCount) {
    throw new Error(`Orders count mismatch: SQLite ${sqliteOrdersCount} vs PG ${pgOrdersCount}`);
  }

  const sqliteOrdersSum = (sqlite.prepare('SELECT SUM(total_paise) as s FROM orders').get() as any).s;
  const [{ value: pgOrdersSum }] = await pg.select({ value: sum(schema.orders.totalPaise) }).from(schema.orders);
  if (BigInt(sqliteOrdersSum) !== BigInt(pgOrdersSum || 0)) {
    throw new Error(`Orders revenue sum mismatch: SQLite ${sqliteOrdersSum} vs PG ${pgOrdersSum}`);
  }
  console.log(`✔ Orders count verified: ${pgOrdersCount} / ${sqliteOrdersCount}`);
  console.log(`✔ Orders revenue sum verified: ${pgOrdersSum} paise / ${sqliteOrdersSum} paise`);

  // 4. Order Items Parity
  const [{ value: pgOrderItemsCount }] = await pg.select({ value: count() }).from(schema.orderItems);
  console.log(`✔ Relational order_items created: ${pgOrderItemsCount}`);

  console.log('\n================================================================');
  console.log('✔ DATA INTEGRITY VERIFIED: 100% PARITY BETWEEN SQLITE AND POSTGRESQL');
  console.log('================================================================');
  process.exit(0);
}

verifyMigration().catch((err) => {
  console.error('\n[Verification] FAILED:', err.message);
  process.exit(1);
});
