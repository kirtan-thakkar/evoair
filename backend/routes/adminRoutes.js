import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import * as adminController from '../controllers/adminController.js';

const router = Router();

// Strict security: require valid authentication AND role === 'admin'
router.use(authenticate, requireAdmin);

router.get('/kpis', adminController.getKpis);
router.get('/orders', adminController.listOrders);
router.get('/orders/:id', adminController.getOrder);
router.patch('/orders/:id/status', adminController.updateOrderStatus);

export default router;
