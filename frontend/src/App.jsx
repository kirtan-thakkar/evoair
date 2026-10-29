import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

// Custom Components
import Noise from './components/Noise';
import Iridescence from './components/Iridescence';
import TextReveal from './components/TextReveal';
import MagneticButton from './components/MagneticButton';
import ModelViewer from './components/ModelViewer';
import Masonry from './components/Masonry';
import MagicRings from './components/MagicRings';
import BlackHole from './components/BlackHole';
import ShinyText from './components/ShinyText';
import CardSwap, { Card } from './components/CardSwap';
import AccordionGallery from './components/AccordionGallery';
import TechMobileCarousel from './components/TechMobileCarousel';

// Route Context & Nav Components
import CartNavButton from './components/CartIcon';
import { AuthProvider } from './context/AuthContext';
import { AuthNavButton } from './components/AuthModal';

// Media Assets
import newLogo from './assets/new-logo.png';
import portrait1 from './assets/portrait1.png';
import spray1 from './assets/spray1.png';
import heroCapsules from './assets/hero-capsules.png';
import texture1 from './assets/texture1.png';
import texture2 from './assets/texture2.png';
import girlDither from './assets/girl dither.jpg';
import revealVideo from './assets/reveal-video.mp4';

// Register GSAP ScrollTrigger
gsap.registerPlugin(ScrollTrigger);

const accordionItems = [
  {
    image: portrait1,
    value: '38',
    unit: 'dB',
    label: 'Near-silent operation',
    desc: 'Whisper-quiet acoustic dampening engineered for discreet daily vanity rituals.',
    alt: '38dB acoustic dampening'
  },
  {
    image: spray1,
    value: '0.1',
    unit: 'mm',
    label: 'Mist particle precision',
    desc: 'Micro-atomized droplet matrix creates a weightless, poreless veil.',
    alt: '0.1mm micro-atomization'
  },
  {
    image: heroCapsules,
    value: '4',
    unit: 'hr',
    label: 'Full charge autonomy',
    desc: 'High-density lithium architecture providing continuous cordless application.',
    alt: '4hr wireless runtime'
  },
  {
    image: texture1,
    value: 'Dual',
    unit: 'Flow™',
    label: 'Air & formula precision controller',
    desc: 'Independent formula feed and dynamic air-stream calibrated to perfection.',
    alt: 'DualFlow aerodynamics'
  },
  {
    image: texture2,
    value: '3',
    unit: 'sec',
    label: 'To flawless finish',
    desc: 'Touchless, even coverage across full complexion in under 3 seconds.',
    alt: '3sec finish'
  },
  {
    image: girlDither,
    value: 'IP',
    unit: '54',
    label: 'Water & dust sealed',
    desc: 'Aerospace-grade sealed titanium unibody crafted for endurance and travel.',
    alt: 'IP54 sealed titanium'
  }
];

const resolveCurrentRoute = () => {
  if (typeof window === 'undefined') return 'home';
  const hash = window.location.hash.toLowerCase();

  // Redirect legacy hash anchors directly to dedicated MPA routes
  if (hash === '#cart') {
    window.location.replace('/cart');
    return 'home';
  }
  if (hash === '#checkout') {
    window.location.replace('/cart#checkout');
    return 'home';
  }
  if (hash === '#products') {
    window.location.replace('/products');
    return 'home';
  }
  if (hash.startsWith('#evofills') || hash.startsWith('#evobottles')) {
    window.location.replace(`/products${hash}`);
    return 'home';
  }

  return 'home';
};

const recordNavSource = () => {
  if (typeof window === 'undefined') return;
  try {
    const sections = ['reveal-intro', 'airflow', 'craftsmanship', 'technology', 'pricing'];
    let visibleSection = 'reveal-intro';
    for (const id of sections) {
      const el = document.getElementById(id);
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.top <= window.innerHeight * 0.5 && rect.bottom >= window.innerHeight * 0.2) {
          visibleSection = id;
          break;
        }
      }
    }
    sessionStorage.setItem(
      'evo_nav_source',
      JSON.stringify({
        pathname: window.location.pathname,
        sectionId: visibleSection,
        scrollY: window.scrollY
      })
    );
  } catch {}
};

const scrollToTarget = (targetId, fallbackScrollY) => {
  const lenis = window.__lenis;
  if (fallbackScrollY !== undefined && fallbackScrollY !== null) {
    if (lenis) lenis.scrollTo(fallbackScrollY, { duration: 1.2 });
    else window.scrollTo({ top: fallbackScrollY, behavior: 'smooth' });
    return;
  }
  const el = document.getElementById(targetId);
  if (el) {
    if (lenis) lenis.scrollTo(el, { offset: -60, duration: 1.2 });
    else el.scrollIntoView({ behavior: 'smooth' });
  }
};

