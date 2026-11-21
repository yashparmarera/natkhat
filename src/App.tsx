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
  ArrowRight,
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
    <div className="min-h-screen flex flex-col bg-[#FBF7EC] text-[#242820]">
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
          <div className="space-y-10 sm:space-y-12 pb-12">
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
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-5">
              <div className="flex items-end justify-between gap-4 border-b border-[#234C35]/20 pb-3">
                <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#234C35]">
                  Browse the menu
                </h2>
                <button
                  onClick={() => {
                    setSelectedCategory('all');
                    setCurrentView('menu');
                  }}
                  className="min-h-11 text-sm font-semibold text-[#234C35] underline underline-offset-4 decoration-[#D98235] flex items-center gap-1 cursor-pointer"
                >
                  <span>View all dishes</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border-t border-l border-[#234C35]/20">
                {categories.map((cat) => {
                  const count = productsCountByCategory[cat.id] || 0;
                  return (
                    <li key={cat.id} className="border-r border-b border-[#234C35]/20">
                      <button
                        onClick={() => handleCategorySelectFromHome(cat.id)}
                        className="group w-full h-full text-left p-4 min-h-11 bg-white hover:bg-[#F7F1E4] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#D98235]"
                      >
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="font-serif font-bold text-base text-[#242820] group-hover:text-[#234C35]">
                            {cat.name}
                          </span>
                          <span className="text-sm tabular-nums text-[#B8651C] font-semibold">{count}</span>
                        </span>
                        <span className="block text-sm text-[#242820]/80 line-clamp-2 mt-1">
                          {cat.description}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Featured & Popular Dishes */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-5">
              <div className="flex items-end justify-between gap-4 border-b border-[#234C35]/20 pb-3">
                <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#234C35]">
                  Popular dishes
                </h2>
                <button
                  onClick={() => {
                    setSelectedCategory('all');
                    setCurrentView('menu');
                  }}
                  className="min-h-11 text-sm font-semibold text-[#234C35] underline underline-offset-4 decoration-[#D98235] flex items-center gap-1 cursor-pointer"
                >
                  <span>See full menu</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {featuredProducts.slice(0, 8).map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onOpenDetails={(p) => setActiveProductDetail(p)}
                  />
                ))}
              </div>
            </section>

            {/* Delivery / lunch offer (threshold comes from store settings) */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="bg-[#234C35] text-white rounded-md p-6 sm:p-10 grid md:grid-cols-12 gap-6 items-center">
                <div className="md:col-span-8 space-y-3">
                  <h3 className="font-serif text-2xl sm:text-3xl font-bold">
                    Free delivery on orders above {formatINRPlain(settings.freeDeliveryThresholdPaise)}
                  </h3>
                  <p className="text-sm sm:text-base text-[#F7F1E4] leading-relaxed">
                    Kulhad chai, breakfast parathas and lunch thalis, ordered straight from the kitchen with no middleman commission.
                  </p>
                </div>
                <div className="md:col-span-4 md:text-right">
                  <button
                    onClick={() => {
                      setSelectedCategory('all');
                      setCurrentView('menu');
                    }}
                    className="min-h-12 px-6 bg-[#F7F1E4] hover:bg-white text-[#234C35] text-base font-semibold rounded-md transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D98235]"
                  >
                    Order now
                  </button>
                </div>
              </div>
            </section>

            {/* Why us: editorial list instead of icon cards */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-12 gap-8">
              <h2 className="lg:col-span-4 font-serif text-2xl sm:text-3xl font-bold text-[#234C35]">
                Why locals choose {settings.cafeName}
              </h2>
              <ol className="lg:col-span-8 divide-y divide-[#234C35]/20 border-y border-[#234C35]/20">
                {[
                  ['Fired live on the tawa', 'No pre-made cold parathas or re-heated tea. Every order is cooked when you place it, with real desi ghee.'],
                  ['Amul butter and fresh paneer', 'No palm oil or substitutes. We use Amul butter, pure cow ghee and malai paneer in our recipes.'],
                  ['Order on WhatsApp', 'No login, no app, no payment gateway. Build your basket, send it to our kitchen, and we confirm it.'],
                ].map(([title, body], i) => (
                  <li key={title} className="py-5 flex gap-5">
                    <span className="font-serif text-2xl font-bold text-[#B8651C] tabular-nums w-8 shrink-0">{i + 1}</span>
                    <div>
                      <h3 className="font-serif font-bold text-lg text-[#234C35]">{title}</h3>
                      <p className="text-sm sm:text-base text-[#242820]/90 leading-relaxed mt-1">{body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            {/* Bulk Order Section Teaser */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="border border-[#234C35]/30 bg-[#F7F1E4] rounded-md p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="space-y-2 max-w-xl">
                  <h3 className="font-serif text-2xl font-bold text-[#234C35]">
                    Office lunch, event or shift meal for 10 to 500 people
                  </h3>
                  <p className="text-sm sm:text-base text-[#242820]/90">
                    Packed thali boxes, chai flasks and snack platters at direct kitchen rates, delivered on time.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setCurrentView('bulk-orders');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="min-h-12 px-6 bg-[#234C35] hover:bg-[#1a3827] text-white text-base font-semibold rounded-md transition-colors cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D98235]"
                >
                  Enquire for bulk catering
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
                  Menu and online ordering
                </h1>
                <p className="text-sm text-[#242820]/80 mt-0.5">
                  Select your dishes, add them to your basket, and place your order directly via WhatsApp.
                </p>
              </div>

              {/* Search Bar */}
              <div className="relative w-full md:w-80">
                <Search className="w-4 h-4 text-gray-500 absolute left-3 top-3.5" aria-hidden="true" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search chai, parathas, thali..."
                  className="w-full pl-9 pr-16 min-h-11 text-base rounded-md border border-[#234C35]/40 bg-white focus:outline-hidden focus:ring-2 focus:ring-[#234C35]"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-1 top-0 min-h-11 px-2 text-sm text-gray-600 hover:text-gray-900"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Category Navigation Bar */}
            <div className="sticky top-18 z-20 bg-[#F7F1E4] py-1 border-y border-[#234C35]/10">
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
              <div className="py-16 text-center space-y-3 bg-white rounded-md border border-[#234C35]/20">
                <p className="text-base font-semibold text-[#242820]">
                  No dishes match your search or filter
                </p>
                <p className="text-sm text-[#242820]/75">
                  Try searching for a different item or select 'All Delicacies'.
                </p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('all');
                  }}
                  className="min-h-11 px-4 bg-[#234C35] text-white text-sm font-semibold rounded-md hover:bg-[#1a3827] cursor-pointer"
                >
                  Reset Menu Filter
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
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
