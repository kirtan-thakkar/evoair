import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import * as analyticsController from '../controllers/analyticsController.js';

const router = express.Router();

// Dedicated rate limiter for public telemetry to prevent log flooding & DoS (60 req per 15 min per IP)
const analyticsEventsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many analytics events from this IP. Please try again after 15 minutes.',
  },
});

// Public telemetry and user activity logging endpoint (beacon & fetch)
router.post('/events', analyticsEventsLimiter, analyticsController.logUserActivity);

// Protected Admin Overview
router.get('/overview', authenticate, requireAdmin, analyticsController.getOverview);

export default router;
