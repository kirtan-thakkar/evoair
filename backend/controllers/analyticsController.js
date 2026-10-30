import * as analyticsService from '../services/analyticsService.js';

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

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
      body = {};
    }
  }

  const { event, path, sessionId, metadata, timestamp, userId } = body || {};
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'] || 'unknown';

  const logEntry = {
    timestamp: timestamp || new Date().toISOString(),
    event: event || 'unknown_event',
    path: path || '/',
    sessionId: sessionId || 'anon_session',
    userId: userId || null,
    ip,
    userAgent,
    metadata: metadata || {},
  };

  await analyticsService.recordUserActivity(logEntry);

  res.status(200).json({ status: 'success' });
});
