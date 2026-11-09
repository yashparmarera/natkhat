import React, { useState } from 'react';
import { useCafe } from '../context/CafeContext';
import { ShoppingBag, Menu, X, Shield } from 'lucide-react';
import { formatINRPlain } from '../utils/currency';

interface NavbarProps {
  currentView: 'home' | 'menu' | 'bulk-orders' | 'track-order' | 'about' | 'admin';
  setCurrentView: (view: 'home' | 'menu' | 'bulk-orders' | 'about' | 'admin') => void;
  openCart: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  setCurrentView,
  openCart,
}) => {
  const { settings, cartItemCount, cartSubtotalPaise } = useCafe();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { id: 'home' as const, label: 'Home' },
    { id: 'menu' as const, label: 'Menu & Order' },
    { id: 'bulk-orders' as const, label: 'Bulk Orders' },
    { id: 'about' as const, label: 'About & Contact' },
  ];

  const handleNavClick = (view: 'home' | 'menu' | 'bulk-orders' | 'about' | 'admin') => {
    setCurrentView(view);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <header className="sticky top-0 z-40 bg-[#FFFFFF]/95 backdrop-blur-md border-b border-[#234C35]/10 transition-colors shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Wordmark (Single text element) */}
        <button
          onClick={() => handleNavClick('home')}
          className="text-left group cursor-pointer focus-visible:outline-hidden"
          aria-label="Natkhat Café Home"
        >
          <span className="font-serif text-2xl md:text-3xl font-bold tracking-tight text-[#234C35] whitespace-nowrap shrink-0 block">
            {settings.cafeName}
          </span>
        </button>

        {/* Zone 2: Clean 4–5 single-line navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#242820]/80">
          {navLinks.map((link) => {
            const isActive = currentView === link.id;
            return (
              <button
                key={link.id}
                onClick={() => handleNavClick(link.id)}
                className={`transition-colors py-1 cursor-pointer whitespace-nowrap shrink-0 relative ${
                  isActive
                    ? 'text-[#234C35] font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#D98235]'
                    : 'hover:text-[#234C35]'
                }`}
              >
                {link.label}
              </button>
            );
          })}
          <button
            onClick={() => handleNavClick('admin')}
            className={`transition-colors py-1 cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 text-xs text-[#242820]/60 hover:text-[#234C35] ${
              currentView === 'admin' ? 'text-[#234C35] font-semibold' : ''
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-[#D98235]" />
            <span>Staff Portal</span>
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action (Cart CTA Button) */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={openCart}
            aria-label="Shopping Cart"
            data-testid="cart-button"
            className="flex items-center gap-2.5 px-4 py-2.5 bg-[#234C35] hover:bg-[#1a3827] text-white text-sm font-medium rounded-lg shadow-sm transition-all cursor-pointer whitespace-nowrap shrink-0 group active:scale-98"
          >
            <div className="relative">
              <ShoppingBag className="w-4 h-4 text-[#F7F1E4] group-hover:scale-105 transition-transform" />
              {cartItemCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-[#D98235] text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center tabular-nums">
                  {cartItemCount}
                </span>
              )}
            </div>
            <span className="font-semibold">Cart</span>
            {cartSubtotalPaise > 0 && (
              <span className="hidden sm:inline border-l border-white/20 pl-2 text-xs font-mono tabular-nums text-[#F7F1E4]/90">
                {formatINRPlain(cartSubtotalPaise)}
              </span>
            )}
          </button>

          {/* Mobile Menu Hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
            className="md:hidden p-2 text-[#242820] hover:text-[#234C35] rounded-lg hover:bg-black/5 transition-colors cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-[#234C35]/10 bg-white px-4 pt-3 pb-6 space-y-2 shadow-lg animate-in slide-in-from-top-2 duration-150">
          {navLinks.map((link) => (
            <button
              key={link.id}
              onClick={() => handleNavClick(link.id)}
              className={`w-full text-left px-4 py-3 rounded-lg text-base font-medium transition-colors ${
                currentView === link.id
                  ? 'bg-[#234C35]/10 text-[#234C35] font-semibold'
                  : 'text-[#242820] hover:bg-black/5'
              }`}
            >
              {link.label}
            </button>
          ))}
          <button
            onClick={() => handleNavClick('admin')}
            className={`w-full text-left px-4 py-3 rounded-lg text-base font-medium flex items-center gap-2 text-[#242820]/75 hover:bg-black/5 ${
              currentView === 'admin' ? 'bg-[#234C35]/10 text-[#234C35] font-semibold' : ''
            }`}
          >
            <Shield className="w-4 h-4 text-[#D98235]" />
            <span>Café Staff & Admin Portal</span>
          </button>
        </div>
      )}
    </header>
  );
};
