import React, { useEffect, useState } from 'react';
import Layout from './Layout';
import MagneticButton from './MagneticButton';
import BlackHole from './BlackHole';
import newLogo from '../assets/new-logo.png';
import heroCapsules from '../assets/hero-capsules.png';
import { useCart } from '../utils/cart';
import { AuthNavButton, AuthModal } from './AuthModal';
import { useAuth } from '../context/AuthContext';

const formatCurrency = (val) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(val);
};

const Cart = () => {
  const { isAuthenticated, authReady } = useAuth();
  const {
    items,
    isServerCart,
    loadingCart,
    isMutating,
    mutatingItemId,
    isBackendOffline,
    backendError,
    retryConnection,
    totalCount,
    pricing,
    subtotal,
    shippingFee,
    finalTotal,
    formattedPricing,
    addToCart,
    updateQuantity,
    removeFromCart,
  } = useCart(isAuthenticated, authReady);

  // Modals & Order confirmation
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [orderComplete, setOrderComplete] = useState(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleInitiateCheckout = (e) => {
    e.preventDefault();
    if (!authReady || loadingCart || isMutating) return;

    if (!isAuthenticated) {
      setAuthModalOpen(true);
      return;
    }

    window.location.href = '/checkout';
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
              {loadingCart
                ? 'Loading your bag...'
                : totalCount === 0
                ? 'Your bag is currently empty'
                : `${totalCount} item${totalCount === 1 ? '' : 's'} ready for checkout`}
            </p>
          </div>

          {/* ── Backend Offline Reconnect Status ── */}
          {isBackendOffline && (
            <div className="backend-offline-banner">
              <div className="backend-offline-content">
                <div className="backend-offline-icon-wrap">
                  <span className="backend-offline-dot" />
                  <span className="backend-offline-ping" />
                </div>
                <div className="backend-offline-text">
                  <h4 className="backend-offline-title">Backend is currently down</h4>
                  <p className="backend-offline-sub">
                    {backendError || 'Please retry in a few moments.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="backend-offline-retry-btn"
                onClick={retryConnection}
                disabled={loadingCart}
              >
                {loadingCart ? 'Connecting…' : 'Retry Now'}
              </button>
            </div>
          )}

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
                Your order has been confirmed. You will receive an email confirmation with complete tracking details shortly.
              </p>
              <MagneticButton href="/products" className="btn-primary" style={{ marginTop: '12px' }}>
                Explore Products
              </MagneticButton>
            </div>
          ) : loadingCart ? (
            <div className="cart-content-grid">
              <div className="cart-items-column">
                <div className="cart-items-list">
                  <div className="cart-skeleton-card">
                    <div className="cart-skeleton-thumb" />
                    <div className="cart-skeleton-info">
                      <div className="cart-skeleton-line title" />
                      <div className="cart-skeleton-line badge" />
                      <div className="cart-skeleton-bottom">
                        <div className="cart-skeleton-qty" />
                        <div className="cart-skeleton-price" />
                      </div>
                    </div>
                  </div>
                  <div className="cart-skeleton-card">
                    <div className="cart-skeleton-thumb" />
                    <div className="cart-skeleton-info">
                      <div className="cart-skeleton-line title" />
                      <div className="cart-skeleton-line badge" />
                      <div className="cart-skeleton-bottom">
                        <div className="cart-skeleton-qty" />
                        <div className="cart-skeleton-price" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="cart-summary-column">
                <div className="cart-summary-card cart-skeleton-summary">
                  <div className="cart-skeleton-line title" style={{ width: '50%', marginBottom: '24px' }} />
                  <div className="cart-skeleton-line" style={{ width: '100%', height: '14px', marginBottom: '14px' }} />
                  <div className="cart-skeleton-line" style={{ width: '100%', height: '14px', marginBottom: '14px' }} />
                  <div className="cart-skeleton-line" style={{ width: '100%', height: '14px', marginBottom: '24px' }} />
                  <div className="cart-skeleton-line" style={{ width: '100%', height: '48px', borderRadius: '30px' }} />
                </div>
              </div>
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
                    const uniqueKey = `${item.id || item.variant_id || item.variantId}-${item.formula || item.formulaId || 'default'}-${item.shadeCode || item.shade_code || 'default'}`;
                    const targetId = item.variant_id || item.variantId || item.id;
                    const isItemLoading = mutatingItemId === targetId || mutatingItemId === item.id || mutatingItemId === uniqueKey;

                    const itemLineTotal = isServerCart && item.line_total_paise
                      ? item.line_total_paise / 100
                      : item.line_total_rupees || (item.numericPrice || 2800) * (item.quantity || 1);

                    const swatchHex = item.color_hex || item.shadeSwatch;

                    const isEvoAirDevice =
                      item.product_slug === 'evoair' ||
                      item.productSlug === 'evoair' ||
                      item.productId === '00000000-0000-4000-8000-000000000001' ||
                      item.name?.includes('Evo-Air') ||
                      item.id === 'evo-air-device';

                    const isEvoFills =
                      item.product_slug === 'evo-fills' ||
                      item.productSlug === 'evo-fills' ||
                      item.productId === '00000000-0000-4000-8000-000000000002' ||
                      item.name?.includes('Evo-Fills') ||
                      item.id?.startsWith('evofills');

                    const isEvoBottles =
                      item.product_slug === 'evo-bottles' ||
                      item.productSlug === 'evo-bottles' ||
                      item.productId === '00000000-0000-4000-8000-000000000003' ||
                      item.name?.includes('Evo-Bottles') ||
                      item.id?.startsWith('evo-bottles');

                    const formulaLabel = item.formulaName || (item.formula ? item.formula.charAt(0).toUpperCase() + item.formula.slice(1) : '');

                    let displayName = item.product_name || item.name;
                    if (isEvoAirDevice) {
                      displayName = 'Evo-Air Cordless Device';
                    } else if (isEvoFills) {
                      displayName = formulaLabel ? `Evo-Fills Prefill (${formulaLabel})` : 'Evo-Fills Prefills';
                    } else if (isEvoBottles) {
                      displayName = formulaLabel ? `Evo-Bottle (${formulaLabel})` : 'Evo-Bottle (Foundation)';
                    }

                    return (
                      <div
                        key={uniqueKey}
                        className={`cart-item-card ${isItemLoading ? 'is-mutating' : ''}`}
                      >
                        <div className="cart-item-thumb">
                          <img
                            src={item.image || heroCapsules}
                            alt={displayName}
                            className="cart-item-img"
                          />
                        </div>

                        <div className="cart-item-info">
                          <div className="cart-item-title-row">
                            <h3 className="cart-item-name">{displayName}</h3>
                            <button
                              type="button"
                              className={`cart-remove-btn ${isItemLoading ? 'is-loading' : ''}`}
                              onClick={() => !isItemLoading && removeFromCart(item)}
                              disabled={isItemLoading}
                              aria-label="Remove item"
                              title="Remove item"
                            >
                              {isItemLoading ? <span className="cart-btn-spinner" /> : '✕'}
                            </button>
                          </div>

                          {/* Hardware specs chip for Evo-Air Device */}
                          {isEvoAirDevice && (
                            <div
                              className="cart-device-starter-badge"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                marginTop: '6px',
                                marginBottom: '6px',
                                padding: '5px 12px',
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid rgba(255, 255, 255, 0.12)',
                                borderRadius: '6px',
                                fontSize: '11px',
                                color: '#d4d4d8',
                                letterSpacing: '0.02em',
                                flexWrap: 'wrap',
                              }}
                            >
                              <span>✨ Flagship Hardware · Includes Charging Cable & Travel Case</span>
                            </div>
                          )}

                          {/* Specification Row for Refills and Bottles */}
                          {(isEvoFills || isEvoBottles || !isEvoAirDevice) && (item.shade_name || item.shadeName || item.subtitle) && (
                            <div className="cart-item-spec">
                              {swatchHex && (
                                <span
                                  className="cart-spec-swatch"
                                  style={{ backgroundColor: swatchHex }}
                                />
                              )}
                              <span>
                                {item.shade_name || item.shadeName
                                  ? `${item.shade_code || item.shadeCode ? `${item.shade_code || item.shadeCode} ` : ''}${item.shade_name || item.shadeName}${isEvoBottles ? ' · Pack of 20' : isEvoFills ? ' · 10 Pre-filled Capsules' : ''}`
                                  : item.subtitle}
                              </span>
                            </div>
                          )}

                          <div className="cart-item-bottom-row">
                            <div className={`cart-qty-control ${isItemLoading ? 'is-disabled' : ''}`}>
                              <button
                                type="button"
                                className="cart-qty-btn"
                                onClick={() => !isItemLoading && updateQuantity(item, -1)}
                                disabled={isItemLoading || (item.quantity || 1) <= 1}
                                aria-label="Decrease quantity"
                              >
                                −
                              </button>
                              <span className="cart-qty-num">
                                {isItemLoading ? '…' : (item.quantity || 1)}
                              </span>
                              <button
                                type="button"
                                className="cart-qty-btn"
                                onClick={() => !isItemLoading && updateQuantity(item, 1)}
                                disabled={isItemLoading || (item.quantity || 1) >= 10}
                                aria-label="Increase quantity"
                              >
                                +
                              </button>
                            </div>

                            <div className={`cart-item-price ${isItemLoading ? 'cart-price-updating' : ''}`}>
                              {item.formatted_line_total || formatCurrency(itemLineTotal)}
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
                        <span className="cart-kit-name">Evo-Fills Prefills</span>
                      </div>
                      <p className="cart-kit-desc">
                        10 Pre-filled sterile formula capsules for zero mess and plug-and-play atomization.
                      </p>
                      <div className="cart-kit-foot">
                        <span className="cart-kit-price">₹2,500</span>
                        <MagneticButton
                          className="btn-secondary cart-kit-add-btn"
                          disabled={isMutating}
                          onClick={() => {
                            addToCart({
                              id: 'evofills',
                              name: 'Evo-Fills Prefilled Capsules',
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
                        <span className="cart-kit-name">Evo-Bottles</span>
                      </div>
                      <p className="cart-kit-desc">
                        Pack of 20 refillable capsules. Compatible with your own foundations and custom formulas.
                      </p>
                      <div className="cart-kit-foot">
                        <span className="cart-kit-price">₹1,799</span>
                        <MagneticButton
                          className="btn-secondary cart-kit-add-btn"
                          disabled={isMutating}
                          onClick={() => {
                            addToCart({
                              id: 'evo-bottles-pack',
                              productSlug: 'evo-bottles',
                              productId: '00000000-0000-4000-8000-000000000003',
                              name: 'Evo-Bottles Refill Pack',
                              subtitle: 'Pack of 20 Capsules',
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

              {/* Right Column: Order Summary (Server-Driven Pricing) */}
              <div className="cart-summary-column">
                <div className="cart-summary-card">
                  <h2 className="cart-summary-title">Order Summary</h2>

                  <div className="cart-summary-rows">
                    <div className="cart-summary-row">
                      <span>Subtotal</span>
                      <span className={isMutating ? 'cart-price-updating' : ''}>
                        {formattedPricing?.subtotal || formatCurrency(subtotal)}
                      </span>
                    </div>

                    <div className="cart-summary-row">
                      <span>Standard Delivery</span>
                      <span style={{ color: '#42fcff', fontWeight: 500, letterSpacing: '0.04em' }}>
                        FREE <span style={{ fontSize: '11px', color: '#888', fontWeight: 400 }}>(Complimentary)</span>
                      </span>
                    </div>

                    <div className="cart-summary-row">
                      <span>Customs & Taxes</span>
                      <span style={{ color: '#888' }}>
                        {formattedPricing?.customs_and_taxes || 'Included'}
                      </span>
                    </div>

                    <div className="cart-summary-divider" />

                    <div className="cart-summary-row cart-total-row">
                      <span>Total</span>
                      <span className={isMutating ? 'cart-price-updating' : ''}>
                        {formattedPricing?.total || formatCurrency(subtotal)}
                      </span>
                    </div>
                  </div>

                  {/* Checkout CTA */}
                  <MagneticButton
                    className="btn-primary cart-checkout-btn"
                    onClick={handleInitiateCheckout}
                    disabled={isMutating || loadingCart}
                    style={{
                      width: '100%',
                      marginTop: '24px',
                      padding: '16px',
                      opacity: isMutating ? 0.7 : 1,
                      pointerEvents: isMutating ? 'none' : 'auto',
                    }}
                  >
                    {isMutating ? 'Updating Cart…' : 'Proceed to Checkout'}
                  </MagneticButton>

                
                </div>
              </div>
            </div>
          )}
        </main>

        {/* ── Auth Modal ── */}
        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          onSuccess={() => {
            setAuthModalOpen(false);
            window.location.href = '/checkout';
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
