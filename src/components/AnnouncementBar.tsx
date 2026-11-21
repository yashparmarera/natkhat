import React, { useState } from 'react';
import { useCafe } from '../context/CafeContext';
import { Clock, Phone, X } from 'lucide-react';

export const AnnouncementBar: React.FC = () => {
  const { settings } = useCafe();
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed || !settings.announcementText) return null;

  return (
    <div className="bg-[#234C35] text-[#F7F1E4] text-xs sm:text-sm font-medium px-4 py-2">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 overflow-hidden whitespace-nowrap min-w-0">
          <span className="inline-flex items-center gap-1.5 text-[#D98235] font-semibold shrink-0">
            <Clock className="w-3.5 h-3.5" />
            {settings.openingHours}
          </span>
          <span className="hidden sm:inline text-white/40">|</span>
          <span className="truncate">{settings.announcementText}</span>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <a
            href={`tel:${settings.contactPhone}`}
            className="hidden md:inline-flex items-center gap-1.5 text-white/90 hover:text-white transition-colors"
          >
            <Phone className="w-3 h-3 text-[#D98235]" />
            <span>{settings.contactPhone}</span>
          </a>
          <button
            onClick={() => setIsDismissed(true)}
            aria-label="Dismiss announcement"
            className="text-white/80 hover:text-white transition-colors w-8 h-8 flex items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-[#D98235]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
