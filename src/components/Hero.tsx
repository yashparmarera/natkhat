import React from 'react';
import { useCafe } from '../context/CafeContext';
import { ArrowRight, Sparkles, Utensils, MessageCircle, PackageSearch } from 'lucide-react';

interface HeroProps {
  onExploreMenu: () => void;
  onOpenTrack: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onExploreMenu, onOpenTrack }) => {
  const { settings } = useCafe();

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-[#F7F1E4] to-[#F7F1E4]/30 py-12 md:py-16 lg:py-20 border-b border-[#234C35]/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          
          {/* Left Column: Brand Story & CTAs */}
          <div className="lg:col-span-7 space-y-6">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#234C35]">
              <Sparkles className="w-3.5 h-3.5 text-[#D98235]" />
              <span>Pure Vegetarian</span>
              <span className="text-black/30" aria-hidden="true">·</span>
              <span>100% Desi Ghee & Amul Butter</span>
              <span className="text-black/30" aria-hidden="true">·</span>
              <span>Fresh Everyday</span>
            </div>

            <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-[#234C35] leading-[1.12] text-balance">
              Fresh Kulhad Chai, Hot Parathas & Wholesome Thalis.
            </h1>

            <p className="text-base sm:text-lg text-[#242820]/80 leading-relaxed max-w-2xl">
              Welcome to <strong className="text-[#234C35] font-semibold">{settings.cafeName}</strong> — your local neighbourhood food destination. From early morning piping-hot ginger chai to hearty executive thalis and spicy evening snacks, everything is freshly cooked on order.
            </p>

            {/* Primary & Secondary Actions */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button
                onClick={onExploreMenu}
                className="px-6 py-3.5 bg-[#234C35] hover:bg-[#193927] text-[#F7F1E4] text-base font-semibold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer group active:scale-98"
              >
                <span>Explore Full Menu</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                onClick={onOpenTrack}
                className="px-5 py-3.5 bg-white hover:bg-[#F7F1E4]/70 border border-[#234C35]/20 text-[#234C35] text-base font-medium rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
              >
                <PackageSearch className="w-4 h-4 text-[#D98235]" />
                <span>Track order</span>
              </button>
            </div>

            {/* Trust Markers Bar */}
            <div className="pt-6 border-t border-[#234C35]/10 grid grid-cols-3 gap-4 text-left">
              <div>
                <p className="text-xl sm:text-2xl font-bold font-mono text-[#234C35] tabular-nums">4.8★</p>
                <p className="text-xs text-[#242820]/70 mt-0.5">Neighbourhood Favourite</p>
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold font-mono text-[#D98235] tabular-nums">15 Mins</p>
                <p className="text-xs text-[#242820]/70 mt-0.5">Average Prep Time</p>
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold font-mono text-[#234C35] tabular-nums">₹0 Fee</p>
                <p className="text-xs text-[#242820]/70 mt-0.5">Free Delivery Above ₹250</p>
              </div>
            </div>
          </div>

          {/* Right Column: Hero Visual Feast */}
          <div className="lg:col-span-5 relative">
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border-4 border-white aspect-4/3 sm:aspect-16/10 lg:aspect-4/3 group">
              <img
                src="/src/assets/images/natkhat_hero_feast_1793454950947.jpg"
                alt="Authentic spread of Kulhad Chai, hot stuffed parathas, samosas and chutneys at Natkhat Café"
                className="w-full h-full object-cover transform group-hover:scale-102 transition-transform duration-500"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent flex flex-col justify-end p-5 text-white">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#D98235]">Handcrafted Daily</span>
                <p className="font-serif text-lg font-bold">Special Kulhad Chai & Butter Paratha</p>
                <p className="text-xs text-white/80 mt-0.5">Served fresh from 8:00 AM till late night</p>
              </div>
            </div>

            {/* Floating Info Tag */}
            <div className="absolute -bottom-4 -left-4 bg-white/95 backdrop-blur-xs p-3.5 rounded-xl shadow-lg border border-[#234C35]/10 hidden sm:flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#234C35] flex items-center justify-center text-[#F7F1E4] shrink-0">
                <MessageCircle className="w-5 h-5 text-[#D98235]" />
              </div>
              <div className="text-xs">
                <p className="font-bold text-[#242820]">Zero App Download</p>
                <p className="text-[#242820]/70">Order straight via WhatsApp</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
