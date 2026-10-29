import React, { useState, useEffect, useRef, useCallback } from 'react';
import './TechMobileCarousel.css';

const TechMobileCarousel = ({ items = [], autoSlideInterval = 3500 }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  const total = items.length;

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % total);
  }, [total]);

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + total) % total);
  }, [total]);

  // Auto-slide effect
  useEffect(() => {
    if (isPaused || total <= 1) return;
    const timer = setInterval(() => {
      handleNext();
    }, autoSlideInterval);
    return () => clearInterval(timer);
  }, [isPaused, autoSlideInterval, handleNext, total]);

  // Touch Swipe Handlers
  const handleTouchStart = (e) => {
    setIsPaused(true);
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    setIsPaused(false);
    const diff = touchStartX.current - touchEndX.current;
    // 40px threshold for swipe
    if (Math.abs(diff) > 40) {
      if (diff > 0) {
        handleNext();
      } else {
        handlePrev();
      }
    }
    touchStartX.current = 0;
    touchEndX.current = 0;
  };

  if (!items || items.length === 0) return null;

  return (
    <div
      className="tech-carousel-wrap"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Main Slide Display */}
      <div
        className="tech-carousel-stage"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {items.map((item, idx) => {
          const isActive = idx === currentIndex;
          return (
            <div
              key={idx}
              className={`tech-slide ${isActive ? 'active' : ''}`}
              aria-hidden={!isActive}
            >
              <div className="tech-slide-media">
                <img src={item.image} alt={item.alt || item.label} />
              </div>
              <div className="tech-slide-overlay" />
              <div className="tech-slide-content">
                <div className="tech-slide-badge">
                  <div className="tech-slide-bar" />
                  <span className="tech-slide-counter">
                    {String(idx + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
                  </span>
                </div>

                <div className="tech-slide-stat-block">
                  <span className="tech-slide-value">{item.value}</span>
                  {item.unit && <span className="tech-slide-unit">{item.unit}</span>}
                </div>

                <div className="tech-slide-label">{item.label}</div>
                {item.desc && <div className="tech-slide-desc">{item.desc}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Controls Bar: Prev Arrow, Dots, Next Arrow */}
      <div className="tech-carousel-controls">
        <button
          type="button"
          className="tech-carousel-arrow"
          onClick={handlePrev}
          aria-label="Previous slide"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div className="tech-carousel-dots">
          {items.map((_, idx) => (
            <button
              key={idx}
              type="button"
              className={`tech-dot ${idx === currentIndex ? 'active' : ''}`}
              onClick={() => setCurrentIndex(idx)}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>

        <button
          type="button"
          className="tech-carousel-arrow"
          onClick={handleNext}
          aria-label="Next slide"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default TechMobileCarousel;
