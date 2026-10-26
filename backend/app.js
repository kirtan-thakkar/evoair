import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import pinoHttp from 'pino-http';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
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

const app = express();

// Trust proxy for reverse proxies / AWS ALB (when hops > 0)
if (env.TRUST_PROXY_HOPS > 0) {
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
}

// 1. Security Headers
app.use(helmet());

// 2. CORS (Strict allowed origin with credentials)
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));

// 3. Request Logging & Tracing with sensitive header redaction
app.use(
  pinoHttp({
    logger,
    genReqId: () => crypto.randomUUID(),
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

// 4. Global IP Rate Limiter across all routes and pages (Anti-scraping & DDoS protection)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // 200 requests per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many requests from this IP. Please try again after a few minutes.',
  },
});
app.use(globalLimiter);

// 5. Body Parsing with strict limits (DoS protection) & Cookie Parser
// Note: Webhook raw parsing (Phase 6) will be inserted BEFORE this in the future
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// 6. Response Compression
app.use(compression());

// --- ROUTES ---

// Health check endpoint (PostgreSQL ping)
app.get('/health', async (req, res) => {
  try {
    await checkDbHealth();
    res.status(200).json({ status: 'OK', message: 'Healthy', db: 'Connected' });
  } catch (error) {
    logger.error('Health check failed: DB not responding');
    res.status(503).json({ status: 'ERROR', message: 'Service Unavailable', db: 'Disconnected' });
  }
});

// API Versioning
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/catalog', catalogRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/cart', cartRoutes);
app.use('/api/v1/analytics', analyticsRoutes);

// Catch-all for unknown routes
app.use(notFoundHandler);

// Centralized Error Handling
app.use(errorHandler);

export default app;
