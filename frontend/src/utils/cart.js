// frontend/src/utils/cart.js
import { useState, useEffect, useCallback } from 'react';
import { api } from './api';

const PRIMARY_CART_KEY = 'evoair_cart';
const LEGACY_CART_KEY = 'evoluir_cart';
const CART_EVENT = 'evoair_cart_updated';

// Dynamic in-memory catalog cache loaded from GET /api/v1/catalog/products
let catalogCache = null;
let catalogPromise = null;

export const loadCatalog = async () => {
  if (catalogCache) return catalogCache;
  if (!catalogPromise) {
    catalogPromise = (async () => {
      try {
        const res = await api.get('/api/v1/catalog/products');
        if (res.ok) {
          const json = await res.json();
          catalogCache = json?.data?.products || [];
          return catalogCache;
        }
        return [];
      } catch (e) {
        console.warn('Could not load live catalog products:', e);
        return [];
      } finally {
        catalogPromise = null;
      }
    })();
  }
  return catalogPromise;
};

// Eagerly trigger catalog fetch on module load
if (typeof window !== 'undefined') {
  loadCatalog();
}

/**
 * Maps frontend shade/accessory data dynamically to PostgreSQL variant UUID
 */
export const resolveVariantId = (item) => {
  if (item.variantId && typeof item.variantId === 'string' && item.variantId.length >= 30) {
    return item.variantId;
  }
  if (item.variant_id && typeof item.variant_id === 'string' && item.variant_id.length >= 30) {
    return item.variant_id;
  }

  // Look up in live catalog if loaded
  if (catalogCache && catalogCache.length > 0) {
    for (const prod of catalogCache) {
      if (!prod.variants) continue;
      for (const v of prod.variants) {
        if (item.shadeCode && v.shade_code === item.shadeCode) return v.id;
        if (item.shadeName && v.shade_name?.toLowerCase() === item.shadeName?.toLowerCase()) return v.id;
        if (item.sku && v.sku === item.sku) return v.id;
        if (item.id === 'evofills' && v.sku?.includes('FILL')) return v.id;
        if (item.id === 'evo-bottles-empty-pack' && v.sku?.includes('BOTTLE')) return v.id;
      }
    }
  }

  return item.variantId || item.variant_id || null;
};

export const getCart = () => {
  try {
    let raw = localStorage.getItem(PRIMARY_CART_KEY);
    if (!raw) {
      // Migrate from legacy key if present
      raw = localStorage.getItem(LEGACY_CART_KEY);
      if (raw) {
        localStorage.setItem(PRIMARY_CART_KEY, raw);
        localStorage.removeItem(LEGACY_CART_KEY);
      }
    }
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Error reading cart from localStorage', e);
    return [];
  }
};

export const saveCart = (items) => {
  try {
    localStorage.setItem(PRIMARY_CART_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event(CART_EVENT));
  } catch (e) {
    console.error('Error saving cart to localStorage', e);
  }
};

export const addToCart = (newItem) => {
  const current = getCart();
  const vId = resolveVariantId(newItem);
  const enrichedItem = { ...newItem, variantId: vId };

  const existingIndex = current.findIndex(
    (item) =>
      resolveVariantId(item) === vId &&
      (item.shadeCode || 'default') === (newItem.shadeCode || 'default')
  );

  let updated;
  if (existingIndex > -1) {
    updated = current.map((item, index) => {
      if (index === existingIndex) {
        return { ...item, quantity: Math.min(10, (item.quantity || 1) + (newItem.quantity || 1)) };
      }
      return item;
    });
  } else {
    updated = [...current, { ...enrichedItem, quantity: Math.min(10, newItem.quantity || 1) }];
  }

  saveCart(updated);
  return updated;
};

export const updateQuantity = (uniqueKey, delta) => {
  const current = getCart();
  const updated = current
    .map((item) => {
      const key = `${item.id || item.variantId}-${item.shadeCode || 'default'}`;
      if (key === uniqueKey) {
        const newQty = item.quantity + delta;
        return newQty > 0 ? { ...item, quantity: Math.min(10, newQty) } : null;
      }
      return item;
    })
    .filter(Boolean);

  saveCart(updated);
  return updated;
};

