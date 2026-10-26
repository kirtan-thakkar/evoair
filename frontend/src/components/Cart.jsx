import React, { useEffect, useState, useRef, useCallback } from 'react';
import Layout from './Layout';
import MagneticButton from './MagneticButton';
import BlackHole from './BlackHole';
import newLogo from '../assets/new-logo.png';
import heroCapsules from '../assets/hero-capsules.png';
import { useCart } from '../utils/cart';
import { AuthNavButton, AuthModal } from './AuthModal';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../utils/api';

const formatCurrency = (val) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(val);
};

const Cart = () => {
  const { user, isAuthenticated, authReady } = useAuth();
  const {
    items,
    serverCart,
    isServerCart,
    loadingCart,
    totalCount,
    subtotal,
    addToCart,
    updateQuantity,
    removeFromCart,
  } = useCart(isAuthenticated);

  const [promoCode, setPromoCode] = useState('');
  const [discount, setDiscount] = useState(0);
  const [promoMessage, setPromoMessage] = useState('');

  // Modals & Order placement state
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [orderComplete, setOrderComplete] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState('');

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

  // Pre-fill user name and phone
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

  const handleApplyPromo = (e) => {
    e.preventDefault();
    if (!promoCode.trim()) return;

    if (promoCode.trim().toUpperCase() === 'EVO10') {
      setDiscount(0.1);
      setPromoMessage('10% VIP discount applied!');
    } else if (promoCode.trim().toUpperCase() === 'STARCAST') {
      setDiscount(0.15);
      setPromoMessage('15% Starcast exclusive discount applied!');
    } else {
      setPromoMessage('Invalid or expired promo code.');
    }
  };

  const discountAmount = Math.round(subtotal * discount);
  const finalTotal = Math.max(0, subtotal - discountAmount);

  const handleInitiateCheckout = (e) => {
    e.preventDefault();
    if (!authReady) return;

    if (!isAuthenticated) {
      setAuthModalOpen(true);
      return;
    }

    setOrderError('');
    setCheckoutModalOpen(true);
  };

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    setOrderError('');
    setSubmitting(true);

    try {
      if (!shippingAddress.name.trim() || shippingAddress.name.trim().length < 2) {
        throw new Error('Full name is required (at least 2 characters)');
      }
      const rawPhone = shippingAddress.phone.replace(/^(?:\+91|91|0)/, '').trim();
      if (!/^[6-9]\d{9}$/.test(rawPhone)) {
        throw new Error('Valid 10-digit Indian mobile number is required');
      }
      if (!shippingAddress.line1.trim() || shippingAddress.line1.trim().length < 5) {
        throw new Error('Address Line 1 is required (at least 5 characters)');
      }
      if (!shippingAddress.city.trim() || !shippingAddress.state.trim()) {
        throw new Error('City and State are required');
      }
      if (!/^[1-9][0-9]{5}$/.test(shippingAddress.pincode.trim())) {
        throw new Error('Valid 6-digit Indian PIN code is required');
      }

      const cartItemsToOrder = serverCart?.items || [];
      if (!cartItemsToOrder.length) {
        throw new Error('Your server cart is empty. Please add items before placing an order.');
      }

      const orderItems = cartItemsToOrder.map((item) => ({
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
            phone: shippingAddress.phone.trim(),
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
      setCheckoutModalOpen(false);
    } catch (err) {
      setOrderError(err.message || 'Order placement failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="cart-page">
        {/* Navigation */}
        <nav className="ck-nav">
          <a href="/" className="nav-logo">
            <img src={newLogo} alt="Evoluir" style={{ height: '22px' }} />
            <span className="nav-wordmark">Evoluir</span>
          </a>
          <div className="nav-right" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <AuthNavButton />
            <MagneticButton
              href="/products"
              className="btn-secondary"
              style={{ padding: '8px 20px', fontSize: '9px' }}
            >
              Continue Shopping
            </MagneticButton>
          </div>
        </nav>

        {/* Main Cart Body */}
        <main className="cart-main-container">
          <div className="cart-header-wrap">
            <div className="cart-label">STARCAST COLLECTION</div>
            <h1 className="cart-title">Your Cart</h1>
            <p className="cart-item-count-sub">
              {totalCount === 0
                ? 'Your bag is currently empty'
                : `${totalCount} item${totalCount === 1 ? '' : 's'} ready for checkout`}
            </p>
          </div>

          {orderComplete ? (
            <div className="cart-empty-state cart-success-state">
              <div className="cart-empty-icon" style={{ borderColor: 'rgba(66, 252, 255, 0.4)', color: '#42fcff' }}>
                ✓
              </div>
              <h2 className="cart-empty-heading">Order Placed Successfully</h2>
              <p className="cart-empty-sub" style={{ marginBottom: '8px' }}>
                Order ID: <code style={{ color: '#42fcff', fontSize: '12px' }}>{orderComplete.id}</code>
              </p>
              <p className="cart-empty-sub" style={{ marginBottom: '14px' }}>
                Status: <strong>{orderComplete.status}</strong> · Total: <strong>₹{(orderComplete.total_paise / 100).toLocaleString('en-IN')}</strong>
              </p>
              <div style={{ background: 'rgba(66, 252, 255, 0.06)', border: '1px solid rgba(66, 252, 255, 0.25)', borderRadius: '12px', padding: '12px 20px', maxWidth: '420px', margin: '0 auto 20px auto' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#42fcff', display: 'block', marginBottom: '4px' }}>Expected Delivery</span>
                <span style={{ fontSize: '15px', color: '#fff', fontWeight: 500 }}>
                  {orderComplete.expected_delivery_date
                    ? new Date(orderComplete.expected_delivery_date).toLocaleDateString('en-IN', { weekday: 'long', month: 'short', day: 'numeric' })
                    : 'Within 4–6 Business Days'}
                </span>
              </div>
              <p style={{ fontSize: '13px', color: '#a0a0a5', maxWidth: '440px', margin: '0 auto 24px auto', lineHeight: 1.6 }}>
                Items are securely reserved in your database. Razorpay payment integration will be activated in the next phase.
              </p>
              <MagneticButton href="/products" className="btn-primary" style={{ marginTop: '12px' }}>
                Explore Products
              </MagneticButton>
            </div>
          ) : items.length === 0 ? (
            <div className="cart-empty-state">
              <div className="cart-empty-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <path d="M16 10a4 4 0 0 1-8 0" />
                </svg>
              </div>
              <h2 className="cart-empty-heading">Your Bag is Empty</h2>
              <p className="cart-empty-sub">
                Experience next-generation cordless micro-mist skincare and airbrush luxury.
              </p>
              <MagneticButton href="/products" className="btn-primary" style={{ marginTop: '28px' }}>
                Browse Products
              </MagneticButton>
            </div>
          ) : (
            <div className="cart-content-grid">
              {/* Left Column: Items */}
              <div className="cart-items-column">
                <div className="cart-items-list">
                  {items.map((item) => {
                    const uniqueKey = `${item.id || item.variant_id || item.variantId}-${item.shadeCode || item.shade_code || 'default'}`;
                    const itemPrice = isServerCart && item.price_paise
                      ? item.price_paise / 100
                      : item.numericPrice || 2800;
                    const itemLineTotal = isServerCart && item.line_total_paise
                      ? item.line_total_paise / 100
                      : itemPrice * (item.quantity || 1);

                    return (
                      <div key={uniqueKey} className="cart-item-card">
                        <div className="cart-item-thumb">
                          <img
                            src={item.image || heroCapsules}
                            alt={item.product_name || item.name}
                            className="cart-item-img"
                          />
                        </div>

                        <div className="cart-item-info">
                          <div className="cart-item-title-row">
                            <h3 className="cart-item-name">{item.product_name || item.name}</h3>
                            <button
                              type="button"
                              className="cart-remove-btn"
                              onClick={() => removeFromCart(uniqueKey)}
                              aria-label="Remove item"
                            >
                              ✕
                            </button>
                          </div>

                          {(item.shade_name || item.shadeName || item.subtitle) && (
                            <div className="cart-item-spec">
                              {item.shadeSwatch && (
                                <span
                                  className="cart-spec-swatch"
                                  style={{ backgroundColor: item.shadeSwatch }}
                                />
                              )}
                              <span>
                                {item.shade_name || item.shadeName
                                  ? `${item.shade_name || item.shadeName}`
                                  : item.subtitle}
                              </span>
                            </div>
                          )}

                          <div className="cart-item-bottom-row">
                            <div className="cart-qty-control">
                              <button
                                type="button"
                                className="cart-qty-btn"
                                onClick={() => updateQuantity(uniqueKey, -1)}
                                aria-label="Decrease quantity"
                              >
                                −
                              </button>
                              <span className="cart-qty-num">{item.quantity || 1}</span>
                              <button
                                type="button"
                                className="cart-qty-btn"
                                onClick={() => updateQuantity(uniqueKey, 1)}
                                aria-label="Increase quantity"
                              >
                                +
                              </button>
                            </div>

                            <div className="cart-item-price">
                              {formatCurrency(itemLineTotal)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Complete Your Kit (in Cart) */}
                <div className="cart-kit-section">
                  <div className="cart-kit-kicker">Recommended Add-ons</div>
                  <h3 className="cart-kit-heading">Complete Your Kit</h3>

                  <div className="cart-kit-grid">
                    <div className="cart-kit-card">
                      <div className="cart-kit-card-head">
                        <span className="cart-kit-number">01</span>
                        <span className="cart-kit-name">Evo-Fills Refills</span>
                      </div>
                      <p className="cart-kit-desc">
                        10 Pre-filled sterile formula capsules for zero mess and ultra-pure atomization.
                      </p>
                      <div className="cart-kit-foot">
                        <span className="cart-kit-price">₹2,500</span>
                        <MagneticButton
                          className="btn-secondary cart-kit-add-btn"
                          onClick={() => {
                            addToCart({
                              id: 'evofills',
                              name: 'Evo-Fills Refill Capsules',
                              subtitle: '10 Pre-filled Capsules',
                              price: '₹2,500',
                              numericPrice: 2500,
                              image: heroCapsules,
                            });
                          }}
                        >
                          + Add
                        </MagneticButton>
                      </div>
                    </div>

                    <div className="cart-kit-card">
                      <div className="cart-kit-card-head">
                        <span className="cart-kit-number">02</span>
                        <span className="cart-kit-name">Evo-Bottles Empty</span>
                      </div>
                      <p className="cart-kit-desc">
                        Pack of 20 empty refillable capsules. Compatible with your own foundation formulas.
                      </p>
                      <div className="cart-kit-foot">
                        <span className="cart-kit-price">₹1,799</span>
                        <MagneticButton
                          className="btn-secondary cart-kit-add-btn"
                          onClick={() => {
                            addToCart({
                              id: 'evo-bottles-empty-pack',
                              name: 'Evo-Bottles Refill Pack',
                              subtitle: 'Pack of 20 Empty Capsules',
                              price: '₹1,799',
                              numericPrice: 1799,
                              image: heroCapsules,
                            });
                          }}
                        >
                          + Add
                        </MagneticButton>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Order Summary */}
              <div className="cart-summary-column">
                <div className="cart-summary-card">
                  <h2 className="cart-summary-title">Order Summary</h2>

                  <div className="cart-summary-rows">
                    <div className="cart-summary-row">
                      <span>Subtotal</span>
                      <span>{formatCurrency(subtotal)}</span>
                    </div>

                    {discount > 0 && (
                      <div className="cart-summary-row" style={{ color: 'var(--accent, #f24c27)' }}>
                        <span>VIP Discount ({(discount * 100).toFixed(0)}%)</span>
                        <span>−{formatCurrency(discountAmount)}</span>
                      </div>
                    )}

                    <div className="cart-summary-row">
                      <span>Shipping</span>
                      <span className="cart-free-badge">Complimentary</span>
                    </div>

                    <div className="cart-summary-row">
                      <span>Customs & Taxes</span>
                      <span>Included</span>
                    </div>

                    <div className="cart-summary-divider" />

                    <div className="cart-summary-row cart-total-row">
                      <span>Total</span>
                      <span>{formatCurrency(finalTotal)}</span>
                    </div>
                  </div>

                  {/* Promo Input */}
                  <form onSubmit={handleApplyPromo} className="cart-promo-form">
                    <input
                      type="text"
                      className="cart-promo-input"
                      placeholder="Promo code (try EVO10)"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value)}
                    />
                    <button type="submit" className="cart-promo-btn">
                      Apply
                    </button>
                  </form>
                  {promoMessage && (
                    <div className={`cart-promo-msg ${discount > 0 ? 'is-success' : 'is-error'}`}>
                      {promoMessage}
                    </div>
                  )}

                  {/* Checkout CTA */}
                  <MagneticButton
                    className="btn-primary cart-checkout-btn"
                    onClick={handleInitiateCheckout}
                    style={{ width: '100%', marginTop: '24px', padding: '16px' }}
                  >
                    Proceed to Checkout
                  </MagneticButton>

                  <div className="cart-guarantee-list">
                    <div className="cart-guarantee-item">
                      <span className="cart-guarantee-dot" />
                      <span>Encrypted 256-Bit SSL Checkout</span>
                    </div>
                    <div className="cart-guarantee-item">
                      <span className="cart-guarantee-dot" />
                      <span>20-Day Return & Flawless Guarantee</span>
                    </div>
                    <div className="cart-guarantee-item">
                      <span className="cart-guarantee-dot" />
                      <span>1-Year Evoluir Hardware Warranty</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* ── Checkout & Shipping Modal ── */}
        {checkoutModalOpen && (
          <div className="auth-modal-overlay" onClick={() => setCheckoutModalOpen(false)}>
            <div className="auth-modal-content ck-checkout-modal" onClick={(e) => e.stopPropagation()}>
              <button className="auth-modal-close" onClick={() => setCheckoutModalOpen(false)}>
                ✕
              </button>

              <div className="auth-modal-header">
                <span className="auth-modal-brand">Evoluir · Checkout</span>
                <h2 className="auth-modal-title">Shipping & Order Review</h2>
                <p className="auth-modal-sub">
                  Confirm your delivery address. Items and prices are read directly from your server cart.
                </p>
              </div>

              {orderError && <div className="auth-modal-error">{orderError}</div>}

              {/* Server Cart Items */}
              <div className="ck-order-summary-box">
                <div className="ck-order-summary-title">Order Items (Database Source)</div>
                {loadingCart ? (
                  <div style={{ fontSize: '12px', color: '#a0a0a5', padding: '10px 0' }}>Syncing server bag...</div>
                ) : (
                  (serverCart?.items || []).map((item) => (
                    <div key={item.item_id || item.variant_id} className="ck-review-item-row">
                      <div>
                        <div style={{ fontWeight: 500, fontSize: '13px' }}>{item.product_name}</div>
                        <div style={{ fontSize: '11px', color: '#a0a0a5' }}>
                          {item.shade_name ? `Shade: ${item.shade_name} · ` : ''}Qty: {item.quantity}
                        </div>
                      </div>
                      <div style={{ fontWeight: 500, fontSize: '13px' }}>
                        ₹{((item.line_total_paise || item.price_paise * item.quantity) / 100).toLocaleString('en-IN')}
                      </div>
                    </div>
                  ))
                )}
                <div className="ck-review-total-row">
                  <span>Estimated Delivery</span>
                  <span style={{ color: '#42fcff', fontSize: '13px', fontWeight: 400 }}>4–6 Business Days (Complimentary)</span>
                </div>
                <div className="ck-review-total-row">
                  <span>Total Amount</span>
                  <span>₹{((serverCart?.total_paise || 0) / 100).toLocaleString('en-IN')}</span>
                </div>
              </div>

              <form onSubmit={handlePlaceOrder} className="auth-modal-form" style={{ marginTop: '20px' }}>
                <div className="auth-input-group">
                  <label>Recipient Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Full recipient name"
                    value={shippingAddress.name}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, name: e.target.value })}
                    disabled={submitting}
                  />
                </div>

                <div className="auth-input-group">
                  <label>10-Digit Mobile Phone</label>
                  <input
                    type="tel"
                    required
                    placeholder="e.g. 9876543210"
                    value={shippingAddress.phone}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, phone: e.target.value })}
                    disabled={submitting}
                  />
                </div>

                <div className="auth-input-group">
                  <label>Address Line 1</label>
                  <input
                    type="text"
                    required
                    placeholder="House/flat no, street, locality"
                    value={shippingAddress.line1}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, line1: e.target.value })}
                    disabled={submitting}
                  />
                </div>

                <div className="auth-input-group">
                  <label>Address Line 2 (Optional)</label>
                  <input
                    type="text"
                    placeholder="Apartment, suite, landmark"
                    value={shippingAddress.line2 || ''}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, line2: e.target.value })}
                    disabled={submitting}
                  />
                </div>

                <div className="ck-address-triplet">
                  <div className="auth-input-group">
                    <label>City</label>
                    <input
                      type="text"
                      required
                      placeholder="City"
                      value={shippingAddress.city}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, city: e.target.value })}
                      disabled={submitting}
                    />
                  </div>
                  <div className="auth-input-group">
                    <label>State</label>
                    <input
                      type="text"
                      required
                      placeholder="State"
                      value={shippingAddress.state}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, state: e.target.value })}
                      disabled={submitting}
                    />
                  </div>
                  <div className="auth-input-group">
                    <label>PIN Code</label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      placeholder="6 digits"
                      value={shippingAddress.pincode}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, pincode: e.target.value })}
                      disabled={submitting}
                    />
                  </div>
                </div>

                <button type="submit" className="auth-submit-btn" disabled={submitting} style={{ marginTop: '16px' }}>
                  {submitting
                    ? 'Creating Order in PostgreSQL...'
                    : `Confirm & Place Order · ₹${((serverCart?.total_paise || 0) / 100).toLocaleString('en-IN')}`}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ── Auth Modal ── */}
        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          onSuccess={() => {
            setAuthModalOpen(false);
            setCheckoutModalOpen(true);
          }}
        />

        {/* Full Size Black Hole Footer */}
        <footer
          className="black-hole-footer"
          style={{
            position: 'relative',
            width: '100%',
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            overflow: 'hidden',
            padding: 0,
            background: 'transparent',
            borderTop: 'none',
          }}
        >
          <div
            className="black-hole-stage"
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }}
          >
            <BlackHole />
          </div>
          <div
            className="footer-content"
            style={{
              position: 'relative',
              zIndex: 10,
              width: '100%',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              padding: '40px 50px',
              background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
              pointerEvents: 'none',
            }}
          >
            <div className="footer-copy" style={{ flex: 1, textAlign: 'left', alignSelf: 'center' }}>
              © 2026 Evoluir.<br />All rights reserved.
            </div>
            <div className="footer-logo" style={{ color: '#ffffff', flex: 1, textAlign: 'center', lineHeight: 1 }}>
              Evoluir
            </div>
            <div className="footer-copy" style={{ flex: 1, textAlign: 'right', alignSelf: 'center' }}>
              Evo-Air™<br />Cart
            </div>
          </div>
        </footer>
      </div>
    </Layout>
  );
};

export default Cart;
