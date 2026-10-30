/**
 * Lightweight Frontend User Activity & Error Logger
 * Tracks:
 * - User navigation & page views (paths, query parameters, hashes)
 * - User interactions & button clicks (Shop, Add to Cart, Checkout, Auth, etc.)
 * - User drop-off / exit tracking (exit page, scroll depth %, time spent before tab close/nav away)
 * - Runtime errors & unhandled promise rejections for debugging
 */

// Generate or retrieve persistent session ID
const getSessionId = () => {
  try {
    let id = sessionStorage.getItem('evo_session_id');
    if (!id) {
      id = 'sess_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
      sessionStorage.setItem('evo_session_id', id);
    }
    return id;
  } catch {
    return 'sess_' + Date.now();
  }
};

let pageStartTime = Date.now();
let lastActionName = 'page_enter';
let isInitialized = false;

// Send telemetry event to backend
export const sendEvent = (event, metadata = {}) => {
  try {
    let userId = null;
    try {
      const userStr = localStorage.getItem('evo_user');
      if (userStr) {
        const parsed = JSON.parse(userStr);
        userId = parsed?.id || parsed?.email || null;
      }
    } catch {}

    const payload = {
      sessionId: getSessionId(),
      userId,
      event,
      path: window.location.pathname + window.location.search + window.location.hash,
      timestamp: new Date().toISOString(),
      metadata,
    };

    if (process.env.NODE_ENV !== 'production') {
      console.log(`%c[Activity Logger] 📡 ${event}`, 'color: #42fcff; font-weight: bold;', payload);
    }

    const jsonString = JSON.stringify(payload);

    // If page is unloading/exiting, prefer navigator.sendBeacon
    if (metadata.isExit && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([jsonString], { type: 'application/json' });
      const sent = navigator.sendBeacon('/api/v1/analytics/events', blob);
      if (sent) return;
    }

    // Standard asynchronous fetch
    fetch('/api/v1/analytics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: jsonString,
      keepalive: true,
    }).catch(() => {
      // Fail silently to prevent disrupting the user
    });
  } catch {
    // Fail silently
  }
};

// Track specific user action
export const logUserAction = (action, metadata = {}) => {
  lastActionName = action;
  sendEvent(action, metadata);
};

// Track page exit (where the user is leaving the website)
const handlePageExit = () => {
  const timeSpentSec = Math.round((Date.now() - pageStartTime) / 1000);
  const scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight || 1;
  const scrollDepthPct = Math.min(100, Math.round(((window.scrollY + window.innerHeight) / scrollHeight) * 100));

  sendEvent('page_exit', {
    isExit: true,
    exitPage: window.location.pathname + window.location.hash,
    timeSpentSec,
    scrollDepthPct,
    lastAction: lastActionName,
  });
};

export const initActivityLogger = () => {
  if (typeof window === 'undefined' || isInitialized) return;
  isInitialized = true;
  pageStartTime = Date.now();

  // 1. Initial Page View
  sendEvent('page_view', {
    referrer: document.referrer || null,
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight,
  });

  // 2. Track Route Changes (SPA hash & history changes)
  window.addEventListener('popstate', () => {
    sendEvent('route_change', { to: window.location.pathname + window.location.hash });
  });
  window.addEventListener('hashchange', () => {
    sendEvent('route_change', { to: window.location.pathname + window.location.hash });
  });

  // 3. Track User Exit (Tab close, backgrounding, navigation away)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      handlePageExit();
    } else if (document.visibilityState === 'visible') {
      pageStartTime = Date.now(); // reset on return
    }
  });
  window.addEventListener('pagehide', handlePageExit);

  // 4. Global Error Catching (for debugging when anything breaks)
  window.addEventListener('error', (event) => {
    sendEvent('error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack || null,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    sendEvent('unhandled_rejection', {
      reason: event.reason?.message || String(event.reason),
      stack: event.reason?.stack || null,
    });
  });

  // 5. Global Click Tracking (buttons, links, action elements)
  document.addEventListener(
    'click',
    (e) => {
      const target = e.target.closest('button, a, [data-track]');
      if (target) {
        const text =
          target.innerText?.trim()?.slice(0, 40) ||
          target.getAttribute('aria-label') ||
          target.className ||
          'button';
        const href = target.getAttribute('href');
        logUserAction('click', {
          element: target.tagName.toLowerCase(),
          text,
          href: href || undefined,
        });
      }
    },
    { passive: true }
  );
};
