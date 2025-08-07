import { AuthService } from '../utils/auth.js';
import { createError } from './error.js';

export const authMiddleware = async (request, env, ctx) => {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return createError('Authorization header required', 401);
    }

    const token = authHeader.substring(7);
    const authService = new AuthService(env);
    
    try {
      const claims = await authService.verifyToken(token);
      request.user = claims;
      return null; // Continue to next middleware
    } catch (error) {
      return createError('Invalid or expired token', 401);
    }
  } catch (error) {
    return createError('Authentication failed', 401);
  }
};

export const requireRole = (roles) => {
  return async (request, env, ctx) => {
    if (!request.user) {
      return createError('Authentication required', 401);
    }

    const userRole = request.user.role;
    if (!roles.includes(userRole)) {
      return createError('Insufficient permissions', 403);
    }

    return null; // Continue to next middleware
  };
};

export const requireAdmin = requireRole(['admin']);
export const requireTechnician = requireRole(['admin', 'technician']);
export const requireCashier = requireRole(['admin', 'cashier']); 