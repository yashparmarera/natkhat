import React from 'react';
import { useCafe } from '../context/CafeContext';
import { MapPin, Clock, Phone, MessageCircle, ShieldCheck, Heart, Coffee, Utensils } from 'lucide-react';

interface AboutContactViewProps {
  onExploreMenu: () => void;
}

export const AboutContactView: React.FC<AboutContactViewProps> = ({ onExploreMenu }) => {
  const { settings } = useCafe();

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-12">
      {/* About Section */}
      <section className="bg-white rounded-2xl border border-[#234C35]/15 p-6 sm:p-10 shadow-xs space-y-6">
        <div className="max-w-3xl space-y-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#D98235]">
            Our Story & Craft
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#234C35]">
            About {settings.cafeName}
          </h1>
          <p className="text-base text-[#242820]/80 leading-relaxed">
            Founded with a passion for authentic Indian culinary traditions, {settings.cafeName} is a dedicated single-location neighborhood kitchen committed to serving wholesome, fresh food cooked with pure ghee and Amul butter.
          </p>
          <p className="text-sm text-[#242820]/75 leading-relaxed">
            Whether you are a student catching an early morning chai before lectures, an office employee grabbing a nutritious lunch thali, or a factory worker looking for filling, hot meals at the end of a shift, our doors and kitchen are always welcoming.
          </p>
        </div>

        {/* 3 Ethos Pillars */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4 border-t border-[#234C35]/10">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-lg bg-[#234C35]/10 flex items-center justify-center text-[#234C35]">
              <Coffee className="w-5 h-5 text-[#D98235]" />
            </div>
            <h3 className="font-serif font-bold text-base text-[#234C35]">Kulhad Chai & Tawa Hot</h3>
            <p className="text-xs text-[#242820]/70 leading-relaxed">
              Every cup of chai is boiled fresh with real ginger and green cardamom. All rotis and parathas are puffed live on our tawa upon your order.
            </p>
          </div>

          <div className="space-y-2">
            <div className="w-10 h-10 rounded-lg bg-[#234C35]/10 flex items-center justify-center text-[#234C35]">
              <Heart className="w-5 h-5 text-[#D98235]" />
            </div>
            <h3 className="font-serif font-bold text-base text-[#234C35]">Pure Desi Goodness</h3>
            <p className="text-xs text-[#242820]/70 leading-relaxed">
              100% vegetarian preparations with pure dairy ghee, fresh malai paneer, and zero reuse of frying oil. Healthy and hearty meals you can trust every day.
            </p>
          </div>

          <div className="space-y-2">
            <div className="w-10 h-10 rounded-lg bg-[#234C35]/10 flex items-center justify-center text-[#234C35]">
              <ShieldCheck className="w-5 h-5 text-[#D98235]" />
            </div>
            <h3 className="font-serif font-bold text-base text-[#234C35]">FSSAI Certified Hygiene</h3>
            <p className="text-xs text-[#242820]/70 leading-relaxed">
              FSSAI Lic. #{settings.fssaiNumber}. Clean kitchen workstations, sanitized stainless-steel vessels, and food-grade spill-proof packaging.
            </p>
          </div>
        </div>
      </section>

      {/* Location & Contact Information */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Contact Info Card */}
        <div className="bg-white rounded-2xl border border-[#234C35]/15 p-6 sm:p-8 shadow-xs space-y-6">
          <h2 className="font-serif text-2xl font-bold text-[#234C35]">Visit & Connect</h2>

          <div className="space-y-4 text-sm">
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-[#D98235] shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-[#242820]">Café Address</p>
                <p className="text-xs text-[#242820]/75 mt-0.5 leading-relaxed">
                  {settings.address}
                </p>
                {settings.landmark && (
                  <p className="text-[11px] text-[#242820]/60 mt-0.5">
                    Landmark: {settings.landmark}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-[#D98235] shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-[#242820]">Operating Hours</p>
                <p className="text-xs text-[#242820]/75 mt-0.5">{settings.openingHours}</p>
                <p className="text-[11px] text-emerald-700 font-medium mt-0.5">
                  Open 7 Days a Week • Live Tawa Counter
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Phone className="w-5 h-5 text-[#D98235] shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-[#242820]">Direct Calling</p>
                <a
                  href={`tel:${settings.contactPhone}`}
                  className="text-xs font-mono text-[#234C35] font-bold hover:underline mt-0.5 block"
                >
                  {settings.contactPhone}
                </a>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MessageCircle className="w-5 h-5 text-[#25D366] shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-[#242820]">WhatsApp Food Orders</p>
                <a
                  href={`https://wa.me/${settings.whatsappNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-emerald-700 font-medium hover:underline mt-0.5 block"
                >
                  +{settings.whatsappNumber} (Chat with kitchen team)
                </a>
              </div>
            </div>
          </div>

          <div className="pt-2 flex flex-wrap gap-3">
            <a
              href={`https://wa.me/${settings.whatsappNumber}?text=${encodeURIComponent(
                `Hello ${settings.cafeName}! I would like to know today's lunch menu specials.`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 bg-[#25D366] hover:bg-[#20ba59] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <MessageCircle className="w-4 h-4 fill-white" />
              <span>Chat on WhatsApp</span>
            </a>

            <button
              onClick={onExploreMenu}
              className="px-4 py-2.5 bg-[#234C35] hover:bg-[#1a3827] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Utensils className="w-4 h-4" />
              <span>View Café Menu</span>
            </button>
          </div>
        </div>

        {/* Delivery Areas & Services Card */}
        <div className="bg-[#F7F1E4]/50 rounded-2xl border border-[#234C35]/15 p-6 sm:p-8 shadow-xs space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            <h2 className="font-serif text-2xl font-bold text-[#234C35]">Delivery & Outlets</h2>
            <p className="text-xs text-[#242820]/75 leading-relaxed">
              We deliver piping hot food across local residential societies, corporate offices, factory campuses, and metro stations within a 5-6 km radius.
            </p>

            <div className="space-y-2 text-xs">
              <div className="p-3 bg-white rounded-lg border border-[#234C35]/10 space-y-1">
                <span className="font-bold text-[#234C35]">🚀 Fast Neighbourhood Delivery</span>
                <p className="text-[#242820]/70 text-[11px]">
                  Delivered in thermal heat-retaining bags to ensure your parathas stay crisp and chai stays steaming.
                </p>
              </div>

              <div className="p-3 bg-white rounded-lg border border-[#234C35]/10 space-y-1">
                <span className="font-bold text-[#234C35]">🥡 Quick Takeaway Counter</span>
                <p className="text-[#242820]/70 text-[11px]">
                  Place your order via WhatsApp 10-15 minutes prior to arriving; pick it up packaged and ready at the counter with zero wait time.
                </p>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-[#242820]/60 border-t border-[#234C35]/10 pt-3">
            Note: As a standalone local café, all orders are personally packed and handed over by our own team.
          </div>
        </div>
      </section>
    </div>
  );
};
