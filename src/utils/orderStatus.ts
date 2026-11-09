/**
 * Order status lifecycle. Pure helpers shared by the server (authoritative transition
 * validation) and the UI (labels, valid next options, tracker steps).
 * No server or React imports, so it is safe to bundle into the frontend.
 *
 * The status values match the Postgres enum public.order_status (migration 0001).
 */
import type { OrderType } from '../types/cafe';

export const ORDER_STATUSES = [
  'pending_confirmation',
  'confirmed',
  'preparing',
  'out_for_delivery',
  'ready_for_pickup',
  'completed',
  'cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}

/** completed and cancelled are final: nothing can follow them. */
export function isTerminalStatus(status: string): boolean {
  return status === 'completed' || status === 'cancelled';
}

// ---------------------------------------------------------------------------
// Transitions (single source of truth; the server validates with these tables)
// ---------------------------------------------------------------------------

/**
 * Takeaway (pickup) flow: pending_confirmation -> confirmed -> preparing -> ready_for_pickup -> completed.
 * - Moves are forward only; there are no backwards moves.
 * - Only the "confirmed" step may be skipped (a new order can go straight to "preparing", because
 *   staff usually confirm on WhatsApp and start cooking at the same time). "ready_for_pickup" and
 *   "completed" can never be skipped to.
 * - cancelled is allowed from every non-terminal status. completed and cancelled are final.
 */
const PICKUP_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_confirmation: ['confirmed', 'preparing', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['completed', 'cancelled'],
  out_for_delivery: ['cancelled'], // not part of the takeaway flow, so it can only be cancelled
  completed: [],
  cancelled: [],
};

/**
 * Delivery orders: staff can only confirm or cancel from the staff panel for now.
 * Statuses outside that path (only reachable by editing the database) can still be cancelled.
 */
const DELIVERY_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_confirmation: ['confirmed', 'cancelled'],
  confirmed: ['cancelled'],
  preparing: ['cancelled'],
  out_for_delivery: ['cancelled'],
  ready_for_pickup: ['cancelled'],
  completed: [],
  cancelled: [],
};

/** Valid next statuses in display order (the cancel option is always last). */
export function getAllowedNextStatuses(orderType: OrderType, current: string): OrderStatus[] {
  // An unrecognised stored value (legacy or hand-edited row) can only be cancelled.
  if (!isOrderStatus(current)) return ['cancelled'];
  const table = orderType === 'pickup' ? PICKUP_TRANSITIONS : DELIVERY_TRANSITIONS;
  return [...table[current]];
}

export type TransitionCheck = { ok: true } | { ok: false; message: string };

export function validateTransition(orderType: OrderType, current: string, next: string): TransitionCheck {
  if (!isOrderStatus(next)) {
    return { ok: false, message: `Unknown status. Allowed values: ${ORDER_STATUSES.join(', ')}.` };
  }
  if (isTerminalStatus(current)) {
    return { ok: false, message: `This order is already "${getStatusLabel(current, orderType)}" and cannot be changed.` };
  }
  if (current === next) {
    return { ok: false, message: `This order is already "${getStatusLabel(current, orderType)}".` };
  }
  if (!getAllowedNextStatuses(orderType, current).includes(next)) {
    const kind = orderType === 'pickup' ? 'takeaway' : 'delivery';
    return {
      ok: false,
      message: `A ${kind} order cannot move from "${getStatusLabel(current, orderType)}" to "${getStatusLabel(next, orderType)}".`,
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending_confirmation: 'Pending WhatsApp Confirmation',
  confirmed: 'Order confirmed',
  preparing: 'Preparing your order',
  out_for_delivery: 'Out for delivery',
  ready_for_pickup: 'Ready for takeaway',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/** Human-readable status for badges. Unknown values are returned unchanged. */
export function getStatusLabel(status: string, orderType?: OrderType): string {
  if (!isOrderStatus(status)) return status;
  if (status === 'completed' && orderType === 'pickup') return 'Collected';
  return STATUS_LABELS[status];
}

/** Text of the staff button that moves an order TO the given status. */
export function getStatusActionLabel(status: OrderStatus, orderType?: OrderType): string {
  switch (status) {
    case 'completed':
      return orderType === 'pickup' ? 'Mark as collected' : 'Mark as completed';
    case 'cancelled':
      return 'Cancel order';
    default:
      return STATUS_LABELS[status];
  }
}

// ---------------------------------------------------------------------------
// Customer-facing takeaway tracker
// ---------------------------------------------------------------------------

export interface TrackingStep {
  status: OrderStatus;
  title: string;
  description: string;
}

/** The steps a customer sees for a takeaway order, in order. */
export const PICKUP_TRACKING_STEPS: readonly TrackingStep[] = [
  {
    status: 'pending_confirmation',
    title: 'Order received',
    description: 'Waiting for the café to confirm your WhatsApp message.',
  },
  {
    status: 'confirmed',
    title: 'Order confirmed',
    description: 'The café has confirmed your order.',
  },
  {
    status: 'preparing',
    title: 'Preparing your order',
    description: 'Your order is being freshly made in our kitchen.',
  },
  {
    status: 'ready_for_pickup',
    title: 'Ready for takeaway',
    description: 'Your order is ready. Please collect it from the café.',
  },
  {
    status: 'completed',
    title: 'Collected',
    description: 'Order collected. Thank you for ordering with us!',
  },
];

export type StepState = 'done' | 'current' | 'upcoming';

export interface TrackingProgress {
  steps: Array<TrackingStep & { state: StepState }>;
  /** Index of the current step, or -1 when the status is not part of the takeaway flow. */
  activeIndex: number;
  cancelled: boolean;
}

export function getTrackingProgress(status: string): TrackingProgress {
  const activeIndex = PICKUP_TRACKING_STEPS.findIndex((step) => step.status === status);
  return {
    activeIndex,
    cancelled: status === 'cancelled',
    steps: PICKUP_TRACKING_STEPS.map((step, index) => {
      let state: StepState = 'upcoming';
      if (activeIndex >= 0) {
        if (index < activeIndex || (index === activeIndex && status === 'completed')) state = 'done';
        else if (index === activeIndex) state = 'current';
      }
      return { ...step, state };
    }),
  };
}

// ---------------------------------------------------------------------------
// Order reference (e.g. NC-348176) and the public tracking payload
// ---------------------------------------------------------------------------

export const ORDER_REFERENCE_PATTERN = /^NC-\d{4,12}$/;

/** Trims and upper-cases the input. Returns null unless it is NC- followed by 4 to 12 digits. */
export function normalizeOrderReference(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const value = input.trim().toUpperCase();
  return ORDER_REFERENCE_PATTERN.test(value) ? value : null;
}

/**
 * Response of GET /api/orders/:referenceId/track. Deliberately contains no customer details,
 * items or totals. For delivery orders status and updatedAt are null (live tracking is takeaway only).
 */
export interface PublicOrderTracking {
  referenceId: string;
  orderType: OrderType;
  status: OrderStatus | null;
  createdAt: string;
  updatedAt: string | null;
}
