import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  Category,
  Product,
  StoreSettings,
  CartItem,
  OrderSubmission,
  CustomerDetails,
} from '../types/cafe';
import { initialSettings, initialCategories, initialProducts } from '../data/initialData';
import type { OrderStatus } from '../utils/orderStatus';
import {
  addToCart as helperAddToCart,
  removeFromCart as helperRemoveFromCart,
  updateCartQuantity as helperUpdateCartQuantity,
  calculateCartSubtotalPaise,
  calculateCartItemCount,
  calculateDeliveryFeePaise,
} from '../utils/cart';

interface CafeContextType {
  settings: StoreSettings;
  categories: Category[];
  products: Product[];
  cart: CartItem[];
  orders: OrderSubmission[];
  cartSubtotalPaise: number;
  cartItemCount: number;
  deliveryFeePaise: number;
  cartTotalPaise: number;
  activeOrderType: 'delivery' | 'pickup';
  setActiveOrderType: (type: 'delivery' | 'pickup') => void;
  
  // Cart Actions
  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;

  // Server-Side Order Submission
  submitOrderToServer: (customer: CustomerDetails) => Promise<{
    success: boolean;
    error?: string;
    order?: OrderSubmission & { whatsappUrl: string; whatsappMessage: string };
  }>;

  // CMS Admin Actions
  updateSettings: (newSettings: Partial<StoreSettings>) => Promise<boolean>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<boolean>;
  toggleProductAvailability: (id: string) => Promise<boolean>;
  addProduct: (product: Omit<Product, 'id' | 'slug'>) => Promise<boolean>;
  deleteProduct: (id: string) => Promise<boolean>;
  updateCategory: (id: string, updates: Partial<Category>) => Promise<boolean>;
  addCategory: (category: Omit<Category, 'id' | 'slug'>) => Promise<boolean>;

  // Admin Auth
  adminToken: string | null;
  isAdminAuthenticated: boolean;
  adminLogin: (password: string, username?: string) => Promise<{ success: boolean; error?: string }>;
  adminLogout: () => void;
  changeAdminPassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
  refreshAdminOrders: () => Promise<void>;
  updateOrderStatus: (
    referenceId: string,
    status: OrderStatus
  ) => Promise<{ success: boolean; error?: string; sessionExpired?: boolean }>;
}

const CafeContext = createContext<CafeContextType | undefined>(undefined);

const CART_KEY = 'natkhat_cart_v2';
const TOKEN_KEY = 'natkhat_admin_token_v2';

