import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import AuthModal from './AuthModal';
import './AdminDashboard.css';

export const AdminDashboard = () => {
  const { user, authReady, logout } = useAuth();
  const [orders, setOrders] = useState([]);
  const [kpis, setKpis] = useState({
    totalOrders: 0,
    pendingOrders: 0,
    processingOrders: 0,
    inTransitOrders: 0,
    deliveredOrders: 0,
    totalRevenueRupees: 0,
  });
  const [activeStatus, setActiveStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [toast, setToast] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Debounce live search input by 250ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const showToast = useCallback((message, duration = 4000) => {
    setToast(message);
    const timer = setTimeout(() => setToast(null), duration);
    return () => clearTimeout(timer);
  }, []);

  // Fetch KPI statistics
  const fetchKpis = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/admin/kpis');
      if (res.ok) {
        const json = await res.json();
        if (json?.data?.kpis) {
          setKpis(json.data.kpis);
        }
      }
    } catch {
      // Handled silently
    }
  }, []);

  // Fetch paginated & filtered orders
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      // When searching, query globally across all statuses so searched orders are never hidden by the active tab
      if (!debouncedSearch && activeStatus && activeStatus !== 'all') {
        params.append('status', activeStatus);
      }
      if (debouncedSearch) {
        params.append('search', debouncedSearch);
      }
      params.append('limit', '100');

      const res = await api.get(`/api/v1/admin/orders?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setOrders(json?.data?.orders || []);
      }
    } catch {
      showToast('Failed to load orders. Please check network connection.');
    } finally {
      setLoading(false);
    }
  }, [activeStatus, debouncedSearch, showToast]);

  useEffect(() => {
    if (user && user.role === 'admin') {
      fetchKpis();
      fetchOrders();
    }
  }, [user, fetchKpis, fetchOrders]);

  // Handle Manual Order State Transitions
  const handleUpdateStatus = async (orderId, orderNumber, nextStatus) => {
    if (updatingId) return;
    setUpdatingId(orderId);

    try {
      const res = await api.patch(`/api/v1/admin/orders/${orderId}/status`, {
        status: nextStatus,
      });

      if (res.ok) {
        // Optimistic local state update
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o))
        );
        fetchKpis();

        const statusLabels = {
          processing: 'Preparing / In Atelier',
          in_transit: 'Dispatched & In Transit',
          delivered: 'Delivered',
        };
        showToast(`Order #${orderNumber} transitioned to "${statusLabels[nextStatus] || nextStatus}"`);
      } else {
        const errJson = await res.json().catch(() => ({}));
        showToast(errJson.message || 'Failed to update order state');
      }
    } catch (err) {
      showToast(err.message || 'Network error updating order state');
    } finally {
      setUpdatingId(null);
    }
  };

  // 1. Loading State while checking auth
  if (!authReady) {
    return (
      <div className="admin-dashboard-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#8e8e93', fontSize: '14px', letterSpacing: '0.1em' }}>
          VERIFYING ATELIER CREDENTIALS...
        </div>
      </div>
    );
  }

  // 2. Role Security Guard: Unauthorized access view
  if (!user || user.role !== 'admin') {
    return (
      <div className="admin-dashboard-page">
        <header className="admin-header">
          <div className="admin-header-inner">
            <div className="admin-brand-cluster">
              <a href="/" className="admin-brand-logo">EVOLUIR</a>
              <span className="admin-badge-atelier">ATELIER SECURE</span>
            </div>
            <a href="/" className="admin-nav-link">&larr; Return to Storefront</a>
          </div>
        </header>

        <div className="admin-main-container">
          <div className="admin-restricted-guard">
            <div className="admin-guard-icon">&#128274;</div>
            <h2 className="admin-guard-title">Atelier Restricted Access</h2>
            <p className="admin-guard-desc">
              This operations console is strictly reserved for authenticated Evoluir store administrators. 
              {user ? (
                <span> You are currently signed in as <strong>{user.email}</strong>, which does not hold administrator privileges.</span>
              ) : (
                <span> Please sign in with an authorized founder or administrator account.</span>
              )}
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                type="button"
                className="admin-primary-btn"
                onClick={() => setAuthModalOpen(true)}
              >
                Sign In with Admin Account
              </button>
              <a href="/" className="admin-nav-link" style={{ padding: '12px 18px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}>
                Storefront
              </a>
            </div>
          </div>
        </div>

        {authModalOpen && (
          <AuthModal
            isOpen={authModalOpen}
            onClose={() => setAuthModalOpen(false)}
          />
        )}
      </div>
    );
  }

  // 3. Authorized Admin Operations Dashboard
  return (
    <div className="admin-dashboard-page">
      {/* Sticky Header */}
      <header className="admin-header">
        <div className="admin-header-inner">
          <div className="admin-brand-cluster">
            <a href="/" className="admin-brand-logo">EVOLUIR</a>
            <span className="admin-badge-atelier">OPERATIONS ATELIER</span>
          </div>

          <div className="admin-actions-cluster">
            <div className="admin-user-pill">
              <span className="role-tag">ADMIN</span>
              <span>{user.email}</span>
            </div>
            <button
              type="button"
              className="admin-logout-btn"
              onClick={async () => {
                await logout();
                window.location.reload();
              }}
              title="Sign out of Admin Console"
            >
              Sign Out
            </button>
            <button
              type="button"
              className="admin-refresh-btn"
              onClick={() => {
                fetchKpis();
                fetchOrders();
                showToast('Telemetry refreshed');
              }}
            >
              &#8635; Refresh
            </button>
            <a href="/" className="admin-nav-link" title="Open Storefront">
              &larr; Storefront
            </a>
          </div>
        </div>
      </header>

      {/* Toast Alert */}
      {toast && (
        <div className="admin-toast-banner">
          <div className="admin-toast-inner">
            <span>&#10003; {toast}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              style={{ background: 'none', border: 'none', color: '#42fcff', cursor: 'pointer', fontSize: '16px' }}
            >
              &times;
            </button>
          </div>
        </div>
      )}

      <main className="admin-main-container">
        {/* KPI Dashboard Metrics */}
        <div className="admin-kpis-grid">
          <div className="admin-kpi-card">
            <div className="admin-kpi-label">Total Orders</div>
            <div className="admin-kpi-value">{kpis.totalOrders}</div>
            <div className="admin-kpi-caption">All-time lifetime orders</div>
          </div>

          <div className="admin-kpi-card kpi-pending">
            <div className="admin-kpi-label" style={{ color: '#facc15' }}>Awaiting Payment</div>
            <div className="admin-kpi-value" style={{ color: '#facc15' }}>{kpis.pendingOrders || 0}</div>
            <div className="admin-kpi-caption">Checkout initiated / unpaid</div>
          </div>

          <div className="admin-kpi-card kpi-processing">
            <div className="admin-kpi-label" style={{ color: '#fbbf24' }}>Needs Packing</div>
            <div className="admin-kpi-value" style={{ color: '#fbbf24' }}>{kpis.processingOrders}</div>
            <div className="admin-kpi-caption">Active orders in preparation</div>
          </div>

          <div className="admin-kpi-card kpi-transit">
            <div className="admin-kpi-label" style={{ color: '#38bdf8' }}>In Transit</div>
            <div className="admin-kpi-value" style={{ color: '#38bdf8' }}>{kpis.inTransitOrders}</div>
            <div className="admin-kpi-caption">Dispatched via priority courier</div>
          </div>

          <div className="admin-kpi-card kpi-delivered">
            <div className="admin-kpi-label" style={{ color: '#34d399' }}>Delivered</div>
            <div className="admin-kpi-value" style={{ color: '#34d399' }}>{kpis.deliveredOrders}</div>
            <div className="admin-kpi-caption">Successfully delivered</div>
          </div>

          <div className="admin-kpi-card kpi-revenue">
            <div className="admin-kpi-label" style={{ color: '#42fcff' }}>Total Revenue</div>
            <div className="admin-kpi-value" style={{ color: '#42fcff' }}>
              ₹{Number(kpis.totalRevenueRupees || 0).toLocaleString('en-IN')}
            </div>
            <div className="admin-kpi-caption">Gross merchandise value</div>
          </div>
        </div>

        {/* View Controls & Filter Tabs */}
        <div className="admin-controls-card">
          <div className="admin-status-tabs">
            <button
              type="button"
              className={`admin-tab-btn ${activeStatus === 'all' ? 'active' : ''}`}
              onClick={() => setActiveStatus('all')}
            >
              All Orders <span className="admin-tab-count">{kpis.totalOrders}</span>
            </button>
            <button
              type="button"
              className={`admin-tab-btn ${activeStatus === 'pending_payment' ? 'active' : ''}`}
              onClick={() => setActiveStatus('pending_payment')}
            >
              Awaiting Payment <span className="admin-tab-count">{kpis.pendingOrders || 0}</span>
            </button>
            <button
              type="button"
              className={`admin-tab-btn ${activeStatus === 'processing' ? 'active' : ''}`}
              onClick={() => setActiveStatus('processing')}
            >
              Processing / Atelier <span className="admin-tab-count">{kpis.processingOrders}</span>
            </button>
            <button
              type="button"
              className={`admin-tab-btn ${activeStatus === 'in_transit' ? 'active' : ''}`}
              onClick={() => setActiveStatus('in_transit')}
            >
              In Transit <span className="admin-tab-count">{kpis.inTransitOrders}</span>
            </button>
            <button
              type="button"
              className={`admin-tab-btn ${activeStatus === 'delivered' ? 'active' : ''}`}
              onClick={() => setActiveStatus('delivered')}
            >
              Delivered <span className="admin-tab-count">{kpis.deliveredOrders}</span>
            </button>
          </div>

          <div className="admin-search-wrapper">
            <span className="admin-search-icon">&#128269;</span>
            <input
              type="text"
              className="admin-search-input"
              placeholder="Filter by Order #, Name, Phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Orders Header */}
        <div className="admin-view-title">
          <span>Orders Management</span>
          <span className="sub-count">({orders.length} orders displayed)</span>
        </div>

        {/* Orders List */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#8e8e93', fontSize: '14px' }}>
            Retrieving atelier orders...
          </div>
        ) : orders.length === 0 ? (
          <div className="admin-empty-state">
            <h3 style={{ margin: '0 0 8px', color: '#ffffff', fontSize: '18px' }}>No Orders Found</h3>
            <p style={{ margin: 0, color: '#8e8e93', fontSize: '13px' }}>
              No orders currently match the selected status filter or search criteria.
            </p>
          </div>
        ) : (
          <div className="admin-orders-list">
            {orders.map((order) => {
              const addr = order.shipping_address || {};
              const orderDate = new Date(order.created_at).toLocaleString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });
              const subtotalRupees = Math.round((order.subtotal_paise || 0) / 100);
              const shippingRupees = Math.round((order.shipping_paise || 0) / 100);
              const totalRupees = Math.round((order.total_paise || 0) / 100);
              const isUpdating = updatingId === order.id;

              const statusBadgeClass =
                order.status === 'pending_payment'
                  ? 'status-pending_payment'
                  : order.status === 'processing'
                  ? 'status-processing'
                  : order.status === 'in_transit' || order.status === 'shipped'
                  ? 'status-in_transit'
                  : order.status === 'delivered'
                  ? 'status-delivered'
                  : '';

              const statusDisplayText =
                order.status === 'pending_payment'
                  ? 'Awaiting Payment'
                  : order.status === 'processing'
                  ? 'Processing / Atelier'
                  : order.status === 'in_transit' || order.status === 'shipped'
                  ? 'In Transit'
                  : order.status === 'delivered'
                  ? 'Delivered'
                  : order.status;

              return (
                <div key={order.id} className="admin-order-card">
                  {/* Card Header */}
                  <div className="admin-order-card-header">
                    <div className="admin-order-num-block">
                      <span className="admin-order-num">#{order.order_number}</span>
                      <span className={`admin-status-badge ${statusBadgeClass}`}>
                        &bull; {statusDisplayText}
                      </span>
                    </div>
                    <div className="admin-order-date">Placed: {orderDate}</div>
                  </div>

                  {/* 3-Column Content Breakdown */}
                  <div className="admin-order-grid">
                    {/* Customer & Shipping */}
                    <div>
                      <div className="admin-col-label">Customer & Delivery Address</div>
                      <div className="admin-customer-info">
                        <div><strong>{order.customer?.name || addr.name || 'Customer'}</strong></div>
                        <div>{order.customer?.email}</div>
                        <div>Phone: {order.customer?.phone || addr.phone || 'Not provided'}</div>
                        <div className="admin-address-text">
                          {addr.line1}
                          {addr.line2 ? `, ${addr.line2}` : ''}<br />
                          {addr.city}, {addr.state} - {addr.pincode}
                        </div>
                      </div>
                    </div>

                    {/* Ordered Items Breakdown */}
                    <div>
                      <div className="admin-col-label">
                        Ordered Items ({order.items?.length || 0})
                      </div>
                      <div className="admin-items-container">
                        {order.items?.map((item) => {
                          const itemRupees = Math.round((item.unit_price_paise || 0) / 100);
                          const totalItemRupees = itemRupees * (item.quantity || 1);
                          const isComplimentary =
                            (item.unit_price_paise === 0 || itemRupees === 0) &&
                            (item.product_slug === 'evo-bottles' ||
                              item.product_name?.toLowerCase().includes('bottle'));

                          return (
                            <div key={item.id} className="admin-item-row">
                              <div className="admin-item-left">
                                {item.color_hex && (
                                  <div
                                    className="admin-item-swatch"
                                    style={{ background: item.color_hex }}
                                    title={item.shade_name || 'Shade'}
                                  />
                                )}
                                <div>
                                  <div className="admin-item-title">
                                    {item.product_name}
                                    {item.formula && (
                                      <span className="admin-item-formula-badge">
                                        {item.formula}
                                      </span>
                                    )}
                                    {isComplimentary && (
                                      <span
                                        style={{
                                          marginLeft: '6px',
                                          padding: '1px 6px',
                                          background: 'rgba(66, 252, 255, 0.1)',
                                          border: '1px solid rgba(66, 252, 255, 0.3)',
                                          borderRadius: '4px',
                                          fontSize: '9px',
                                          color: '#42fcff',
                                          textTransform: 'uppercase',
                                        }}
                                      >
                                        Free Promo
                                      </span>
                                    )}
                                  </div>
                                  <div className="admin-item-shade-sub">
                                    Shade: <strong>{item.shade_name || 'Standard'}</strong>
                                    {item.shade_code ? ` (${item.shade_code})` : ''} &bull; Qty: {item.quantity}
                                  </div>
                                </div>
                              </div>
                              <div className="admin-item-pricing">
                                {isComplimentary ? (
                                  <span style={{ color: '#42fcff', fontWeight: 600 }}>
                                    <s style={{ opacity: 0.5, marginRight: '4px', color: '#a0a0a5' }}>₹1,799</s>
                                    ₹0
                                  </span>
                                ) : (
                                  `₹${totalItemRupees.toLocaleString('en-IN')}`
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Financial Summary */}
                    <div>
                      <div className="admin-col-label">Financials</div>
                      <div className="admin-financials-card">
                        <div className="admin-fin-row">
                          <span>Subtotal</span>
                          <span>₹{subtotalRupees.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="admin-fin-row">
                          <span>Shipping</span>
                          <span>{shippingRupees === 0 ? 'Complimentary' : `₹${shippingRupees}`}</span>
                        </div>
                        <div className="admin-fin-total">
                          <span>Total Paid</span>
                          <span className="amount">₹{totalRupees.toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer: Manual State Machine Switcher */}
                  <div className="admin-order-card-footer">
                    <div className="admin-dispatch-label">
                      Manual State Transition:
                    </div>

                    <div className="admin-state-switcher">
                      {order.status === 'pending_payment' && (
                        <button
                          type="button"
                          disabled={isUpdating}
                          className="admin-state-btn state-pending-action"
                          onClick={() => handleUpdateStatus(order.id, order.order_number, 'processing')}
                          title="Confirm offline payment and move to processing atelier"
                        >
                          {isUpdating ? '...' : '✓ Confirm Payment & Start Packing'}
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isUpdating}
                        className={`admin-state-btn ${order.status === 'processing' ? 'active state-processing' : ''}`}
                        onClick={() => handleUpdateStatus(order.id, order.order_number, 'processing')}
                        title="Set to Processing (Preparing in atelier)"
                      >
                        {isUpdating && order.status !== 'processing' ? '...' : '1. Processing'}
                      </button>

                      <button
                        type="button"
                        disabled={isUpdating}
                        className={`admin-state-btn ${order.status === 'in_transit' || order.status === 'shipped' ? 'active state-in_transit' : ''}`}
                        onClick={() => handleUpdateStatus(order.id, order.order_number, 'in_transit')}
                        title="Set to In Transit (Dispatched via courier)"
                      >
                        {isUpdating && order.status !== 'in_transit' ? '...' : '2. In Transit'}
                      </button>

                      <button
                        type="button"
                        disabled={isUpdating}
                        className={`admin-state-btn ${order.status === 'delivered' ? 'active state-delivered' : ''}`}
                        onClick={() => handleUpdateStatus(order.id, order.order_number, 'delivered')}
                        title="Set to Delivered (Customer received order)"
                      >
                        {isUpdating && order.status !== 'delivered' ? '...' : '3. Delivered'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminDashboard;
