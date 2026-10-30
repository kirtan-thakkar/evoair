import React, { useEffect, useState, useRef, useCallback } from 'react';
import Layout from './Layout';
import MagneticButton from './MagneticButton';
import newLogo from '../assets/new-logo.png';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../utils/cart';
import { apiFetch } from '../utils/api';
import { AuthNavButton, AuthModal } from './AuthModal';
import './CheckoutPage.css';

const formatCurrency = (val) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(val);
};

const CheckoutPage = () => {
  const { user, isAuthenticated, authReady } = useAuth();
  const {
    items,
    serverCart,
    isServerCart,
    loadingCart,
    isBackendOffline,
    backendError,
    retryConnection,
    pricing,
    subtotal,
    shippingFee,
    finalTotal,
    formattedPricing,
    clearCart,
    reloadCart,
  } = useCart(isAuthenticated, authReady);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [orderComplete, setOrderComplete] = useState(null);

  // Shipping Address Form State
  const [shippingAddress, setShippingAddress] = useState({
    name: '',
    phone: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    pincode: '',
  });

  // Pre-fill user information when available
  useEffect(() => {
    if (user) {
      setShippingAddress((prev) => ({
        ...prev,
        name: prev.name || user.name || '',
        phone: prev.phone || user.phone || '',
      }));
    }
  }, [user]);

  // Stable Idempotency-Key Lifecycle
  const idempotencyKeyRef = useRef(null);
  const addressFingerprintRef = useRef('');
  const cartFingerprintRef = useRef('');

  const getOrCreateIdempotencyKey = useCallback(() => {
    const currentAddrFingerprint = JSON.stringify(shippingAddress);
    const cartItemsList = serverCart?.items || items;
    const currentCartFingerprint = JSON.stringify(
      cartItemsList.map((i) => `${i.variant_id || i.variantId}-${i.quantity}`)
    );

    if (
      !idempotencyKeyRef.current ||
      addressFingerprintRef.current !== currentAddrFingerprint ||
      cartFingerprintRef.current !== currentCartFingerprint
    ) {
      idempotencyKeyRef.current = `ord-${crypto.randomUUID()}`;
      addressFingerprintRef.current = currentAddrFingerprint;
      cartFingerprintRef.current = currentCartFingerprint;
    }

    return idempotencyKeyRef.current;
  }, [shippingAddress, serverCart, items]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Route Protection: /checkout is strictly for signed-in users. Redirect guests to home.
  useEffect(() => {
    if (authReady && !isAuthenticated) {
      window.location.replace('/');
    }
  }, [authReady, isAuthenticated]);

  // Compute order items list with server pricing calculations
  const displayItems = serverCart?.items?.length ? serverCart.items : items;
  const itemsSubtotalRupees = pricing?.subtotal_rupees ?? Math.round(subtotal);
  const shippingFeeRupees = pricing?.shipping_fee_rupees ?? (itemsSubtotalRupees > 0 ? 150 : 0);
  const totalAmountRupees = pricing?.total_rupees ?? (itemsSubtotalRupees + shippingFeeRupees);

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    setOrderError('');

    if (!authReady) return;
    if (!isAuthenticated) {
      setAuthModalOpen(true);
      return;
    }

    setSubmitting(true);

    try {
      if (!shippingAddress.name.trim() || shippingAddress.name.trim().length < 2) {
        throw new Error('Full recipient name is required (at least 2 characters)');
      }

      const rawPhone = shippingAddress.phone.replace(/^(?:\+91|91|0)/, '').trim();
      if (!/^[6-9]\d{9}$/.test(rawPhone)) {
        throw new Error('Valid 10-digit Indian mobile number is required (starts with 6, 7, 8, or 9)');
      }

      if (!shippingAddress.line1.trim() || shippingAddress.line1.trim().length < 5) {
        throw new Error('Address Line 1 is required (house/flat no, street, locality)');
      }

      if (!shippingAddress.city.trim() || !shippingAddress.state.trim()) {
        throw new Error('City and State are required');
      }

      if (!/^[1-9][0-9]{5}$/.test(shippingAddress.pincode.trim())) {
        throw new Error('Valid 6-digit Indian PIN code is required');
      }

      const cartItemsToOrder = serverCart?.items || [];
      if (!cartItemsToOrder.length && !items.length) {
        throw new Error('Your cart is empty. Please add items to your cart before checking out.');
      }

      const orderItems = (cartItemsToOrder.length ? cartItemsToOrder : items).map((item) => ({
        variantId: item.variant_id || item.variantId,
        quantity: item.quantity,
      }));

      const key = getOrCreateIdempotencyKey();

      const res = await apiFetch('/api/v1/orders', {
        method: 'POST',
        headers: {
          'Idempotency-Key': key,
        },
        body: JSON.stringify({
          items: orderItems,
          shippingAddress: {
            name: shippingAddress.name.trim(),
            phone: rawPhone,
            line1: shippingAddress.line1.trim(),
            line2: shippingAddress.line2?.trim() || null,
            city: shippingAddress.city.trim(),
            state: shippingAddress.state.trim(),
            pincode: shippingAddress.pincode.trim(),
          },
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        const errorMsg = json.errors?.[0]?.message || json.message || 'Failed to place order';
        throw new Error(errorMsg);
      }

      setOrderComplete(json.data.order);
      if (typeof clearCart === 'function') {
        clearCart();
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setOrderError(err.message || 'Order placement failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!authReady || !isAuthenticated) {
    return (
      <Layout>
        <div
          className="checkout-page"
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#050505',
          }}
        >
          <div style={{ color: '#a0a0a5', fontSize: '13px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Verifying secure session...
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="checkout-page">
        {/* ── Top Navigation Bar ── */}
        <nav className="checkout-nav">
          <div className="checkout-nav-left">
            {!orderComplete && (
              <a href="/cart" className="checkout-back-link">
                ← Return to Cart
              </a>
            )}
            <a href="/" className="checkout-nav-logo">
              <img src={newLogo} alt="Evoluir" />
              <span className="checkout-nav-wordmark">Evoluir</span>
            </a>
          </div>
          <div className="checkout-nav-right">
            <AuthNavButton />
          </div>
        </nav>

        {/* ── Main Container ── */}
        <main className="checkout-container">
          {orderComplete ? (
            /* ── Order Complete Celebration State ── */
            <div className="checkout-success-wrap">
              <div className="checkout-success-icon">✓</div>
              <h1 className="checkout-success-title">Order Confirmed</h1>
              <p className="checkout-success-sub">
                Thank you for acquiring Evoluir. Your order has been recorded and is being prepared for dispatch.
              </p>

              <div className="checkout-success-card">
                <div className="checkout-success-row">
                  <span>Order Number</span>
                  <span style={{ color: '#42fcff', fontFamily: 'Satoshi-Variable, Satoshi, sans-serif', fontWeight: 700, fontSize: '14px', letterSpacing: '0.04em' }}>
                    #{orderComplete.order_number || (orderComplete.id ? orderComplete.id.slice(0, 8).toUpperCase() : 'EVO')}
                  </span>
                </div>
                <div className="checkout-success-row">
                  <span>Order Status</span>
                  <span style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {orderComplete.status}
                  </span>
                </div>
                <div className="checkout-success-row">
                  <span>Total Amount</span>
                  <span>₹{((orderComplete.total_paise || 0) / 100).toLocaleString('en-IN')}</span>
                </div>
                <div className="checkout-success-row">
                  <span>Expected Delivery</span>
                  <span style={{ color: '#42fcff' }}>
                    {orderComplete.expected_delivery_date
                      ? new Date(orderComplete.expected_delivery_date).toLocaleDateString('en-IN', {
                          weekday: 'long',
                          month: 'short',
                          day: 'numeric',
                        })
                      : 'Within 4–6 Business Days'}
                  </span>
                </div>
                <div className="checkout-success-row">
                  <span>Shipping Destination</span>
                  <span>
                    {shippingAddress.name}, {shippingAddress.city} ({shippingAddress.pincode})
                  </span>
                </div>
              </div>

              <div className="checkout-success-actions">
                <MagneticButton
                  href="/products"
                  className="btn-primary"
                  style={{ padding: '14px 28px', fontSize: '12px' }}
                >
                  Continue Shopping
                </MagneticButton>
                <MagneticButton
                  href="/"
                  className="btn-secondary"
                  style={{ padding: '14px 24px', fontSize: '12px' }}
                >
                  Return to Home
                </MagneticButton>
              </div>
            </div>
          ) : (
            /* ── Active Checkout Screen ── */
            <>
              <div className="checkout-header">
                <span className="checkout-sub-label">Evoluir · Secure Checkout</span>
                <h1 className="checkout-title">Shipping & Order Review</h1>
                <p className="checkout-desc">
                  Confirm your delivery destination. Items and pricing are verified directly against our live catalog and database.
                </p>
              </div>



              <div className="checkout-grid">
                {/* ── Left Column: Shipping Form ── */}
                <div className="checkout-card">
                  <div className="checkout-card-header">
                    <h2 className="checkout-card-title">Delivery Destination</h2>
                    {user && (
                      <span className="checkout-user-badge">
                        Signed in as {user.name || user.phone || user.email}
                      </span>
                    )}
                  </div>

                  {isBackendOffline && (
                    <div className="backend-offline-banner" style={{ marginBottom: '20px' }}>
                      <div className="backend-offline-content">
                        <div className="backend-offline-icon-wrap">
                          <span className="backend-offline-dot" />
                          <span className="backend-offline-ping" />
                        </div>
                        <div className="backend-offline-text">
                          <h4 className="backend-offline-title">Connecting to Live Server…</h4>
                          <p className="backend-offline-sub">
                            {backendError || 'Attempting to verify live order items in PostgreSQL. Stale browser history is ignored.'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="backend-offline-retry-btn"
                        onClick={retryConnection}
                        disabled={loadingCart}
                      >
                        {loadingCart ? 'Connecting…' : 'Retry'}
                      </button>
                    </div>
                  )}

                  {orderError && (
                    <div className="checkout-error-banner" style={{ marginBottom: '20px' }}>
                      <span>⚠</span>
                      <span>{orderError}</span>
                    </div>
                  )}

                  <form onSubmit={handlePlaceOrder} className="checkout-form-grid">
                    <div className="checkout-field-row">
                      <div className="checkout-field">
                        <label>Recipient Full Name</label>
                        <input
                          type="text"
                          required
                          placeholder="Full recipient name"
                          value={shippingAddress.name}
                          onChange={(e) =>
                            setShippingAddress({ ...shippingAddress, name: e.target.value })
                          }
                          disabled={submitting}
                        />
                      </div>

                      <div className="checkout-field">
                        <label>10-Digit Mobile Phone</label>
                        <input
                          type="tel"
                          required
                          placeholder="e.g. 9876543210"
                          value={shippingAddress.phone}
                          onChange={(e) =>
                            setShippingAddress({ ...shippingAddress, phone: e.target.value })
                          }
                          disabled={submitting}
                        />
                      </div>
                    </div>

                    <div className="checkout-field">
                      <label>Address Line 1</label>
                      <input
                        type="text"
                        required
                        placeholder="House / Flat no, apartment name, street, locality"
                        value={shippingAddress.line1}
                        onChange={(e) =>
                          setShippingAddress({ ...shippingAddress, line1: e.target.value })
                        }
                        disabled={submitting}
                      />
                    </div>

                    <div className="checkout-field">
                      <label>Address Line 2 (Optional)</label>
                      <input
                        type="text"
                        placeholder="Suite, landmark, floor, or delivery directions"
                        value={shippingAddress.line2 || ''}
                        onChange={(e) =>
                          setShippingAddress({ ...shippingAddress, line2: e.target.value })
                        }
                        disabled={submitting}
                      />
                    </div>

                    <div className="checkout-field-triplet">
                      <div className="checkout-field">
                        <label>City</label>
                        <input
                          type="text"
                          required
                          placeholder="City"
                          value={shippingAddress.city}
                          onChange={(e) =>
                            setShippingAddress({ ...shippingAddress, city: e.target.value })
                          }
                          disabled={submitting}
                        />
                      </div>
                      <div className="checkout-field">
                        <label>State</label>
                        <input
                          type="text"
                          required
                          placeholder="State"
                          value={shippingAddress.state}
                          onChange={(e) =>
                            setShippingAddress({ ...shippingAddress, state: e.target.value })
                          }
                          disabled={submitting}
                        />
                      </div>
                      <div className="checkout-field">
                        <label>PIN Code</label>
                        <input
                          type="text"
                          required
                          maxLength={6}
                          placeholder="6 digits"
                          value={shippingAddress.pincode}
                          onChange={(e) =>
                            setShippingAddress({ ...shippingAddress, pincode: e.target.value })
                          }
                          disabled={submitting}
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="checkout-submit-btn"
                      disabled={submitting || isBackendOffline || (!displayItems.length && !loadingCart)}
                    >
                      {submitting
                        ? 'Creating Order in Database...'
                        : isBackendOffline
                        ? 'Waiting for Server Connection…'
                        : `Place Order & Confirm · ₹${totalAmountRupees.toLocaleString('en-IN')}`}
                    </button>
                  </form>
                </div>

                {/* ── Right Column: Order Summary ── */}
                <div className="checkout-summary-wrap">
                  <div className="checkout-summary-card">
                    <h2 className="checkout-summary-title">Order Summary</h2>

                    {loadingCart ? (
                      <div style={{ padding: '16px 0' }}>
                        <div className="cart-skeleton-line" style={{ width: '100%', height: '36px', marginBottom: '12px' }} />
                        <div className="cart-skeleton-line" style={{ width: '80%', height: '36px' }} />
                      </div>
                    ) : !displayItems.length ? (
                      <div style={{ color: '#a0a0a5', fontSize: '13px', padding: '20px 0', textAlign: 'center' }}>
                        Your cart is empty.{' '}
                        <a href="/products" style={{ color: '#42fcff', textDecoration: 'underline' }}>
                          Add products
                        </a>
                      </div>
                    ) : (
                      <div className="checkout-items-list">
                        {displayItems.map((item, idx) => {
                          const itemName = item.product_name || item.name || 'Evoluir Product';
                          const itemQty = item.quantity || 1;
                          const itemPrice = item.line_total_paise
                            ? Math.round(item.line_total_paise / 100)
                            : item.price_paise
                            ? Math.round((item.price_paise * itemQty) / 100)
                            : (item.numericPrice || 0) * itemQty;
                          const shadeName = item.shade_name || item.shadeCode;

                          return (
                            <div key={item.item_id || item.variant_id || idx} className="checkout-item-row">
                              <div className="checkout-item-info">
                                <span className="checkout-item-name">{itemName}</span>
                                <span className="checkout-item-meta">
                                  {shadeName ? `Shade: ${shadeName} · ` : ''}Qty: {itemQty}
                                </span>
                              </div>
                              <span className="checkout-item-price">
                                ₹{itemPrice.toLocaleString('en-IN')}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="checkout-totals-block">
                      <div className="checkout-total-line">
                        <span>Items Subtotal</span>
                        <span>₹{itemsSubtotalRupees.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="checkout-total-line">
                        <span>Standard Delivery</span>
                        <span>₹{shippingFeeRupees.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="checkout-total-line">
                        <span>Applicable Taxes (GST)</span>
                        <span>Included</span>
                      </div>
                    </div>

                    <div className="checkout-grand-total">
                      <span className="checkout-grand-total-label">Total Due</span>
                      <span className="checkout-grand-total-amount">
                        ₹{totalAmountRupees.toLocaleString('en-IN')}
                      </span>
                    </div>

                    <div className="checkout-trust-list">
                      <div className="checkout-trust-item">
                        <span className="checkout-trust-dot" />
                        <span>Encrypted 256-Bit SSL Checkout</span>
                      </div>
                      <div className="checkout-trust-item">
                        <span className="checkout-trust-dot" />
                        <span>20-Day Return & Flawless Guarantee</span>
                      </div>
                      <div className="checkout-trust-item">
                        <span className="checkout-trust-dot" />
                        <span>1-Year Evoluir Hardware Warranty</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </main>

        {/* ── Auth Modal if sign in needed ── */}
        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          onSuccess={() => setAuthModalOpen(false)}
        />
      </div>
    </Layout>
  );
};

export default CheckoutPage;
