import React from 'react';
import { useCart } from '../utils/cart';

export const CartNavButton = ({ className = '', style = {} }) => {
  const { totalCount } = useCart();

  return (
    <a
      href="/cart"
      className={`cart-nav-link ${className}`}
      aria-label={`Shopping cart with ${totalCount} items`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        color: 'inherit',
        textDecoration: 'none',
        padding: '8px 12px',
        ...style,
      }}
    >
      <svg
        width="19"
        height="19"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ display: 'block' }}
      >
        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      </svg>
      {totalCount > 0 && (
        <span
          className="cart-badge-count"
          style={{
            position: 'absolute',
            top: '2px',
            right: '2px',
            background: 'var(--accent, #f24c27)',
            color: '#fff',
            fontSize: '9px',
            fontWeight: '700',
            fontFamily: "'Satoshi', sans-serif",
            minWidth: '15px',
            height: '15px',
            borderRadius: '999px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 3px',
            lineHeight: 1,
            boxShadow: '0 0 8px rgba(242, 76, 39, 0.6)',
          }}
        >
          {totalCount}
        </span>
      )}
    </a>
  );
};

export default CartNavButton;
