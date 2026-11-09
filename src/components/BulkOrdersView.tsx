import React, { useState } from 'react';
import { useCafe } from '../context/CafeContext';
import { BulkEnquiry } from '../types/cafe';
import { buildBulkEnquiryWhatsAppUrl } from '../utils/whatsapp';
import { Users, Calendar, Clock, Sparkles, MessageCircle, Building2, CheckCircle2 } from 'lucide-react';

export const BulkOrdersView: React.FC = () => {
  const { settings } = useCafe();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [companyOrGroup, setCompanyOrGroup] = useState('');
  const [eventType, setEventType] = useState('Corporate Office Lunch');
  const [estimatedPeople, setEstimatedPeople] = useState<number>(30);
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('1:00 PM');
  const [dietaryRequirements, setDietaryRequirements] = useState('Pure Vegetarian (Standard)');
  const [notes, setNotes] = useState('');

  const [submitted, setSubmitted] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const enquiry: BulkEnquiry = {
      name: name.trim(),
      phone: phone.trim(),
      companyOrGroup: companyOrGroup.trim(),
      eventType,
      estimatedPeople,
      preferredDate: preferredDate || 'Next 2-3 Days',
      preferredTime,
      dietaryRequirements,
      notes: notes.trim(),
    };

    const waUrl = buildBulkEnquiryWhatsAppUrl(
      settings.whatsappNumber,
      settings.cafeName,
      enquiry
    );

    setGeneratedUrl(waUrl);
    setSubmitted(true);

    try {
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    } catch {}
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-10">
      {/* Header Banner */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#234C35]/10 text-[#234C35] rounded-md text-xs font-semibold uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5 text-[#D98235]" />
          <span>Catering & Large Orders</span>
        </div>
        <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-[#234C35]">
          Bulk Food Orders & Catering
        </h1>
        <p className="text-sm sm:text-base text-[#242820]/80 max-w-2xl mx-auto leading-relaxed">
          Hosting an office celebration, factory shift meal, college fest, or family reunion? We deliver hot, hygienically packed thali boxes, snacks, and fresh kulhad chai on time.
        </p>
      </div>

      {/* Target Audiences Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white rounded-xl border border-[#234C35]/10 shadow-2xs space-y-1.5">
          <h3 className="font-serif font-bold text-sm text-[#234C35]">Corporate & Offices</h3>
          <p className="text-xs text-[#242820]/70">
            Hygienically sealed executive thalis and afternoon snack platters with cutting chai flasks.
          </p>
        </div>
        <div className="p-4 bg-white rounded-xl border border-[#234C35]/10 shadow-2xs space-y-1.5">
          <h3 className="font-serif font-bold text-sm text-[#234C35]">Industrial & Shifts</h3>
          <p className="text-xs text-[#242820]/70">
            Wholesome, filling meal combos with warm rotis, dal tadka, and seasonal subzis for factory teams.
          </p>
        </div>
        <div className="p-4 bg-white rounded-xl border border-[#234C35]/10 shadow-2xs space-y-1.5">
          <h3 className="font-serif font-bold text-sm text-[#234C35]">Family & College Gatherings</h3>
          <p className="text-xs text-[#242820]/70">
            Samosas, chole bhature, chowmein, and sweet gulab jamuns for birthdays and student celebrations.
          </p>
        </div>
      </div>

      {/* Form Container */}
      <div className="bg-white rounded-2xl border border-[#234C35]/15 p-6 sm:p-8 shadow-sm">
        {submitted ? (
          <div className="text-center py-8 space-y-5">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div>
              <h3 className="font-serif text-2xl font-bold text-[#234C35]">
                Bulk Order Request Prepared!
              </h3>
              <p className="text-xs sm:text-sm text-[#242820]/75 mt-2 max-w-md mx-auto">
                Your catering enquiry message is ready. Click below to connect with the {settings.cafeName} kitchen manager directly on WhatsApp.
              </p>
            </div>

            <div className="max-w-md mx-auto space-y-3">
              <a
                href={generatedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3.5 px-4 bg-[#25D366] hover:bg-[#20ba59] text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer text-sm"
              >
                <MessageCircle className="w-5 h-5 fill-white" />
                <span>Send Enquiry on WhatsApp</span>
              </a>

              <button
                type="button"
                onClick={() => setSubmitted(false)}
                className="text-xs text-[#234C35] underline font-semibold cursor-pointer"
              >
                Edit Enquiry Details
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#242820] mb-1">
                  Contact Person Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Vikramaditya Rathore"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-[#234C35]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#242820] mb-1">
                  WhatsApp Contact Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="10-digit mobile number"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-[#234C35]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#242820] mb-1">
                  Organization / Group Name <span className="text-[#242820]/40 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={companyOrGroup}
                  onChange={(e) => setCompanyOrGroup(e.target.value)}
                  placeholder="e.g. Acme Tech / Department of Engineering"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-[#234C35]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#242820] mb-1">
                  Occasion / Event Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-gray-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-[#234C35]"
                >
                  <option value="Corporate Office Lunch">Corporate Office Lunch</option>
                  <option value="Factory / Industrial Shift Meal">Factory / Industrial Shift Meal</option>
                  <option value="College Fest / Student Gathering">College Fest / Student Gathering</option>
                  <option value="Family Birthday / Puja Gathering">Family Birthday / Puja Gathering</option>
                  <option value="Tea & Snacks Meeting">Tea & Evening Snacks Meeting</option>
                  <option value="Other Custom Event">Other Custom Event</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#242820] mb-1">
                  Estimated People <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={10}
                  max={500}
                  required
                  value={estimatedPeople}
                  onChange={(e) => setEstimatedPeople(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-[#234C35]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#242820] mb-1">
                  Target Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={preferredDate}
                  onChange={(e) => setPreferredDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-[#234C35]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#242820] mb-1">
                  Preferred Delivery Time
                </label>
                <input
                  type="text"
                  value={preferredTime}
                  onChange={(e) => setPreferredTime(e.target.value)}
                  placeholder="e.g. 1:00 PM or 5:30 PM"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-[#234C35]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#242820] mb-1">
                Dietary Preferences & Menu Focus
              </label>
              <select
                value={dietaryRequirements}
                onChange={(e) => setDietaryRequirements(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-gray-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-[#234C35]"
              >
                <option value="Pure Vegetarian (Standard)">Pure Vegetarian (Standard)</option>
                <option value="Pure Vegetarian with Jain Options (No Onion/Garlic)">Pure Vegetarian with Jain Options (No Onion/Garlic)</option>
                <option value="Only Tea & Evening Snacks Combo">Only Tea & Evening Snacks Combo</option>
                <option value="Deluxe Thali Box with Sweet">Deluxe Thali Box with Sweet</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#242820] mb-1">
                Additional Requirements / Special Notes
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Need individual sealed food trays, paper napkins, disposable glasses"
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-[#234C35]"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3.5 px-4 bg-[#234C35] hover:bg-[#1a3827] text-white font-semibold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              <MessageCircle className="w-5 h-5 text-[#D98235]" />
              <span>Connect on WhatsApp for Bulk Quote</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
