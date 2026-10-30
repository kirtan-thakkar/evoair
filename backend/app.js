import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import pinoHttp from 'pino-http';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFound.js';
import { checkDbHealth } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import catalogRoutes from './routes/catalogRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import cartRoutes from './routes/cartRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDist = path.join(__dirname, '../frontend/dist');

const app = express();
app.disable('x-powered-by');

// Trust proxy for reverse proxies / AWS ALB (when hops > 0)
if (env.TRUST_PROXY_HOPS > 0) {
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
}

// 1. Request Logging & Tracing with clean serializers (omits noisy header dumps in console)
app.use(
  pinoHttp({
    logger,
    genReqId: () => crypto.randomUUID(),
    serializers: {
      req: (req) => ({
        id: req.id,
        method: req.method,
        url: req.url,
      }),
      res: (res) => ({
        statusCode: res.statusCode,
      }),
    },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["idempotency-key"]',
        'res.headers["set-cookie"]',
      ],
      censor: '[Redacted]',
    },
    customLogLevel: (req, res, err) => {
      if (res.statusCode >= 400 && res.statusCode < 500) return 'warn';
      if (res.statusCode >= 500 || err) return 'error';
      return 'info';
    },
  })
);

// 2. Health check endpoint (PostgreSQL ping)
// Placed before helmet & rate-limiter so it returns a clean, minimal header response without header clutter
app.get('/health', async (req, res) => {
  try {
    await checkDbHealth();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.status(200).json({ status: 'OK', message: 'Healthy', db: 'Connected' });
  } catch (error) {
    logger.error('Health check failed: DB not responding');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.status(503).json({ status: 'ERROR', message: 'Service Unavailable', db: 'Disconnected' });
  }
});
app.options('/health', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.sendStatus(204);
});

// 3. Security Headers (configured to allow 3D models, WASM, and web fonts)
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// 4. CORS (Allows development localhost ports 5173, 5174, etc., with credentials)
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const isLocalhost = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
      if (env.NODE_ENV !== 'production' && isLocalhost) {
        return callback(null, true);
      }
      if (env.CORS_ORIGIN && origin === env.CORS_ORIGIN) {
        return callback(null, true);
      }
      return callback(null, env.NODE_ENV !== 'production');
    },
    credentials: true,
  })
);

// 5. Global IP Rate Limiter across all routes and pages (Anti-scraping & DDoS protection)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === 'production' ? 200 : 50000, // Generous in dev (50,000) to prevent false offline lockouts
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many requests from this IP. Please try again after a few minutes.',
  },
});
app.use(globalLimiter);

// 6. Body Parsing with strict limits (DoS protection) & Cookie Parser
// Note: Webhook raw parsing (Phase 6) will be inserted BEFORE this in the future
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// 7. Response Compression
app.use(compression());

// Prevent browser and proxy caching on all API routes so data is always fresh from backend
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

// --- API ROUTES ---

// API Versioning
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/catalog', catalogRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/cart', cartRoutes);
app.use('/api/v1/analytics', analyticsRoutes);

// --- STATIC FRONTEND SERVING (UNIFIED CONTAINER / EC2) ---
// Serve frontend static assets (CSS, JS, 3D models, fonts, audio, video)
app.use(express.static(frontendDist));
app.use('/Evoair', express.static(frontendDist));

// Multi-page entrypoints
app.get(['/products', '/products.html', '/Evoair/products', '/Evoair/products.html'], (req, res) => {
  res.sendFile(path.join(frontendDist, 'products.html'));
});
app.get(['/cart', '/cart.html', '/Evoair/cart', '/Evoair/cart.html'], (req, res) => {
  res.sendFile(path.join(frontendDist, 'cart.html'));
});
app.get(['/checkout', '/checkout.html', '/Evoair/checkout', '/Evoair/checkout.html'], (req, res) => {
  res.sendFile(path.join(frontendDist, 'checkout.html'));
});
app.get(
  [
    '/orders',
    '/orders.html',
    '/Evoair/orders',
    '/Evoair/orders.html',
    '/:id/orders',
    '/Evoair/:id/orders',
    '/user/:id/orders',
    '/Evoair/user/:id/orders',
  ],
  (req, res) => {
    res.sendFile(path.join(frontendDist, 'orders.html'));
  }
);
app.get(['/', '/index.html', '/Evoair', '/Evoair/index.html'], (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

// Catch-all for unknown routes (only API routes that didn't match get 404 JSON, or 404 page)
app.use(notFoundHandler);

// Centralized Error Handling
app.use(errorHandler);

export default app;
