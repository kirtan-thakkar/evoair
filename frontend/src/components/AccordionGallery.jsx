import React, { useState, useRef, useEffect, useCallback } from 'react';
import gsap from 'gsap';
import './AccordionGallery.css';

const defaultDemoItems = [
  { value: '38', unit: 'dB', label: 'Near-silent operation', alt: '38dB acoustic dampening' },
  { value: '0.1', unit: 'mm', label: 'Mist particle precision', alt: '0.1mm micro-atomization' },
  { value: '4', unit: 'hr', label: 'Full charge autonomy', alt: '4hr wireless runtime' },
  { value: 'Dual', unit: 'Flow™', label: 'Air & formula precision controller', alt: 'DualFlow™ aerodynamics' },
  { value: '3', unit: 'sec', label: 'To flawless finish', alt: '3sec finish' },
  { value: 'IP', unit: '54', label: 'Water & dust sealed', alt: 'IP54 sealed titanium' },
];

export const AccordionGallery = ({
  items = defaultDemoItems,
  defaultIndex = 1,
  accentColor = '#ffffff',
  overlayColor = '#060010',
  textColor = '#ffffff',
  height = 440,
  gap = 8,
  radius = 18,
  expandRatio = 0.52,
  orientation = 'horizontal',
  duration = 0.6,
  ease = 'power3.out',
  parallax = 0.5,
  tilt = 8,
  stagger = 0.06,
  trigger = 'hover',
  showLabels = true,
  grayscale = true,
  className = '',
}) => {
  const containerRef = useRef(null);
  const panelRefs = useRef([]);
  const mediaRefs = useRef([]);
  const barRefs = useRef([]);
  const textRefs = useRef([]);
  const timelineRef = useRef(null);
  const isFirstRender = useRef(true);
  const mediaSizeRef = useRef(320);

  const isVertical = orientation === 'vertical';
  const totalItems = items.length;
  const [activeIndex, setActiveIndex] = useState(
    Math.min(Math.max(defaultIndex, 0), totalItems - 1)
  );

  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  const animatePanels = useCallback(
    (animate) => {
      const panels = panelRefs.current;
      if (!panels.length) return;

      const clampedRatio = Math.min(Math.max(expandRatio, 0.2), 0.9);
      const activeFlexGrow = totalItems > 1 ? (clampedRatio * (totalItems - 1)) / (1 - clampedRatio) : 1;
      const mediaSize = mediaSizeRef.current;

      timelineRef.current?.kill();
      const dur = animate && !prefersReducedMotion ? duration : 0;
      const tl = gsap.timeline();

      panels.forEach((panel, i) => {
        if (!panel) return;
        const isActive = i === activeIndex;
        const media = mediaRefs.current[i];
        const bar = barRefs.current[i];
        const text = textRefs.current[i];
        const tiltDeg = isActive ? 0 : i < activeIndex ? tilt : -tilt;
        const rotationObj = isVertical ? { rotateX: -tiltDeg } : { rotateY: tiltDeg };

        tl.to(
          panel,
          {
            flexGrow: isActive ? activeFlexGrow : 1,
            ...rotationObj,
            duration: dur,
            ease,
          },
          0
        );

        if (media) {
          const pxOffset = Math.max(-1.5, Math.min(1.5, activeIndex - i)) * parallax * mediaSize * 0.06;
          const grayVal = grayscale ? (isActive ? 0 : 1) : 0;
          tl.to(
            media,
            {
              xPercent: -50,
              yPercent: -50,
              x: isVertical || isActive ? 0 : pxOffset,
              y: isVertical ? (isActive ? 0 : pxOffset) : 0,
              '--ag-gray': grayVal,
              '--ag-dim': isActive ? 0 : 0.35,
              duration: dur,
              ease,
            },
            0
          );
        }

        if (showLabels && bar && text) {
          if (isActive) {
            tl.to(
              [bar, text],
              {
                opacity: 1,
                x: 0,
                duration: dur,
                ease,
                stagger: prefersReducedMotion ? 0 : stagger,
              },
              0
            );
          } else {
            tl.to(
              [bar, text],
              {
                opacity: 0,
                x: -14,
                duration: dur * 0.6,
                ease,
              },
              0
            );
          }
        }
      });

      timelineRef.current = tl;
    },
    [activeIndex, totalItems, expandRatio, duration, ease, isVertical, tilt, parallax, grayscale, showLabels, stagger, prefersReducedMotion]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let rafId;
    const handleResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;
        const dim = isVertical ? rect.height : rect.width;
        const available = Math.max(dim - gap * (totalItems - 1), 120);
        const computedSize = Math.max(
          140,
          available * Math.min(Math.max(expandRatio, 0.2), 0.9) * 1.22
        );
        mediaSizeRef.current = computedSize;
        el.style.setProperty('--ag-media-size', `${computedSize}px`);
        animatePanels(!isFirstRender.current);
      });
    };

    handleResize();
    const observer = new ResizeObserver(handleResize);
    observer.observe(el);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [animatePanels, gap, totalItems, expandRatio, isVertical]);

  useEffect(() => {
    animatePanels(!isFirstRender.current);
    isFirstRender.current = false;
  }, [animatePanels]);

  useEffect(() => {
    return () => {
      timelineRef.current?.kill();
    };
  }, []);

  const handleMouseEnter = (idx) => {
    if (trigger === 'hover') setActiveIndex(idx);
  };

  const handleClick = (idx, e) => {
    if (idx !== activeIndex) {
      e.preventDefault();
      setActiveIndex(idx);
    }
  };

  const handleKeyDown = (idx, e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((idx + 1) % totalItems);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((idx - 1 + totalItems) % totalItems);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`accordion-gallery${isVertical ? ' accordion-gallery--vertical' : ''}${className ? ` ${className}` : ''}`}
      style={{
        '--ag-accent': accentColor,
        '--ag-overlay': overlayColor,
        '--ag-text': textColor,
        '--ag-gap': `${gap}px`,
        '--ag-radius': `${radius}px`,
        height: isVertical ? `${Math.round(height * 1.6)}px` : `${height}px`,
      }}
      role="list"
      aria-label="Technology feature accordion"
    >
      {items.map((item, idx) => {
        const isActive = idx === activeIndex;
        const Tag = item.link ? 'a' : 'div';
        return (
          <Tag
            key={idx}
            ref={(el) => (panelRefs.current[idx] = el)}
            className={`ag-panel${isActive ? ' ag-panel--active' : ''}`}
            style={{ borderRadius: `${radius}px` }}
            href={item.link || undefined}
            onClick={(e) => handleClick(idx, e)}
            onMouseEnter={() => handleMouseEnter(idx)}
            onFocus={() => setActiveIndex(idx)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            role="listitem"
            tabIndex={0}
            aria-current={isActive ? 'true' : undefined}
            aria-label={item.label}
          >
            <span className="ag-panel__frame">
              {item.image && (
                <span className="ag-panel__media" ref={(el) => (mediaRefs.current[idx] = el)}>
                  <img src={item.image} alt={item.alt || item.label || ''} draggable="false" />
                </span>
              )}
              <span className="ag-panel__overlay" aria-hidden="true" />
            </span>

            {showLabels && (
              <span className="ag-panel__label" aria-hidden="true">
                <span className="ag-panel__bar" ref={(el) => (barRefs.current[idx] = el)} />
                <span className="ag-panel__text" ref={(el) => (textRefs.current[idx] = el)}>
                  {item.value ? (
                    <span className="ag-panel__stat-block">
                      <span className="ag-panel__stat-value">
                        {item.value}
                        {item.unit && <span className="ag-panel__stat-unit">{item.unit}</span>}
                      </span>
                      <span className="ag-panel__stat-label">{item.label}</span>
                    </span>
                  ) : (
                    item.label
                  )}
                </span>
              </span>
            )}
          </Tag>
        );
      })}
    </div>
  );
};

export default AccordionGallery;
