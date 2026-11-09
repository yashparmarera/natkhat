/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, lazy, Suspense } from 'react';
import { CafeProvider, useCafe } from './context/CafeContext';
import { AnnouncementBar } from './components/AnnouncementBar';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { CategoryNav } from './components/CategoryNav';
import { ProductCard } from './components/ProductCard';
import { ProductDetailModal } from './components/ProductDetailModal';
import { CartDrawer } from './components/CartDrawer';
import { BulkOrdersView } from './components/BulkOrdersView';
import { TrackOrderView } from './components/TrackOrderView';
import { AboutContactView } from './components/AboutContactView';
const AdminCMS = lazy(() => import('./components/AdminCMS').then((m) => ({ default: m.AdminCMS })));
import { Footer } from './components/Footer';
import { Product } from './types/cafe';
import { formatINRPlain } from './utils/currency';
import {
  Search,
  Sparkles,
  ArrowRight,
  Flame,
  Award,
  ShieldCheck,
  Truck,
  HeartHandshake,
  CheckCircle,
  MessageCircle,
} from 'lucide-react';

function CafeApp() {
  const { settings, categories, products } = useCafe();

  const [currentView, setCurrentView] = useState<
    'home' | 'menu' | 'bulk-orders' | 'track-order' | 'about' | 'admin'
  >('home');

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeProductDetail, setActiveProductDetail] = useState<Product | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Order number to look up when the Track order view opens (empty = blank form).
  // The nonce remounts the view, so a new prefill always starts a fresh lookup.
  const [trackRequest, setTrackRequest] = useState({ referenceId: '', nonce: 0 });

  const openTrackOrder = (referenceId = '') => {
    setTrackRequest((prev) => ({ referenceId, nonce: prev.nonce + 1 }));
    setCurrentView('track-order');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Products count map by category
  const productsCountByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    products.forEach((p) => {
      map[p.categoryId] = (map[p.categoryId] || 0) + 1;
    });
    return map;
  }, [products]);

  // Filtered menu products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesCategory =
        selectedCategory === 'all' || p.categoryId === selectedCategory;
      const matchesSearch =
        !searchQuery.trim() ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.categoryName &&
          p.categoryName.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  // Featured dishes for homepage
  const featuredProducts = useMemo(() => {
    return products.filter((p) => p.isFeatured && p.isAvailable);
  }, [products]);

  const handleCategorySelectFromHome = (categoryId: string) => {
    setSelectedCategory(categoryId);
    setCurrentView('menu');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F1E4]/30 text-[#242820]">
      {/* 1. Announcement Bar */}
      <AnnouncementBar />

      {/* 2. Top Bar Contract Compliant Navbar */}
      <Navbar
        currentView={currentView}
        setCurrentView={setCurrentView}
        openCart={() => setIsCartOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        {/* VIEW A: HOMEPAGE */}
        {currentView === 'home' && (
          <div className="space-y-16 sm:space-y-20 pb-12">
            {/* Hero Section */}
            <Hero
              onExploreMenu={() => {
                setSelectedCategory('all');
                setCurrentView('menu');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onOpenTrack={() => openTrackOrder()}
            />

            {/* Food Categories Quick Navigation */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <span className="text-xs font-semibold text-[#D98235] uppercase tracking-wider">
                    Handcrafted Menu
                  </span>
                  <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#234C35] mt-0.5">
                    Explore Food Categories
                  </h2>
                </div>
                <button
                  onClick={() => {
                    setSelectedCategory('all');
                    setCurrentView('menu');
                  }}
                  className="text-xs font-semibold text-[#234C35] hover:underline flex items-center gap-1 cursor-pointer self-start sm:self-auto"
                >
                  <span>View all dishes</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {categories.map((cat) => {
                  const count = productsCountByCategory[cat.id] || 0;
                  return (
                    <div
                      key={cat.id}
                      onClick={() => handleCategorySelectFromHome(cat.id)}
                      className="group p-4 bg-white rounded-xl border border-[#234C35]/10 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <h3 className="font-serif font-bold text-sm text-[#242820] group-hover:text-[#234C35] transition-colors">
                            {cat.name}
                          </h3>
                          <span className="text-[10px] font-mono font-bold bg-[#F7F1E4] text-[#234C35] px-2 py-0.5 rounded-full">
                            {count}
                          </span>
                        </div>
                        <p className="text-xs text-[#242820]/65 line-clamp-2 leading-relaxed">
                          {cat.description}
                        </p>
                      </div>

                      <div className="pt-3 flex items-center gap-1 text-[11px] font-semibold text-[#D98235] group-hover:translate-x-1 transition-transform">
                        <span>Browse Items</span>
                        <ArrowRight className="w-3 h-3" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Featured & Popular Dishes */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Flame className="w-4 h-4 text-[#D98235]" />
                    <span className="text-xs font-semibold text-[#D98235] uppercase tracking-wider">
                      Chef Specials
                    </span>
                  </div>
                  <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#234C35] mt-0.5">
                    Popular Dishes
                  </h2>
                </div>

                <button
                  onClick={() => {
                    setSelectedCategory('all');
                    setCurrentView('menu');
                  }}
                  className="text-xs font-semibold text-[#234C35] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>See Full Menu</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {featuredProducts.slice(0, 8).map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onOpenDetails={(p) => setActiveProductDetail(p)}
                  />
                ))}
              </div>
            </section>

            {/* Promotional Offer Banner (Dynamically Managed) */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="bg-[#234C35] text-white rounded-2xl p-6 sm:p-10 shadow-md relative overflow-hidden">
                <div className="max-w-2xl space-y-3 relative z-10">
                  <span className="px-2.5 py-1 bg-[#D98235] text-white text-[11px] font-bold uppercase tracking-wider rounded-md">
                    Limited Period Offer
                  </span>
                  <h3 className="font-serif text-2xl sm:text-3xl font-bold">
                    Enjoy Free Neighbourhood Delivery on Orders Above{' '}
                    {formatINRPlain(settings.freeDeliveryThresholdPaise)}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#F7F1E4]/80 leading-relaxed">
                    Order your favourite kulhad chai flasks, breakfast parathas, and lunch thalis directly. No middleman commissions, straight from our pan to your table.
                  </p>
                  <div className="pt-2">
                    <button
                      onClick={() => {
                        setSelectedCategory('all');
                        setCurrentView('menu');
                      }}
                      className="px-5 py-2.5 bg-[#F7F1E4] hover:bg-white text-[#234C35] text-xs font-bold rounded-lg shadow-sm transition-colors cursor-pointer"
                    >
                      Order Now
                    </button>
                  </div>
                </div>

                <div className="absolute -bottom-8 -right-8 w-60 h-60 bg-white/5 rounded-full blur-2xl pointer-events-none" />
              </div>
            </section>

            {/* Why Choose Us */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
              <div className="text-center space-y-2">
                <span className="text-xs font-semibold text-[#D98235] uppercase tracking-wider">
                  Our Promise
                </span>
                <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#234C35]">
                  Why Locals Love {settings.cafeName}
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-6 bg-white rounded-2xl border border-[#234C35]/10 shadow-2xs space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-[#234C35]/10 text-[#234C35] flex items-center justify-center">
                    <Flame className="w-5 h-5 text-[#D98235]" />
                  </div>
                  <h3 className="font-serif font-bold text-lg text-[#234C35]">
                    Piped Live on Tawa
                  </h3>
                  <p className="text-xs text-[#242820]/75 leading-relaxed">
                    We never serve pre-made cold parathas or re-heated tea. Every order is fired live on our tawa with real Desi Ghee and served steaming hot.
                  </p>
                </div>

                <div className="p-6 bg-white rounded-2xl border border-[#234C35]/10 shadow-2xs space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-[#234C35]/10 text-[#234C35] flex items-center justify-center">
                    <Award className="w-5 h-5 text-[#D98235]" />
                  </div>
                  <h3 className="font-serif font-bold text-lg text-[#234C35]">
                    100% Amul Butter & Pure Paneer
                  </h3>
                  <p className="text-xs text-[#242820]/75 leading-relaxed">
                    Zero palm oil or artificial substitutes. We strictly use genuine Amul dairy butter, pure cow ghee, and fresh malai paneer in all our recipes.
                  </p>
                </div>

                <div className="p-6 bg-white rounded-2xl border border-[#234C35]/10 shadow-2xs space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-[#234C35]/10 text-[#234C35] flex items-center justify-center">
                    <MessageCircle className="w-5 h-5 text-[#25D366]" />
                  </div>
                  <h3 className="font-serif font-bold text-lg text-[#234C35]">
                    Simple WhatsApp Handoff
                  </h3>
                  <p className="text-xs text-[#242820]/75 leading-relaxed">
                    No complicated logins, no hidden app service fees, and no payment gateways. Customise your meal in 30 seconds and send it to our kitchen on WhatsApp.
                  </p>
                </div>
              </div>
            </section>

            {/* Bulk Order Section Teaser */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="bg-gradient-to-r from-[#F7F1E4] to-[#F7F1E4]/60 border border-[#234C35]/15 rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xs">
                <div className="space-y-2 max-w-xl">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#D98235]">
                    <HeartHandshake className="w-4 h-4" />
                    <span>Office & Group Catering</span>
                  </div>
                  <h3 className="font-serif text-2xl font-bold text-[#234C35]">
                    Planning an Event, Office Lunch, or Shift Meal?
                  </h3>
                  <p className="text-xs text-[#242820]/75">
                    We prepare packaged thali boxes, bulk chai flasks, and snack platters for 10 to 500 people. Direct kitchen rates with guaranteed punctual delivery.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setCurrentView('bulk-orders');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="px-6 py-3 bg-[#234C35] hover:bg-[#1a3827] text-white text-xs font-bold rounded-xl shadow-xs transition-colors whitespace-nowrap cursor-pointer shrink-0"
                >
                  Enquire for Bulk Catering
                </button>
              </div>
            </section>
          </div>
        )}

        {/* VIEW B: MENU & ORDERING */}
        {currentView === 'menu' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
            {/* Header & Search */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="font-serif text-3xl font-bold text-[#234C35]">
                  Café Menu & Online Ordering
                </h1>
                <p className="text-xs text-[#242820]/70 mt-0.5">
                  Select your dishes, add them to your basket, and place your order directly via WhatsApp.
                </p>
              </div>

              {/* Search Bar */}
              <div className="relative w-full md:w-80">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search chai, parathas, thali..."
                  className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-gray-300 bg-white shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-[#234C35]"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-2.5 text-xs text-gray-400 hover:text-gray-600"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Category Navigation Bar */}
            <div className="sticky top-18 z-20 bg-[#F7F1E4]/90 backdrop-blur-xs py-2 border-y border-[#234C35]/10">
              <CategoryNav
                categories={categories}
                selectedCategory={selectedCategory}
                onSelectCategory={(catId) => setSelectedCategory(catId)}
                productsCountByCategory={productsCountByCategory}
                totalProductsCount={products.length}
              />
            </div>

            {/* Product Grid */}
            {filteredProducts.length === 0 ? (
              <div className="py-16 text-center space-y-3 bg-white rounded-2xl border border-gray-200">
                <p className="text-base font-semibold text-[#242820]">
                  No dishes match your search or filter
                </p>
                <p className="text-xs text-[#242820]/60">
                  Try searching for a different item or select 'All Delicacies'.
                </p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('all');
                  }}
                  className="px-4 py-2 bg-[#234C35] text-white text-xs font-semibold rounded-lg hover:bg-[#1a3827] cursor-pointer"
                >
                  Reset Menu Filter
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {filteredProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onOpenDetails={(p) => setActiveProductDetail(p)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* VIEW C: BULK ORDERS */}
        {currentView === 'bulk-orders' && <BulkOrdersView />}

        {/* VIEW C2: TRACK ORDER (takeaway) */}
        {currentView === 'track-order' && (
          <TrackOrderView key={trackRequest.nonce} initialReferenceId={trackRequest.referenceId} />
        )}

        {/* VIEW D: ABOUT & CONTACT */}
        {currentView === 'about' && (
          <AboutContactView
            onExploreMenu={() => {
              setSelectedCategory('all');
              setCurrentView('menu');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {/* VIEW E: ADMIN CMS */}
        {currentView === 'admin' && (
          <Suspense fallback={<div className="py-24 text-center">Loading...</div>}>
            <AdminCMS />
          </Suspense>
        )}
      </main>

      {/* Product Detail Modal */}
      <ProductDetailModal
        product={activeProductDetail}
        onClose={() => setActiveProductDetail(null)}
      />

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        onContinueShopping={() => {
          setIsCartOpen(false);
          setCurrentView('menu');
        }}
        onTrackOrder={(referenceId) => openTrackOrder(referenceId)}
      />

      {/* Footer */}
      <Footer onNavClick={(view) => setCurrentView(view)} />
    </div>
  );
}

export default function App() {
  return (
    <CafeProvider>
      <CafeApp />
    </CafeProvider>
  );
}
