import { Router } from '../utils/router.js';
import { AuthService } from '../utils/auth.js';
import { createError, createSuccess } from '../middleware/error.js';
import { requireAdmin, authMiddleware } from '../middleware/auth.js';

const router = new Router();

router.get('/test', async (request, env) => {
  return createSuccess('test');
});

// Login endpoint
router.post('/login', async (request, env) => {
  try {
    const { username, password } = await request.json();
    
    if (!username || !password) {
      return createError('Username and password are required');
    }

    // Get user from database
    const user = await env.DB.prepare(`
      SELECT id, username, email, password_hash, role 
      FROM users 
      WHERE username = ? OR email = ?
    `).bind(username, username).first();

    if (!user) {
      return createError('Invalid credentials', 401);
    }

    // Verify password
    const authService = new AuthService(env);
    const isValidPassword = await authService.verifyPassword(password, user.password_hash);
    
    if (!isValidPassword) {
      return createError('Invalid credentials', 401);
    }

    // Generate token
    const token = await authService.generateToken({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    });

    // Store token in KV for session management
    await env.AUTH_TOKENS.put(token, JSON.stringify({
      userId: user.id,
      role: user.role,
      createdAt: new Date().toISOString()
    }), { expirationTtl: 86400 }); // 24 hours

    return createSuccess({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    }, 'Login successful');

  } catch (error) {
    console.error('Login error:', error);
    return createError('Login failed', 500);
  }
});

// Admin registration endpoint
router.post('/register', async (request, env) => {
  try {
    const { username, email, password, registrationKey } = await request.json();
    
    if (!username || !email || !password || !registrationKey) {
      return createError('All fields are required');
    }

    // Verify registration key
    if (registrationKey !== env.ADMIN_REGISTRATION_KEY) {
      return createError('Invalid registration key', 403);
    }

    // Check if user already exists
    const existingUser = await env.DB.prepare(`
      SELECT id FROM users WHERE username = ? OR email = ?
    `).bind(username, email).first();

    if (existingUser) {
      return createError('User already exists');
    }

    // Hash password
    const authService = new AuthService(env);
    const passwordHash = await authService.hashPassword(password);

    // Create user
    const result = await env.DB.prepare(`
      INSERT INTO users (username, email, password_hash, role)
      VALUES (?, ?, ?, 'admin')
    `).bind(username, email, passwordHash).run();

    return createSuccess({
      id: result.meta.last_row_id,
      username,
      email,
      role: 'admin'
    }, 'Admin user created successfully');

  } catch (error) {
    console.error('Registration error:', error);
    return createError('Registration failed', 500);
  }
});

// Logout endpoint
router.post('/logout', async (request, env) => {
  try {
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      // Remove token from KV
      await env.AUTH_TOKENS.delete(token);
    }

    return createSuccess(null, 'Logout successful');
  } catch (error) {
    console.error('Logout error:', error);
    return createError('Logout failed', 500);
  }
});

// Get current user profile
router.get('/profile', authMiddleware, async (request, env) => {
  try {
    if (!request.user) {
      return createError('Authentication required', 401);
    }

    const user = await env.DB.prepare(`
      SELECT id, username, email, role, created_at
      FROM users 
      WHERE id = ?
    `).bind(request.user.id).first();

    if (!user) {
      return createError('User not found', 404);
    }

    return createSuccess(user, 'Profile retrieved successfully');
  } catch (error) {
    console.error('Profile error:', error);
    return createError('Failed to get profile', 500);
  }
});

// Change password
router.post('/change-password', authMiddleware, async (request, env) => {
  try {
    if (!request.user) {
      return createError('Authentication required', 401);
    }

    const { currentPassword, newPassword } = await request.json();
    
    if (!currentPassword || !newPassword) {
      return createError('Current and new password are required');
    }

    // Get current user with password hash
    const user = await env.DB.prepare(`
      SELECT password_hash FROM users WHERE id = ?
    `).bind(request.user.id).first();

    if (!user) {
      return createError('User not found', 404);
    }

    // Verify current password
    const authService = new AuthService(env);
    const isValidPassword = await authService.verifyPassword(currentPassword, user.password_hash);
    
    if (!isValidPassword) {
      return createError('Current password is incorrect', 401);
    }

    // Hash new password
    const newPasswordHash = await authService.hashPassword(newPassword);

    // Update password
    await env.DB.prepare(`
      UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(newPasswordHash, request.user.id).run();

    return createSuccess(null, 'Password changed successfully');
  } catch (error) {
    console.error('Change password error:', error);
    return createError('Failed to change password', 500);
  }
});

export default router;
