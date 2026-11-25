import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/authenticate.js';
import * as paymentController from '../controllers/paymentController.js';

const router = express.Router();

const paymentRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60, // 60 payment attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many payment requests from this IP. Please try again later.',
  },
});

router.post('/create-order', paymentRateLimiter, authenticate, paymentController.createRazorpayOrder);
router.post('/verify', paymentRateLimiter, authenticate, paymentController.verifyPayment);
router.post('/webhook', paymentController.handleWebhook);

// PayU India Hosted Checkout & Webhook Routes
router.post('/payu/initiate', paymentRateLimiter, authenticate, paymentController.initiatePayuPayment);
router.post('/payu/callback', paymentController.handlePayuCallback);
router.get('/payu/callback', paymentController.handlePayuCallback);
router.post('/payu/webhook', paymentController.handlePayuWebhook);

export default router;
