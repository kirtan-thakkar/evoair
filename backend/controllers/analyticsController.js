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
