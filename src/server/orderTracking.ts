import { and, eq } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { db } from './db';
import { getPostgresClient, isPostgresConfigured } from './pgDb';
import { createRateLimiter } from './rateLimit';
import * as schema from '../db/schema';
import type { OrderType } from '../types/cafe';
import {
  ORDER_STATUSES,
  isOrderStatus,
  validateTransition,
  type OrderStatus,
  type PublicOrderTracking,
} from '../utils/orderStatus';

/**
 * Public order tracking and staff status updates.
 * Both runtimes sit behind the small OrderStore interface: Postgres (production, Supabase) and
 * SQLite (local development only, via the lazy `db` proxy which throws outside local mode).
 * Neither store ever reads customer details, items or totals.
 */

/** GET /api/orders/:referenceId/track allows 60 requests per minute per client. */
export const TRACK_RATE_LIMIT = { windowMs: 60_000, max: 60 };
export const trackRateLimiter = createRateLimiter(TRACK_RATE_LIMIT);

export interface OrderRecord {
  referenceId: string;
  orderType: OrderType;
  /** Stored value as is; a hand-edited SQLite row could hold an unrecognised status. */
  status: string;
  createdAt: string;
  /** null when the backend has no updated_at column (local SQLite files created before this feature). */
  updatedAt: string | null;
}

export interface OrderStore {
  find(referenceId: string): Promise<OrderRecord | null>;
  /**
   * Compare-and-set: moves the order to `next` only while it is still in `expected`.
   * Returns null when nothing was updated (the order changed meanwhile, or no longer exists).
   */
  transition(
    referenceId: string,
    expected: string,
    next: OrderStatus,
    at: Date
  ): Promise<{ updatedAt: string | null } | null>;
}

// Accepts the postgres-js client used in production and any other Drizzle Postgres driver (tests use PGlite).
type OrderDb = PgDatabase<any, typeof schema>;

