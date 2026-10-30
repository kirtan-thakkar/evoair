import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import newLogo from '../assets/new-logo.png';

export const AuthModal = ({ isOpen, onClose, onSuccess, initialMode = 'login' }) => {
  const [mode, setMode] = useState(initialMode); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();

  useEffect(() => {
    setMode(initialMode);
    setError('');
  }, [initialMode, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (mode === 'register') {
      const cleanPhone = phone.replace(/\D/g, '').slice(0, 10);
      if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
        setError('Please enter a valid 10-digit Indian mobile number (e.g. 9876543210)');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters');
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email.trim(), password);
      } else {
        const cleanPhone = phone.replace(/\D/g, '').slice(0, 10);
        await register({
          name: name.trim(),
          email: email.trim(),
          password,
          phone: cleanPhone
        });
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-modal-overlay" onClick={onClose}>
      <div className="auth-modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Left Column: Brand Showcase */}
        <div className="auth-modal-left">
          <div className="auth-modal-left-inner">
            <div className="auth-modal-brand-lockup">
              <img src={newLogo} alt="Evoluir" className="auth-modal-logo-img" />
              <div className="auth-modal-brand-divider" />
              <div className="auth-modal-wordmark">Evoluir</div>
            </div>
            <div className="auth-modal-left-tagline">
              The future of<br />flawless skin.
            </div>
            <div className="auth-modal-left-sub">
              Designed in India.<br />Built for the world.
            </div>
          </div>
          <div className="auth-modal-left-footer">
            © 2026 Evoluir. All rights reserved.
          </div>
        </div>

        {/* Right Column: Form Container */}
        <div className="auth-modal-right">
          <button className="auth-modal-close" onClick={onClose} aria-label="Close modal">
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <line x1="1" y1="1" x2="11" y2="11" />
              <line x1="11" y1="1" x2="1" y2="11" />
            </svg>
          </button>

          <div className="auth-modal-header">
            <div className="auth-modal-eyebrow">
              {mode === 'login' ? 'Welcome back' : 'New member'}
            </div>
            <h2 className="auth-modal-title">
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </h2>
            <p className="auth-modal-sub">
              {mode === 'login'
                ? 'Access your bag, saved preferences, and checkout.'
                : 'Join for priority dispatch and personalized shade profiles.'}
            </p>
          </div>

          {error && <div className="auth-modal-error">{error}</div>}

          <form onSubmit={handleSubmit} className="auth-modal-form">
            {mode === 'register' && (
              <>
                <div className="auth-input-group">
                  <label>Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Maya Lin"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={loading}
                  />
                </div>

                <div className="auth-input-group">
                  <label>Mobile Number (10 Digits)</label>
                  <div className="auth-phone-input-wrap">
                    <span className="auth-phone-prefix">+91</span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={10}
                      required
                      placeholder="9876543210"
                      value={phone}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                        setPhone(val);
                      }}
                      disabled={loading}
                    />
                  </div>
                </div>
              </>
            )}

            <div className="auth-input-group">
              <label>Email Address</label>
              <input
                type="email"
                required
                placeholder="you@domain.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="auth-input-group">
              <label>
                Password {mode === 'register' ? '(Min. 8 characters)' : ''}
              </label>
              <input
                type="password"
                required
                minLength={mode === 'register' ? 8 : 1}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? 'Please wait…' : mode === 'login' ? 'Continue' : 'Create Account'}
            </button>
          </form>

          <div className="auth-modal-footer">
            <div className="auth-footer-divider">
              <span>{mode === 'login' ? "Don't have an account?" : 'Already registered?'}</span>
            </div>
            <button
              type="button"
              className="auth-secondary-btn"
              onClick={() => {
                setError('');
                setMode(mode === 'login' ? 'register' : 'login');
              }}
            >
              {mode === 'login' ? 'Create Account' : 'Sign In'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const AuthNavButton = ({ style = {} }) => {
  const { user, isAuthenticated, authReady, logout } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const dropdownRef = useRef(null);

  const updatePlacement = useCallback(() => {
    if (dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      // If inside bottom navigation or less than 240px space below, open upward
      const shouldOpenUp = spaceBelow < 240 || window.innerWidth <= 1024 || rect.top > window.innerHeight / 2;
      setOpenUpward(shouldOpenUp);
    }
  }, []);

  useEffect(() => {
    const handleOutsideInteraction = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideInteraction);
    document.addEventListener('touchstart', handleOutsideInteraction, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleOutsideInteraction);
      document.removeEventListener('touchstart', handleOutsideInteraction);
    };
  }, []);

  useEffect(() => {
    if (menuOpen) {
      updatePlacement();
      window.addEventListener('resize', updatePlacement);
      window.addEventListener('scroll', updatePlacement, { passive: true });
      return () => {
        window.removeEventListener('resize', updatePlacement);
        window.removeEventListener('scroll', updatePlacement);
      };
    }
  }, [menuOpen, updatePlacement]);

  if (!authReady) return null;

  if (!isAuthenticated) {
    return (
      <>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="auth-nav-trigger"
          aria-label="Sign In"
          title="Sign In"
          style={style}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="auth-nav-icon"
          >
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </button>
        <AuthModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
      </>
    );
  }

  const initial = user?.name ? user.name.charAt(0).toUpperCase() : 'U';
  const firstName = user?.name ? user.name.split(' ')[0] : 'Account';

  const toggleMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!menuOpen) {
      updatePlacement();
    }
    setMenuOpen((prev) => !prev);
  };

  return (
    <div
      ref={dropdownRef}
      className="auth-user-dropdown-wrap"
      style={{ position: 'relative', display: 'inline-block', ...style }}
    >
      <button
        type="button"
        onClick={toggleMenu}
        className="auth-user-pill"
        aria-expanded={menuOpen}
        aria-haspopup="true"
        aria-label="User account menu"
      >
        <span className="auth-user-avatar">{initial}</span>
        <span className="auth-user-name">{firstName}</span>
        <span
          className="auth-user-arrow"
          style={{ transform: menuOpen ? 'rotate(180deg)' : 'none' }}
        >
          ▾
        </span>
      </button>

      {menuOpen && (
        <div
          className={`auth-user-dropdown-menu ${openUpward ? 'placement-up' : 'placement-down'}`}
          onClick={(e) => e.stopPropagation()}
          role="menu"
        >
          <div className="auth-dropdown-user-header">
            <div className="auth-dropdown-user-name">
              {user?.name || 'Customer'}
            </div>
            <div className="auth-dropdown-user-email">
              {user?.email || ''}
            </div>
          </div>

          <a
            href={user?.id ? `/${user.id}/orders` : '/orders'}
            onClick={() => setMenuOpen(false)}
            className="auth-dropdown-item auth-dropdown-orders-link"
            role="menuitem"
          >
            <span className="auth-dropdown-icon">
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                <path d="M3 6h18" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
            </span>
            <span className="auth-dropdown-label">My Orders</span>
            <span className="auth-dropdown-arrow">→</span>
          </a>

          <button
            type="button"
            onClick={async (e) => {
              e.stopPropagation();
              setMenuOpen(false);
              await logout();
            }}
            className="auth-dropdown-item auth-dropdown-signout-btn"
            role="menuitem"
          >
            <span className="auth-dropdown-icon">
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </span>
            <span className="auth-dropdown-label">Sign Out</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default AuthModal;
