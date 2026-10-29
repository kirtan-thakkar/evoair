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
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

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

  return (
    <div
      ref={dropdownRef}
      className="auth-user-dropdown-wrap"
      style={{ position: 'relative', display: 'inline-block', ...style }}
    >
      <button
        type="button"
        onClick={() => setMenuOpen(!menuOpen)}
        className="auth-user-pill"
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
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            minWidth: '200px',
            background: '#09090b',
            border: '1px solid rgba(255, 255, 255, 0.14)',
            borderRadius: '14px',
            padding: '14px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.8), 0 0 20px rgba(242, 76, 39, 0.1)',
            zIndex: 9999
          }}
        >
          <div
            style={{
              paddingBottom: '10px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              marginBottom: '8px'
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 500, color: '#f5f5f7' }}>
              {user?.name}
            </div>
            <div
              style={{
                fontSize: '11px',
                color: '#a0a0a5',
                textOverflow: 'ellipsis',
                overflow: 'hidden'
              }}
            >
              {user?.email}
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              setMenuOpen(false);
              await logout();
            }}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              color: '#ff6b4a',
              textAlign: 'left',
              padding: '8px 4px',
              fontSize: '12px',
              cursor: 'pointer',
              borderRadius: '6px',
              fontWeight: 500
            }}
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
};

export default AuthModal;
