// frontend/src/utils/cart.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from './api';
import { logUserAction } from './activityLogger';

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
 * Maps frontend shade/accessory data dynamically to PostgreSQL variant UUID.
 * Strictly scopes matching to the target product (EvoAir vs Evo-Fills vs Evo-Bottles)
 * so refill/bottle shades never accidentally resolve to the ₹14,999 device variant.
 */
export const resolveVariantId = (item) => {
  if (!item) return null;
  if (item.variantId && typeof item.variantId === 'string' && item.variantId.length >= 30 && UUID_REGEX.test(item.variantId)) {
    return item.variantId;
  }
  if (item.variant_id && typeof item.variant_id === 'string' && item.variant_id.length >= 30 && UUID_REGEX.test(item.variant_id)) {
    return item.variant_id;
  }

  // 1. Identify target product slug
  let targetSlug = item.productSlug || item.product_slug;
  if (!targetSlug) {
    const id = String(item.id || item.productId || '').toLowerCase();
    const name = String(item.name || item.product_name || '').toLowerCase();
    if (id.startsWith('evofills') || id.includes('fill') || name.includes('evo-fills') || name.includes('refill')) {
      targetSlug = 'evo-fills';
    } else if (id.startsWith('evo-bottles') || id.includes('bottle') || name.includes('evo-bottles')) {
      targetSlug = 'evo-bottles';
    } else if (id.startsWith('evo-air') || id === 'evoair' || name.includes('evo-air') || name.includes('evoair') || item.isDevice) {
      targetSlug = 'evoair';
    }
  }

  const shade = item.shadeCode || item.shade_code;
  const formula = (item.formulaId || item.formula || '').toLowerCase();
  const sku = item.sku;

  // 2. Query in live in-memory catalog
  if (catalogCache && catalogCache.length > 0) {
    const targetProducts = targetSlug
      ? catalogCache.filter((p) => p.slug === targetSlug)
      : catalogCache;

    for (const prod of targetProducts) {
      if (!prod.variants || !prod.variants.length) continue;

      // Exact Match: SKU
      if (sku) {
        const match = prod.variants.find((v) => v.sku === sku);
        if (match) return match.id;
      }

      // Exact Match: formula AND shade_code
      if (formula && shade) {
        const match = prod.variants.find(
          (v) => v.formula?.toLowerCase() === formula && v.shade_code === shade
        );
        if (match) return match.id;
      }

      // Match: shade_code within target product
      if (shade) {
        const match = prod.variants.find((v) => v.shade_code === shade);
        if (match) return match.id;
      }

      // Accessory / Pack fallbacks
      if (prod.slug === 'evo-bottles') {
        const match = prod.variants.find((v) => v.sku?.includes('BOTTLE'));
        if (match && !shade) return match.id;
      }
      if (prod.slug === 'evo-fills') {
        const match = prod.variants.find((v) => v.sku?.includes('FILL'));
        if (match && !shade) return match.id;
      }
    }
  }

  // 3. Fallback mappings for offline / pre-catalog bootstrapping
  if (targetSlug === 'evo-fills') {
    const fndMap = {
      '02': '22222222-2222-4222-8222-000000000001',
      '03': '22222222-2222-4222-8222-000000000002',
      '06': '22222222-2222-4222-8222-000000000003',
      '07': '22222222-2222-4222-8222-000000000004',
      '10': '22222222-2222-4222-8222-000000000005',
      '11': '22222222-2222-4222-8222-000000000006',
      '14': '22222222-2222-4222-8222-000000000007',
      '15': '22222222-2222-4222-8222-000000000008',
      '18': '22222222-2222-4222-8222-000000000009',
      '19': '22222222-2222-4222-8222-000000000010',
      'B01': '22222222-2222-4222-8222-000000000011',
      'B02': '22222222-2222-4222-8222-000000000012',
      'B03': '22222222-2222-4222-8222-000000000013',
      'B04': '22222222-2222-4222-8222-000000000014',
      'B05': '22222222-2222-4222-8222-000000000015',
      'H01': '22222222-2222-4222-8222-000000000021',
      'H02': '22222222-2222-4222-8222-000000000022',
      'H03': '22222222-2222-4222-8222-000000000023',
      'H04': '22222222-2222-4222-8222-000000000024',
      'H05': '22222222-2222-4222-8222-000000000025',
    };
    if (shade && fndMap[shade]) return fndMap[shade];
    return '11111111-1111-4111-8111-000000000051';
  }

  if (targetSlug === 'evo-bottles') {
    const btlMap = {
      '02': '33333333-3333-4333-8333-000000000001',
      '03': '33333333-3333-4333-8333-000000000002',
      '06': '33333333-3333-4333-8333-000000000003',
      '07': '33333333-3333-4333-8333-000000000004',
      '10': '33333333-3333-4333-8333-000000000005',
      '11': '33333333-3333-4333-8333-000000000006',
      '14': '33333333-3333-4333-8333-000000000007',
      '15': '33333333-3333-4333-8333-000000000008',
      '18': '33333333-3333-4333-8333-000000000009',
      '19': '33333333-3333-4333-8333-000000000010',
      'B01': '33333333-3333-4333-8333-000000000011',
      'B02': '33333333-3333-4333-8333-000000000012',
      'B03': '33333333-3333-4333-8333-000000000013',
      'B04': '33333333-3333-4333-8333-000000000014',
      'B05': '33333333-3333-4333-8333-000000000015',
      'H01': '33333333-3333-4333-8333-000000000021',
      'H02': '33333333-3333-4333-8333-000000000022',
      'H03': '33333333-3333-4333-8333-000000000023',
      'H04': '33333333-3333-4333-8333-000000000024',
      'H05': '33333333-3333-4333-8333-000000000025',
    };
    if (shade && btlMap[shade]) return btlMap[shade];
    return '11111111-1111-4111-8111-000000000052';
  }

  if (targetSlug === 'evoair') {
    const devMap = {
      '02': '11111111-1111-4111-8111-000000000001',
      '03': '11111111-1111-4111-8111-000000000002',
      '06': '11111111-1111-4111-8111-000000000003',
      '07': '11111111-1111-4111-8111-000000000004',
      '10': '11111111-1111-4111-8111-000000000005',
      '11': '11111111-1111-4111-8111-000000000006',
      '14': '11111111-1111-4111-8111-000000000007',
      '15': '11111111-1111-4111-8111-000000000008',
      '18': '11111111-1111-4111-8111-000000000009',
      '19': '11111111-1111-4111-8111-000000000010',
      'B01': '11111111-1111-4111-8111-000000000011',
      'B02': '11111111-1111-4111-8111-000000000012',
      'B03': '11111111-1111-4111-8111-000000000013',
      'B04': '11111111-1111-4111-8111-000000000014',
      'B05': '11111111-1111-4111-8111-000000000015',
      'H01': '11111111-1111-4111-8111-000000000021',
      'H02': '11111111-1111-4111-8111-000000000022',
      'H03': '11111111-1111-4111-8111-000000000023',
      'H04': '11111111-1111-4111-8111-000000000024',
      'H05': '11111111-1111-4111-8111-000000000025',
    };
    if (shade && devMap[shade]) return devMap[shade];
    return '11111111-1111-4111-8111-000000000001';
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
  logUserAction('cart_add', { variantId: vId, name: newItem.name, quantity: newItem.quantity || 1 });
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
  logUserAction('cart_update_qty', { uniqueKey, delta });
  return updated;
};

export const removeFromCart = (uniqueKey) => {
  const current = getCart();
  const updated = current.filter((item) => {
    const key = `${item.id || item.variantId}-${item.shadeCode || 'default'}`;
    return key !== uniqueKey && item.variantId !== uniqueKey && item.id !== uniqueKey;
  });
  saveCart(updated);
  logUserAction('cart_remove', { uniqueKey });
  return updated;
};

export const clearCart = (isAuthenticated = false) => {
  saveCart([]);
  if (isAuthenticated) {
    api.delete('/api/v1/cart').catch(() => {});
  }
  logUserAction('cart_clear');
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
                    is_complimentary: match.is_complimentary,
                    free_quantity: match.free_quantity,
                    paid_quantity: match.paid_quantity,
                    promo_badge: match.promo_badge,
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
          setBackendError('Please retry in a few moments.');
        }
      }
    } catch (e) {
      console.warn('Backend server is offline or unreachable:', e);
      setIsBackendOffline(true);
      setBackendError('Please retry in a few moments.');
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
      setBackendError('Please retry in a few moments.');
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
