import React, { useEffect, useState } from 'react';
import Layout from './Layout';
import MagneticButton from './MagneticButton';
import BlackHole from './BlackHole';
import newLogo from '../assets/new-logo.png';
import heroCapsules from '../assets/hero-capsules.png';
import texture1 from '../assets/texture1.png';
import portrait1 from '../assets/portrait1.png';
import spray1 from '../assets/spray1.png';
import texture2 from '../assets/texture2.png';
import { defaultShadeByFormula, fillFormulas } from '../data/productOptions';

const EvoBottles = () => {
  const [openAccordion, setOpenAccordion] = useState(null);
  const [selectedFormulaId, setSelectedFormulaId] = useState(fillFormulas[0].id);
  const selectedFormula = fillFormulas.find(formula => formula.id === selectedFormulaId);
  const [selectedShadeByFormula, setSelectedShadeByFormula] = useState(defaultShadeByFormula);
  const selectedShade = selectedShadeByFormula[selectedFormulaId];

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const toggleAccordion = (index) => {
    setOpenAccordion(openAccordion === index ? null : index);
  };

  return (
    <Layout>
      <div className="ck-page">
      {/* ── Sticky Nav ── */}
      <nav className="ck-nav">
        <a href="#home" className="nav-logo">
          <img src={newLogo} alt="Evoluir" style={{ height: '22px' }} />
          <span className="nav-wordmark">Evoluir</span>
        </a>
        <div className="nav-right">
          <MagneticButton className="btn-secondary" style={{ padding: '8px 20px', fontSize: '9px' }}
            onClick={() => window.location.hash = '#home'}>
            Back
          </MagneticButton>
        </div>
      </nav>

      {/* ── Hero: Split layout ── */}
      <section className="ck-hero">
        <div className="ck-hero-left">
          <div className="ck-title">Evo-Bottles</div>
          <div className="ck-subtitle-line">Your Signature Blend. Perfected.</div>
          <p className="ck-desc">
            Professional-grade refillable capsules for your Evo-Air device. Mix your own foundations, serums, or sunscreens and transform them into a micro-fine airbrush mist for a flawless finish.
          </p>
          <div className="ck-price-block">
            <span className="ck-price">₹1,799</span>
            <span className="ck-price-note">Pack of 20 · Free shipping</span>
          </div>
          <div className="ck-option-panel ck-fill-selector">
            <div className="ck-option-kicker">Choose Formula</div>
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
              Selected: {selectedFormula.name} · {selectedShade.code} {selectedShade.name}
            </div>
          </div>
          <div className="ck-hero-actions">
            <MagneticButton className="btn-primary"
              onClick={(e) => {
                e.preventDefault();
                alert(`Redirecting to secure payment gateway for Evo-Bottles with ${selectedFormula.name} ${selectedShade.code} ${selectedShade.name}.`);
              }}>
              Buy Now
            </MagneticButton>
            <MagneticButton className="btn-secondary" href="#checkout">
              Get The Device
            </MagneticButton>
          </div>
        </div>
        <div className="ck-hero-right">
          <img src={heroCapsules} alt="Evo-Bottles Refill Capsules" className="ck-product-img" />
        </div>
      </section>

      {/* ── Details Section ── */}
      <section className="ck-includes">
        <div className="ck-includes-header ck-detail-intro">
          <div className="ck-section-headline">The Smart Beauty Advantage</div>
          <p className="ck-section-desc">
            Empower your routine. Evo-Bottles give you the freedom to customize your coverage, mix your favorite skincare, and eliminate product waste.
          </p>
        </div>

        <div className="ck-advantage-list">
          <div className="ck-advantage-item">Mix custom shades and formulas</div>
          <div className="ck-advantage-item">Reusable and easy to clean</div>
          <div className="ck-advantage-item">Leak-proof secure seal</div>
          <div className="ck-advantage-item">Cost-effective beauty routine</div>
          <div className="ck-advantage-item">Universal fit for Evo-Air</div>
          <div className="ck-advantage-item">Travel-friendly 15ml capacity</div>
        </div>

        <div className="ck-includes-header ck-feature-intro">
          <div className="ck-section-headline ck-feature-headline">Designed for Sustainability</div>
          <p className="ck-section-desc">
            Built to last and easy to wash. Reduce single-use plastics while achieving a professional airbrushed look with your existing makeup collection.
          </p>
        </div>

        <div className="ck-feature-tags">
          {['BPA-Free', 'Reusable', 'Easy-Clean', 'Durable', 'Leak-Proof', 'Eco-Friendly', 'Multi-Use', 'Medical-Grade Polymer'].map(tag => (
            <div key={tag} className="ck-tag">{tag}</div>
          ))}
        </div>
        
        <div className="ck-includes-header ck-process-intro">
          <div className="ck-section-headline">Seamless Customization.</div>
        </div>

        <div className="bento-grid">
          <div className="bento-box bento-tall">
            <div className="bento-content">
              <div className="ck-include-number">01</div>
              <div className="ck-include-name">Mix & Fill</div>
              <p className="bento-p">Pour your favorite liquid foundation, serum, or toner into the Evo-Bottle.</p>
            </div>
            <img src={portrait1} alt="Application" className="bento-img bento-img-tall" />
          </div>

          <div className="bento-box bento-wide" style={{ backgroundImage: `url(${texture1})`, backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(0,0,0,0.8), transparent)' }}></div>
            <div className="bento-content" style={{ position: 'relative', zIndex: 2 }}>
              <div className="ck-include-number">02</div>
              <div className="ck-include-name">Seal & Insert</div>
              <p className="bento-p">Click the secure lid in place and snap the bottle firmly into your Evo-Air device nozzle.</p>
            </div>
          </div>

          <div className="bento-box bento-square" style={{ backgroundImage: `url(${spray1})`, backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)' }}></div>
            <div className="bento-content" style={{ position: 'relative', zIndex: 2 }}>
              <div className="ck-include-number">03</div>
              <div className="ck-include-name">Spray</div>
              <p className="bento-p">Transform your everyday products into an ultra-fine, flawless mist in seconds.</p>
            </div>
          </div>

          <div className="bento-box bento-square" style={{ backgroundImage: `url(${texture2})`, backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)' }}></div>
            <div className="bento-content" style={{ position: 'relative', zIndex: 2 }}>
              <div className="ck-include-number">04</div>
              <div className="ck-include-name">Wash & Reuse</div>
              <p className="bento-p">Simply rinse with warm water and cleanser, and it's ready for your next custom blend.</p>
            </div>
          </div>
        </div>

        {/* ── Accordions ── */}
        <div className="ck-accordion-container">
          <div className="ck-accordion-item">
            <button 
              className="ck-accordion-header" 
              onClick={() => toggleAccordion(0)}
              aria-expanded={openAccordion === 0}
            >
              <span>Care & Cleaning</span>
              <span className="ck-accordion-icon">+</span>
            </button>
            <div className="ck-accordion-content" aria-hidden={openAccordion !== 0}>
              After use, rinse the Evo-Bottle with warm water and a gentle cleanser or makeup remover. For deep cleaning, you can run water through the nozzle while attached to the Evo-Air device. Ensure the bottle is completely dry before filling with a new formula to prevent separation.
            </div>
          </div>
          
          <div className="ck-accordion-item">
            <button 
              className="ck-accordion-header" 
              onClick={() => toggleAccordion(1)}
              aria-expanded={openAccordion === 1}
            >
              <span>Specifications</span>
              <span className="ck-accordion-icon">+</span>
            </button>
            <div className="ck-accordion-content" aria-hidden={openAccordion !== 1}>
              <strong>Capacity:</strong> 15ml per bottle<br/>
              <strong>Material:</strong> BPA-Free Medical Grade Polymer<br/>
              <strong>Package Contents:</strong> 20 Reusable Bottles & Lids<br/>
              <strong>Compatibility:</strong> Designed exclusively for the Evo-Air Device<br/><br/>
              ➡️ Backed by our <strong>20-Day Return Guarantee</strong>
            </div>
          </div>
        </div>
      </section>

      {/* ── BlackHole Footer ── */}
      <footer className="black-hole-footer" style={{ position: 'relative', width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', overflow: 'hidden', padding: 0, background: 'transparent', borderTop: 'none' }}>
        <div className="black-hole-stage" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }}>
          <BlackHole />
        </div>
        <div className="footer-content" style={{ position: 'relative', zIndex: 10, width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '40px 50px', background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)', pointerEvents: 'none' }}>
          <div className="footer-copy" style={{ flex: 1, textAlign: 'left', alignSelf: 'center' }}>© 2026 Evoluir.<br/>All rights reserved.</div>
          <div className="footer-logo" style={{ color: '#ffffff', flex: 1, textAlign: 'center', lineHeight: 1 }}>Evoluir</div>
          <div className="footer-copy" style={{ flex: 1, textAlign: 'right', alignSelf: 'center' }}>Evo-Bottles<br/>Reusable Capsules</div>
        </div>
      </footer>
      </div>
    </Layout>
  );
};

export default EvoBottles;
