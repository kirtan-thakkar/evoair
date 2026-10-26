import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../utils/errors.js';
import { uuidSchema } from '../validators/commonValidators.js';

export const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Access token required'));
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });

    const subValidation = uuidSchema.safeParse(payload.sub);
    if (!subValidation.success) {
      return next(new UnauthorizedError('Invalid user ID in access token'));
    }

    req.user = {
      id: subValidation.data,
      role: payload.role,
    };

    next();
  } catch (err) {
    next(new UnauthorizedError('Invalid or expired access token'));
  }
};