export const CafeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<StoreSettings>(initialSettings);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [orders, setOrders] = useState<OrderSubmission[]>([]);

  const [adminToken, setAdminToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  });

  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(CART_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [activeOrderType, setActiveOrderType] = useState<'delivery' | 'pickup'>('delivery');

  // Load Initial Data from Server API
  const refreshServerData = useCallback(async () => {
    try {
      const [settingsRes, catsRes, prodsRes] = await Promise.all([
        fetch('/api/settings'),
        fetch('/api/categories'),
        fetch('/api/products'),
      ]);

      if (settingsRes.ok) {
        const s = await settingsRes.json();
        setSettings((prev) => ({ ...prev, ...s }));
      }
      if (catsRes.ok) {
        const c = await catsRes.json();
        if (Array.isArray(c) && c.length > 0) setCategories(c);
      }
      if (prodsRes.ok) {
        const p = await prodsRes.json();
        if (Array.isArray(p) && p.length > 0) setProducts(p);
      }
    } catch (e) {
      console.warn('Backend API connection fallback to local cache:', e);
    }
  }, []);

  useEffect(() => {
    refreshServerData();
  }, [refreshServerData]);

  // Sync Cart to LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch (e) {
      console.error('Failed to save cart to localStorage', e);
    }
  }, [cart]);

  // Derived calculations
  const cartSubtotalPaise = calculateCartSubtotalPaise(cart);
  const cartItemCount = calculateCartItemCount(cart);
  const deliveryFeePaise = calculateDeliveryFeePaise(
    cartSubtotalPaise,
    activeOrderType,
    settings.deliveryFeePaise,
    settings.freeDeliveryThresholdPaise
  );
  const cartTotalPaise = cartSubtotalPaise + deliveryFeePaise;

  // Cart operations
  const addToCart = (product: Product, quantity = 1) => {
    setCart((prev) => helperAddToCart(prev, product, quantity));
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => helperRemoveFromCart(prev, productId));
  };

  const updateCartQuantity = (productId: string, quantity: number) => {
    setCart((prev) => helperUpdateCartQuantity(prev, productId, quantity));
  };

  const clearCart = () => {
    setCart([]);
  };

  // SERVER-SIDE ORDER SUBMISSION & PRICE VALIDATION
  const submitOrderToServer = async (customer: CustomerDetails) => {
    try {
      const payload = {
        customer,
        items: cart.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
        })),
      };

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to validate order on server' };
      }

      return { success: true, order: data };
    } catch (err: any) {
      return { success: false, error: 'Network connection error while submitting order' };
    }
  };

  // ADMIN OPERATIONS
  const getAuthHeader = (): Record<string, string> => {
    return adminToken ? { Authorization: `Bearer ${adminToken}` } : {};
  };

  const refreshAdminOrders = useCallback(async () => {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/orders', {
        headers: { ...getAuthHeader() },
      });
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
      }
    } catch (e) {
      console.error('Failed to fetch admin orders', e);
    }
  }, [adminToken]);

  useEffect(() => {
    if (adminToken) {
      refreshAdminOrders();
    }
  }, [adminToken, refreshAdminOrders]);

  const updateOrderStatus = async (referenceId: string, status: OrderStatus) => {
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(referenceId)}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({ status }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        // The session ended (for example the local dev server restarted): go back to the sign-in screen.
        adminLogout();
        return { success: false, sessionExpired: true, error: 'Your session has expired. Please sign in again.' };
      }
      if (!res.ok) {
        // The order may have changed since the list was loaded; reload so the next options are correct.
        await refreshAdminOrders();
        return { success: false, error: data.error || 'Failed to update order status' };
      }

      setOrders((prev) => prev.map((o) => (o.referenceId === referenceId ? { ...o, status } : o)));
      await refreshAdminOrders();
      return { success: true };
    } catch {
      return { success: false, error: 'Network error. Please try again.' };
    }
  };

  const adminLogin = async (password: string, username = 'admin') => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Invalid credentials' };
      }

      setAdminToken(data.token);
      localStorage.setItem(TOKEN_KEY, data.token);
      return { success: true };
    } catch {
      return { success: false, error: 'Network error connecting to authentication server' };
    }
  };

  const adminLogout = () => {
    setAdminToken(null);
    localStorage.removeItem(TOKEN_KEY);
    setOrders([]);
  };

  const changeAdminPassword = async (newPassword: string) => {
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({ newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to update password' };
      }
      return { success: true };
    } catch {
      return { success: false, error: 'Network error' };
    }
  };

  const updateSettings = async (newSettings: Partial<StoreSettings>) => {
    try {
      const updated = { ...settings, ...newSettings };
      setSettings(updated);

      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify(newSettings),
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  const toggleProductAvailability = async (id: string) => {
    // Optimistic UI update
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, isAvailable: !p.isAvailable } : p))
    );

    try {
      const res = await fetch(`/api/products/${id}/availability`, {
        method: 'PATCH',
        headers: { ...getAuthHeader() },
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  const updateProduct = async (id: string, updates: Partial<Product>) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
    );

    try {
      const res = await fetch(`/api/products/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify(updates),
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  const addProduct = async (productData: Omit<Product, 'id' | 'slug'>) => {
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify(productData),
      });

      if (res.ok) {
        await refreshServerData();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const deleteProduct = async (id: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== id));
    removeFromCart(id);

    try {
      const res = await fetch(`/api/products/${id}`, {
        method: 'DELETE',
        headers: { ...getAuthHeader() },
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  const updateCategory = async (id: string, updates: Partial<Category>) => {
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );

    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify(updates),
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  const addCategory = async (categoryData: Omit<Category, 'id' | 'slug'>) => {
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify(categoryData),
      });

      if (res.ok) {
        await refreshServerData();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  return (
    <CafeContext.Provider
      value={{
        settings,
        categories,
        products,
        cart,
        orders,
        cartSubtotalPaise,
        cartItemCount,
        deliveryFeePaise,
        cartTotalPaise,
        activeOrderType,
        setActiveOrderType,
        addToCart,
        removeFromCart,
        updateCartQuantity,
        clearCart,
        submitOrderToServer,
        updateSettings,
        updateProduct,
        toggleProductAvailability,
        addProduct,
        deleteProduct,
        updateCategory,
        addCategory,
        adminToken,
        isAdminAuthenticated: !!adminToken,
        adminLogin,
        adminLogout,
        changeAdminPassword,
        refreshAdminOrders,
        updateOrderStatus,
      }}
    >
      {children}
    </CafeContext.Provider>
  );
};

export const useCafe = () => {
  const context = useContext(CafeContext);
  if (!context) {
    throw new Error('useCafe must be used within a CafeProvider');
  }
  return context;
};
