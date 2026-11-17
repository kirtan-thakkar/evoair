import * as paymentService from '../services/paymentService.js';
import {
  createPaymentOrderSchema,
  verifyPaymentSchema,
} from '../validators/paymentValidators.js';
import { ValidationError } from '../utils/errors.js';

const validate = (schema, data) => {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues ?? result.error.errors ?? [];
    const formatted = issues.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    throw new ValidationError('Validation failed', formatted);
  }
  return result.data;
};

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export const createRazorpayOrder = asyncHandler(async (req, res) => {
  const { orderId } = validate(createPaymentOrderSchema, req.body);
  const result = await paymentService.createRazorpayOrder(req.user.id, orderId);

  res.status(200).json({
    status: 'success',
    data: result,
  });
});

export const verifyPayment = asyncHandler(async (req, res) => {
  const validatedBody = validate(verifyPaymentSchema, req.body);
  const result = await paymentService.verifyPayment(req.user.id, validatedBody);

  res.status(200).json({
    status: 'success',
    data: result,
  });
});

export const handleWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const rawBody = req.rawBody || req.body;

  const result = await paymentService.processWebhook({ rawBody, signature });

  res.status(200).json({
    status: 'success',
    data: result,
  });
});
