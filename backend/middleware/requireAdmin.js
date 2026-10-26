import { eq } from 'drizzle-orm';
import { db } from '../config/db.js';
import { users } from '../db/schema.js';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';

export const requireAdmin = async (req, res, next) => {
  if (!req.user || !req.user.id) {
    return next(new UnauthorizedError('Authentication required'));
  }

  try {
    const [user] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, req.user.id))
      .limit(1);

    if (!user || user.role !== 'admin') {
      return next(new ForbiddenError('Admin access required'));
    }

    req.user.role = user.role;
    next();
  } catch (err) {
    next(err);
  }
};
