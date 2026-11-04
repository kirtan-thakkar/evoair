import * as orderService from '../services/orderService.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const listOrders = async (req, res, next) => {
  try {
    const { status, search, page = 1, limit = 50 } = req.query;
    const result = await orderService.getAllOrdersForAdmin({
      status,
      search,
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 50,
    });

    res.status(200).json({
      status: 'success',
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

export const getOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      throw new AppError('Order ID parameter is required', 400);
    }

    const order = await orderService.getOrderByIdForAdmin(id);

    res.status(200).json({
      status: 'success',
      data: { order },
    });
  } catch (err) {
    next(err);
  }
};

export const updateOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!id) {
      throw new AppError('Order ID parameter is required', 400);
    }
    if (!status) {
      throw new AppError('Order status is required in request body', 400);
    }

    const updated = await orderService.updateOrderStatusByAdmin(id, status);

    logger.info(
      { adminUserId: req.user.id, orderId: id, newStatus: status },
      '[ADMIN_ACTION] Order status updated by authenticated admin'
    );

    res.status(200).json({
      status: 'success',
      message: `Order status updated to ${status}`,
      data: { order: updated },
    });
  } catch (err) {
    next(err);
  }
};

export const getKpis = async (req, res, next) => {
  try {
    const kpis = await orderService.getAdminKpis();
    res.status(200).json({
      status: 'success',
      data: { kpis },
    });
  } catch (err) {
    next(err);
  }
};
