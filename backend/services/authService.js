import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { eq, sql } from 'drizzle-orm';
import { OAuth2Client } from 'google-auth-library';
import { db } from '../config/db.js';
import { users } from '../db/schema.js';
import { env } from '../config/env.js';
import { AppError, UnauthorizedError } from '../utils/errors.js';
import { uuidSchema } from '../validators/commonValidators.js';

// Precomputed valid bcrypt hash with 10 salt rounds to defend against timing attacks
const DUMMY_HASH = bcrypt.hashSync('dummy_timing_protection_hash', 10);

const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { sub: String(user.id), role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN, algorithm: 'HS256' }
  );

  const refreshToken = jwt.sign(
    { sub: String(user.id), tokenVersion: user.refresh_token_version },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN, algorithm: 'HS256' }
  );

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatar_url: user.avatar_url || null,
      role: user.role,
      created_at: user.created_at,
    },
  };
};

export const registerUser = async ({ name, email, phone, password }) => {
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  try {
    const [newUser] = await db
      .insert(users)
      .values({
        name,
        email: email.toLowerCase(),
        phone,
        password_hash: passwordHash,
        role: 'customer',
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        avatar_url: users.avatar_url,
        role: users.role,
        refresh_token_version: users.refresh_token_version,
        created_at: users.created_at,
      });

    return generateTokens(newUser);
  } catch (err) {
    if ((err.code ?? err.cause?.code) === '23505') {
      throw new AppError('Email is already registered', 409);
    }
    throw err;
  }
};

export const loginUser = async ({ email, password }) => {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      avatar_url: users.avatar_url,
      role: users.role,
      password_hash: users.password_hash,
      refresh_token_version: users.refresh_token_version,
      created_at: users.created_at,
    })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (!user || !user.password_hash) {
    // Run constant dummy compare to equalize response time
    await bcrypt.compare(password, DUMMY_HASH);
    throw new UnauthorizedError('Invalid email or password');
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    throw new UnauthorizedError('Invalid email or password');
  }

  return generateTokens(user);
};

export const googleLogin = async (idToken) => {
  if (!idToken) {
    throw new AppError('Google ID token is required', 400);
  }

  if (!env.GOOGLE_CLIENT_ID) {
    throw new AppError('Google sign-in is not configured', 503);
  }

  let googlePayload;
  try {
    const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken,
      audience: env.GOOGLE_CLIENT_ID,
    });
    googlePayload = ticket.getPayload();
  } catch (err) {
    throw new UnauthorizedError('Invalid or expired Google authentication token');
  }

  if (!googlePayload || !googlePayload.email || googlePayload.email_verified !== true) {
    throw new UnauthorizedError('Google email is not verified');
  }

  const { sub: googleId, email, name, picture } = googlePayload;

  const normalizedEmail = email.toLowerCase();

  let [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      avatar_url: users.avatar_url,
      role: users.role,
      google_id: users.google_id,
      refresh_token_version: users.refresh_token_version,
      created_at: users.created_at,
    })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (user) {
    if (!user.google_id || !user.avatar_url) {
      await db
        .update(users)
        .set({
          google_id: user.google_id || googleId,
          avatar_url: user.avatar_url || picture,
        })
        .where(eq(users.id, user.id));
      user.google_id = user.google_id || googleId;
      user.avatar_url = user.avatar_url || picture;
    }
  } else {
    const [newUser] = await db
      .insert(users)
      .values({
        email: normalizedEmail,
        name: name || 'Customer',
        google_id: googleId,
        avatar_url: picture,
        role: 'customer',
        password_hash: null,
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        avatar_url: users.avatar_url,
        role: users.role,
        google_id: users.google_id,
        refresh_token_version: users.refresh_token_version,
        created_at: users.created_at,
      });

    user = newUser;
  }

  return generateTokens(user);
};

export const refreshTokens = async (refreshToken) => {
  if (!refreshToken) {
    throw new UnauthorizedError('Refresh token required');
  }

  let payload;
  try {
    payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET, {
      algorithms: ['HS256'],
    });
  } catch (err) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const subValidation = uuidSchema.safeParse(payload.sub);
  if (!subValidation.success) {
    throw new UnauthorizedError('Invalid user ID in refresh token');
  }
  const userId = subValidation.data;

  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      avatar_url: users.avatar_url,
      role: users.role,
      refresh_token_version: users.refresh_token_version,
      created_at: users.created_at,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user || user.refresh_token_version !== payload.tokenVersion) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  return generateTokens(user);
};

export const logoutUser = async (refreshToken) => {
  if (!refreshToken) return;

  try {
    const payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET, {
      algorithms: ['HS256'],
    });

    const subValidation = uuidSchema.safeParse(payload.sub);
    if (subValidation.success) {
      const userId = subValidation.data;
      await db
        .update(users)
        .set({
          refresh_token_version: sql`${users.refresh_token_version} + 1`,
        })
        .where(eq(users.id, userId));
    }
  } catch (err) {
    // Silently ignore verification failures on logout; version increment is skipped
  }
};

export const getUserById = async (id) => {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      avatar_url: users.avatar_url,
      role: users.role,
      created_at: users.created_at,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  return user ?? null;
};
