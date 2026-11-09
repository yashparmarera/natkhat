import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const dbPath = path.resolve(process.cwd(), 'data/natkhat_backup_pre_migration.db');
const db = new DatabaseSync(dbPath, { readOnly: true });

const orders = db.prepare('SELECT * FROM orders ORDER BY created_at ASC').all() as any[];

console.log('=== EXACT RECONCILIATION OF ALL HISTORICAL ORDERS ===');
console.log(`Source File: ${dbPath}`);
console.log(`Total Orders: ${orders.length}\n`);

let grandTotalRevenuePaise = 0;
let grandTotalSubtotalPaise = 0;
let grandTotalFeePaise = 0;
let grandTotalLineItemsCount = 0;

orders.forEach((ord, index) => {
  console.log(`--------------------------------------------------------------------------------`);
  console.log(`ORDER ${index + 1} OF ${orders.length}: [${ord.reference_id}]`);
  console.log(`Customer: ${ord.customer_name} | Phone: ${ord.customer_phone} | Type: ${ord.order_type}`);
  console.log(`Timestamp (UTC): ${ord.created_at}`);
  console.log(`Recorded Subtotal: ${ord.subtotal_paise} paise (₹${(ord.subtotal_paise / 100).toFixed(2)})`);
  console.log(`Recorded Delivery Fee: ${ord.delivery_fee_paise} paise (₹${(ord.delivery_fee_paise / 100).toFixed(2)})`);
  console.log(`Recorded Total: ${ord.total_paise} paise (₹${(ord.total_paise / 100).toFixed(2)})`);
  console.log(`Status: ${ord.status}`);
  console.log(`Raw items_json:\n${ord.items_json}`);

  const items = JSON.parse(ord.items_json);
  let computedOrderSubtotal = 0;

  console.log('\nParsed Line Items:');
  items.forEach((item: any, itemIdx: number) => {
    grandTotalLineItemsCount++;
    const prod = item.product || {};
    const unitPrice = prod.pricePaise;
    const quantity = item.quantity;
    const lineSubtotal = unitPrice * quantity;
    computedOrderSubtotal += lineSubtotal;

    console.log(`  Line Item ${itemIdx + 1}:`);
    console.log(`    - Product ID: "${prod.id}"`);
    console.log(`    - Product Name: "${prod.name}"`);
    console.log(`    - Quantity: ${quantity}`);
    console.log(`    - Unit Price: ${unitPrice} paise (₹${(unitPrice / 100).toFixed(2)})`);
    console.log(`    - Line Subtotal: ${lineSubtotal} paise (₹${(lineSubtotal / 100).toFixed(2)})`);
    console.log(`    - Portion: ${prod.portionInfo || 'N/A'}`);
    console.log(`    - Category: ${prod.categoryId} ("${prod.categoryName}")`);
  });

  const subtotalMatches = computedOrderSubtotal === ord.subtotal_paise;
  const totalMatches = (ord.subtotal_paise + ord.delivery_fee_paise) === ord.total_paise;

  console.log(`\nOrder Mathematical Reconciliation:`);
  console.log(`  Sum of Line Subtotals: ${computedOrderSubtotal} paise`);
  console.log(`  Recorded Subtotal:      ${ord.subtotal_paise} paise -> Matches: ${subtotalMatches ? 'YES (EXACT)' : 'NO (MISMATCH)'}`);
  console.log(`  Subtotal + Fee:         ${ord.subtotal_paise + ord.delivery_fee_paise} paise`);
  console.log(`  Recorded Total:         ${ord.total_paise} paise -> Matches: ${totalMatches ? 'YES (EXACT)' : 'NO (MISMATCH)'}`);

  grandTotalSubtotalPaise += ord.subtotal_paise;
  grandTotalFeePaise += ord.delivery_fee_paise;
  grandTotalRevenuePaise += ord.total_paise;
});

console.log(`================================================================================`);
console.log(`CUMULATIVE PORTFOLIO RECONCILIATION ACROSS ALL 6 ORDERS`);
console.log(`Total Orders: ${orders.length}`);
console.log(`Total Relational Line Items: ${grandTotalLineItemsCount}`);
console.log(`Sum of All Subtotals: ${grandTotalSubtotalPaise} paise (₹${(grandTotalSubtotalPaise / 100).toFixed(2)}) [Target: ₹1,590.00] -> ${grandTotalSubtotalPaise === 159000 ? 'MATCHES EXACTLY' : 'MISMATCH'}`);
console.log(`Sum of All Delivery Fees: ${grandTotalFeePaise} paise (₹${(grandTotalFeePaise / 100).toFixed(2)})`);
console.log(`Sum of All Order Totals: ${grandTotalRevenuePaise} paise (₹${(grandTotalRevenuePaise / 100).toFixed(2)}) [Target: ₹1,590.00] -> ${grandTotalRevenuePaise === 159000 ? 'MATCHES EXACTLY' : 'MISMATCH'}`);
console.log(`================================================================================`);
