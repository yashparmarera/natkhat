import React, { useState } from 'react';
import { useCafe } from '../context/CafeContext';
import { formatINRPlain } from '../utils/currency';
import { buildWhatsAppOrderUrl } from '../utils/whatsapp';
import { CustomerDetails, OrderSubmission } from '../types/cafe';
import {
  X,
  Plus,
  Minus,
  Trash2,
  ArrowRight,
  ShoppingBag,
  MessageCircle,
  Truck,
  Store,
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  PackageSearch,
} from 'lucide-react';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onContinueShopping: () => void;
  /** Opens the Track order view with this order number prefilled. */
  onTrackOrder: (referenceId: string) => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  onContinueShopping,
  onTrackOrder,
}) => {
  const {
    settings,
    cart,
    cartSubtotalPaise,
    deliveryFeePaise,
    cartTotalPaise,
    updateCartQuantity,
    removeFromCart,
    clearCart,
    activeOrderType,
    setActiveOrderType,
    submitOrderToServer,
  } = useCafe();

  // Step state: 'review' | 'details' | 'success'
  const [step, setStep] = useState<'review' | 'details' | 'success'>('review');

  // Form fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [instructions, setInstructions] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submittedOrder, setSubmittedOrder] = useState<OrderSubmission | null>(null);
  const [generatedWhatsAppUrl, setGeneratedWhatsAppUrl] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  if (!isOpen) return null;

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) {
      newErrors.name = 'Please enter your full name';
    }

    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 10) {
      newErrors.phone = 'Please enter a valid 10-digit mobile number';
    }

    if (activeOrderType === 'delivery') {
      if (!address.trim()) {
        newErrors.address = 'Please enter your delivery street address';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleProceedToWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    if (!validateForm()) return;

    setIsSubmitting(true);

    const customer: CustomerDetails = {
      name: name.trim(),
      phone: phone.trim(),
      orderType: activeOrderType,
      address: activeOrderType === 'delivery' ? address.trim() : undefined,
      landmark: landmark.trim() ? landmark.trim() : undefined,
      instructions: instructions.trim() ? instructions.trim() : undefined,
    };

    // 1. Submit to server for price validation & SQLite database insertion
    const result = await submitOrderToServer(customer);
    setIsSubmitting(false);

    if (!result.success || !result.order) {
      setServerError(result.error || 'Failed to submit order. Please check item availability.');
      return;
    }

    // 2. Set server-validated order details
    setSubmittedOrder(result.order);
    setGeneratedWhatsAppUrl(result.order.whatsappUrl);
    setStep('success');

    // 3. Open WhatsApp link in new tab or trigger navigation
    try {
      window.open(result.order.whatsappUrl, '_blank', 'noopener,noreferrer');
    } catch {
      // If popup blocker intervened, the user clicks the prominent WhatsApp button on the success screen
    }
  };

  const handleCopyOrderMessage = () => {
    if (!generatedWhatsAppUrl) return;
    try {
      const urlObj = new URL(generatedWhatsAppUrl);
      const rawText = decodeURIComponent(urlObj.searchParams.get('text') || '');
      navigator.clipboard.writeText(rawText);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch (e) {
      console.error('Failed to copy', e);
    }
  };

  const handleFinish = () => {
    clearCart();
    setStep('review');
    setName('');
    setPhone('');
    setAddress('');
    setLandmark('');
    setInstructions('');
    onClose();
  };

  const amountToFreeDelivery = settings.freeDeliveryThresholdPaise - cartSubtotalPaise;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-300 relative"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-heading"
      >
        {/* Drawer Header */}
        <div className="px-5 py-4 border-b border-[#234C35]/10 flex items-center justify-between bg-[#F7F1E4]/40 shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-[#234C35]" />
            <h2 id="cart-drawer-heading" className="font-serif font-bold text-lg text-[#234C35]">
              {step === 'review' && 'Your Food Basket'}
              {step === 'details' && 'Order & Contact Details'}
              {step === 'success' && 'WhatsApp Order Ready'}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close cart drawer"
            className="p-1.5 rounded-lg text-[#242820]/60 hover:text-[#234C35] hover:bg-black/5 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Free Delivery Nudge (Only on review step and if delivery) */}
        {step === 'review' && cart.length > 0 && activeOrderType === 'delivery' && (
          <div className="bg-[#234C35]/10 px-5 py-2.5 text-xs text-[#234C35] border-b border-[#234C35]/10 shrink-0">
            {amountToFreeDelivery > 0 ? (
              <p>
                Add <strong>{formatINRPlain(amountToFreeDelivery)}</strong> more to get <strong>FREE delivery</strong>!
              </p>
            ) : (
              <p className="font-semibold text-emerald-800 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Congratulations! You have unlocked FREE delivery.
              </p>
            )}
          </div>
        )}

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* STEP 1: REVIEW CART ITEMS */}
          {step === 'review' && (
            <div className="space-y-6">
              {cart.length === 0 ? (
                /* Empty Cart State */
                <div className="py-16 text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-[#F7F1E4] text-[#234C35] flex items-center justify-center mx-auto">
                    <ShoppingBag className="w-8 h-8 opacity-60" />
                  </div>
                  <div>
                    <h3 className="font-serif text-lg font-bold text-[#242820]">
                      Your basket is empty
                    </h3>
                    <p className="text-xs text-[#242820]/60 mt-1 max-w-xs mx-auto">
                      Explore our fresh kulhad chai, hot parathas, and thalis to add to your order.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      onClose();
                      onContinueShopping();
                    }}
                    className="px-5 py-2.5 bg-[#234C35] text-white text-xs font-semibold rounded-lg hover:bg-[#1a3827] transition-all cursor-pointer"
                  >
                    Browse Our Menu
                  </button>
                </div>
              ) : (
                <>
                  {/* Delivery vs Pickup Switcher */}
                  <div className="bg-[#F7F1E4]/70 p-1 rounded-xl flex items-center gap-1 border border-[#234C35]/15">
                    <button
                      type="button"
                      onClick={() => setActiveOrderType('delivery')}
                      className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        activeOrderType === 'delivery'
                          ? 'bg-[#234C35] text-white shadow-xs'
                          : 'text-[#242820]/70 hover:text-[#234C35]'
                      }`}
                    >
                      <Truck className="w-3.5 h-3.5" />
                      <span>Delivery</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveOrderType('pickup')}
                      className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        activeOrderType === 'pickup'
                          ? 'bg-[#234C35] text-white shadow-xs'
                          : 'text-[#242820]/70 hover:text-[#234C35]'
                      }`}
                    >
                      <Store className="w-3.5 h-3.5" />
                      <span>Takeaway / Pickup</span>
                    </button>
                  </div>

                  {/* Itemized List */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-[#242820]/60 pb-1 border-b border-gray-100">
                      <span>{cart.length} Dish{cart.length > 1 ? 'es' : ''} Selected</span>
                      <button
                        onClick={clearCart}
                        className="text-red-600 hover:text-red-700 font-medium cursor-pointer"
                      >
                        Clear Basket
                      </button>
                    </div>

                    {cart.map((item) => {
                      const itemTotal = item.product.pricePaise * item.quantity;
                      return (
                        <div
                          key={item.product.id}
                          className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-200/80 shadow-2xs"
                        >
                          <img
                            src={item.product.image}
                            alt={item.product.name}
                            className="w-14 h-14 rounded-lg object-cover bg-gray-100 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <div className="flex-1 min-w-0">
                            <h4 className="font-serif font-bold text-sm text-[#242820] truncate">
                              {item.product.name}
                            </h4>
                            <p className="text-xs font-mono font-medium text-[#234C35] tabular-nums mt-0.5">
                              {formatINRPlain(item.product.pricePaise)} each
                            </p>
                          </div>

                          {/* Stepper */}
                          <div className="flex items-center gap-1.5 bg-[#F7F1E4] rounded-lg p-1 shrink-0 border border-[#234C35]/10">
                            <button
                              onClick={() =>
                                updateCartQuantity(item.product.id, item.quantity - 1)
                              }
                              aria-label={`Decrease ${item.product.name}`}
                              className="w-6 h-6 flex items-center justify-center rounded hover:bg-black/5 text-[#242820] cursor-pointer"
                            >
                              {item.quantity === 1 ? (
                                <Trash2 className="w-3 h-3 text-red-600" />
                              ) : (
                                <Minus className="w-3 h-3" />
                              )}
                            </button>
                            <span className="w-4 text-center font-mono font-bold text-xs tabular-nums">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() =>
                                updateCartQuantity(item.product.id, item.quantity + 1)
                              }
                              aria-label={`Increase ${item.product.name}`}
                              className="w-6 h-6 flex items-center justify-center rounded hover:bg-black/5 text-[#242820] cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>

                          <div className="text-right shrink-0 w-16">
                            <span className="font-mono font-bold text-xs text-[#242820] tabular-nums">
                              {formatINRPlain(itemTotal)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Summary Breakdown */}
                  <div className="pt-4 border-t border-[#234C35]/10 space-y-2 text-xs">
                    <div className="flex justify-between text-[#242820]/70">
                      <span>Item Subtotal</span>
                      <span className="font-mono tabular-nums">{formatINRPlain(cartSubtotalPaise)}</span>
                    </div>

                    <div className="flex justify-between text-[#242820]/70">
                      <span>
                        {activeOrderType === 'delivery' ? 'Estimated Delivery Fee' : 'Pickup Fee'}
                      </span>
                      <span className="font-mono tabular-nums">
                        {deliveryFeePaise === 0 ? (
                          <span className="text-emerald-700 font-semibold">FREE</span>
                        ) : (
                          formatINRPlain(deliveryFeePaise)
                        )}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-gray-200 flex justify-between text-sm font-bold text-[#234C35]">
                      <span>Total Amount Payable</span>
                      <span className="font-mono tabular-nums text-base">
                        {formatINRPlain(cartTotalPaise)}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* STEP 2: CUSTOMER DETAILS FORM */}
          {step === 'details' && (
            <form id="order-form" onSubmit={handleProceedToWhatsApp} className="space-y-4">
              <div className="p-3 bg-[#F7F1E4]/60 rounded-xl text-xs text-[#242820]/80 space-y-1 border border-[#234C35]/10">
                <div className="flex items-center justify-between font-bold text-[#234C35]">
                  <span>
                    {activeOrderType === 'delivery' ? 'Home Delivery Order' : 'Café Takeaway / Pickup'}
                  </span>
                  <span className="font-mono tabular-nums">{formatINRPlain(cartTotalPaise)}</span>
                </div>
                <p className="text-[11px] text-[#242820]/70">
                  Please provide your contact details so our kitchen can prepare your meal accurately.
                </p>
              </div>

              {serverError && (
                <div className="p-2.5 bg-red-50 text-red-700 text-xs rounded-lg flex items-center gap-2 border border-red-200">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{serverError}</span>
                </div>
              )}

              {errors.subtotal && (
                <div className="p-2.5 bg-red-50 text-red-700 text-xs rounded-lg flex items-center gap-2 border border-red-200">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errors.subtotal}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#242820] mb-1">
                  Your Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className={`w-full px-3.5 py-2.5 text-sm rounded-lg border ${
                    errors.name ? 'border-red-500 bg-red-50/30' : 'border-gray-300'
                  } focus:outline-hidden focus:ring-2 focus:ring-[#234C35]`}
                />
                {errors.name && <p className="text-[11px] text-red-600 mt-1">{errors.name}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#242820] mb-1">
                  WhatsApp Mobile Number <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center">
                  <span className="inline-flex items-center px-3 py-2.5 text-xs font-medium text-gray-500 bg-gray-100 border border-r-0 border-gray-300 rounded-l-lg">
                    +91
                  </span>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="10-digit phone number"
                    className={`w-full px-3.5 py-2.5 text-sm rounded-r-lg border ${
                      errors.phone ? 'border-red-500 bg-red-50/30' : 'border-gray-300'
                    } focus:outline-hidden focus:ring-2 focus:ring-[#234C35]`}
                  />
                </div>
                {errors.phone && <p className="text-[11px] text-red-600 mt-1">{errors.phone}</p>}
              </div>

              {activeOrderType === 'delivery' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-[#242820] mb-1">
                      Complete Delivery Address <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      required
                      rows={2}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="House / Flat No., Building Name, Street / Sector"
                      className={`w-full px-3.5 py-2.5 text-sm rounded-lg border ${
                        errors.address ? 'border-red-500 bg-red-50/30' : 'border-gray-300'
                      } focus:outline-hidden focus:ring-2 focus:ring-[#234C35]`}
                    />
                    {errors.address && (
                      <p className="text-[11px] text-red-600 mt-1">{errors.address}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#242820] mb-1">
                      Nearby Landmark <span className="text-[#242820]/40 font-normal">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      value={landmark}
                      onChange={(e) => setLandmark(e.target.value)}
                      placeholder="e.g. Near HDFC ATM / Metro Gate 2"
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-[#234C35]"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#242820] mb-1">
                  Kitchen Notes & Instructions <span className="text-[#242820]/40 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="e.g. Medium spicy, separate chutney, extra disposable spoons"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-[#234C35]"
                />
              </div>

              {/* Mandatory Notice Required By Prompt */}
              <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <p>
                  <strong>Notice:</strong> Your order will be confirmed by our café team on WhatsApp. No advance online payment is required; cash/UPI on delivery or pickup.
                </p>
              </div>

              {/* Submit Button Inside Form */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 px-4 bg-[#234C35] hover:bg-[#1a3827] text-white font-semibold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
              >
                <MessageCircle className="w-4 h-4 text-[#D98235]" />
                <span className="text-sm">
                  {isSubmitting ? 'Verifying with Kitchen...' : 'Generate WhatsApp Order'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStep('review')}
                className="w-full text-center text-xs text-[#242820]/70 hover:text-[#234C35] py-1 cursor-pointer block"
              >
                ← Back to Basket
              </button>
            </form>
          )}

          {/* STEP 3: ORDER READY & WHATSAPP HANDOFF SUCCESS */}
          {step === 'success' && submittedOrder && (
            <div className="space-y-6 text-center py-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div>
                <span className="text-xs font-mono font-bold text-[#D98235] uppercase tracking-wider">
                  Order Request Generated
                </span>
                <h3 className="font-serif text-2xl font-bold text-[#234C35] mt-1">
                  Ref #{submittedOrder.referenceId}
                </h3>
                {submittedOrder.customer.orderType === 'pickup' && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onTrackOrder(submittedOrder.referenceId);
                    }}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-[#F7F1E4]/70 border border-[#234C35]/20 text-[#234C35] text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    <PackageSearch className="w-3.5 h-3.5 text-[#D98235]" />
                    <span>Track this order</span>
                  </button>
                )}
                <p className="text-xs text-[#242820]/70 mt-2 max-w-sm mx-auto leading-relaxed">
                  We have prepared your formatted order request. Click the button below to send it to <strong>{settings.cafeName}</strong> on WhatsApp.
                </p>
              </div>

              {/* Order Snapshot Box */}
              <div className="p-4 bg-[#F7F1E4]/60 rounded-xl text-left text-xs border border-[#234C35]/15 space-y-2">
                <div className="flex justify-between font-bold text-[#242820]">
                  <span>Customer: {submittedOrder.customer.name}</span>
                  <span className="font-mono">{formatINRPlain(submittedOrder.totalPaise)}</span>
                </div>
                <p className="text-[#242820]/70">
                  {submittedOrder.items.length} item(s) •{' '}
                  {submittedOrder.customer.orderType === 'delivery' ? 'Home Delivery' : 'Takeaway Pickup'}
                </p>
              </div>

              {/* Primary Action: Open WhatsApp */}
              <div className="space-y-3 pt-2">
                <a
                  href={generatedWhatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3.5 px-4 bg-[#25D366] hover:bg-[#20ba59] text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer text-sm"
                >
                  <MessageCircle className="w-5 h-5 fill-white" />
                  <span>Send Order On WhatsApp</span>
                  <ExternalLink className="w-4 h-4" />
                </a>

                {/* Fallback Copy Text */}
                <button
                  type="button"
                  onClick={handleCopyOrderMessage}
                  className="w-full py-2.5 px-3 bg-gray-100 hover:bg-gray-200 text-[#242820] text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedLink ? 'Message Copied!' : 'Copy Order Text to Clipboard'}</span>
                </button>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-left text-xs text-emerald-900">
                <p className="font-semibold">Next Step:</p>
                <p className="mt-0.5 text-[#242820]/80">
                  Once sent, our café staff will reply immediately on WhatsApp to confirm preparation time and deliver your fresh food.
                </p>
              </div>

              <button
                type="button"
                onClick={handleFinish}
                className="text-xs text-[#234C35] underline hover:text-[#183525] font-semibold cursor-pointer"
              >
                Start New Order / Back to Home
              </button>
            </div>
          )}
        </div>

        {/* Drawer Footer Actions */}
        {cart.length > 0 && step === 'review' && (
          <div className="p-5 bg-white border-t border-[#234C35]/10 shrink-0 shadow-xs">
            <div className="space-y-3">
              <button
                onClick={() => setStep('details')}
                className="w-full py-3.5 px-4 bg-[#234C35] hover:bg-[#1a3827] text-white font-semibold rounded-xl shadow-md transition-all flex items-center justify-between cursor-pointer active:scale-98"
              >
                <span className="text-sm">Proceed to Details</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono tabular-nums text-sm font-bold text-[#F7F1E4]">
                    {formatINRPlain(cartTotalPaise)}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </div>
              </button>
              <button
                onClick={onClose}
                className="w-full text-center text-xs text-[#242820]/70 hover:text-[#234C35] py-1 cursor-pointer"
              >
                Continue Browsing Menu
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
