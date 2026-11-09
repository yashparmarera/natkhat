import React from 'react';
import { useCafe } from '../context/CafeContext';
import { Phone, MessageCircle, MapPin, Clock, ShieldCheck, Heart } from 'lucide-react';

interface FooterProps {
  onNavClick: (view: 'home' | 'menu' | 'bulk-orders' | 'about' | 'admin') => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavClick }) => {
  const { settings } = useCafe();

  return (
    <footer className="bg-[#234C35] text-[#F7F1E4] pt-12 pb-8 border-t border-[#234C35]/20 mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          
          {/* Col 1: Café Identity */}
          <div className="space-y-3">
            <h3 className="font-serif text-2xl font-bold tracking-tight text-white">
              {settings.cafeName}
            </h3>
            <p className="text-xs text-[#F7F1E4]/80 leading-relaxed">
              {settings.tagline}
            </p>
            <div className="pt-2 flex items-center gap-2 text-xs text-[#F7F1E4]/70">
              <ShieldCheck className="w-4 h-4 text-[#D98235]" />
              <span>FSSAI Lic. #{settings.fssaiNumber}</span>
            </div>
          </div>

          {/* Col 2: Navigation Links */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#D98235]">
              Quick Links
            </h4>
            <ul className="space-y-2 text-xs text-[#F7F1E4]/80">
              <li>
                <button
                  onClick={() => onNavClick('home')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Home
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavClick('menu')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Full Menu & Ordering
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavClick('bulk-orders')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Bulk & Office Catering
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavClick('about')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  About & Directions
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavClick('admin')}
                  className="hover:text-[#D98235] text-[#F7F1E4]/60 transition-colors cursor-pointer"
                >
                  Staff Portal
                </button>
              </li>
            </ul>
          </div>

          {/* Col 3: Timings & Address */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#D98235]">
              Location & Hours
            </h4>
            <div className="space-y-2 text-xs text-[#F7F1E4]/80">
              <div className="flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 text-[#D98235] shrink-0 mt-0.5" />
                <p>{settings.address}</p>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-[#D98235] shrink-0" />
                <p>{settings.openingHours}</p>
              </div>
            </div>
          </div>

          {/* Col 4: WhatsApp & Calling */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#D98235]">
              Order Direct
            </h4>
            <p className="text-xs text-[#F7F1E4]/80">
              Place your order directly via WhatsApp or phone. Confirmed live by café staff.
            </p>
            <div className="space-y-2 pt-1">
              <a
                href={`https://wa.me/${settings.whatsappNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2 px-3 bg-[#25D366] hover:bg-[#20ba59] text-white text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <MessageCircle className="w-4 h-4 fill-white" />
                <span>WhatsApp: +{settings.whatsappNumber}</span>
              </a>

              <a
                href={`tel:${settings.contactPhone}`}
                className="w-full py-2 px-3 bg-white/10 hover:bg-white/20 text-white text-xs font-medium rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer border border-white/20"
              >
                <Phone className="w-3.5 h-3.5 text-[#D98235]" />
                <span>Call: {settings.contactPhone}</span>
              </a>
            </div>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#F7F1E4]/60">
          <p>© {new Date().getFullYear()} {settings.cafeName}. All rights reserved.</p>
          <p className="flex items-center gap-1.5">
            <span>Freshly handcrafted with</span>
            <Heart className="w-3.5 h-3.5 text-red-400 fill-red-400" />
            <span>for our neighbourhood.</span>
          </p>
        </div>
      </div>
    </footer>
  );
};
