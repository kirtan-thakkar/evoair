import * as authService from '../services/authService.js';
import { registerSchema, loginSchema, googleAuthSchema } from '../validators/authValidators.js';
import { env } from '../config/env.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

const REFRESH_COOKIE_NAME = 'refreshToken';

const getCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: env.NODE_ENV === 'production',
  path: '/api/v1/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
});

const getClearCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: env.NODE_ENV === 'production',
  path: '/api/v1/auth',
});

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

// Async wrapper helper to route rejections to centralized error handler
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export const register = asyncHandler(async (req, res) => {
  const validatedData = validate(registerSchema, req.body);
  const { accessToken, refreshToken, user } = await authService.registerUser(validatedData);

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, getCookieOptions());
  res.status(201).json({
    status: 'success',
    data: { user, accessToken },
  });
});

export const login = asyncHandler(async (req, res) => {
  const validatedData = validate(loginSchema, req.body);
  const { accessToken, refreshToken, user } = await authService.loginUser(validatedData);

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, getCookieOptions());
  res.status(200).json({
    status: 'success',
    data: { user, accessToken },
  });
});

export const googleAuth = asyncHandler(async (req, res) => {
  const validatedData = validate(googleAuthSchema, req.body);
  const { accessToken, refreshToken, user } = await authService.googleLogin(validatedData.credential);

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, getCookieOptions());
  res.status(200).json({
    status: 'success',
    data: { user, accessToken },
  });
});

export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  const result = await authService.refreshTokens(token);

  res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, getCookieOptions());
  res.status(200).json({
    status: 'success',
    data: { user: result.user, accessToken: result.accessToken },
  });
});

export const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  await authService.logoutUser(token);

  res.clearCookie(REFRESH_COOKIE_NAME, getClearCookieOptions());
  res.status(204).end();
});

export const getMe = asyncHandler(async (req, res) => {
  const user = await authService.getUserById(req.user.id);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  res.status(200).json({
    status: 'success',
    data: { user },
  });
});