export function createPostgresOrderStore(pg: OrderDb): OrderStore {
  return {
    async find(referenceId) {
      const [row] = await pg
        .select({
          referenceId: schema.orders.referenceId,
          orderType: schema.orders.orderType,
          status: schema.orders.status,
          createdAt: schema.orders.createdAt,
          updatedAt: schema.orders.updatedAt,
        })
        .from(schema.orders)
        .where(eq(schema.orders.referenceId, referenceId))
        .limit(1);
      if (!row) return null;
      return {
        referenceId: row.referenceId,
        orderType: row.orderType,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    },

    async transition(referenceId, expected, next, at) {
      // Only status and updated_at are written, which is all migration 0003 allows.
      const rows = await pg
        .update(schema.orders)
        .set({ status: next, updatedAt: at })
        .where(and(eq(schema.orders.referenceId, referenceId), eq(schema.orders.status, expected as OrderStatus)))
        .returning({ updatedAt: schema.orders.updatedAt });
      return rows.length > 0 ? { updatedAt: rows[0].updatedAt.toISOString() } : null;
    },
  };
}

export function createSqliteOrderStore(): OrderStore {
  // The local orders table may predate this feature and has no updated_at column.
  // The schema is never altered; the column is used only if it already exists.
  const hasUpdatedAt = () =>
    (db.prepare('PRAGMA table_info(orders)').all() as Array<{ name: string }>).some((c) => c.name === 'updated_at');

  return {
    async find(referenceId) {
      const withUpdatedAt = hasUpdatedAt();
      const row = db
        .prepare(
          `SELECT reference_id, order_type, status, created_at${withUpdatedAt ? ', updated_at' : ''} FROM orders WHERE reference_id = ?`
        )
        .get(referenceId) as any;
      if (!row) return null;
      return {
        referenceId: row.reference_id,
        // Anything other than a pickup order is treated as delivery (the stricter flow).
        orderType: row.order_type === 'pickup' ? 'pickup' : 'delivery',
        status: row.status,
        createdAt: row.created_at,
        updatedAt: withUpdatedAt ? (row.updated_at ?? null) : null,
      };
    },

    async transition(referenceId, expected, next, at) {
      const withUpdatedAt = hasUpdatedAt();
      const iso = at.toISOString();
      const result = withUpdatedAt
        ? db
            .prepare('UPDATE orders SET status = ?, updated_at = ? WHERE reference_id = ? AND status = ?')
            .run(next, iso, referenceId, expected)
        : db.prepare('UPDATE orders SET status = ? WHERE reference_id = ? AND status = ?').run(next, referenceId, expected);
      return Number(result.changes) > 0 ? { updatedAt: withUpdatedAt ? iso : null } : null;
    },
  };
}

/** Picks the store the same way the other routes do: Postgres when configured, otherwise local SQLite. */
export function getOrderStore(): OrderStore {
  const pg = getPostgresClient();
  if (isPostgresConfigured() && pg) return createPostgresOrderStore(pg);
  return createSqliteOrderStore();
}

/** Builds the public payload. Takeaway orders expose their status; delivery orders do not. */
export function toPublicTracking(order: OrderRecord): PublicOrderTracking {
  const takeaway = order.orderType === 'pickup';
  return {
    referenceId: order.referenceId,
    orderType: order.orderType,
    status: takeaway && isOrderStatus(order.status) ? order.status : null,
    createdAt: order.createdAt,
    updatedAt: takeaway ? order.updatedAt : null,
  };
}

export async function trackOrder(referenceId: string, store: OrderStore = getOrderStore()): Promise<PublicOrderTracking | null> {
  const order = await store.find(referenceId);
  return order ? toPublicTracking(order) : null;
}

export type ChangeStatusResult =
  | { ok: true; referenceId: string; status: OrderStatus; updatedAt: string | null }
  | {
      ok: false;
      code: 'invalid_status' | 'invalid_transition' | 'not_found' | 'conflict';
      message: string;
      currentStatus?: string;
    };

/**
 * Staff status change. The server decides whether the move is allowed (shared transition tables)
 * and applies it with compare-and-set so two staff members cannot overwrite each other silently.
 */
export async function changeOrderStatus(
  referenceId: string,
  requested: unknown,
  store: OrderStore = getOrderStore(),
  now: () => Date = () => new Date()
): Promise<ChangeStatusResult> {
  if (!isOrderStatus(requested)) {
    return { ok: false, code: 'invalid_status', message: `Unknown status. Allowed values: ${ORDER_STATUSES.join(', ')}.` };
  }

  const order = await store.find(referenceId);
  if (!order) return { ok: false, code: 'not_found', message: 'Order not found' };

  const check = validateTransition(order.orderType, order.status, requested);
  if (!check.ok) {
    return { ok: false, code: 'invalid_transition', message: check.message, currentStatus: order.status };
  }

  const applied = await store.transition(referenceId, order.status, requested, now());
  if (!applied) {
    const latest = await store.find(referenceId);
    if (!latest) return { ok: false, code: 'not_found', message: 'Order not found' };
    return {
      ok: false,
      code: 'conflict',
      message: 'This order was just updated by someone else. Please check its latest status and try again.',
      currentStatus: latest.status,
    };
  }

  return { ok: true, referenceId, status: requested, updatedAt: applied.updatedAt };
}

/**
 * Error text for logs: the database error's own message and code only. Never the error object or
 * request data. Drizzle wraps driver errors and puts the whole query and its parameters in the
 * wrapper's message, so the underlying cause is used when there is one.
 */
export function describeError(err: unknown): string {
  const root = err instanceof Error && err.cause instanceof Error ? err.cause : err;
  if (root instanceof Error) {
    const code = (root as { code?: unknown }).code;
    return typeof code === 'string' ? `${code}: ${root.message}` : root.message;
  }
  return 'unknown error';
}
