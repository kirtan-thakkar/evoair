import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/authenticate.js';
import * as orderController from '../controllers/orderController.js';

const router = express.Router();

// Strict checkout limiter to prevent automated bot drops and card testing (15 attempts / 15 min)
const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many order attempts from this IP. Please try again after 15 minutes.',
  },
});

router.use(authenticate);

router.post('/', orderLimiter, orderController.createOrder);
router.get('/', orderController.getOrders);
router.get('/:id', orderController.getOrderById);

export default router;
