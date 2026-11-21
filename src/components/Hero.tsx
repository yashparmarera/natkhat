import React from 'react';
import { useCafe } from '../context/CafeContext';
import { formatINRPlain } from '../utils/currency';
import { ArrowRight, PackageSearch } from 'lucide-react';

interface HeroProps {
  onExploreMenu: () => void;
  onOpenTrack: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onExploreMenu, onOpenTrack }) => {
  const { settings } = useCafe();

  return (
    <section className="bg-[#F7F1E4] border-b border-[#234C35]/15">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 lg:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-10 items-start">
          <div className="lg:col-span-7 space-y-4 order-2 lg:order-1">
            <p className="text-sm font-semibold text-[#234C35]">
              Pure vegetarian · Desi ghee &amp; Amul butter · Cooked fresh to order
            </p>

            <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-[#234C35] leading-[1.1]">
              Kulhad chai, hot parathas and thalis, made while you wait.
            </h1>

            <p className="text-base sm:text-lg text-[#242820] leading-relaxed max-w-xl">
              {settings.cafeName} is your neighbourhood kitchen. Pick your dishes, send the order on WhatsApp, and we confirm it live.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                onClick={onExploreMenu}
                className="min-h-12 px-6 bg-[#234C35] hover:bg-[#193927] text-[#F7F1E4] text-base font-semibold rounded-md transition-colors flex items-center gap-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D98235]"
              >
                <span>Order from the menu</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={onOpenTrack}
                className="min-h-12 px-4 text-[#234C35] text-base font-semibold underline underline-offset-4 decoration-[#D98235] hover:decoration-2 flex items-center gap-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D98235]"
              >
                <PackageSearch className="w-4 h-4" aria-hidden="true" />
                <span>Track order</span>
              </button>
            </div>

            <dl className="pt-4 border-t border-[#234C35]/20 grid grid-cols-3 gap-4">
              <div>
                <dt className="text-xs text-[#242820]/75 order-2">Neighbourhood favourite</dt>
                <dd className="text-xl sm:text-2xl font-bold text-[#234C35] tabular-nums">4.8★</dd>
              </div>
              <div>
                <dt className="text-xs text-[#242820]/75">Average prep time</dt>
                <dd className="text-xl sm:text-2xl font-bold text-[#234C35] tabular-nums">15 min</dd>
              </div>
              <div>
                <dt className="text-xs text-[#242820]/75">Free delivery above</dt>
                <dd className="text-xl sm:text-2xl font-bold text-[#B8651C] tabular-nums">
                  {formatINRPlain(settings.freeDeliveryThresholdPaise)}
                </dd>
              </div>
            </dl>
          </div>

          <figure className="lg:col-span-5 order-1 lg:order-2 m-0">
            <div className="rounded-md overflow-hidden border border-[#234C35]/20 aspect-4/3 lg:aspect-4/5 bg-white">
              <img
                src="/images/natkhat_hero_feast_1793454950947.jpg"
                alt="Kulhad chai, stuffed parathas, samosas and chutneys on a table at Natkhat Café"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <figcaption className="mt-2 text-xs text-[#242820]/75">
              Kulhad chai and butter paratha, served from 8:00 AM.
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
};
