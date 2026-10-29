import React, { useEffect, useState } from 'react';
import Layout from './Layout';
import MagneticButton from './MagneticButton';
import newLogo from '../assets/new-logo.png';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../utils/api';
import { AuthNavButton, AuthModal } from './AuthModal';
import './OrdersPage.css';

const formatCurrency = (val) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(val);
};

const getStatusBadge = (status) => {
  switch (status?.toLowerCase()) {
    case 'paid':
    case 'confirmed':
      return { label: 'Order Confirmed', className: 'is-processing' };
    case 'processing':
    case 'preparing':
      return { label: 'Preparing Order', className: 'is-processing' };
    case 'shipped':
    case 'in_transit':
      return { label: 'Dispatched', className: 'is-processing' };
    case 'delivered':
      return { label: 'Delivered', className: 'is-delivered' };
    case 'pending_payment':
    default:
      return { label: 'Order Placed', className: 'is-pending' };
  }
};

const OrdersPage = () => {
  const { user, isAuthenticated, authReady } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [authModalOpen, setAuthModalOpen] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Route Protection: /orders is strictly for signed-in users. Redirect guests to home.
  useEffect(() => {
    if (authReady && !isAuthenticated) {
      window.location.replace('/');
    }
  }, [authReady, isAuthenticated]);

  useEffect(() => {
    if (!authReady) return;

    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    const fetchOrders = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await apiFetch('/api/v1/orders');
        const json = await res.json();

        if (!res.ok) {
          throw new Error(json.message || 'Failed to load orders');
        }

        setOrders(json.data?.orders || []);
      } catch (err) {
        setError(err.message || 'Error fetching orders');
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [authReady, isAuthenticated]);

  if (!authReady || !isAuthenticated) {
    return (
      <Layout>
        <div
          className="orders-page"
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#050505',
          }}
        >
          <div style={{ color: '#a0a0a5', fontSize: '13px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Verifying secure session...
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="orders-page">
        {/* ── Top Navigation Bar ── */}
        <nav className="orders-nav">
          <div className="orders-nav-left">
            <a href="/cart" className="orders-back-link">
              ← Return to Cart
            </a>
            <a href="/" className="orders-nav-logo">
              <img src={newLogo} alt="Evoluir" />
              <span className="orders-nav-wordmark">Evoluir</span>
            </a>
          </div>
          <div className="orders-nav-right">
            <MagneticButton
              href="/products"
              className="btn-secondary"
              style={{ padding: '8px 18px', fontSize: '9px' }}
            >
              Continue Shopping
            </MagneticButton>
            <AuthNavButton />
          </div>
        </nav>

        {/* ── Main Orders Container ── */}
        <main className="orders-container">
          <div className="orders-header">
            <span className="orders-sub-label">Evoluir · Customer Account</span>
            <h1 className="orders-title">Your Orders</h1>
            <p className="orders-desc">
              Track live package dispatch, expected delivery windows, and full transaction history recorded in PostgreSQL.
            </p>
          </div>

          {loading ? (
            /* ── Loading Skeleton ── */
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#a0a0a5', fontSize: '14px' }}>
              Retrieving your orders from database...
            </div>
          ) : error ? (
            /* ── Error Banner ── */
            <div
              style={{
                background: 'rgba(255, 75, 75, 0.08)',
                border: '1px solid rgba(255, 75, 75, 0.3)',
                color: '#ff7070',
                borderRadius: '14px',
                padding: '20px 24px',
                fontSize: '13.5px',
              }}
            >
              ⚠ {error}
            </div>
          ) : orders.length === 0 ? (
            /* ── Empty Orders State ── */
            <div className="orders-empty-state">
              <div className="orders-empty-icon">📦</div>
              <h2 className="orders-empty-title">No Orders Placed Yet</h2>
              <p className="orders-empty-sub">
                Your luxury acquisition archives will appear here as soon as you place your first order.
              </p>
              <MagneticButton
                href="/products"
                className="btn-primary"
                style={{ padding: '14px 28px', fontSize: '12px' }}
              >
                Explore Starcast Collection
              </MagneticButton>
            </div>
          ) : (
            /* ── Orders Stack ── */
            <div className="orders-list">
              {orders.map((order) => {
                const badge = getStatusBadge(order.status);
                const totalRupees = Math.round((order.total_paise || 0) / 100);

                const formattedCreatedDate = order.created_at
                  ? new Date(order.created_at).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Recent Order';

                const formattedDeliveryDate = order.expected_delivery_date
                  ? new Date(order.expected_delivery_date).toLocaleDateString('en-IN', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  : 'Within 4–6 Business Days';

                const shipping = order.shipping_address || {};

                return (
                  <article key={order.id} className="order-card">
                    {/* ── Order Header ── */}
                    <div className="order-card-header">
                      <div className="order-id-block">
                        <span className="order-id-label">Order Number</span>
                        <span className="order-id-code">
                          #{order.order_number || (order.id ? order.id.slice(0, 8).toUpperCase() : 'EVO')}
                        </span>
                      </div>
                      <div className="order-header-meta">
                        <span className="order-date">Placed: {formattedCreatedDate}</span>
                        <span className={`order-status-pill ${badge.className}`}>
                          ● {badge.label}
                        </span>
                      </div>
                    </div>

                    {/* ── Prominent Expected Delivery Date Banner ── */}
                    <div className="order-delivery-banner">
                      <div className="order-delivery-left">
                        <div className="order-delivery-icon-box">⚡</div>
                        <div className="order-delivery-info">
                          <span className="order-delivery-title">Expected Delivery Window</span>
                          <span className="order-delivery-date">{formattedDeliveryDate}</span>
                          <span className="order-delivery-sub">
                            Hand-prepared with precision. Tracking and manual updates coordinated directly.
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* ── Order Line Items ── */}
                    <div className="order-items-wrap">
                      <div className="order-items-title">Items in this Order</div>
                      {(order.items || []).map((item, idx) => {
                        const itemPriceRupees = Math.round((item.unit_price_paise || 0) / 100);
                        const itemTotalRupees = itemPriceRupees * (item.quantity || 1);
                        const formulaLabel =
                          item.formula && item.formula !== 'foundation' && item.formula !== 'accessories'
                            ? item.formula.charAt(0).toUpperCase() + item.formula.slice(1)
                            : null;

                        return (
                          <div key={item.id || idx} className="order-item-row">
                            <div className="order-item-left">
                              <div className="order-item-headline">
                                <span className="order-item-name">
                                  {item.product_name || 'Evo-Air Device'}
                                </span>
                                {formulaLabel && (
                                  <span className="order-item-formula-tag">
                                    {formulaLabel}
                                  </span>
                                )}
                              </div>
                              <div className="order-item-meta">
                                {item.color_hex && (
                                  <span
                                    className="order-item-swatch"
                                    style={{ backgroundColor: item.color_hex }}
                                  />
                                )}
                                {item.shade_name && (
                                  <span className="order-item-shade">
                                    {item.shade_code ? `${item.shade_code} · ` : ''}{item.shade_name}
                                  </span>
                                )}
                                <span className="order-item-qty">Qty: {item.quantity || 1}</span>
                              </div>
                            </div>
                            <span className="order-item-right">
                              ₹{itemTotalRupees.toLocaleString('en-IN')}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* ── Card Footer: Shipping Destination & Totals ── */}
                    <div className="order-card-footer">
                      <div className="order-shipping-summary">
                        <span className="order-shipping-title">Shipping Address</span>
                        <div className="order-shipping-dest">
                          <strong>{shipping.name || user?.name}</strong> · {shipping.phone || user?.phone}
                          <br />
                          {shipping.line1}
                          {shipping.line2 ? `, ${shipping.line2}` : ''}
                          <br />
                          {shipping.city}, {shipping.state} — {shipping.pincode}
                        </div>
                      </div>

                      <div className="order-price-summary">
                        <span className="order-price-label">Total Amount Paid</span>
                        <span className="order-price-total">
                          ₹{totalRupees.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </main>

        {/* ── Auth Modal if sign in needed ── */}
        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          onSuccess={() => setAuthModalOpen(false)}
        />
      </div>
    </Layout>
  );
};

export default OrdersPage;
