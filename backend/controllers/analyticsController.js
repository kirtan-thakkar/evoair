import * as analyticsService from '../services/analyticsService.js';
import { eventSchema } from '../validators/analyticsValidators.js';
import { ValidationError } from '../utils/errors.js';

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const validate = (schema, data) => {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error?.issues || result.error?.errors || [];
    const formatted = issues.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    throw new ValidationError('Validation failed', formatted);
  }
  return result.data;
};

export const getOverview = asyncHandler(async (req, res) => {
  const data = await analyticsService.getStoreAnalytics();
  res.status(200).json({
    status: 'success',
    data,
  });
});

export const logUserActivity = asyncHandler(async (req, res) => {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      throw new ValidationError('Invalid JSON body');
    }
  }

  const validated = validate(eventSchema, body || {});

  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';

  const logEntry = {
    timestamp: validated.timestamp || new Date().toISOString(),
    event: validated.event,
    path: validated.path || '/',
    sessionId: validated.sessionId || 'anon_session',
    userId: validated.userId || req.user?.id || null,
    ip,
    userAgent,
    metadata: validated.metadata || {},
  };

  await analyticsService.recordUserActivity(logEntry);

  res.status(200).json({ status: 'success' });
});