export const removeFromCart = (uniqueKey) => {
  const current = getCart();
  const updated = current.filter((item) => {
    const key = `${item.id || item.variantId}-${item.shadeCode || 'default'}`;
    return key !== uniqueKey;
  });
  saveCart(updated);
  return updated;
};

export const clearCart = (isAuthenticated = false) => {
  saveCart([]);
  if (isAuthenticated) {
    api.delete('/api/v1/cart').catch(() => {});
  }
  window.dispatchEvent(new Event(CART_EVENT));
};

/**
 * Synchronizes local guest items with PostgreSQL server cart upon authentication.
 * On success, clears localStorage cart as server cart becomes source of truth.
 */
export const syncCartWithBackend = async () => {
  const localItems = getCart();
  if (!localItems.length) {
    // No local items, just fetch existing server cart
    const res = await api.get('/api/v1/cart');
    if (res.ok) {
      const data = await res.json();
      return data?.data?.cart || null;
    }
    return null;
  }

  // Deduplicate and format items for POST /api/v1/cart/sync
  const variantMap = new Map();
  for (const item of localItems) {
    const vId = resolveVariantId(item);
    if (!vId) continue; // Safely skip unknown or invalid variant IDs
    const qty = Math.min(10, Math.max(1, item.quantity || 1));
    const existing = variantMap.get(vId) || 0;
    variantMap.set(vId, Math.min(10, existing + qty));
  }

  const payload = {
    items: Array.from(variantMap.entries()).map(([variantId, quantity]) => ({
      variantId,
      quantity,
    })),
  };

  const res = await api.post('/api/v1/cart/sync', payload);
  if (res.ok) {
    const data = await res.json();
    // Clear guest cart in localStorage now that server holds it
    localStorage.removeItem(PRIMARY_CART_KEY);
    localStorage.removeItem(LEGACY_CART_KEY);
    window.dispatchEvent(new Event(CART_EVENT));
    return data?.data?.cart || null;
  }

  return null;
};

export const useCart = (isAuthenticated = false) => {
  const [items, setItems] = useState(getCart);
  const [serverCart, setServerCart] = useState(null);
  const [isServerCart, setIsServerCart] = useState(false);
  const [loadingCart, setLoadingCart] = useState(false);

  // Fetch or sync server cart if authenticated
  const loadServerCart = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoadingCart(true);
    try {
      const local = getCart();
      let cartData = null;
      if (local.length > 0) {
        cartData = await syncCartWithBackend();
      } else {
        const res = await api.get('/api/v1/cart');
        if (res.ok) {
          const json = await res.json();
          cartData = json?.data?.cart;
        }
      }

      if (cartData) {
        setServerCart(cartData);
        setIsServerCart(true);
      }
    } catch (e) {
      console.error('Failed to load server cart:', e);
    } finally {
      setLoadingCart(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      loadServerCart();
    } else {
      setIsServerCart(false);
      setServerCart(null);
      setItems(getCart());
    }
  }, [isAuthenticated, loadServerCart]);

  useEffect(() => {
    const handleUpdate = () => {
      setItems(getCart());
      if (isAuthenticated) {
        loadServerCart();
      }
    };

    window.addEventListener(CART_EVENT, handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener(CART_EVENT, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [isServerCart]);

  // If serverCart is active, use server items; otherwise use local items
  const activeItems = isServerCart && serverCart?.items ? serverCart.items : items;

  const totalCount = isServerCart
    ? serverCart?.total_count || 0
    : activeItems.reduce((sum, item) => sum + (item.quantity || 1), 0);

  const subtotalPaise = isServerCart
    ? serverCart?.total_paise || 0
    : activeItems.reduce((sum, item) => sum + (item.numericPrice || 0) * 100 * (item.quantity || 1), 0);

  const handleClearCart = useCallback(async () => {
    saveCart([]);
    setItems([]);
    setServerCart({ items: [], total_count: 0, total_paise: 0 });
    if (isAuthenticated) {
      try {
        await api.delete('/api/v1/cart');
      } catch (e) {
        console.error('Failed to clear server cart:', e);
      }
    }
    window.dispatchEvent(new Event(CART_EVENT));
  }, [isAuthenticated]);

  return {
    items: activeItems,
    serverCart,
    isServerCart,
    loadingCart,
    totalCount,
    subtotal: subtotalPaise / 100,
    subtotalPaise,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart: handleClearCart,
    reloadCart: loadServerCart,
  };
};

export default useCart;
