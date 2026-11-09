import React, { useState } from 'react';
import { useCafe } from '../context/CafeContext';
import { Clock, Phone, X } from 'lucide-react';

export const AnnouncementBar: React.FC = () => {
  const { settings } = useCafe();
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed || !settings.announcementText) return null;

  return (
    <div className="bg-[#234C35] text-[#F7F1E4] text-xs font-medium px-4 py-2 transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 overflow-hidden text-ellipsis whitespace-nowrap">
          <span className="inline-flex items-center gap-1.5 text-[#D98235] font-semibold uppercase tracking-wider text-[11px]">
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
            className="text-white/60 hover:text-white transition-colors p-0.5 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
