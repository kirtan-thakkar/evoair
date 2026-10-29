import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Layout from './Layout';
import MagneticButton from './MagneticButton';
import CartNavButton from './CartIcon';
import { AuthNavButton } from './AuthModal';
import BlackHole from './BlackHole';
import newLogo from '../assets/new-logo.png';
import pricingImage from '../assets/product-pricing.png';
import heroCapsules from '../assets/hero-capsules.png';
import evoairRender from '../assets/evoair-render.png';
import evofillShell from '../assets/evofill-shell.png';
import evofillWindowShading from '../assets/evofill-window-shading.png';
import { addToCart } from '../utils/cart';
import texture1 from '../assets/texture1.png';
import portrait1 from '../assets/portrait1.png';
import spray1 from '../assets/spray1.png';
import texture2 from '../assets/texture2.png';
import { defaultShadeByFormula, fillFormulas } from '../data/productOptions';

const PRODUCT_TABS = [
  { id: 'evoair', label: 'Evo-Air Device', hasLogo: true },
  { id: 'evofills', label: 'Evo-Fills Refills' },
  { id: 'evobottles', label: 'Evo-Bottles Empty' }
];

// Preserved for cart and accessory flows
export const CompleteYourKit = () => (
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
);

const Products = () => {
  const getActiveProductFromHash = () => {
    if (typeof window === 'undefined') return 'evoair';
    const hash = window.location.hash.toLowerCase();
    if (hash === '#evofills') return 'evofills';
    if (hash === '#evobottles') return 'evobottles';
    return 'evoair';
  };

  const [activeProduct, setActiveProduct] = useState(getActiveProductFromHash);
  const [selectedFormulaId, setSelectedFormulaId] = useState(fillFormulas[0].id);
  const selectedFormula = fillFormulas.find(formula => formula.id === selectedFormulaId) || fillFormulas[0];
  const [selectedShadeByFormula, setSelectedShadeByFormula] = useState(defaultShadeByFormula);
  const selectedShade = selectedShadeByFormula[selectedFormulaId] || selectedFormula.shades[0];

  useEffect(() => {
    const handleHash = () => {
      const prod = getActiveProductFromHash();
      setActiveProduct(prod);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const switchProduct = (prod) => {
    setActiveProduct(prod);
    if (prod === 'evofills') {
      window.location.hash = '#evofills';
    } else if (prod === 'evobottles') {
      window.location.hash = '#evobottles';
    } else {
      window.location.hash = '#evoair';
    }
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = '/';
    }
  };

  return (
    <Layout>
      <div className="ck-page">
        <nav className="ck-nav">
          <div className="ck-nav-left" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <a
              href="/"
              onClick={(e) => {
                e?.preventDefault();
                e?.stopPropagation();
                handleBack();
              }}
              className="ck-back-btn"
              aria-label="Go back"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
            </a>
            <a href="/" className="nav-logo" aria-label="Evoluir Home">
              <img src={newLogo} alt="Evoluir Butterfly Logo" style={{ height: '22px' }} />
              <span className="nav-wordmark">Evoluir</span>
            </a>
          </div>
          <div className="nav-right" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <CartNavButton />
            <AuthNavButton />
            <MagneticButton
              href="/"
              className="btn-secondary"
              style={{ padding: '8px 20px', fontSize: '9px' }}
            >
              Back
            </MagneticButton>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="ck-hero">
          <div className="ck-hero-left">
            {/* Product Switcher Tabs with Motion Spring Pill and Butterfly Logo */}
            <div className="ck-product-switch-tabs">
              {PRODUCT_TABS.map((tab) => {
                const isActive = activeProduct === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    className={`ck-product-tab-btn ${isActive ? 'is-active' : ''}`}
                    onClick={() => switchProduct(tab.id)}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="active-product-pill"
                        className="ck-pill-active-bg"
                        transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                      />
                    )}
                    <span
                      className="ck-tab-btn-text"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '7px',
                        position: 'relative',
                        zIndex: 1
                      }}
                    >
                      {tab.hasLogo && (
                        <img
                          src={newLogo}
                          alt="Evo-Air Logo"
                          style={{
                            height: '11px',
                            width: 'auto',
                            filter: isActive ? 'brightness(0)' : 'brightness(0) invert(1)',
                            transition: 'filter 0.25s ease'
                          }}
                        />
                      )}
                      <span>{tab.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Pan-Up Animated Tab Panes */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeProduct}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="ck-product-tab-pane"
              >
                {activeProduct === 'evofills' ? (
                  <>
                    <div className="ck-title">Evo-Fills</div>
                    <div className="ck-subtitle-line">Blush Beyond Beauty</div>
                    <div className="ck-mobile-product-visual">
                      <div className="evofill-interactive-wrapper">
                        <svg viewBox="0 0 724 1024" className="evofill-svg-stage" xmlns="http://www.w3.org/2000/svg">
                          <defs>
                            <clipPath id="evofill-window-clip-mobile">
                              <path d="M 342 229 L 323 267 L 320 274 L 318 281 L 313 290 L 300 323 L 300 326 L 288 359 L 280 385 L 278 396 L 275 403 L 275 407 L 268 431 L 265 444 L 258 483 L 255 506 L 255 515 L 253 523 L 252 532 L 252 543 L 250 554 L 248 585 L 249 589 L 253 585 L 274 557 L 302 516 L 331 467 L 338 454 L 339 450 L 343 444 L 347 436 L 350 427 L 352 415 L 352 402 L 350 388 L 348 383 L 348 376 L 346 369 L 343 344 L 341 312 L 341 242 L 342 241 Z" />
                            </clipPath>
                          </defs>
                          <rect x="0" y="0" width="724" height="1024" fill={selectedShade.color} clipPath="url(#evofill-window-clip-mobile)" style={{ transition: 'fill 0.3s ease' }} />
                          <image href={evofillShell} x="0" y="0" width="724" height="1024" />
                          <image href={evofillWindowShading} x="0" y="0" width="724" height="1024" style={{ mixBlendMode: 'multiply', opacity: 0.85 }} />
                        </svg>
                      </div>
                    </div>
                    <p className="ck-desc">
                      Powered by precision beauty technology, this next-generation liquid blush delivers controlled, even color with every application. Its advanced lightweight formula blends effortlessly into the skin, creating a seamless, airbrushed flush that looks naturally diffused.
                    </p>
                    <div className="ck-price-block">
                      <span className="ck-price">{selectedFormula.price}</span>
                      <span className="ck-price-note">{selectedFormula.note} · Free shipping</span>
                    </div>
                    <div className="ck-option-panel ck-fill-selector">
                      <div className="ck-option-kicker">Choose Formula</div>
                      <div className="ck-segment-row">
                        {fillFormulas.map(formula => {
                          const isSelected = selectedFormulaId === formula.id;
                          return (
                            <button
                              key={formula.id}
                              type="button"
                              className={`ck-segment-choice${isSelected ? ' is-selected' : ''}`}
                              onClick={() => setSelectedFormulaId(formula.id)}
                              aria-pressed={isSelected}
                              style={{ position: 'relative' }}
                            >
                              {isSelected && (
                                <motion.span
                                  layoutId="active-formula-pill"
                                  className="ck-pill-active-bg"
                                  transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                                />
                              )}
                              <span className="ck-tab-btn-text" style={{ position: 'relative', zIndex: 1 }}>{formula.name}</span>
                            </button>
                          );
                        })}
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
                        Selected: {selectedFormula.name} · {selectedShade.code} {selectedShade.name}
                      </div>
                    </div>
                    <div className="ck-hero-actions">
                      <MagneticButton
                        className="btn-primary"
                        onClick={(e) => {
                          e.preventDefault();
                          const numPrice = parseInt(selectedFormula.price.replace(/[^\d]/g, ''), 10) || 2500;
                          addToCart({
                            id: `evofills-${selectedFormula.id}-${selectedShade.code}`,
                            name: `Evo-Fills Refill (${selectedFormula.name})`,
                            subtitle: `Shade: ${selectedShade.code} ${selectedShade.name} · 10 Pre-filled Capsules`,
                            formulaId: selectedFormula.id,
                            formulaName: selectedFormula.name,
                            shadeCode: selectedShade.code,
                            shadeName: selectedShade.name,
                            shadeSwatch: selectedShade.color,
                            price: selectedFormula.price,
                            numericPrice: numPrice,
                            image: heroCapsules,
                          });
                          window.location.href = '/cart';
                        }}
                      >
                        Add to Cart
                      </MagneticButton>
                      <MagneticButton
                        className="btn-secondary"
                        onClick={(e) => {
                          e.preventDefault();
                          switchProduct('evoair');
                        }}
                      >
                        Browse Evo-Air
                      </MagneticButton>
                    </div>
                  </>
                ) : activeProduct === 'evobottles' ? (
                  <>
                    <div className="ck-title">Evo-Bottles</div>
                    <div className="ck-subtitle-line">Your Signature Blend. Perfected.</div>
                    <div className="ck-mobile-product-visual">
                      <img src={heroCapsules} alt="Evo-Bottles Product" className="ck-product-img" />
                    </div>
                    <p className="ck-desc">
                      Professional-grade, empty, and reusable refill capsules for your Evo-Air device. Mix your own foundations, serums, or sunscreens and transform them into a micro-fine airbrush mist for a flawless finish.
                    </p>
                    <div className="ck-price-block">
                      <span className="ck-price">₹1,799</span>
                      <span className="ck-price-note">Pack of 20 · Free shipping</span>
                    </div>
                    <div className="ck-option-panel ck-fill-selector">
                      <div className="ck-selection-summary" style={{ marginTop: 0 }}>
                        Pack of 20 empty capsules · Compatible with all liquid foundations & formulas
                      </div>
                    </div>
                    <div className="ck-hero-actions">
                      <MagneticButton
                        className="btn-primary"
                        onClick={(e) => {
                          e.preventDefault();
                          addToCart({
                            id: 'evo-bottles-empty-pack',
                            name: 'Evo-Bottles Refill Capsules',
                            subtitle: 'Pack of 20 empty refillable capsules',
                            price: '₹1,799',
                            numericPrice: 1799,
                            image: heroCapsules,
                          });
                          window.location.href = '/cart';
                        }}
                      >
                        Add to Cart
                      </MagneticButton>
                      <MagneticButton
                        className="btn-secondary"
                        onClick={(e) => {
                          e.preventDefault();
                          switchProduct('evoair');
                        }}
                      >
                        Browse Evo-Air
                      </MagneticButton>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="ck-title">Evo-Air</div>
                    <div className="ck-subtitle-line">The Future of Flawless Skin.</div>
                    <div className="ck-mobile-product-visual">
                      <img src={evoairRender} alt="Evo-Air Product" className="ck-product-img" />
                    </div>
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
                        {fillFormulas.map(formula => {
                          const isSelected = selectedFormulaId === formula.id;
                          return (
                            <button
                              key={formula.id}
                              type="button"
                              className={`ck-segment-choice${isSelected ? ' is-selected' : ''}`}
                              onClick={() => setSelectedFormulaId(formula.id)}
                              aria-pressed={isSelected}
                              style={{ position: 'relative' }}
                            >
                              {isSelected && (
                                <motion.span
                                  layoutId="active-starter-formula-pill"
                                  className="ck-pill-active-bg"
                                  transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                                />
                              )}
                              <span className="ck-tab-btn-text" style={{ position: 'relative', zIndex: 1 }}>{formula.name}</span>
                            </button>
                          );
                        })}
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
                        Selected: {selectedFormula.name} · {selectedShade.code} {selectedShade.name}
                      </div>
                    </div>
                    <div className="ck-hero-actions">
                      <MagneticButton
                        className="btn-primary"
                        onClick={(e) => {
                          e.preventDefault();
                          addToCart({
                            id: 'evo-air-device',
                            name: 'Evo-Air Cordless Device',
                            subtitle: `Includes EvoMix, Charging Cable & Travel Case · Starter Shade: ${selectedShade.code} ${selectedShade.name}`,
                            formulaId: selectedFormula.id,
                            formulaName: selectedFormula.name,
                            shadeCode: selectedShade.code,
                            shadeName: selectedShade.name,
                            shadeSwatch: selectedShade.color,
                            price: '₹14,999',
                            numericPrice: 14999,
                            image: evoairRender,
                          });
                          window.location.href = '/cart';
                        }}
                      >
                        Add to Cart
                      </MagneticButton>
                      <MagneticButton
                        className="btn-secondary"
                        onClick={(e) => {
                          e.preventDefault();
                          switchProduct('evofills');
                        }}
                      >
                        Browse Evo-Fills
                      </MagneticButton>
                    </div>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Right Product Visual with Pan-Up Motion Animation */}
          <div className="ck-hero-right">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeProduct}
                initial={{ opacity: 0, scale: 0.98, y: 14 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: -14 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {activeProduct === 'evofills' ? (
                  <div className="evofill-interactive-wrapper">
                    <svg viewBox="0 0 724 1024" className="evofill-svg-stage" xmlns="http://www.w3.org/2000/svg">
                      <defs>
                        <clipPath id="evofill-window-clip">
                          <path d="M 342 229 L 323 267 L 320 274 L 318 281 L 313 290 L 300 323 L 300 326 L 288 359 L 280 385 L 278 396 L 275 403 L 275 407 L 268 431 L 265 444 L 258 483 L 255 506 L 255 515 L 253 523 L 252 532 L 252 543 L 250 554 L 248 585 L 249 589 L 253 585 L 274 557 L 302 516 L 331 467 L 338 454 L 339 450 L 343 444 L 347 436 L 350 427 L 352 415 L 352 402 L 350 388 L 348 383 L 348 376 L 346 369 L 343 344 L 341 312 L 341 242 L 342 241 Z" />
                        </clipPath>
                      </defs>
                      <rect x="0" y="0" width="724" height="1024" fill={selectedShade.color} clipPath="url(#evofill-window-clip)" style={{ transition: 'fill 0.3s ease' }} />
                      <image href={evofillShell} x="0" y="0" width="724" height="1024" />
                      <image href={evofillWindowShading} x="0" y="0" width="724" height="1024" style={{ mixBlendMode: 'multiply', opacity: 0.85 }} />
                    </svg>
                  </div>
                ) : activeProduct === 'evobottles' ? (
                  <img src={heroCapsules} alt="Evo-Bottles Product" className="ck-product-img" />
                ) : (
                  <img src={evoairRender} alt="Evo-Air Product" className="ck-product-img" />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </section>

        {/* 4-Step Bento Grid & Smart Beauty Advantage */}
        <section className="ck-includes">
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

            <div className="bento-box bento-square" style={{ backgroundImage: `url(${spray1})`, backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)' }}></div>
              <div className="bento-content" style={{ position: 'relative', zIndex: 2 }}>
                <div className="ck-include-number">03</div>
                <div className="ck-include-name">Airbrush</div>
                <p className="bento-p">Hold 4-6 inches away and sweep in slow circles for a flawless, studio-grade finish in seconds.</p>
              </div>
            </div>

            <div className="bento-box bento-square" style={{ backgroundImage: `url(${texture2})`, backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)' }}></div>
              <div className="bento-content" style={{ position: 'relative', zIndex: 2 }}>
                <div className="ck-include-number">04</div>
                <div className="ck-include-name">Clean</div>
                <p className="bento-p">Pop out the capsule and wipe the nozzle. Your device is immediately ready for your next application.</p>
              </div>
            </div>
          </div>

          {/* The Smart Beauty Advantage */}
          <div className="ck-includes-header ck-detail-intro">
            <div className="ck-section-headline">The Smart Beauty<br />Advantage</div>
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
        </section>

        {/* Full Size Black Hole Footer */}
        <footer className="black-hole-footer" style={{ position: 'relative', width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', overflow: 'hidden', padding: 0, background: 'transparent', borderTop: 'none' }}>
          <div className="black-hole-stage" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }}>
            <BlackHole />
          </div>
          <div className="footer-content" style={{ position: 'relative', zIndex: 10, width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '40px 50px', background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)', pointerEvents: 'none' }}>
            <div className="footer-copy" style={{ flex: 1, textAlign: 'left', alignSelf: 'center' }}>© 2026 Evoluir.<br/>All rights reserved.</div>
            <div className="footer-logo" style={{ color: '#ffffff', flex: 1, textAlign: 'center', lineHeight: 1 }}>Evoluir</div>
            <div className="footer-copy" style={{ flex: 1, textAlign: 'right', alignSelf: 'center' }}>Evo-Air™<br/>Products</div>
          </div>
        </footer>
      </div>
    </Layout>
  );
};

export default Products;
