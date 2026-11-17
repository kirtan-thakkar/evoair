import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

const SENSITIVE_KEY_REGEX = /password|token|secret|authorization|cookie|credential|key/i;
const JWT_OR_BEARER_REGEX = /^(Bearer\s+)?[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*$/;

/**
 * Deeply sanitizes data to prevent leaking passwords, auth tokens, or secrets into logs
 */
export const sanitize = (data, depth = 0) => {
  if (data == null || depth > 5) return data;

  if (typeof data === 'string') {
    if (JWT_OR_BEARER_REGEX.test(data.trim())) {
      return '[REDACTED]';
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitize(item, depth + 1));
  }

  if (typeof data === 'object') {
    const isSensitiveFieldDesc =
      (typeof data.field === 'string' && SENSITIVE_KEY_REGEX.test(data.field)) ||
      (typeof data.path === 'string' && SENSITIVE_KEY_REGEX.test(data.path)) ||
      (Array.isArray(data.path) && data.path.some((p) => typeof p === 'string' && SENSITIVE_KEY_REGEX.test(p)));

    const clean = {};
    for (const [key, value] of Object.entries(data)) {
      if (SENSITIVE_KEY_REGEX.test(key)) {
        clean[key] = '[REDACTED]';
      } else if (isSensitiveFieldDesc && (key === 'value' || key === 'input' || key === 'received')) {
        clean[key] = '[REDACTED]';
      } else {
        clean[key] = sanitize(value, depth + 1);
      }
    }
    return clean;
  }

  return data;
};

export const errorHandler = (err, req, res, next) => {
  const requestId = req.id || req.headers?.['x-request-id'];
  const userId = req.user?.id;
  const isClientError =
    err instanceof AppError &&
    typeof err.statusCode === 'number' &&
    err.statusCode >= 400 &&
    err.statusCode < 500;

  if (isClientError) {
    const sanitizedDetails = err.errors !== undefined ? sanitize(err.errors) : undefined;

    logger.warn({
      requestId,
      userId,
      method: req.method,
      url: req.originalUrl,
      statusCode: err.statusCode,
      errorCode: err.code || err.name,
      message: err.message,
      details: sanitizedDetails,
    });

    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
      requestId,
      ...(err.errors && { errors: err.errors }),
    });
  }

  // 5xx or unexpected errors
  const statusCode =
    typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600
      ? err.statusCode
      : 500;

  logger.error({
    err,
    requestId,
    userId,
    method: req.method,
    url: req.originalUrl,
  });

  const message =
    env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message || 'Internal server error';

  return res.status(statusCode).json({
    status: 'error',
    message,
    requestId,
  });
};
