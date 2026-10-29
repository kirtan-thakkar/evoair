import React, { useEffect, useState, useRef, useCallback } from 'react';
import MagneticButton from './MagneticButton';
import BlackHole from './BlackHole';
import newLogo from '../assets/new-logo.png';
import pricingImage from '../assets/product-pricing.png';
import texture1 from '../assets/texture1.png';
import portrait1 from '../assets/portrait1.png';
import spray1 from '../assets/spray1.png';
import texture2 from '../assets/texture2.png';
import { defaultShadeByFormula, fillFormulas } from '../data/productOptions';
import { useAuth } from '../context/AuthContext';
import { useCart, resolveVariantId } from '../utils/cart';
import { apiFetch } from '../utils/api';
import AuthModal from './AuthModal';

const Checkout = () => {
  const [openAccordion, setOpenAccordion] = useState(null);
  const [selectedFormulaId, setSelectedFormulaId] = useState(fillFormulas[0].id);
  const selectedFormula = fillFormulas.find(formula => formula.id === selectedFormulaId);
  const [selectedShadeByFormula, setSelectedShadeByFormula] = useState(defaultShadeByFormula);
  const selectedShade = selectedShadeByFormula[selectedFormulaId];

  // Auth & Cart state
  const { user, isAuthenticated, authReady } = useAuth();
  const { items, serverCart, isServerCart, loadingCart, addToCart, reloadCart } = useCart(isAuthenticated);

  // Modals & Order state
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [orderComplete, setOrderComplete] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState('');

  // Shipping Address state
  const [shippingAddress, setShippingAddress] = useState({
    name: '',
    phone: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    pincode: '',
  });

  // Pre-fill user name and phone if available
  useEffect(() => {
    if (user) {
      setShippingAddress(prev => ({
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
      cartItemsList.map(i => `${i.variant_id || i.variantId}-${i.quantity}`)
    );

    // Regenerate key ONLY if cart or address changes, or if no key exists yet
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

  const toggleAccordion = (index) => {
    setOpenAccordion(openAccordion === index ? null : index);
  };

  const handleInitiatePurchase = async (e) => {
    e.preventDefault();
    if (!authReady) return;

    if (!isAuthenticated) {
      setAuthModalOpen(true);
      return;
    }

    // If server cart is empty, add current configured device and reload
    const currentServerItems = serverCart?.items || [];
    if (currentServerItems.length === 0 && items.length === 0) {
      const vId = resolveVariantId({
        id: 'evo-air-device',
        shadeCode: selectedShade.code,
        shadeName: selectedShade.name,
      });
      addToCart({
        id: 'evo-air-device',
        name: 'Evo-Air Cordless Device',
        subtitle: `Starter Fill: ${selectedFormula.name} · ${selectedShade.code} ${selectedShade.name}`,
        variantId: vId,
        quantity: 1,
        numericPrice: 14999,
        price: '₹14,999',
      });
      await reloadCart();
    }

    setOrderError('');
    setCheckoutModalOpen(true);
  };

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    setOrderError('');
    setSubmitting(true);

    try {
      // Validate shipping address
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

      // Read items strictly from server cart (Source of truth)
      const cartItemsToOrder = serverCart?.items || [];
      if (!cartItemsToOrder.length) {
        throw new Error('Your server cart is empty. Please add items before placing an order.');
      }

      const orderItems = cartItemsToOrder.map(item => ({
        variantId: item.variant_id || item.variantId,
        quantity: item.quantity,
      }));

      // Get or reuse stable Idempotency-Key
      const key = getOrCreateIdempotencyKey();

      // Submit order to POST /api/v1/orders
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

      // Success: DO NOT clear server cart (preserved for payment confirmation)
      setOrderComplete(json.data.order);
      setCheckoutModalOpen(false);
    } catch (err) {
      setOrderError(err.message || 'Order placement failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ck-page">
      <nav className="ck-nav">
        <a href="#home" className="nav-logo">
          <img src={newLogo} alt="Evoluir" style={{ height: '22px' }} />
          <span className="nav-wordmark">Evoluir</span>
        </a>
        <div className="nav-right" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {isAuthenticated ? (
            <span style={{ fontSize: '11px', color: '#a0a0a5', letterSpacing: '0.05em' }}>
              Hi, {user?.name?.split(' ')[0] || 'Member'}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              style={{ background: 'transparent', border: 'none', color: '#f5f5f7', fontSize: '11px', cursor: 'pointer', letterSpacing: '0.05em' }}
            >
              Sign In
            </button>
          )}
          <MagneticButton className="btn-secondary" style={{ padding: '8px 20px', fontSize: '9px' }}
            onClick={() => window.location.hash = '#home'}>
            Back
          </MagneticButton>
        </div>
      </nav>

      <section className="ck-hero">
        <div className="ck-hero-left">
          <div className="ck-title">Evo-Air</div>
          <div className="ck-subtitle-line">The Future of Flawless Skin.</div>
          <p className="ck-desc">
            Our flagship cordless airbrush device. Using patented micro-mist technology, Evo-Air atomizes makeup into a weightless, flawless finish that looks like natural skin. No brushes, no sponges, no contamination.
          </p>
          <div className="ck-price-block">
            <span className="ck-price">₹14,999</span>
            <span className="ck-price-note">Includes Device, Charging Cable & Case · Free shipping</span>
          </div>
          <div className="ck-option-panel ck-fill-selector">
            <div className="ck-option-kicker">Choose Starter Fill</div>
            <div className="ck-segment-row">
              {fillFormulas.map(formula => (
                <button
                  key={formula.id}
                  type="button"
                  className={`ck-segment-choice${selectedFormulaId === formula.id ? ' is-selected' : ''}`}
                  onClick={() => setSelectedFormulaId(formula.id)}
                  aria-pressed={selectedFormulaId === formula.id}
                >
                  {formula.name}
                </button>
              ))}
            </div>
            <div className="ck-option-kicker">Choose Shade</div>
            <div className="ck-shade-grid">
              {selectedFormula.shades.map(shade => (
                <button
                  key={shade.code}
                  type="button"
                  className={`ck-shade-choice${selectedShade.code === shade.code ? ' is-selected' : ''}`}
                  onClick={() => setSelectedShadeByFormula(prev => ({ ...prev, [selectedFormulaId]: shade }))}
                  aria-pressed={selectedShade.code === shade.code}
                >
                  <span className="ck-shade-swatch" style={{ '--swatch': shade.color }} />
                  <span className="ck-shade-copy">
                    <span className="ck-shade-code">{shade.code}</span>
                    <span className="ck-shade-name">{shade.name}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="ck-selection-summary">
              Starter fill: {selectedFormula.name} · {selectedShade.code} {selectedShade.name}
            </div>
          </div>
          <div className="ck-hero-actions">
            <MagneticButton className="btn-primary" onClick={handleInitiatePurchase}>
              Complete Purchase
            </MagneticButton>
            <MagneticButton className="btn-secondary" href="/products#evofills">
              Browse Evo-Fills
            </MagneticButton>
          </div>
        </div>
        <div className="ck-hero-right">
          <img src={pricingImage} alt="Evo-Air Product" className="ck-product-img" />
        </div>
      </section>

      <section className="ck-includes">
        <div className="ck-includes-header ck-detail-intro">
          <div className="ck-section-headline">The Smart Beauty Advantage</div>
          <p className="ck-section-desc">
            Elevate your everyday makeup routine with professional-grade technology. The Evo-Air device gives you absolute control over your coverage, delivering a radiant, even complexion in seconds.
          </p>
        </div>

        <div className="ck-advantage-list">
          <div className="ck-advantage-item">3-Speed customizable airflow control</div>
          <div className="ck-advantage-item">Whisper-quiet motor technology</div>
          <div className="ck-advantage-item">USB-C Fast Charging</div>
          <div className="ck-advantage-item">Ergonomic, lightweight design</div>
          <div className="ck-advantage-item">Zero-touch hygienic application</div>
          <div className="ck-advantage-item">Dermatologist recommended technique</div>
        </div>

        <div className="ck-includes-header ck-feature-intro">
          <div className="ck-section-headline ck-feature-headline">Designed for Perfection</div>
          <p className="ck-section-desc">
            Engineered from premium materials to deliver a consistent, ultra-fine mist that sits flawlessly on top of your skin rather than settling into pores or fine lines.
          </p>
        </div>

        <div className="ck-feature-tags">
          {['Cordless', 'USB-C', '3-Speeds', 'Ultra-Light', 'Travel-Ready', 'Easy-Clean', 'Zero-Touch', 'Pro-Grade', 'Precision Nozzle', 'Long Battery Life'].map(tag => (
            <div key={tag} className="ck-tag">{tag}</div>
          ))}
        </div>
        
        <div className="ck-includes-header ck-process-intro">
          <div className="ck-section-headline">Seamless Application. Flawless Finish.</div>
        </div>

        <div className="bento-grid">
          <div className="bento-box bento-tall">
            <div className="bento-content">
              <div className="ck-include-number">01</div>
              <div className="ck-include-name">Charge & Click</div>
              <p className="bento-p">Ensure your device is charged via USB-C. Snap in an Evo-Fill blush capsule or your custom-filled Evo-Bottle.</p>
            </div>
            <img src={portrait1} alt="Application" className="bento-img bento-img-tall" />
          </div>

          <div className="bento-box bento-wide" style={{ backgroundImage: `url(${texture1})`, backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(0,0,0,0.8), transparent)' }}></div>
            <div className="bento-content" style={{ position: 'relative', zIndex: 2 }}>
              <div className="ck-include-number">02</div>
              <div className="ck-include-name">Select Speed</div>
              <p className="bento-p">Choose from 3 airflow speeds (Light, Medium, Full Coverage) to tailor your application intensity.</p>
            </div>
          </div>

          <div className="bento-box bento-wide" style={{ backgroundImage: `url(${texture2})`, backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(0,0,0,0.8), transparent)' }}></div>
            <div className="bento-content" style={{ position: 'relative', zIndex: 2 }}>
              <div className="ck-include-number">03</div>
              <div className="ck-include-name">Position & Mist</div>
              <p className="bento-p">Hold 6-8 inches from face. Move in slow, circular motions for a weightless, airbrushed glow.</p>
            </div>
          </div>

          <div className="bento-box bento-tall">
            <div className="bento-content">
              <div className="ck-include-number">04</div>
              <div className="ck-include-name">Capsule Lock</div>
              <p className="bento-p">Evo-Lock technology seals the capsule hermetically, preserving active ingredients and hygiene until the very last spray.</p>
            </div>
            <img src={spray1} alt="Micro-Mist" className="bento-img bento-img-tall" />
          </div>
        </div>
      </section>

      {/* ── FAQ Accordion ── */}
      <section className="ck-accordion-section">
        <div className="ck-section-headline">Frequently Asked Questions</div>
        <div className="ck-accordion-wrap">
          {[
            {
              q: "What is included with my purchase?",
              a: "Your Evo-Air purchase includes:<br/>• 1x Evo-Air Cordless Airbrush Device<br/>• 1x USB-C Fast-Charging Cable<br/>• 1x Travel Case<br/>• Comprehensive Quick-Start & Care Guide<br/><br/><em>Note: Evo-Fills and Evo-Bottles are sold separately. Check out the accessories below.</em>"
            },
            {
              q: "Can I use my existing foundation with Evo-Air?",
              a: "Yes! While our pre-filled Evo-Fills are specifically formulated for micro-atomization, you can use any liquid makeup, serum, or facial mist by purchasing our reusable Evo-Bottles."
            },
            {
              q: "How often do I need to clean the device?",
              a: "Thanks to our direct-capsule spray system, the device requires minimal maintenance. Simply run a few drops of warm water through the nozzle if switching between high-pigment products."
            },
            {
              q: "What is the return policy?",
              a: "We offer a 30-day satisfaction guarantee. If you're not completely in love with your airbrushed finish, return the device in its original packaging for a full refund."
            }
          ].map((item, index) => (
            <div 
              key={index} 
              className={`ck-accordion-item${openAccordion === index ? ' is-open' : ''}`}
            >
              <button 
                className="ck-accordion-header"
                onClick={() => toggleAccordion(index)}
              >
                <span>{item.q}</span>
                <span className="ck-accordion-icon">{openAccordion === index ? '−' : '+'}</span>
              </button>
              {openAccordion === index && (
                <div 
                  className="ck-accordion-body"
                  dangerouslySetInnerHTML={{ __html: item.a }}
                />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Accessories ── */}
      <section className="ck-accessories">
        <div className="ck-section-headline">Complete Your Kit</div>
        <div className="ck-acc-grid">
          <div className="ck-acc-card">
            <div className="ck-acc-number">01</div>
            <div className="ck-acc-name">Evo-Fills</div>
            <p className="ck-acc-desc">
              Pre-filled, zero-contamination foundation capsules designed for your Evo-Air. Just click and spray.
            </p>
            <div className="ck-acc-price">₹2,500</div>
            <MagneticButton className="btn-secondary" style={{ marginTop: '20px' }} href="/products#evofills">
              View
            </MagneticButton>
          </div>

          <div className="ck-acc-card">
            <div className="ck-acc-number">02</div>
            <div className="ck-acc-name">Evo-Bottles</div>
            <p className="ck-acc-desc">
              Want to use your own foundation? Buy our empty, refillable capsules. Pack of 20.
            </p>
            <div className="ck-acc-price">₹1,799</div>
            <MagneticButton className="btn-secondary" style={{ marginTop: '20px' }} href="/products#evobottles">
              View
            </MagneticButton>
          </div>
        </div>
      </section>

      {/* ── Checkout & Shipping Modal ── */}
      {checkoutModalOpen && (
        <div className="auth-modal-overlay" onClick={() => setCheckoutModalOpen(false)}>
          <div className="auth-modal-content ck-checkout-modal" onClick={e => e.stopPropagation()}>
            <button className="auth-modal-close" onClick={() => setCheckoutModalOpen(false)}>✕</button>

            <div className="auth-modal-header">
              <span className="auth-modal-brand">Evoluir · Checkout</span>
              <h2 className="auth-modal-title">Review & Delivery</h2>
              <p className="auth-modal-sub">Verify your server bag items and confirm your shipping address.</p>
            </div>

            {orderError && <div className="auth-modal-error">{orderError}</div>}

            {/* Server Cart Items (Reading price_paise directly from server) */}
            <div className="ck-order-summary-box">
              <div className="ck-order-summary-title">Bag Line Items (Server Source)</div>
              {loadingCart ? (
                <div style={{ fontSize: '12px', color: '#a0a0a5', padding: '10px 0' }}>Syncing server bag...</div>
              ) : (
                (serverCart?.items || []).map(item => (
                  <div key={item.item_id || item.variant_id} className="ck-review-item-row">
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '13px' }}>{item.product_name}</div>
                      <div style={{ fontSize: '11px', color: '#a0a0a5' }}>
                        {item.shade_name ? `Shade: ${item.shade_name} · ` : ''}Qty: {item.quantity}
                      </div>
                    </div>
                    <div style={{ fontWeight: 500, fontSize: '13px' }}>
                      ₹{((item.line_total_paise || (item.price_paise * item.quantity)) / 100).toLocaleString('en-IN')}
                    </div>
                  </div>
                ))
              )}
              <div className="ck-review-total-row">
                <span>Subtotal</span>
                <span>₹{((serverCart?.total_paise || 0) / 100).toLocaleString('en-IN')}</span>
              </div>
            </div>

            <form onSubmit={handlePlaceOrder} className="auth-modal-form" style={{ marginTop: '20px' }}>
              <div className="auth-input-group">
                <label>Recipient Name</label>
                <input
                  type="text"
                  required
                  placeholder="Full recipient name"
                  value={shippingAddress.name}
                  onChange={e => setShippingAddress({ ...shippingAddress, name: e.target.value })}
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
                  onChange={e => setShippingAddress({ ...shippingAddress, phone: e.target.value })}
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
                  onChange={e => setShippingAddress({ ...shippingAddress, line1: e.target.value })}
                  disabled={submitting}
                />
              </div>

              <div className="auth-input-group">
                <label>Address Line 2 (Optional)</label>
                <input
                  type="text"
                  placeholder="Apartment, suite, landmark"
                  value={shippingAddress.line2 || ''}
                  onChange={e => setShippingAddress({ ...shippingAddress, line2: e.target.value })}
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
                    onChange={e => setShippingAddress({ ...shippingAddress, city: e.target.value })}
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
                    onChange={e => setShippingAddress({ ...shippingAddress, state: e.target.value })}
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
                    onChange={e => setShippingAddress({ ...shippingAddress, pincode: e.target.value })}
                    disabled={submitting}
                  />
                </div>
              </div>

              <button type="submit" className="auth-submit-btn" disabled={submitting} style={{ marginTop: '16px' }}>
                {submitting ? 'Creating Order...' : `Confirm Order · ₹${((serverCart?.total_paise || 0) / 100).toLocaleString('en-IN')}`}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Order Confirmation Modal ── */}
      {orderComplete && (
        <div className="auth-modal-overlay">
          <div className="auth-modal-content" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '36px', color: '#42fcff', marginBottom: '14px' }}>✓</div>
            <span className="auth-modal-brand">Order Reserved</span>
            <h2 className="auth-modal-title">Order #{orderComplete.id} Placed</h2>
            <p className="auth-modal-sub" style={{ marginBottom: '18px' }}>
              Your order has been registered in status <strong>{orderComplete.status}</strong>.
              Total amount: <strong>₹{(orderComplete.total_amount_paise / 100).toLocaleString('en-IN')}</strong>.
            </p>
            <p style={{ fontSize: '12px', color: '#a0a0a5', marginBottom: '24px', lineHeight: 1.5 }}>
              Your items remain reserved. Secure payment gateway integration will be completed in the next phase.
            </p>
            <MagneticButton className="btn-primary" onClick={() => { setOrderComplete(null); window.location.hash = '#home'; }}>
              Return to Storefront
            </MagneticButton>
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

      {/* ── BlackHole Footer ── */}
      <footer className="black-hole-footer" style={{ position: 'relative', width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', overflow: 'hidden', padding: 0, background: 'transparent', borderTop: 'none' }}>
        <div className="black-hole-stage" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }}>
          <BlackHole />
        </div>
        <div className="footer-content" style={{ position: 'relative', zIndex: 10, width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '40px 50px', background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)', pointerEvents: 'none' }}>
          <div className="footer-copy">© 2026 Evoluir. All rights reserved.</div>
          <div className="footer-logo" style={{ color: '#ffffff' }}>Evoluir</div>
          <div className="footer-copy" style={{ flex: 1, textAlign: 'right', alignSelf: 'center' }}>Secure Checkout<br/>SSL Encrypted</div>
        </div>
      </footer>
    </div>
  );
};

export default Checkout;
