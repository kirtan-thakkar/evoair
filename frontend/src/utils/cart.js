// frontend/src/utils/cart.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from './api';

const PRIMARY_CART_KEY = 'evoair_cart';
const LEGACY_CART_KEY = 'evoluir_cart';
const CART_EVENT = 'evoair_cart_updated';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  if (!item) return null;
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
        if (item.shade_code && v.shade_code === item.shade_code) return v.id;
        if (item.shadeName && v.shade_name?.toLowerCase() === item.shadeName?.toLowerCase()) return v.id;
        if (item.shade_name && v.shade_name?.toLowerCase() === item.shade_name?.toLowerCase()) return v.id;
        if (item.sku && v.sku === item.sku) return v.id;
        if (item.id === 'evofills' && v.sku?.includes('FILL')) return v.id;
        if (item.id === 'evo-bottles-empty-pack' && v.sku?.includes('BOTTLE')) return v.id;
        if (item.id === 'evoair' && v.shade_code === (item.shadeCode || item.shade_code || '02')) return v.id;
      }
    }
  }

  return item.variantId || item.variant_id || (UUID_REGEX.test(item.id) ? item.id : null);
};

export const getCart = () => {
  try {
    let raw = localStorage.getItem(PRIMARY_CART_KEY);
    if (!raw) {
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
      (item.shadeCode || item.shade_code || 'default') === (newItem.shadeCode || newItem.shade_code || 'default')
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
        const newQty = (item.quantity || 1) + delta;
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
    return key !== uniqueKey && item.variantId !== uniqueKey && item.id !== uniqueKey;
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
 */
export const syncCartWithBackend = async () => {
  const localItems = getCart();
  if (!localItems.length) {
    const res = await api.get('/api/v1/cart');
    if (res.ok) {
      const data = await res.json();
      return data?.data?.cart || null;
    }
    return null;
  }

  const variantMap = new Map();
  for (const item of localItems) {
    const vId = resolveVariantId(item);
    if (!vId) continue;
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
    localStorage.removeItem(PRIMARY_CART_KEY);
    localStorage.removeItem(LEGACY_CART_KEY);
    window.dispatchEvent(new Event(CART_EVENT));
    return data?.data?.cart || null;
  }

  return null;
};

export const useCart = (isAuthenticated = false, authReady = true) => {
  const [items, setItems] = useState([]);
  const [serverCart, setServerCart] = useState(null);
  const [isServerCart, setIsServerCart] = useState(false);
  const [loadingCart, setLoadingCart] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [mutatingItemId, setMutatingItemId] = useState(null);
  const [guestPricing, setGuestPricing] = useState(null);
  const [isBackendOffline, setIsBackendOffline] = useState(false);
  const [backendError, setBackendError] = useState(null);

  const retryTimeoutRef = useRef(null);

  // Helper to fetch server-side pricing for guest cart
  const fetchGuestPricing = useCallback(async (guestItems) => {
    if (!guestItems || guestItems.length === 0) {
      setGuestPricing({
        subtotal_paise: 0,
        subtotal_rupees: 0,
        shipping_fee_paise: 0,
        shipping_fee_rupees: 0,
        customs_and_taxes: 'Included',
        tax_paise: 0,
        total_paise: 0,
        total_rupees: 0,
        currency: 'INR',
        currency_symbol: '₹',
        formatted: {
          subtotal: '₹0',
          shipping: '₹0',
          customs_and_taxes: 'Included',
          total: '₹0',
        },
      });
      setIsBackendOffline(false);
      setBackendError(null);
      return;
    }

    try {
      const payload = {
        items: guestItems.map((item) => ({
          variantId: resolveVariantId(item),
          id: item.id,
          sku: item.sku,
          shadeCode: item.shadeCode || item.shade_code,
          quantity: item.quantity || 1,
        })),
      };

      const res = await api.post('/api/v1/cart/calculate', payload);
      if (res.ok) {
        const json = await res.json();
        const data = json?.data;
        if (data?.pricing) {
          setGuestPricing(data.pricing);
          setIsBackendOffline(false);
          setBackendError(null);
          // Enrich local items with server prices
          if (Array.isArray(data.items) && data.items.length > 0) {
            setItems((prev) =>
              prev.map((it) => {
                const match = data.items.find(
                  (ci) =>
                    ci.variant_id === it.variantId ||
                    ci.id === it.id ||
                    (ci.shade_code && ci.shade_code === (it.shadeCode || it.shade_code))
                );
                if (match) {
                  return {
                    ...it,
                    price_paise: match.price_paise,
                    line_total_paise: match.line_total_paise,
                    formatted_price: match.formatted_price,
                    formatted_line_total: match.formatted_line_total,
                  };
                }
                return it;
              })
            );
          }
        }
      } else {
        if (res.status >= 500) {
          setIsBackendOffline(true);
          setBackendError('Backend pricing engine unavailable');
        }
      }
    } catch (e) {
      console.warn('Backend server is offline or unreachable:', e);
      setIsBackendOffline(true);
      setBackendError('Unable to connect to Evoluir server');
    }
  }, []);

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
        } else if (res.status >= 500) {
          throw new Error('Backend server returned internal error');
        }
      }

      if (cartData) {
        setServerCart(cartData);
        setIsServerCart(true);
        setIsBackendOffline(false);
        setBackendError(null);
      }
    } catch (e) {
      console.warn('Failed to load server cart from backend:', e);
      setIsBackendOffline(true);
      setBackendError('Evoluir backend server is offline or unreachable');
      // Do NOT fall back to stale browser history / localStorage items
      setIsServerCart(false);
      setServerCart(null);
    } finally {
      setLoadingCart(false);
    }
  }, [isAuthenticated]);

  // Primary loader triggered when auth status is known
  useEffect(() => {
    if (!authReady) {
      setLoadingCart(true);
      return;
    }

    if (isAuthenticated) {
      loadServerCart();
    } else {
      setIsServerCart(false);
      setServerCart(null);
      const local = getCart();
      setItems(local);
      setLoadingCart(true);
      fetchGuestPricing(local).finally(() => setLoadingCart(false));
    }
  }, [authReady, isAuthenticated, loadServerCart, fetchGuestPricing]);

  // Prevent stale data from browser history (bfcache) or hidden tab restores
  useEffect(() => {
    const handlePageShow = (event) => {
      // event.persisted is true when restored from bfcache / browser back-forward history
      if (event.persisted) {
        if (isAuthenticated) {
          loadServerCart();
        } else {
          const local = getCart();
          setItems(local);
          fetchGuestPricing(local);
        }
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (isAuthenticated) {
          loadServerCart();
        } else {
          const local = getCart();
          setItems(local);
          fetchGuestPricing(local);
        }
      }
    };

    const handleStorage = () => {
      if (!isAuthenticated) {
        const local = getCart();
        setItems(local);
        fetchGuestPricing(local);
      }
    };

    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener(CART_EVENT, handleStorage);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener(CART_EVENT, handleStorage);
      window.removeEventListener('storage', handleStorage);
    };
  }, [isAuthenticated, loadServerCart, fetchGuestPricing]);

  // Auto-reconnect polling when backend is offline
  useEffect(() => {
    if (!isBackendOffline) {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      return;
    }

    const pollHealth = async () => {
      try {
        const res = await fetch('/health', { cache: 'no-store' });
        if (res.ok) {
          setIsBackendOffline(false);
          setBackendError(null);
          if (isAuthenticated) {
            loadServerCart();
          } else {
            fetchGuestPricing(getCart());
          }
          return;
        }
      } catch {
        // Still offline, schedule next poll
      }
      retryTimeoutRef.current = setTimeout(pollHealth, 3500);
    };

    retryTimeoutRef.current = setTimeout(pollHealth, 3500);

    return () => {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, [isBackendOffline, isAuthenticated, loadServerCart, fetchGuestPricing]);

  // Active items: strictly server items when authenticated; local items only for unauthenticated guests
  const activeItems = isAuthenticated
    ? (isServerCart && serverCart?.items ? serverCart.items : [])
    : items;

  // Active pricing object calculated exclusively by backend PostgreSQL
  const activePricing = isServerCart && serverCart?.pricing
    ? serverCart.pricing
    : guestPricing || {
        subtotal_paise: 0,
        subtotal_rupees: 0,
        shipping_fee_paise: 0,
        shipping_fee_rupees: 0,
        customs_and_taxes: 'Included',
        tax_paise: 0,
        total_paise: 0,
        total_rupees: 0,
        currency: 'INR',
        currency_symbol: '₹',
        formatted: {
          subtotal: '₹0',
          shipping: '₹0',
          customs_and_taxes: 'Included',
          total: '₹0',
        },
      };

  const totalCount = isServerCart
    ? serverCart?.total_count || 0
    : activeItems.reduce((sum, item) => sum + (item.quantity || 1), 0);

  // Helper to extract variant or item identifier
  const resolveTargetId = (itemOrKey) => {
    if (!itemOrKey) return null;
    if (typeof itemOrKey === 'object') {
      return itemOrKey.variant_id || itemOrKey.variantId || resolveVariantId(itemOrKey) || itemOrKey.id;
    }
    if (typeof itemOrKey === 'string') {
      if (UUID_REGEX.test(itemOrKey)) return itemOrKey;
      if (itemOrKey.includes('-')) {
        const parts = itemOrKey.split('-');
        if (parts.length >= 5) {
          const cand = parts.slice(0, 5).join('-');
          if (UUID_REGEX.test(cand)) return cand;
        }
      }
      const match = activeItems.find(
        (it) =>
          it.id === itemOrKey ||
          it.variant_id === itemOrKey ||
          `${it.id || it.variant_id || it.variantId}-${it.shadeCode || it.shade_code || 'default'}` === itemOrKey
      );
      if (match) {
        return match.variant_id || match.variantId || resolveVariantId(match) || match.id;
      }
      return itemOrKey;
    }
    return null;
  };

  // Connected Reactive Remove Item
  const handleRemoveFromCart = useCallback(
    async (itemOrKey) => {
      const targetId = resolveTargetId(itemOrKey);
      const loadingKey = targetId || (typeof itemOrKey === 'string' ? itemOrKey : itemOrKey?.id);
      setMutatingItemId(loadingKey);
      setIsMutating(true);

      try {
        if (isAuthenticated && targetId) {
          const res = await api.delete(`/api/v1/cart/${targetId}`);
          if (res.ok) {
            const json = await res.json();
            const updated = json?.data?.cart;
            if (updated) {
              setServerCart(updated);
              setIsBackendOffline(false);
            }
          }
          // Also clean localStorage in case any legacy key remained
          const local = getCart();
          const filtered = local.filter((item) => {
            const key = `${item.id || item.variantId}-${item.shadeCode || 'default'}`;
            return item.variantId !== targetId && item.id !== targetId && key !== itemOrKey;
          });
          saveCart(filtered);
        } else {
          // Guest removal
          const local = getCart();
          const filtered = local.filter((item) => {
            const key = `${item.id || item.variantId}-${item.shadeCode || 'default'}`;
            return (
              item.variantId !== targetId &&
              item.id !== targetId &&
              item.id !== itemOrKey &&
              key !== itemOrKey
            );
          });
          saveCart(filtered);
          setItems(filtered);
          await fetchGuestPricing(filtered);
        }
      } catch (err) {
        console.error('Failed to remove cart item:', err);
      } finally {
        setMutatingItemId(null);
        setIsMutating(false);
        window.dispatchEvent(new Event(CART_EVENT));
      }
    },
    [isAuthenticated, activeItems, fetchGuestPricing]
  );

  // Connected Reactive Update Quantity
  const handleUpdateQuantity = useCallback(
    async (itemOrKey, delta) => {
      const targetId = resolveTargetId(itemOrKey);
      const targetItem = activeItems.find(
        (it) =>
          it.variant_id === targetId ||
          it.id === targetId ||
          it === itemOrKey ||
          `${it.id || it.variant_id || it.variantId}-${it.shadeCode || it.shade_code || 'default'}` === itemOrKey
      );

      const currentQty = targetItem?.quantity || 1;
      const newQty = Math.max(0, Math.min(10, currentQty + delta));
      const loadingKey = targetId || (typeof itemOrKey === 'string' ? itemOrKey : itemOrKey?.id);

      setMutatingItemId(loadingKey);
      setIsMutating(true);

      try {
        if (isAuthenticated && targetId) {
          if (newQty <= 0) {
            const res = await api.delete(`/api/v1/cart/${targetId}`);
            if (res.ok) {
              const json = await res.json();
              if (json?.data?.cart) setServerCart(json.data.cart);
            }
          } else {
            const res = await api.put('/api/v1/cart', {
              variantId: targetId,
              quantity: newQty,
            });
            if (res.ok) {
              const json = await res.json();
              if (json?.data?.cart) setServerCart(json.data.cart);
            }
          }
        } else {
          // Guest quantity change
          const local = getCart();
          const updated = local
            .map((item) => {
              const key = `${item.id || item.variantId}-${item.shadeCode || 'default'}`;
              if (item.variantId === targetId || item.id === targetId || key === itemOrKey) {
                return newQty > 0 ? { ...item, quantity: newQty } : null;
              }
              return item;
            })
            .filter(Boolean);
          saveCart(updated);
          setItems(updated);
          await fetchGuestPricing(updated);
        }
      } catch (err) {
        console.error('Failed to update cart quantity:', err);
      } finally {
        setMutatingItemId(null);
        setIsMutating(false);
        window.dispatchEvent(new Event(CART_EVENT));
      }
    },
    [isAuthenticated, activeItems, fetchGuestPricing]
  );

  // Connected Reactive Add to Cart
  const handleAddToCart = useCallback(
    async (newItem) => {
      setIsMutating(true);
      try {
        if (isAuthenticated) {
          const vId = resolveVariantId(newItem);
          if (vId) {
            const existing = activeItems.find((it) => it.variant_id === vId || it.id === vId);
            const qty = Math.min(10, (existing?.quantity || 0) + (newItem.quantity || 1));
            const res = await api.put('/api/v1/cart', {
              variantId: vId,
              quantity: qty,
            });
            if (res.ok) {
              const json = await res.json();
              if (json?.data?.cart) setServerCart(json.data.cart);
            }
          }
        } else {
          const updated = addToCart(newItem);
          setItems(updated);
          await fetchGuestPricing(updated);
        }
      } catch (err) {
        console.error('Failed to add to cart:', err);
      } finally {
        setIsMutating(false);
        window.dispatchEvent(new Event(CART_EVENT));
      }
    },
    [isAuthenticated, activeItems, fetchGuestPricing]
  );

  const handleClearCart = useCallback(async () => {
    setIsMutating(true);
    saveCart([]);
    setItems([]);
    setServerCart({
      items: [],
      total_count: 0,
      total_paise: 0,
      pricing: {
        subtotal_paise: 0,
        subtotal_rupees: 0,
        shipping_fee_paise: 0,
        shipping_fee_rupees: 0,
        customs_and_taxes: 'Included',
        tax_paise: 0,
        total_paise: 0,
        total_rupees: 0,
        formatted: {
          subtotal: '₹0',
          shipping: '₹0',
          customs_and_taxes: 'Included',
          total: '₹0',
        },
      },
    });
    if (isAuthenticated) {
      try {
        await api.delete('/api/v1/cart');
      } catch (e) {
        console.error('Failed to clear server cart:', e);
      }
    }
    setIsMutating(false);
    window.dispatchEvent(new Event(CART_EVENT));
  }, [isAuthenticated]);

  const handleRetryConnection = useCallback(() => {
    setIsBackendOffline(false);
    setLoadingCart(true);
    if (isAuthenticated) {
      loadServerCart();
    } else {
      fetchGuestPricing(getCart()).finally(() => setLoadingCart(false));
    }
  }, [isAuthenticated, loadServerCart, fetchGuestPricing]);

  return {
    items: activeItems,
    serverCart,
    isServerCart,
    loadingCart,
    isMutating,
    mutatingItemId,
    isBackendOffline,
    backendError,
    retryConnection: handleRetryConnection,
    totalCount,
    pricing: activePricing,
    subtotal: activePricing.subtotal_rupees,
    subtotalPaise: activePricing.subtotal_paise,
    shippingFee: activePricing.shipping_fee_rupees,
    finalTotal: activePricing.total_rupees,
    formattedPricing: activePricing.formatted,
    addToCart: handleAddToCart,
    updateQuantity: handleUpdateQuantity,
    removeFromCart: handleRemoveFromCart,
    clearCart: handleClearCart,
    reloadCart: loadServerCart,
  };
};

export default useCart;