const MainApp = () => {
  const [currentRoute, setCurrentRoute] = useState(resolveCurrentRoute);
  const [loading, setLoading] = useState(() => {
    if (typeof window === 'undefined' || resolveCurrentRoute() !== 'home') return false;
    const hash = window.location.hash.toLowerCase();
    const played = sessionStorage.getItem('evo_intro_played') === 'true';
    return !(played || (hash && hash !== '#hero' && hash !== '#home'));
  });
  const [percent, setPercent] = useState(0);
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [hasRevealPlayed, setHasRevealPlayed] = useState(() => {
    if (typeof window === 'undefined' || resolveCurrentRoute() !== 'home') return true;
    const played = sessionStorage.getItem('evo_intro_played') === 'true';
    if (played) return true;
    const hash = window.location.hash.toLowerCase();
    return !!(hash && hash !== '#hero' && hash !== '#home');
  });

  const iridescenceRef = useRef(null);

  // Resize listener for mobile/desktop layout adaptation
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 1. Loading screen progress simulation
  useEffect(() => {
    if (currentRoute !== 'home' || !loading) return;

    let currentPercent = 0;
    const interval = setInterval(() => {
      currentPercent += Math.floor(Math.random() * 15) + 5;
      if (currentPercent >= 100) {
        currentPercent = 100;
        clearInterval(interval);

        setTimeout(() => {
          setLoading(false);
          setHasRevealPlayed(true);
          sessionStorage.setItem('evo_intro_played', 'true');
          startRevealTimeline();
        }, 300);
      }
      setPercent(currentPercent);
    }, 120);

    return () => clearInterval(interval);
  }, [currentRoute, loading]);

  // 2. Lenis Smooth Scrolling & Navigation Sync
  useEffect(() => {
    if (loading) return;

    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 1.05
    });
    window.__lenis = lenis;

    let rafId;
    const raf = (time) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    let scrollTimeout;
    lenis.on('scroll', (e) => {
      const navEl = document.querySelector('nav');
      if (navEl) {
        if (e.scroll > 60) {
          navEl.classList.add('scrolled');
        } else {
          navEl.classList.remove('scrolled');
        }
      }
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        recordNavSource();
      }, 150);
    });

    // Handle deep link scroll or restored position
    const initialHash = window.location.hash.replace('#', '').toLowerCase();
    if (initialHash && initialHash !== 'hero' && initialHash !== 'home' && initialHash !== 'cart') {
      setTimeout(() => scrollToTarget(initialHash), 150);
    } else {
      try {
        const stored = sessionStorage.getItem('evo_nav_source');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.sectionId && parsed.sectionId !== 'hero' && !parsed.pathname?.includes('/products')) {
            setTimeout(() => scrollToTarget(parsed.sectionId, parsed.scrollY), 150);
          }
        }
      } catch {}
    }

    const handleHashChange = () => {
      const target = window.location.hash.replace('#', '').toLowerCase();
      if (target && target !== 'hero' && target !== 'home' && target !== 'cart' && target !== 'checkout') {
        scrollToTarget(target);
      }
    };

    window.addEventListener('hashchange', handleHashChange);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      cancelAnimationFrame(rafId);
      lenis.destroy();
      window.__lenis = null;
    };
  }, [loading]);

  // 3. Intro Reveal Animation
  const startRevealTimeline = () => {
    const tl = gsap.timeline();
    if (iridescenceRef.current) {
      tl.to(iridescenceRef.current, { opacity: 0.08, duration: 1.5, ease: 'power2.out' }, 0.2);
    }
    const label = document.querySelector('.reveal-intro-label');
    const title = document.querySelector('.reveal-intro-title');
    const subtitle = document.querySelector('.reveal-intro-subtitle');
    const hint = document.getElementById('scroll-hint');
    const nav = document.querySelector('nav');

    if (label) tl.to(label, { opacity: 1, y: 0, duration: 1, ease: 'power2.out' }, 0.5);
    if (title) tl.to(title, { opacity: 1, y: 0, duration: 1.2, ease: 'power3.out' }, 0.7);
    if (subtitle) tl.to(subtitle, { opacity: 1, y: 0, duration: 1, ease: 'power2.out' }, 1.1);
    if (hint) tl.to(hint, { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out' }, 1.5);
    if (nav) tl.to(nav, { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out' }, 1.8);
  };

  // 4. ScrollTriggers for Sections
  useEffect(() => {
    if (loading || currentRoute !== 'home') return;

    const timer = setTimeout(() => {
      const ctx = gsap.context(() => {
        // Fade in scroll-reveal elements
        document.querySelectorAll('.scroll-reveal-el').forEach((el) => {
          gsap.fromTo(
            el,
            { opacity: 0, y: 40 },
            {
              opacity: 1,
              y: 0,
              duration: 0.9,
              ease: 'power2.out',
              scrollTrigger: {
                trigger: el,
                start: 'top 88%',
                toggleActions: 'play none none none'
              }
            }
          );
        });

        // Airflow reveal
        const airflowSec = document.getElementById('airflow');
        const afItems = document.querySelectorAll('.af-reveal');
        if (airflowSec && afItems.length) {
          gsap.fromTo(
            afItems,
            { opacity: 0, y: 40 },
            {
              opacity: 1,
              y: 0,
              stagger: 0.18,
              duration: 1,
              ease: 'power2.out',
              scrollTrigger: {
                trigger: airflowSec,
                start: 'top 70%'
              }
            }
          );
        }

        // Tech stats reveal
        const techSec = document.getElementById('technology');
        const techStats = document.querySelectorAll('.tech-stat');
        if (techSec && techStats.length) {
          gsap.fromTo(
            techStats,
            { opacity: 0, y: 30 },
            {
              opacity: 1,
              y: 0,
              stagger: 0.1,
              duration: 0.8,
              ease: 'power2.out',
              scrollTrigger: {
                trigger: techSec,
                start: 'top 75%'
              }
            }
          );
        }

        // Pricing card reveal
        const pricingSec = document.getElementById('pricing');
        const priceDisplay = document.getElementById('price-display');
        if (pricingSec && priceDisplay) {
          gsap.fromTo(
            priceDisplay,
            { scale: 0.93, opacity: 0, y: 50, rotate: -45 },
            {
              scale: 1,
              opacity: 1,
              y: 0,
              rotate: -45,
              duration: 2.2,
              ease: 'power3.out',
              scrollTrigger: {
                trigger: pricingSec,
                start: 'top 75%'
              }
            }
          );
        }
      });

      ScrollTrigger.refresh();
      return () => ctx.revert();
    }, 50);

    return () => clearTimeout(timer);
  }, [loading, currentRoute]);

  // 5. Route switch event listeners (hashchange + popstate)
  useEffect(() => {
    const handleRouteChange = () => {
      const nextRoute = resolveCurrentRoute();
      setCurrentRoute(nextRoute);
      if (nextRoute !== 'home') {
        setLoading(false);
      }
    };

    handleRouteChange();
    window.addEventListener('hashchange', handleRouteChange);
    window.addEventListener('popstate', handleRouteChange);

    return () => {
      window.removeEventListener('hashchange', handleRouteChange);
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, []);

  return (
    <>
      <Noise opacity={0.03} />

      {/* Loading Overlay */}
      {loading && (
        <div id="loading-overlay">
          <img
            src={newLogo}
            alt="Evoluir Logo"
            style={{
              width: '60px',
              height: '60px',
              objectFit: 'contain',
              filter: 'brightness(0) invert(1)',
              marginBottom: '10px',
              opacity: 0,
              transform: 'scale(0.95)',
              animation: 'loadLogoFade 1s ease forwards 0.2s'
            }}
          />
          <div className="loading-logo">Evoluir</div>
          <div className="loading-bar-container">
            <div className="loading-bar" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}

      {/* Main Page Content */}
      <div id="page" style={{ opacity: loading ? 0 : 1, transition: 'opacity 1s ease' }}>
        {/* Background Iridescence Canvas */}
        <div
          ref={iridescenceRef}
          style={{
            position: 'fixed',
            inset: 0,
            width: '100%',
            height: '100vh',
            pointerEvents: 'none',
            zIndex: 1,
            opacity: 0
          }}
        >
          <Iridescence />
        </div>

        {/* Luxury Top Navigation */}
        <nav
          className="luxury-nav"
          style={hasRevealPlayed ? { opacity: 1, transform: 'none' } : { opacity: 0, transform: 'translateY(-10px)' }}
        >
          <a className="nav-logo" href="#" aria-label="Evoluir Home">
            <img src={newLogo} alt="Evoluir Butterfly Logo" className="nav-logo-img" />
          </a>
          <div className="nav-actions-cluster">
            <MagneticButton
              href="/products"
              className="nav-btn-browse"
              onClick={() => recordNavSource()}
            >
              Shop
            </MagneticButton>
            <CartNavButton />
            <AuthNavButton />
          </div>
        </nav>

        {/* Section 1: Reveal Intro with Hero Video & Holographic Text */}
        <section id="reveal-intro">
          <div className="reveal-intro-container">
            <video
              src={revealVideo}
              autoPlay
              loop
              muted
              playsInline
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                position: 'absolute',
                top: 0,
                left: 0,
                zIndex: 1,
                opacity: 0.45
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(to bottom, #050505 0%, transparent 15%, transparent 85%, #050505 100%)',
                zIndex: 2,
                pointerEvents: 'none'
              }}
            />
            <div className="reveal-intro-content" style={{ zIndex: 3 }}>
              <div
                className="reveal-intro-label"
                style={hasRevealPlayed ? { opacity: 1, transform: 'none' } : { opacity: 0, transform: 'translateY(20px)' }}
              >
                <ShinyText text="introducing" speed={2.5} color="#88888b" shineColor="#ffffff" spread={90} />
              </div>
              <h2
                className="reveal-intro-title"
                style={hasRevealPlayed ? { opacity: 1, transform: 'none' } : { opacity: 0, transform: 'translateY(20px)' }}
              >
                <ShinyText text="EVOAIR" speed={3} color="#99999c" shineColor="#ffffff" spread={120} />
              </h2>
              <div
                className="reveal-intro-subtitle"
                style={hasRevealPlayed ? { opacity: 1, transform: 'none' } : { opacity: 0, transform: 'translateY(20px)' }}
              >
                DEBUT OF THE STARCAST COLLECTION
              </div>
            </div>
            <div id="scroll-hint" style={hasRevealPlayed ? { opacity: 1 } : { opacity: 0 }}>
              <div className="scroll-hint-text">Discover</div>
              <div className="scroll-line" />
            </div>
          </div>
        </section>

        {/* Section 2: Airflow (Precision Micro-Mist) */}
        <section id="airflow">
          <div className="container af-container-split">
            <div className="af-col-image">
              <img
                src={portrait1}
                alt="Evo Air Experience"
                style={{
                  width: '100%',
                  borderRadius: '16px',
                  opacity: 0.85,
                  WebkitMaskImage: 'radial-gradient(ellipse at center, black 65%, transparent 100%)',
                  maskImage: 'radial-gradient(ellipse at center, black 65%, transparent 100%)',
                  display: 'block'
                }}
                className="scroll-reveal-el"
              />
            </div>
            <div className="af-col-text">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h2 className="af-headline-primary af-reveal" style={{ margin: 0 }}>
                  <span><TextReveal>Designed for</TextReveal></span>
                  <span className="af-tajawal"><TextReveal>Skin.</TextReveal></span>
                </h2>
                <h2 className="af-headline-secondary af-reveal" style={{ margin: 0 }}>
                  <span><TextReveal>Perfected by</TextReveal></span>
                  <span className="af-tajawal"><TextReveal>Air.</TextReveal></span>
                </h2>
              </div>
              <p className="af-body af-reveal">
                Precision-controlled micro-mist delivers foundation at the exact pressure your skin requires.
              </p>
            </div>
          </div>
        </section>

        {/* Section 3: Craftsmanship with CardSwap */}
        <section id="craftsmanship">
          <div className="container">
            <div className="craft-grid">
              <div>
                <h2 className="craft-headline scroll-reveal-el">
                  <TextReveal>Every decision</TextReveal><br />
                  <TextReveal>earns its</TextReveal><br />
                  <TextReveal><em>place.</em></TextReveal>
                </h2>
              </div>
              <div className="craft-details">
                <CardSwap
                  cardDistance={isMobile ? 18 : 35}
                  verticalDistance={isMobile ? 24 : 45}
                  delay={4000}
                  pauseOnHover={true}
                  skewAmount={isMobile ? 2 : 4}
                  width={isMobile ? Math.min(window.innerWidth - 60, 310) : 420}
                  height={isMobile ? 210 : 280}
                >
                  <Card customClass="craft-item-card">
                    <div className="craft-item-label">Air pressure system</div>
                    <div className="craft-item-text">Mist, perfected.</div>
                    <div className="craft-item-accent">→ Micron-level delivery</div>
                  </Card>
                  <Card customClass="craft-item-card">
                    <div className="craft-item-label">Power architecture</div>
                    <div className="craft-item-text">Power that disappears into the experience.</div>
                    <div className="craft-item-accent">→ 4hr continuous autonomy</div>
                  </Card>
                  <Card customClass="craft-item-card">
                    <div className="craft-item-label">Dual-flow system</div>
                    <div className="craft-item-text">Foundation and air, dialed.</div>
                    <div className="craft-item-accent">→ DualFlow™ precision controller</div>
                  </Card>
                </CardSwap>
              </div>
            </div>
          </div>
        </section>

        {/* Section 4: Technology Masonry (Desktop) + Auto-Sliding Carousel (Mobile) */}
        <section id="technology">
          <div className="container">
            <div className="tech-header">
              <h2 className="tech-headline scroll-reveal-el">
                <TextReveal>Engineered to</TextReveal><br />
                <TextReveal><em>disappear.</em></TextReveal>
              </h2>
            </div>
            <div className="tech-masonry-desktop">
              <Masonry columns={3} gap={24}>
                <div className="tech-stat">
                  <div className="tech-stat-value">
                    38<span className="tech-stat-unit">dB</span>
                  </div>
                  <div className="tech-stat-label">Near-silent operation</div>
                </div>
                <div className="tech-stat">
                  <div className="tech-stat-value">
                    0.1<span className="tech-stat-unit">mm</span>
                  </div>
                  <div className="tech-stat-label">Mist particle precision</div>
                </div>
                <div className="tech-stat">
                  <div className="tech-stat-value">
                    4<span className="tech-stat-unit">hr</span>
                  </div>
                  <div className="tech-stat-label">Full charge autonomy</div>
                </div>
                <div className="tech-stat">
                  <div className="tech-stat-value">
                    Dual<span className="tech-stat-unit">Flow™</span>
                  </div>
                  <div className="tech-stat-label">Air & formula precision controller</div>
                </div>
                <div className="tech-stat">
                  <div className="tech-stat-value">
                    3<span className="tech-stat-unit">sec</span>
                  </div>
                  <div className="tech-stat-label">To flawless finish</div>
                </div>
                <div className="tech-stat">
                  <div className="tech-stat-value">
                    IP<span className="tech-stat-unit">54</span>
                  </div>
                  <div className="tech-stat-label">Water & dust sealed</div>
                </div>
              </Masonry>
            </div>
            <div className="tech-accordion-mobile">
              <TechMobileCarousel items={accordionItems} autoSlideInterval={3500} />
            </div>
          </div>
        </section>

        {/* Section 5: Pricing & 3D Interactive Model */}
        <section id="pricing">
          <div className="container scroll-reveal-el">
            <div className="pricing-headline">
              <span className="pricing-headline-line">The experience luxury brands</span>
              <span className="pricing-headline-line">were always meant to deliver.</span>
            </div>
            <div className="pricing-sub-copy">
              Designed in India. Built for the world.<br />
              Delivered to your door.
            </div>
            <div className="pricing-visual-centered">
              <MagicRings
                color="#fc42ff"
                colorTwo="#42fcff"
                ringCount={6}
                followMouse={true}
                hoverScale={1.2}
                clickBurst={true}
              >
                <ModelViewer src="/HEER_AS-10-1000010.glb" alt="Evo Air Device 3D Model" />
              </MagicRings>
            </div>
            <div className="pricing-bottom-actions">
              <div className="ck-price-block" style={{ marginBottom: '24px' }}>
                <span className="ck-price">₹14,999</span>
                <span className="ck-price-note">
                  Includes Device, Charging Cable, Case & EvoMix · Free shipping
                </span>
              </div>
              <div className="pricing-actions">
                <MagneticButton
                  href="/products"
                  className="btn-primary"
                  onClick={() => recordNavSource()}
                >
                  Acquire Now
                </MagneticButton>
              </div>
            </div>
          </div>
        </section>

        {/* Section 6: Black Hole Full-Bleed Footer */}
        <footer
          className="black-hole-footer"
          style={{
            position: 'relative',
            width: '100%',
            height: 'clamp(520px, 72vh, 800px)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            overflow: 'hidden',
            padding: 0,
            background: 'transparent',
            borderTop: 'none'
          }}
        >
          <div
            className="black-hole-stage"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              zIndex: 0
            }}
          >
            <BlackHole />
          </div>
          <div className="black-hole-top-fade" aria-hidden="true" />
          <div
            className="footer-content"
            style={{
              position: 'relative',
              zIndex: 10,
              width: '100%',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '40px 50px',
              background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
              pointerEvents: 'none'
            }}
          >
            <div className="footer-copy" style={{ flex: 1, textAlign: 'left', alignSelf: 'center' }}>
              © 2026 Evoluir.<br className="mobile-only" /> All rights reserved.
            </div>
            <div
              className="footer-logo"
              style={{ color: '#ffffff', flex: 1, textAlign: 'center', lineHeight: 1 }}
            >
              Evoluir
            </div>
            <div style={{ flex: 1 }} />
          </div>
        </footer>
      </div>
    </>
  );
};

const App = () => {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
};

export default App;
