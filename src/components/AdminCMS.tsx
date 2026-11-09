import React, { useState } from 'react';
import { useCafe } from '../context/CafeContext';
import { Product, Category, StoreSettings } from '../types/cafe';
import { formatINRPlain, rupeesToPaise, paiseToRupees } from '../utils/currency';
import { isTerminalStatus } from '../utils/orderStatus';
import { OrderStatusBadge, OrderStatusModal } from './OrderStatusModal';
import {
  Shield,
  Lock,
  LogOut,
  UtensilsCrossed,
  Settings as SettingsIcon,
  FolderTree,
  ClipboardList,
  Check,
  AlertTriangle,
  Plus,
  Edit2,
  Trash2,
  Save,
  CheckCircle,
  XCircle,
  Clock,
  Phone,
  MessageCircle,
  Search,
} from 'lucide-react';

export const AdminCMS: React.FC = () => {
  const {
    settings,
    categories,
    products,
    orders,
    updateSettings,
    updateProduct,
    toggleProductAvailability,
    addProduct,
    deleteProduct,
    updateCategory,
    addCategory,
    isAdminAuthenticated,
    adminLogin,
    adminLogout,
  } = useCafe();

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [activeTab, setActiveTab] = useState<'products' | 'categories' | 'settings' | 'orders'>('products');

  // Change password modal / state
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [passwordChangeStatus, setPasswordChangeStatus] = useState<string | null>(null);

  // Search & filter in products tab
  const [productSearch, setProductSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // State for Add / Edit Product Modal
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);

  // New product form fields
  const [newProdName, setNewProdName] = useState('');
  const [newProdCategory, setNewProdCategory] = useState(categories[0]?.id || 'tea-snacks');
  const [newProdPriceRupees, setNewProdPriceRupees] = useState<number>(60);
  const [newProdDesc, setNewProdDesc] = useState('');
  const [newProdPortion, setNewProdPortion] = useState('Serves 1');
  const [newProdImage, setNewProdImage] = useState('/src/assets/images/natkhat_hero_feast_1793454950947.jpg');
  const [newProdFeatured, setNewProdFeatured] = useState(false);

  // Settings form state
  const [settingsForm, setSettingsForm] = useState<StoreSettings>(settings);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Category add form
  const [isAddCatOpen, setIsAddCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');

  // Order status popup (holds the reference only, so the popup always shows the latest list data)
  const [statusOrderRef, setStatusOrderRef] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoggingIn(true);

    const result = await adminLogin(password, username);
    setIsLoggingIn(false);

    if (!result.success) {
      setLoginError(result.error || 'Authentication failed. Please verify credentials.');
    } else {
      setPassword('');
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminPassword || newAdminPassword.length < 8) {
      setPasswordChangeStatus('Password must be at least 8 characters long');
      return;
    }

    const { changeAdminPassword } = useCafe();
    const res = await changeAdminPassword(newAdminPassword);
    if (res.success) {
      setPasswordChangeStatus('Admin password successfully updated in database!');
      setNewAdminPassword('');
      setTimeout(() => {
        setIsChangePasswordOpen(false);
        setPasswordChangeStatus(null);
      }, 2000);
    } else {
      setPasswordChangeStatus(res.error || 'Failed to update password');
    }
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings(settingsForm);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2500);
  };

  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdName.trim()) return;

    const matchedCat = categories.find((c) => c.id === newProdCategory);

    addProduct({
      name: newProdName.trim(),
      description: newProdDesc.trim(),
      pricePaise: rupeesToPaise(Number(newProdPriceRupees)),
      categoryId: newProdCategory,
      categoryName: matchedCat?.name || 'Snacks',
      dietary: 'veg',
      image: newProdImage,
      isAvailable: true,
      isFeatured: newProdFeatured,
      displayOrder: products.length + 1,
      portionInfo: newProdPortion.trim(),
    });

    // Reset
    setNewProdName('');
    setNewProdDesc('');
    setNewProdPriceRupees(60);
    setIsAddProductOpen(false);
  };

  const handleUpdateProductSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    updateProduct(editingProduct.id, {
      name: editingProduct.name,
      description: editingProduct.description,
      pricePaise: editingProduct.pricePaise,
      categoryId: editingProduct.categoryId,
      categoryName: categories.find((c) => c.id === editingProduct.categoryId)?.name,
      portionInfo: editingProduct.portionInfo,
      isFeatured: editingProduct.isFeatured,
    });

    setEditingProduct(null);
  };

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    addCategory({
      name: newCatName.trim(),
      description: newCatDesc.trim(),
      displayOrder: categories.length + 1,
      active: true,
    });

    setNewCatName('');
    setNewCatDesc('');
    setIsAddCatOpen(false);
  };

  // If not logged in, show secure admin login modal
  if (!isAdminAuthenticated) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 sm:py-24">
        <div className="bg-white rounded-2xl border border-[#234C35]/15 p-6 sm:p-8 shadow-sm space-y-6 text-center">
          <div className="w-12 h-12 rounded-xl bg-[#234C35]/10 text-[#234C35] flex items-center justify-center mx-auto">
            <Shield className="w-6 h-6 text-[#D98235]" />
          </div>

          <div>
            <h1 className="font-serif text-2xl font-bold text-[#234C35]">
              Café Management Login
            </h1>
            <p className="text-xs text-[#242820]/70 mt-1">
              Protected administrative portal with server-side scrypt authentication and rate limiting.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4 text-left">
            <div>
              <label className="block text-xs font-semibold text-[#242820] mb-1">
                Username
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setLoginError(null);
                }}
                placeholder="admin"
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-[#234C35]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#242820] mb-1">
                Master Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setLoginError(null);
                  }}
                  placeholder="Enter administrator password"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-[#234C35]"
                />
                <Lock className="w-4 h-4 text-gray-400 absolute right-3 top-3" />
              </div>
            </div>

            {loginError && (
              <div className="p-2.5 bg-red-50 text-red-700 text-xs rounded-lg flex items-start gap-2 border border-red-200">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-2.5 bg-[#234C35] hover:bg-[#1a3827] text-white text-sm font-semibold rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {isLoggingIn ? 'Verifying...' : 'Sign In to Management'}
            </button>
          </form>

          <div className="p-3 bg-gray-50 rounded-lg text-xs text-[#242820]/70 text-left space-y-1">
            <span className="font-semibold text-[#234C35] block">Default Master Credentials:</span>
            <p>Username: <code className="bg-gray-200 px-1 py-0.5 rounded text-[11px]">admin</code></p>
            <p>Password: <code className="bg-gray-200 px-1 py-0.5 rounded text-[11px]">NatkhatCafe@2026</code></p>
            <p className="text-[10px] text-gray-500 pt-1">
              (Master password can be changed securely in Store Settings).
            </p>
          </div>
        </div>
      </div>
    );
  }

  const statusOrder = statusOrderRef ? orders.find((o) => o.referenceId === statusOrderRef) : undefined;

  // Filtered products list
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.description.toLowerCase().includes(productSearch.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || p.categoryId === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* CMS Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#234C35]/10">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-serif text-2xl font-bold text-[#234C35]">
              {settings.cafeName}
            </span>
            <span className="px-2 py-0.5 bg-[#234C35]/10 text-[#234C35] text-[10px] font-bold rounded-md uppercase tracking-wider">
              Staff CMS
            </span>
          </div>
          <p className="text-xs text-[#242820]/70 mt-0.5">
            Single-Outlet Menu Management, Stock Toggles & Store Configuration
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={adminLogout}
            className="px-3.5 py-1.5 text-xs text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setActiveTab('products')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'products'
              ? 'bg-[#234C35] text-white shadow-xs'
              : 'text-[#242820]/70 hover:text-[#234C35]'
          }`}
        >
          <UtensilsCrossed className="w-3.5 h-3.5" />
          <span>Products ({products.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('categories')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'categories'
              ? 'bg-[#234C35] text-white shadow-xs'
              : 'text-[#242820]/70 hover:text-[#234C35]'
          }`}
        >
          <FolderTree className="w-3.5 h-3.5" />
          <span>Categories ({categories.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'settings'
              ? 'bg-[#234C35] text-white shadow-xs'
              : 'text-[#242820]/70 hover:text-[#234C35]'
          }`}
        >
          <SettingsIcon className="w-3.5 h-3.5" />
          <span>Store & WhatsApp Settings</span>
        </button>

        <button
          onClick={() => setActiveTab('orders')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'orders'
              ? 'bg-[#234C35] text-white shadow-xs'
              : 'text-[#242820]/70 hover:text-[#234C35]'
          }`}
        >
          <ClipboardList className="w-3.5 h-3.5" />
          <span>WhatsApp Orders Log ({orders.length})</span>
        </button>
      </div>

      {/* TAB 1: PRODUCTS MANAGEMENT */}
      {activeTab === 'products' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search products or ingredients..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-[#234C35]"
                />
              </div>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-300 bg-white"
              >
                <option value="all">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => setIsAddProductOpen(true)}
              className="px-4 py-2 bg-[#234C35] hover:bg-[#1a3827] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-xs cursor-pointer self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add New Dish</span>
            </button>
          </div>

          {/* Products Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F7F1E4]/50 text-[#242820] font-semibold border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3">Dish / Item</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Price (₹)</th>
                    <th className="px-4 py-3">Stock Status</th>
                    <th className="px-4 py-3">Featured</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredProducts.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={p.image}
                            alt={p.name}
                            className="w-10 h-10 rounded-md object-cover bg-gray-100 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <div>
                            <p className="font-semibold text-[#242820]">{p.name}</p>
                            <p className="text-[11px] text-[#242820]/60 truncate max-w-xs">
                              {p.portionInfo || p.description}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#242820]/75">{p.categoryName}</td>
                      <td className="px-4 py-3 font-mono font-bold text-[#234C35] tabular-nums">
                        {formatINRPlain(p.pricePaise)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleProductAvailability(p.id)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                            p.isAvailable
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                              : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                          }`}
                        >
                          {p.isAvailable ? (
                            <>
                              <CheckCircle className="w-3 h-3 text-emerald-600" />
                              <span>In Stock</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3 h-3 text-red-600" />
                              <span>Sold Out</span>
                            </>
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => updateProduct(p.id, { isFeatured: !p.isFeatured })}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                            p.isFeatured
                              ? 'bg-[#D98235] text-white'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          {p.isFeatured ? 'Featured' : 'Standard'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setEditingProduct(p)}
                            aria-label={`Edit ${p.name}`}
                            className="p-1.5 text-gray-600 hover:text-[#234C35] hover:bg-gray-100 rounded cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete ${p.name}?`)) {
                                deleteProduct(p.id);
                              }
                            }}
                            aria-label={`Delete ${p.name}`}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CATEGORIES MANAGEMENT */}
      {activeTab === 'categories' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs text-[#242820]/75">
              Menu categories define the navigation structure on the customer menu.
            </p>
            <button
              onClick={() => setIsAddCatOpen(true)}
              className="px-4 py-2 bg-[#234C35] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Category</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {categories.map((cat) => {
              const count = products.filter((p) => p.categoryId === cat.id).length;
              return (
                <div
                  key={cat.id}
                  className="p-4 bg-white rounded-xl border border-gray-200 shadow-2xs space-y-2 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="font-serif font-bold text-base text-[#234C35]">{cat.name}</h3>
                      <span className="text-[11px] font-mono bg-[#F7F1E4] px-2 py-0.5 rounded text-[#234C35]">
                        {count} item{count > 1 ? 's' : ''}
                      </span>
                    </div>
                    <p className="text-xs text-[#242820]/70 mt-1">{cat.description}</p>
                  </div>

                  <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-[11px] text-gray-500">Order #{cat.displayOrder}</span>
                    <button
                      onClick={() => updateCategory(cat.id, { active: !cat.active })}
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded cursor-pointer ${
                        cat.active ? 'bg-emerald-50 text-emerald-800' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {cat.active ? 'Active' : 'Hidden'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: STORE SETTINGS & WHATSAPP CONFIG */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="bg-white rounded-xl border border-gray-200 p-6 shadow-2xs space-y-6 max-w-3xl">
          <div className="space-y-1">
            <h2 className="font-serif text-lg font-bold text-[#234C35]">
              Store Configuration & WhatsApp Number
            </h2>
            <p className="text-xs text-[#242820]/70">
              Update editable business details. All WhatsApp order handoffs will route to the configured number below.
            </p>
          </div>

          {settingsSaved && (
            <div className="p-3 bg-emerald-50 text-emerald-800 text-xs rounded-lg flex items-center gap-2 border border-emerald-200">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>Settings saved successfully! WhatsApp orders and announcements updated.</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#242820] mb-1">
                Café Brand Name
              </label>
              <input
                type="text"
                required
                value={settingsForm.cafeName}
                onChange={(e) => setSettingsForm({ ...settingsForm, cafeName: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#242820] mb-1">
                WhatsApp Ordering Number (Digits only, including country code)
              </label>
              <div className="flex items-center">
                <span className="px-2.5 py-2 text-xs font-mono bg-gray-100 border border-r-0 border-gray-300 rounded-l-lg text-gray-600">
                  +
                </span>
                <input
                  type="text"
                  required
                  value={settingsForm.whatsappNumber}
                  onChange={(e) => setSettingsForm({ ...settingsForm, whatsappNumber: e.target.value })}
                  placeholder="919876543210"
                  className="w-full px-3 py-2 text-xs font-mono rounded-r-lg border border-gray-300"
                />
              </div>
              <p className="text-[10px] text-gray-500 mt-0.5">
                Current recipient: https://wa.me/{settingsForm.whatsappNumber}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#242820] mb-1">
                Direct Contact Phone
              </label>
              <input
                type="text"
                value={settingsForm.contactPhone}
                onChange={(e) => setSettingsForm({ ...settingsForm, contactPhone: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#242820] mb-1">
                Opening Hours
              </label>
              <input
                type="text"
                value={settingsForm.openingHours}
                onChange={(e) => setSettingsForm({ ...settingsForm, openingHours: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#242820] mb-1">
              Physical Café Address
            </label>
            <input
              type="text"
              value={settingsForm.address}
              onChange={(e) => setSettingsForm({ ...settingsForm, address: e.target.value })}
              className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#242820] mb-1">
              Homepage Announcement Bar Text
            </label>
            <input
              type="text"
              value={settingsForm.announcementText}
              onChange={(e) => setSettingsForm({ ...settingsForm, announcementText: e.target.value })}
              className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-gray-100">
            <div>
              <label className="block text-xs font-semibold text-[#242820] mb-1">
                Delivery Charge (₹)
              </label>
              <input
                type="number"
                value={paiseToRupees(settingsForm.deliveryFeePaise)}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    deliveryFeePaise: rupeesToPaise(Number(e.target.value)),
                  })
                }
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-gray-300"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#242820] mb-1">
                Free Delivery Above (₹)
              </label>
              <input
                type="number"
                value={paiseToRupees(settingsForm.freeDeliveryThresholdPaise)}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    freeDeliveryThresholdPaise: rupeesToPaise(Number(e.target.value)),
                  })
                }
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-gray-300"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#242820] mb-1">
                Min. Delivery Order (₹)
              </label>
              <input
                type="number"
                value={paiseToRupees(settingsForm.minOrderDeliveryPaise)}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    minOrderDeliveryPaise: rupeesToPaise(Number(e.target.value)),
                  })
                }
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-gray-300"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <button
              type="submit"
              className="px-6 py-2.5 bg-[#234C35] hover:bg-[#1a3827] text-white text-xs font-semibold rounded-lg shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Save Store Settings</span>
            </button>

            <button
              type="button"
              onClick={() => setIsChangePasswordOpen(true)}
              className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-[#242820] text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer border border-gray-300"
            >
              <Lock className="w-3.5 h-3.5 text-[#D98235]" />
              <span>Change Admin Password</span>
            </button>
          </div>
        </form>
      )}

      {/* MODAL: CHANGE ADMIN PASSWORD */}
      {isChangePasswordOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-2xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-gray-200 space-y-4">
            <h3 className="font-serif text-lg font-bold text-[#234C35]">Update Master Password</h3>
            <p className="text-xs text-[#242820]/70">
              Set a new secure password for the café management portal. It will be hashed with scrypt and saved in SQLite.
            </p>

            <form onSubmit={handlePasswordChange} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">New Password (min 8 chars) *</label>
                <input
                  type="password"
                  required
                  value={newAdminPassword}
                  onChange={(e) => setNewAdminPassword(e.target.value)}
                  placeholder="Enter new strong password"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              {passwordChangeStatus && (
                <p className="text-xs font-medium text-[#234C35] p-2 bg-emerald-50 rounded border border-emerald-200">
                  {passwordChangeStatus}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsChangePasswordOpen(false);
                    setPasswordChangeStatus(null);
                  }}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#234C35] hover:bg-[#1a3827] text-white rounded-lg font-semibold"
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 4: WHATSAPP ORDER LOG */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          <p className="text-xs text-[#242820]/75">
            Audit history of order requests initiated by customers through the website WhatsApp handoff.
          </p>

          {orders.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-xl border border-gray-200">
              <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-[#242820]">No order handoffs recorded yet</p>
              <p className="text-xs text-[#242820]/60 mt-1">
                When customers build a basket and click 'Send on WhatsApp', records appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((o) => (
                <div
                  key={o.referenceId}
                  className="p-4 bg-white rounded-xl border border-gray-200 shadow-2xs space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-[#234C35]">
                        #{o.referenceId}
                      </span>
                      <OrderStatusBadge status={o.status} orderType={o.customer.orderType} />
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-[11px] text-gray-500 font-mono">
                        {new Date(o.createdAt).toLocaleString('en-IN')}
                      </span>
                      <button
                        onClick={() => setStatusOrderRef(o.referenceId)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer transition-colors ${
                          isTerminalStatus(o.status)
                            ? 'bg-white hover:bg-gray-50 border border-gray-300 text-[#242820]'
                            : 'bg-[#234C35] hover:bg-[#1a3827] text-white shadow-xs'
                        }`}
                      >
                        Update status
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-gray-500 block">Customer</span>
                      <p className="font-semibold text-[#242820]">{o.customer.name}</p>
                      <a
                        href={`tel:${o.customer.phone}`}
                        className="text-xs font-mono text-[#234C35] hover:underline"
                      >
                        {o.customer.phone}
                      </a>
                    </div>

                    <div>
                      <span className="text-gray-500 block">Order Type</span>
                      <p className="font-semibold text-[#242820] capitalize">{o.customer.orderType}</p>
                      {o.customer.address && (
                        <p className="text-[11px] text-gray-600 line-clamp-1">{o.customer.address}</p>
                      )}
                    </div>

                    <div>
                      <span className="text-gray-500 block">Total Payable</span>
                      <p className="font-mono font-bold text-sm text-[#234C35] tabular-nums">
                        {formatINRPlain(o.totalPaise)}
                      </p>
                    </div>
                  </div>

                  <div className="bg-gray-50 p-2.5 rounded-lg text-xs space-y-1">
                    <span className="text-[10px] font-semibold uppercase text-gray-500 tracking-wider">
                      Itemized Snapshot
                    </span>
                    <div className="space-y-0.5">
                      {o.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-gray-700">
                          <span>
                            {item.quantity}x {item.product.name}
                          </span>
                          <span className="font-mono tabular-nums">
                            {formatINRPlain(item.product.pricePaise * item.quantity)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL: UPDATE ORDER STATUS */}
      {statusOrder && (
        <OrderStatusModal
          order={statusOrder}
          onClose={() => setStatusOrderRef(null)}
          onSessionExpired={(message) => {
            setStatusOrderRef(null);
            setLoginError(message);
          }}
        />
      )}

      {/* MODAL: ADD NEW DISH */}
      {isAddProductOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-2xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-200 space-y-4">
            <h3 className="font-serif text-lg font-bold text-[#234C35]">Add New Menu Dish</h3>

            <form onSubmit={handleCreateProduct} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">Dish Name *</label>
                <input
                  type="text"
                  required
                  value={newProdName}
                  onChange={(e) => setNewProdName(e.target.value)}
                  placeholder="e.g. Masala Chai Flask"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Category *</label>
                  <select
                    value={newProdCategory}
                    onChange={(e) => setNewProdCategory(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg bg-white"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold mb-1">Price (₹) *</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={newProdPriceRupees}
                    onChange={(e) => setNewProdPriceRupees(Number(e.target.value))}
                    className="w-full px-3 py-2 border rounded-lg font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Portion Info</label>
                <input
                  type="text"
                  value={newProdPortion}
                  onChange={(e) => setNewProdPortion(e.target.value)}
                  placeholder="e.g. Serves 1-2 (350ml)"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Description</label>
                <textarea
                  rows={2}
                  value={newProdDesc}
                  onChange={(e) => setNewProdDesc(e.target.value)}
                  placeholder="Appetizing description of ingredients and spices..."
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="featured-check"
                  checked={newProdFeatured}
                  onChange={(e) => setNewProdFeatured(e.target.checked)}
                  className="w-4 h-4 rounded text-[#234C35]"
                />
                <label htmlFor="featured-check" className="font-semibold text-gray-700">
                  Feature in Popular Dishes on Homepage
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setIsAddProductOpen(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#234C35] hover:bg-[#1a3827] text-white rounded-lg font-semibold"
                >
                  Save Dish
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT PRODUCT */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-2xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-200 space-y-4">
            <h3 className="font-serif text-lg font-bold text-[#234C35]">
              Edit: {editingProduct.name}
            </h3>

            <form onSubmit={handleUpdateProductSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">Dish Name</label>
                <input
                  type="text"
                  required
                  value={editingProduct.name}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, name: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Category</label>
                  <select
                    value={editingProduct.categoryId}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, categoryId: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-lg bg-white"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold mb-1">Price (₹)</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={paiseToRupees(editingProduct.pricePaise)}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        pricePaise: rupeesToPaise(Number(e.target.value)),
                      })
                    }
                    className="w-full px-3 py-2 border rounded-lg font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Portion Information</label>
                <input
                  type="text"
                  value={editingProduct.portionInfo || ''}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, portionInfo: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Description</label>
                <textarea
                  rows={3}
                  value={editingProduct.description}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, description: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="edit-featured"
                  checked={editingProduct.isFeatured}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, isFeatured: e.target.checked })
                  }
                  className="w-4 h-4 rounded text-[#234C35]"
                />
                <label htmlFor="edit-featured" className="font-semibold text-gray-700">
                  Feature in Popular Dishes on Homepage
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#234C35] hover:bg-[#1a3827] text-white rounded-lg font-semibold"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD CATEGORY */}
      {isAddCatOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-2xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-gray-200 space-y-4">
            <h3 className="font-serif text-lg font-bold text-[#234C35]">Add New Category</h3>

            <form onSubmit={handleCreateCategory} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">Category Name *</label>
                <input
                  type="text"
                  required
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="e.g. Desserts & Sweets"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Description</label>
                <textarea
                  rows={2}
                  value={newCatDesc}
                  onChange={(e) => setNewCatDesc(e.target.value)}
                  placeholder="Short summary of dishes..."
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddCatOpen(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#234C35] hover:bg-[#1a3827] text-white rounded-lg font-semibold"
                >
                  Add Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
