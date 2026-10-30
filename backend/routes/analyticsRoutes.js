import express from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import * as analyticsController from '../controllers/analyticsController.js';

const router = express.Router();

// Public telemetry and user activity logging endpoint (beacon & fetch)
router.post('/events', analyticsController.logUserActivity);

// Protected Admin Overview
router.get('/overview', authenticate, requireAdmin, analyticsController.getOverview);

export default router;
