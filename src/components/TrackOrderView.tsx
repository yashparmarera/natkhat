import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useCafe } from '../context/CafeContext';
import {
  getTrackingProgress,
  isTerminalStatus,
  normalizeOrderReference,
  type OrderStatus,
  type PublicOrderTracking,
  type StepState,
} from '../utils/orderStatus';
import {
  PackageSearch,
  ClipboardCheck,
  CheckCircle2,
  ChefHat,
  PackageCheck,
  ShoppingBag,
  RefreshCw,
  AlertCircle,
  XCircle,
  MessageCircle,
  Store,
  Clock,
} from 'lucide-react';

/** How often a live order is re-checked while the page is open. */
const POLL_INTERVAL_MS = 10_000;
/** A lookup that takes longer than this is treated as failed (slow mobile networks). */
const REQUEST_TIMEOUT_MS = 15_000;

const GENERIC_ERROR = "We couldn't check your order right now. Please try again in a moment.";
const RATE_LIMITED_ERROR = 'Too many lookups in a short time. Please wait a minute and try again.';

type Lookup =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'found'; order: PublicOrderTracking }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string };

const STEP_ICONS: Record<string, LucideIcon> = {
  pending_confirmation: ClipboardCheck,
  confirmed: CheckCircle2,
  preparing: ChefHat,
  ready_for_pickup: PackageCheck,
  completed: ShoppingBag,
};

// Banner colours per status (text stays dark green for contrast; the icon chip carries the colour).
const BANNER_TONES: Record<string, { box: string; chip: string }> = {
  pending_confirmation: { box: 'bg-[#F7F1E4] border-[#234C35]/15', chip: 'bg-[#234C35]/10 text-[#234C35]' },
  confirmed: { box: 'bg-[#234C35]/5 border-[#234C35]/15', chip: 'bg-[#234C35] text-white' },
  preparing: { box: 'bg-[#D98235]/10 border-[#D98235]/30', chip: 'bg-[#D98235] text-white' },
  ready_for_pickup: { box: 'bg-emerald-50 border-emerald-200', chip: 'bg-emerald-600 text-white' },
  completed: { box: 'bg-[#234C35]/5 border-[#234C35]/15', chip: 'bg-[#234C35] text-white' },
};

const STEP_STYLES: Record<StepState, string> = {
  done: 'bg-[#234C35] border-[#234C35] text-white',
  current: 'bg-[#D98235] border-[#D98235] text-white ring-4 ring-[#D98235]/20',
  upcoming: 'bg-white border-gray-200 text-gray-400',
};

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

interface TrackOrderViewProps {
  /** Order number to look up as soon as the view opens (used by "Track this order" in the cart). */
  initialReferenceId?: string;
}

