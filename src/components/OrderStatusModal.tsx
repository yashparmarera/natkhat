import React, { useEffect, useRef, useState } from 'react';
import { useCafe } from '../context/CafeContext';
import type { OrderSubmission, OrderType } from '../types/cafe';
import {
  PICKUP_TRACKING_STEPS,
  getAllowedNextStatuses,
  getStatusActionLabel,
  getStatusLabel,
  type OrderStatus,
} from '../utils/orderStatus';
import { X, AlertTriangle } from 'lucide-react';

const BADGE_CLASSES: Record<string, string> = {
  pending_confirmation: 'bg-amber-50 text-amber-800 border-amber-200',
  confirmed: 'bg-sky-50 text-sky-800 border-sky-200',
  preparing: 'bg-orange-50 text-orange-800 border-orange-200',
  out_for_delivery: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  ready_for_pickup: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  completed: 'bg-gray-100 text-gray-700 border-gray-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
};

/** Status-aware badge for the staff order list and the status popup. */
export const OrderStatusBadge: React.FC<{ status: string; orderType?: OrderType }> = ({ status, orderType }) => (
  <span
    className={`text-[11px] px-2 py-0.5 rounded font-semibold border ${
      BADGE_CLASSES[status] || 'bg-gray-100 text-gray-700 border-gray-200'
    }`}
  >
    {getStatusLabel(status, orderType)}
  </span>
);

/** What the customer sees on their Track order page after this change (takeaway orders only). */
function customerSees(next: OrderStatus): string {
  if (next === 'cancelled') return 'Order cancelled';
  return PICKUP_TRACKING_STEPS.find((step) => step.status === next)?.title || getStatusLabel(next, 'pickup');
}

interface OrderStatusModalProps {
  order: OrderSubmission;
  onClose: () => void;
  /** The server rejected the session (401). The caller returns to the sign-in screen. */
  onSessionExpired: (message: string) => void;
}

export const OrderStatusModal: React.FC<OrderStatusModalProps> = ({ order, onClose, onSessionExpired }) => {
  const { updateOrderStatus } = useCafe();
  const [saving, setSaving] = useState<OrderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const orderType = order.customer.orderType;
  const options = getAllowedNextStatuses(orderType, order.status);
  const forwardOptions = options.filter((status) => status !== 'cancelled');
  const canCancel = options.includes('cancelled');
  const isSaving = saving !== null;
  const dialogRef = useRef<HTMLDivElement>(null);

  // Move keyboard focus into the popup when it opens.
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSaving, onClose]);

  const apply = async (next: OrderStatus) => {
    setSaving(next);
    setError(null);
    const result = await updateOrderStatus(order.referenceId, next);
    setSaving(null);

    if (result.success) {
      onClose();
      return;
    }
    if (result.sessionExpired) {
      onSessionExpired(result.error || 'Your session has expired. Please sign in again.');
      return;
    }
    setConfirmingCancel(false);
    setError(result.error || 'Could not update the order. Please try again.');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-2xs">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-status-title"
        className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-gray-200 space-y-4 focus:outline-hidden"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="order-status-title" className="font-serif text-lg font-bold text-[#234C35]">
              Update order status
            </h3>
            <p className="text-xs text-[#242820]/70 mt-0.5">
              Customers with a takeaway order see each change on their Track order page.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close status popup"
            className="p-1.5 rounded-lg text-[#242820]/60 hover:text-[#234C35] hover:bg-black/5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 bg-[#F7F1E4]/60 rounded-xl border border-[#234C35]/10 text-xs space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono font-bold text-sm text-[#234C35]">#{order.referenceId}</span>
            <span className="font-semibold text-[#242820]">
              {orderType === 'pickup' ? 'Takeaway / Pickup' : 'Home Delivery'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Current status</span>
            <OrderStatusBadge status={order.status} orderType={orderType} />
          </div>
        </div>

        {options.length === 0 ? (
          <p className="text-xs text-[#242820]/75">
            This order is {getStatusLabel(order.status, orderType).toLowerCase()}, so no further updates are possible.
          </p>
        ) : (
          <div className="space-y-3">
            {forwardOptions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#242820]">Move this order to</p>
                {forwardOptions.map((next, index) => (
                  <button
                    key={next}
                    type="button"
                    onClick={() => apply(next)}
                    disabled={isSaving}
                    className={`w-full px-4 py-3 rounded-xl text-left transition-colors cursor-pointer disabled:opacity-50 ${
                      index === 0
                        ? 'bg-[#234C35] hover:bg-[#1a3827] text-white'
                        : 'bg-white hover:bg-[#F7F1E4]/70 border border-[#234C35]/25 text-[#234C35]'
                    }`}
                  >
                    <span className="block text-sm font-semibold">
                      {saving === next ? 'Saving...' : getStatusActionLabel(next, orderType)}
                    </span>
                    {orderType === 'pickup' && (
                      <span className={`block text-[11px] mt-0.5 ${index === 0 ? 'text-[#F7F1E4]/80' : 'text-[#242820]/60'}`}>
                        Customer sees: {customerSees(next)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {orderType !== 'pickup' && (
              <p className="text-[11px] text-[#242820]/60">
                Delivery orders can be confirmed or cancelled here. Preparing and ready-for-takeaway updates are for takeaway orders.
              </p>
            )}

            {canCancel &&
              (confirmingCancel ? (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-2">
                  <p className="text-xs text-red-900 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                    <span>Cancel this order? It will be marked as cancelled and cannot be reopened.</span>
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => apply('cancelled')}
                      disabled={isSaving}
                      className="flex-1 px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-50"
                    >
                      {saving === 'cancelled' ? 'Cancelling...' : 'Yes, cancel order'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingCancel(false)}
                      disabled={isSaving}
                      className="flex-1 px-3 py-2 bg-white hover:bg-gray-50 border border-gray-300 text-[#242820] text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-50"
                    >
                      Keep order
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingCancel(true)}
                  disabled={isSaving}
                  className="w-full px-4 py-2.5 bg-white hover:bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl cursor-pointer disabled:opacity-50"
                >
                  {getStatusActionLabel('cancelled', orderType)}
                </button>
              ))}
          </div>
        )}

        {error && (
          <div role="alert" className="p-2.5 bg-red-50 text-red-700 text-xs rounded-lg flex items-start gap-2 border border-red-200">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
