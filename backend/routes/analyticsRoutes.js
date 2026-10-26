import express from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import * as analyticsController from '../controllers/analyticsController.js';

const router = express.Router();

router.use(authenticate, requireAdmin);

// GET /api/v1/analytics/overview
router.get('/overview', analyticsController.getOverview);

export default router;