export const TrackOrderView: React.FC<TrackOrderViewProps> = ({ initialReferenceId = '' }) => {
  const { settings } = useCafe();

  const [input, setInput] = useState(initialReferenceId.toUpperCase());
  const [inputError, setInputError] = useState<string | null>(null);
  const [trackedRef, setTrackedRef] = useState<string | null>(null);
  const [lookup, setLookup] = useState<Lookup>({ kind: 'idle' });
  const [refreshing, setRefreshing] = useState(false);
  const [softError, setSoftError] = useState<string | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const requestSeq = useRef(0);
  const inFlight = useRef(false);

  // `background` lookups (polling and the refresh button) keep showing the last known status if they fail.
  const fetchOrder = useCallback(async (reference: string, background: boolean) => {
    // A slow background check is left to finish instead of being restarted by the next tick.
    if (background && inFlight.current) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const seq = ++requestSeq.current;
    inFlight.current = true;
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    if (background) {
      setRefreshing(true);
    } else {
      setLookup({ kind: 'loading' });
      setSoftError(null);
    }

    const fail = (message: string) => {
      if (background) setSoftError(message);
      setLookup((prev) => (background && prev.kind === 'found' ? prev : { kind: 'error', message }));
    };

    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(reference)}/track`, {
        signal: controller.signal,
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (seq !== requestSeq.current) return;

      if (res.status === 404) {
        setSoftError(null);
        setLookup({ kind: 'not_found' });
        return;
      }
      if (res.status === 429) {
        fail(RATE_LIMITED_ERROR);
        return;
      }
      if (!res.ok) {
        fail(GENERIC_ERROR);
        return;
      }

      const data = (await res.json()) as PublicOrderTracking;
      if (seq !== requestSeq.current) return;
      if (!data || typeof data.referenceId !== 'string') {
        fail(GENERIC_ERROR);
        return;
      }
      setSoftError(null);
      setLookup({ kind: 'found', order: data });
      setLastCheckedAt(new Date());
    } catch {
      // Ignore requests that were replaced by a newer lookup or cancelled on unmount; a timeout is a failure.
      if (seq !== requestSeq.current || (controller.signal.aborted && !timedOut)) return;
      fail(GENERIC_ERROR);
    } finally {
      window.clearTimeout(timer);
      if (seq === requestSeq.current) {
        inFlight.current = false;
        setRefreshing(false);
      }
    }
  }, []);

  // Look up a prefilled order number right away; cancel any in-flight request on unmount.
  useEffect(() => {
    const reference = normalizeOrderReference(initialReferenceId);
    if (reference) {
      setTrackedRef(reference);
      void fetchOrder(reference, false);
    }
    return () => abortRef.current?.abort();
    // Runs once on mount; a new prefill remounts the view (see the key in App).
  }, []);

  const order = lookup.kind === 'found' ? lookup.order : null;
  const isPickup = order?.orderType === 'pickup';
  const status: OrderStatus | null = order?.status ?? null;
  const isPolling = Boolean(trackedRef && isPickup && status && !isTerminalStatus(status));

  // Poll while the order is still moving. The interval is cleared when the order reaches a final
  // status, when the view unmounts, or when another order is looked up. Hidden tabs do not poll.
  useEffect(() => {
    if (!isPolling || !trackedRef) return;
    const check = () => {
      if (!document.hidden) void fetchOrder(trackedRef, true);
    };
    const timer = window.setInterval(check, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, [isPolling, trackedRef, fetchOrder]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const reference = normalizeOrderReference(input);
    if (!reference) {
      setInputError('Please enter a valid order number, for example NC-123456.');
      return;
    }
    setInputError(null);
    setInput(reference);
    setTrackedRef(reference);
    void fetchOrder(reference, false);
  };

  const progress = status ? getTrackingProgress(status) : null;
  const isCancelled = status === 'cancelled';
  const activeStep = progress && progress.activeIndex >= 0 ? progress.steps[progress.activeIndex] : null;
  const tone = status ? BANNER_TONES[status] : undefined;
  const ActiveIcon = (status && STEP_ICONS[status]) || Clock;
  const whatsappHref = `https://wa.me/${settings.whatsappNumber}`;
  const placedLabel = formatDateTime(order?.createdAt);
  const updatedLabel = formatDateTime(order?.updatedAt);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-8">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#234C35]/10 text-[#234C35] rounded-md text-xs font-semibold uppercase tracking-wider">
          <PackageSearch className="w-3.5 h-3.5 text-[#D98235]" />
          <span>Takeaway Order Tracking</span>
        </div>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#234C35]">Track your order</h1>
        <p className="text-sm sm:text-base text-[#242820]/80 max-w-xl mx-auto leading-relaxed">
          Enter your order number to see whether the café is preparing your takeaway order or it is ready to collect.
        </p>
      </div>

      {/* Lookup form */}
      <form
        onSubmit={handleSubmit}
        noValidate
        className="bg-white rounded-2xl border border-[#234C35]/15 p-5 sm:p-6 shadow-sm space-y-3"
      >
        <label htmlFor="track-order-number" className="block text-xs font-semibold text-[#242820]">
          Order number
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            id="track-order-number"
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value.toUpperCase());
              setInputError(null);
            }}
            placeholder="NC-123456"
            maxLength={20}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-invalid={inputError ? true : undefined}
            aria-describedby={inputError ? 'track-order-error' : 'track-order-hint'}
            className={`flex-1 min-w-0 px-3.5 py-3 text-base font-mono tracking-wide rounded-lg border ${
              inputError ? 'border-red-500 bg-red-50/30' : 'border-gray-300'
            } focus:outline-hidden focus:ring-2 focus:ring-[#234C35]`}
          />
          <button
            type="submit"
            disabled={lookup.kind === 'loading'}
            className="px-6 py-3 bg-[#234C35] hover:bg-[#1a3827] text-white font-semibold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
          >
            <PackageSearch className="w-4 h-4 text-[#D98235]" />
            <span className="text-sm">{lookup.kind === 'loading' ? 'Checking...' : 'Track order'}</span>
          </button>
        </div>
        {inputError ? (
          <p id="track-order-error" role="alert" className="text-[11px] text-red-600">
            {inputError}
          </p>
        ) : (
          <p id="track-order-hint" className="text-[11px] text-[#242820]/60">
            Your order number (like NC-123456) is shown after you place an order and is included in your WhatsApp message.
          </p>
        )}
      </form>

      {/* Result (announced to screen readers when it changes) */}
      <div aria-live="polite" className="space-y-4">
        {lookup.kind === 'loading' && (
          <div className="p-8 text-center bg-white rounded-2xl border border-[#234C35]/10 text-sm text-[#242820]/70">
            Looking up your order...
          </div>
        )}

        {lookup.kind === 'not_found' && (
          <div className="p-6 bg-white rounded-2xl border border-amber-200 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h2 className="font-serif font-bold text-lg text-[#234C35]">We couldn't find that order</h2>
              <p className="text-xs text-[#242820]/75 mt-1 leading-relaxed">
                Please check the order number (for example NC-123456) and try again. If you just placed the order,
                make sure you copied the full number.
              </p>
            </div>
          </div>
        )}

        {lookup.kind === 'error' && (
          <div className="p-6 bg-red-50 rounded-2xl border border-red-200 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="text-sm text-red-800">{lookup.message}</p>
              {trackedRef && (
                <button
                  type="button"
                  onClick={() => void fetchOrder(trackedRef, false)}
                  className="text-xs font-semibold text-red-700 underline cursor-pointer"
                >
                  Try again
                </button>
              )}
            </div>
          </div>
        )}

        {order && (
          <div className="bg-white rounded-2xl border border-[#234C35]/15 p-5 sm:p-7 shadow-sm space-y-6">
            {/* Order header */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-gray-100">
              <p className="text-xs text-[#242820]/60">
                Order <span className="font-mono font-bold text-sm text-[#234C35]">#{order.referenceId}</span>
              </p>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#F7F1E4] text-[#234C35] rounded-md text-[11px] font-semibold">
                <Store className="w-3 h-3 text-[#D98235]" />
                {isPickup ? 'Takeaway' : 'Delivery'}
              </span>
            </div>

            {/* Delivery orders: no live status */}
            {!isPickup && (
              <div className="p-4 bg-[#F7F1E4]/60 rounded-xl border border-[#234C35]/15 flex items-start gap-3">
                <MessageCircle className="w-5 h-5 text-[#25D366] shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="text-sm text-[#242820]">
                    Live tracking is available for takeaway orders. Delivery orders are confirmed with you on WhatsApp.
                  </p>
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-[#234C35] underline"
                  >
                    Message the café on WhatsApp
                  </a>
                </div>
              </div>
            )}

            {/* Takeaway: cancelled */}
            {isPickup && isCancelled && (
              <div className="p-4 bg-red-50 rounded-xl border border-red-200 flex items-start gap-3">
                <XCircle className="w-6 h-6 text-red-600 shrink-0" />
                <div className="space-y-1">
                  <h2 className="font-serif font-bold text-xl text-red-800">Order cancelled</h2>
                  <p className="text-xs text-red-900/80 leading-relaxed">
                    This order was cancelled. If you were not expecting this, please message the café on WhatsApp.
                  </p>
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-xs font-semibold text-red-800 underline"
                  >
                    Message the café on WhatsApp
                  </a>
                </div>
              </div>
            )}

            {/* Takeaway: live progress */}
            {isPickup && !isCancelled && (
              <>
                {activeStep && tone ? (
                  <div className={`p-4 rounded-xl border flex items-start gap-4 ${tone.box}`}>
                    <span className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${tone.chip}`}>
                      <ActiveIcon className="w-6 h-6" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="font-serif font-bold text-xl sm:text-2xl text-[#234C35]">{activeStep.title}</h2>
                      <p className="text-sm text-[#242820]/80 mt-1 leading-relaxed">{activeStep.description}</p>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-[#F7F1E4]/60 rounded-xl border border-[#234C35]/15 text-sm text-[#242820]">
                    We can't show the live status of this order right now. Please check with the café on WhatsApp.
                  </div>
                )}

                {progress && progress.activeIndex >= 0 && (
                  <ol className="space-y-0" aria-label="Order progress">
                    {progress.steps.map((step, index) => {
                      const Icon = STEP_ICONS[step.status] || Clock;
                      const isLast = index === progress.steps.length - 1;
                      return (
                        <li
                          key={step.status}
                          aria-current={step.state === 'current' ? 'step' : undefined}
                          className={`relative flex items-center gap-4 ${isLast ? '' : 'pb-5'}`}
                        >
                          {!isLast && (
                            <span
                              aria-hidden="true"
                              className={`absolute left-4.75 top-10 bottom-0 w-0.5 ${
                                step.state === 'done' ? 'bg-[#234C35]' : 'bg-gray-200'
                              }`}
                            />
                          )}
                          <span
                            className={`relative z-10 w-10 h-10 rounded-full border-2 flex items-center justify-center shrink-0 ${STEP_STYLES[step.state]}`}
                          >
                            <Icon className="w-4.5 h-4.5" />
                          </span>
                          <span
                            className={`text-sm ${
                              step.state === 'upcoming'
                                ? 'text-[#242820]/45'
                                : step.state === 'current'
                                  ? 'font-bold text-[#234C35]'
                                  : 'font-semibold text-[#234C35]'
                            }`}
                          >
                            {step.title}
                            {step.state === 'done' && <span className="sr-only"> (done)</span>}
                            {step.state === 'current' && <span className="sr-only"> (current step)</span>}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </>
            )}

            {/* Footer: timestamps, refresh */}
            {isPickup && (
              <div className="pt-4 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-[11px] text-[#242820]/60 space-y-0.5">
                  {placedLabel && <p>Placed {placedLabel}</p>}
                  {updatedLabel && updatedLabel !== placedLabel && <p>Status updated {updatedLabel}</p>}
                  {lastCheckedAt && (
                    <p>
                      Last checked{' '}
                      {lastCheckedAt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
                      {isPolling && ' · updates automatically every 10 seconds'}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => trackedRef && void fetchOrder(trackedRef, true)}
                  disabled={refreshing}
                  className="px-4 py-2 bg-[#F7F1E4] hover:bg-[#F7F1E4]/70 border border-[#234C35]/20 text-[#234C35] text-xs font-semibold rounded-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 self-start sm:self-auto"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                  <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
                </button>
              </div>
            )}

            {softError && (
              <p role="status" className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {softError} We'll keep showing the last status we have.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
