import express from 'express';
import { authenticate } from '../middleware/authenticate.js';
import * as cartController from '../controllers/cartController.js';

const router = express.Router();

// Public calculation endpoint: calculates server pricing for guest items
router.post('/calculate', cartController.calculateCart);

// Protected routes (Customer authentication required)
router.use(authenticate);

router.get('/', cartController.getCart);
router.put('/', cartController.updateItem);
router.delete('/:variantId', cartController.removeItem);
router.delete('/', cartController.clearCart);
router.post('/sync', cartController.syncCart);

export default router;
