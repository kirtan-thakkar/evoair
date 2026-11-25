import React, { useRef, useState, useEffect } from 'react';
import { gsap } from 'gsap';

const MagneticButton = ({
  children,
  className = '',
  onClick,
  type = 'button',
  href,
  style = {},
  disabled = false,
  ...rest
}) => {
  const buttonRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const el = buttonRef.current;
    if (!el || disabled) return;

    const handleMouseMove = (e) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;

      // Magnetic pull: move the button towards the cursor
      // Max displacement 12px
      const pullX = x * 0.28;
      const pullY = y * 0.28;

      gsap.to(el, {
        x: pullX,
        y: pullY,
        scale: 1.03,
        duration: 0.45,
        ease: 'power2.out',
      });
    };

    const handleMouseLeave = () => {
      setIsHovered(false);
      gsap.to(el, {
        x: 0,
        y: 0,
        scale: 1,
        duration: 0.7,
        ease: 'power3.out', // Smooth return, no bounce
      });
    };

    const handleMouseEnter = () => {
      setIsHovered(true);
    };

    el.addEventListener('mousemove', handleMouseMove);
    el.addEventListener('mouseleave', handleMouseLeave);
    el.addEventListener('mouseenter', handleMouseEnter);

    return () => {
      el.removeEventListener('mousemove', handleMouseMove);
      el.removeEventListener('mouseleave', handleMouseLeave);
      el.removeEventListener('mouseenter', handleMouseEnter);
    };
  }, [disabled]);

  const Component = href ? 'a' : 'button';
  const props = href ? { href } : { type, onClick, disabled };

  return (
    <Component
      ref={buttonRef}
      className={`magnetic-button ${className} ${isHovered ? 'hovered' : ''}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'box-shadow 0.5s ease, border-color 0.5s ease',
        transformStyle: 'preserve-3d',
        ...style,
      }}
      {...props}
      {...rest}
    >
      {/* Subtle bloom glow backplate */}
      <span
        className="magnetic-button-glow"
        style={{
          position: 'absolute',
          inset: '-8px',
          borderRadius: 'inherit',
          background: 'radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%)',
          opacity: isHovered ? 1 : 0,
          transition: 'opacity 0.6s ease',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <span style={{ position: 'relative', zIndex: 1 }}>{children}</span>
    </Component>
  );
};

export default MagneticButton;
