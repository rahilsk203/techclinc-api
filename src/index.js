import { Router } from './utils/router.js';
import { AuthService } from './utils/auth.js';
import { createError, createSuccess } from './middleware/error.js';
import { authMiddleware } from './middleware/auth.js';
import { corsMiddleware } from './middleware/cors.js';
import { errorHandler } from './middleware/error.js';
import { requireAdmin, requireTechnician, requireCashier } from './middleware/auth.js';

// Import route handlers
import partsRoutes from './routes/parts.js';
import accessoriesRoutes from './routes/accessories.js';
import customersRoutes from './routes/customers.js';
import repairsRoutes from './routes/repairs.js';
import billsRoutes from './routes/bills.js';
import reportsRoutes from './routes/reports.js';
import settingsRoutes from './routes/settings.js';

const router = new Router();

// Global middleware
router.use(corsMiddleware);
router.use(errorHandler);

// --- AUTH ROUTES FLATTENED ---
// Login endpoint
router.post('/auth/login', async (request, env) => {
  try {
    const { username, password } = await request.json();
    if (!username || !password) {
      return createError('Username and password are required');
    }
    const user = await env.DB.prepare(`
      SELECT id, username, email, password_hash, role 
      FROM users 
      WHERE username = ? OR email = ?
    `).bind(username, username).first();
    if (!user) {
      return createError('Invalid credentials', 401);
    }
    const authService = new AuthService(env);
    const isValidPassword = await authService.verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      return createError('Invalid credentials', 401);
    }
    const token = await authService.generateToken({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    });
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
router.post('/auth/register', async (request, env) => {
  try {
    const { username, email, password, registrationKey } = await request.json();
    if (!username || !email || !password || !registrationKey) {
      return createError('All fields are required');
    }
    if (registrationKey !== env.ADMIN_REGISTRATION_KEY) {
      return createError('Invalid registration key', 403);
    }
    const existingUser = await env.DB.prepare(`
      SELECT id FROM users WHERE username = ? OR email = ?
    `).bind(username, email).first();
    if (existingUser) {
      return createError('User already exists');
    }
    const authService = new AuthService(env);
    const passwordHash = await authService.hashPassword(password);
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
router.post('/auth/logout', async (request, env) => {
  try {
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      await env.AUTH_TOKENS.delete(token);
    }
    return createSuccess(null, 'Logout successful');
  } catch (error) {
    console.error('Logout error:', error);
    return createError('Logout failed', 500);
  }
});
// Get current user profile
router.get('/auth/profile', authMiddleware, async (request, env) => {
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
router.post('/auth/change-password', authMiddleware, async (request, env) => {
  try {
    if (!request.user) {
      return createError('Authentication required', 401);
    }
    const { currentPassword, newPassword } = await request.json();
    if (!currentPassword || !newPassword) {
      return createError('Current and new password are required');
    }
    const user = await env.DB.prepare(`
      SELECT password_hash FROM users WHERE id = ?
    `).bind(request.user.id).first();
    if (!user) {
      return createError('User not found', 404);
    }
    const authService = new AuthService(env);
    const isValidPassword = await authService.verifyPassword(currentPassword, user.password_hash);
    if (!isValidPassword) {
      return createError('Current password is incorrect', 401);
    }
    const newPasswordHash = await authService.hashPassword(newPassword);
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

// --- PARTS & BOXES ROUTES FLATTENED ---
// Get all storage boxes
router.get('/parts/boxes', authMiddleware, async (request, env) => {
  try {
    const boxes = await env.DB.prepare(`
      SELECT id, name, description, location, created_at, updated_at
      FROM storage_boxes
      ORDER BY name
    `).all();
    return createSuccess(boxes.results, 'Storage boxes retrieved successfully');
  } catch (error) {
    console.error('Get boxes error:', error);
    return createError('Failed to get storage boxes', 500);
  }
});
// Create storage box
router.post('/parts/boxes', authMiddleware, requireAdmin, async (request, env) => {
  try {
    const { name, description, location } = await request.json();
    if (!name) {
      return createError('Box name is required');
    }
    const result = await env.DB.prepare(`
      INSERT INTO storage_boxes (name, description, location)
      VALUES (?, ?, ?)
    `).bind(name, description || null, location || null).run();
    const newBox = await env.DB.prepare(`
      SELECT id, name, description, location, created_at, updated_at
      FROM storage_boxes WHERE id = ?
    `).bind(result.meta.last_row_id).first();
    return createSuccess(newBox, 'Storage box created successfully');
  } catch (error) {
    console.error('Create box error:', error);
    return createError('Failed to create storage box', 500);
  }
});
// Update storage box
router.put('/parts/boxes/:id', authMiddleware, requireAdmin, async (request, env) => {
  try {
    const boxId = request.params.id;
    const { name, description, location } = await request.json();
    if (!name) {
      return createError('Box name is required');
    }
    await env.DB.prepare(`
      UPDATE storage_boxes 
      SET name = ?, description = ?, location = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(name, description || null, location || null, boxId).run();
    const updatedBox = await env.DB.prepare(`
      SELECT id, name, description, location, created_at, updated_at
      FROM storage_boxes WHERE id = ?
    `).bind(boxId).first();
    if (!updatedBox) {
      return createError('Storage box not found', 404);
    }
    return createSuccess(updatedBox, 'Storage box updated successfully');
  } catch (error) {
    console.error('Update box error:', error);
    return createError('Failed to update storage box', 500);
  }
});
// Delete storage box
router.delete('/parts/boxes/:id', authMiddleware, requireAdmin, async (request, env) => {
  try {
    const boxId = request.params.id;
    const partsCount = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM parts WHERE box_id = ?
    `).bind(boxId).first();
    if (partsCount.count > 0) {
      return createError('Cannot delete box with existing parts');
    }
    await env.DB.prepare(`
      DELETE FROM storage_boxes WHERE id = ?
    `).bind(boxId).run();
    return createSuccess(null, 'Storage box deleted successfully');
  } catch (error) {
    console.error('Delete box error:', error);
    return createError('Failed to delete storage box', 500);
  }
});
// Get all parts with box information
router.get('/parts', authMiddleware, async (request, env) => {
  try {
    const { search, box_id, low_stock } = request.query;
    let query = `
      SELECT p.*, b.name as box_name, b.location as box_location
      FROM parts p
      LEFT JOIN storage_boxes b ON p.box_id = b.id
      WHERE 1=1
    `;
    const params = [];
    if (search) {
      query += ` AND (p.name LIKE ? OR p.description LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }
    if (box_id) {
      query += ` AND p.box_id = ?`;
      params.push(box_id);
    }
    if (low_stock === 'true') {
      query += ` AND p.quantity <= p.min_quantity`;
    }
    query += ` ORDER BY p.name`;
    const parts = await env.DB.prepare(query).bind(...params).all();
    return createSuccess(parts.results, 'Parts retrieved successfully');
  } catch (error) {
    console.error('Get parts error:', error);
    return createError('Failed to get parts', 500);
  }
});
// Get single part
router.get('/parts/:id', authMiddleware, async (request, env) => {
  try {
    const partId = request.params.id;
    const part = await env.DB.prepare(`
      SELECT p.*, b.name as box_name, b.location as box_location
      FROM parts p
      LEFT JOIN storage_boxes b ON p.box_id = b.id
      WHERE p.id = ?
    `).bind(partId).first();
    if (!part) {
      return createError('Part not found', 404);
    }
    return createSuccess(part, 'Part retrieved successfully');
  } catch (error) {
    console.error('Get part error:', error);
    return createError('Failed to get part', 500);
  }
});
// Create part
router.post('/parts', authMiddleware, requireAdmin, async (request, env) => {
  try {
    const { name, description, box_id, quantity, min_quantity, repair_price, sealing_price } = await request.json();
    if (!name || !repair_price || !sealing_price) {
      return createError('Name, repair price, and sealing price are required');
    }
    if (box_id) {
      const boxExists = await env.DB.prepare(`
        SELECT id FROM storage_boxes WHERE id = ?
      `).bind(box_id).first();
      if (!boxExists) {
        return createError('Storage box not found', 404);
      }
    }
    const result = await env.DB.prepare(`
      INSERT INTO parts (name, description, box_id, quantity, min_quantity, repair_price, sealing_price)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      name, 
      description || null, 
      box_id || null, 
      quantity || 0, 
      min_quantity || 5, 
      repair_price, 
      sealing_price
    ).run();
    const newPart = await env.DB.prepare(`
      SELECT p.*, b.name as box_name, b.location as box_location
      FROM parts p
      LEFT JOIN storage_boxes b ON p.box_id = b.id
      WHERE p.id = ?
    `).bind(result.meta.last_row_id).first();
    return createSuccess(newPart, 'Part created successfully');
  } catch (error) {
    console.error('Create part error:', error);
    return createError('Failed to create part', 500);
  }
});
// Update part
router.put('/parts/:id', authMiddleware, requireAdmin, async (request, env) => {
  try {
    const partId = request.params.id;
    const { name, description, box_id, quantity, min_quantity, repair_price, sealing_price } = await request.json();
    if (!name || !repair_price || !sealing_price) {
      return createError('Name, repair price, and sealing price are required');
    }
    if (box_id) {
      const boxExists = await env.DB.prepare(`
        SELECT id FROM storage_boxes WHERE id = ?
      `).bind(box_id).first();
      if (!boxExists) {
        return createError('Storage box not found', 404);
      }
    }
    await env.DB.prepare(`
      UPDATE parts 
      SET name = ?, description = ?, box_id = ?, quantity = ?, min_quantity = ?, 
          repair_price = ?, sealing_price = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      name, 
      description || null, 
      box_id || null, 
      quantity || 0, 
      min_quantity || 5, 
      repair_price, 
      sealing_price, 
      partId
    ).run();
    const updatedPart = await env.DB.prepare(`
      SELECT p.*, b.name as box_name, b.location as box_location
      FROM parts p
      LEFT JOIN storage_boxes b ON p.box_id = b.id
      WHERE p.id = ?
    `).bind(partId).first();
    if (!updatedPart) {
      return createError('Part not found', 404);
    }
    return createSuccess(updatedPart, 'Part updated successfully');
  } catch (error) {
    console.error('Update part error:', error);
    return createError('Failed to update part', 500);
  }
});
// Delete part
router.delete('/parts/:id', authMiddleware, requireAdmin, async (request, env) => {
  try {
    const partId = request.params.id;
    const usageCount = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM repair_parts WHERE part_id = ?
    `).bind(partId).first();
    if (usageCount.count > 0) {
      return createError('Cannot delete part that has been used in repairs');
    }
    await env.DB.prepare(`
      DELETE FROM parts WHERE id = ?
    `).bind(partId).run();
    return createSuccess(null, 'Part deleted successfully');
  } catch (error) {
    console.error('Delete part error:', error);
    return createError('Failed to delete part', 500);
  }
});
// Update part quantity
router.patch('/parts/:id/quantity', authMiddleware, requireTechnician, async (request, env) => {
  try {
    const partId = request.params.id;
    const { quantity, operation } = await request.json();
    if (!quantity || !operation) {
      return createError('Quantity and operation are required');
    }
    let updateQuery;
    if (operation === 'add') {
      updateQuery = `UPDATE parts SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    } else if (operation === 'subtract') {
      updateQuery = `UPDATE parts SET quantity = GREATEST(0, quantity - ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    } else if (operation === 'set') {
      updateQuery = `UPDATE parts SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    } else {
      return createError('Invalid operation. Use: add, subtract, or set');
    }
    await env.DB.prepare(updateQuery).bind(quantity, partId).run();
    const updatedPart = await env.DB.prepare(`
      SELECT p.*, b.name as box_name, b.location as box_location
      FROM parts p
      LEFT JOIN storage_boxes b ON p.box_id = b.id
      WHERE p.id = ?
    `).bind(partId).first();
    if (!updatedPart) {
      return createError('Part not found', 404);
    }
    return createSuccess(updatedPart, 'Part quantity updated successfully');
  } catch (error) {
    console.error('Update quantity error:', error);
    return createError('Failed to update part quantity', 500);
  }
});

// --- ACCESSORIES ROUTES FLATTENED ---
// Get all accessories
router.get('/accessories', authMiddleware, async (request, env) => {
  try {
    const { search, low_stock } = request.query;
    let query = `
      SELECT * FROM accessories WHERE 1=1
    `;
    const params = [];
    if (search) {
      query += ` AND (name LIKE ? OR description LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }
    if (low_stock === 'true') {
      query += ` AND quantity <= min_quantity`;
    }
    query += ` ORDER BY name`;
    const accessories = await env.DB.prepare(query).bind(...params).all();
    return createSuccess(accessories.results, 'Accessories retrieved successfully');
  } catch (error) {
    console.error('Get accessories error:', error);
    return createError('Failed to get accessories', 500);
  }
});
// Get single accessory
router.get('/accessories/:id', authMiddleware, async (request, env) => {
  try {
    const accessoryId = request.params.id;
    const accessory = await env.DB.prepare(`
      SELECT * FROM accessories WHERE id = ?
    `).bind(accessoryId).first();
    if (!accessory) {
      return createError('Accessory not found', 404);
    }
    return createSuccess(accessory, 'Accessory retrieved successfully');
  } catch (error) {
    console.error('Get accessory error:', error);
    return createError('Failed to get accessory', 500);
  }
});
// Create accessory
router.post('/accessories', authMiddleware, requireAdmin, async (request, env) => {
  try {
    const { name, description, quantity, min_quantity, price } = await request.json();
    if (!name || !price) {
      return createError('Name and price are required');
    }
    const result = await env.DB.prepare(`
      INSERT INTO accessories (name, description, quantity, min_quantity, price)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      name, 
      description || null, 
      quantity || 0, 
      min_quantity || 5, 
      price
    ).run();
    const newAccessory = await env.DB.prepare(`
      SELECT * FROM accessories WHERE id = ?
    `).bind(result.meta.last_row_id).first();
    return createSuccess(newAccessory, 'Accessory created successfully');
  } catch (error) {
    console.error('Create accessory error:', error);
    return createError('Failed to create accessory', 500);
  }
});
// Update accessory
router.put('/accessories/:id', authMiddleware, requireAdmin, async (request, env) => {
  try {
    const accessoryId = request.params.id;
    const { name, description, quantity, min_quantity, price } = await request.json();
    if (!name || !price) {
      return createError('Name and price are required');
    }
    await env.DB.prepare(`
      UPDATE accessories 
      SET name = ?, description = ?, quantity = ?, min_quantity = ?, 
          price = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      name, 
      description || null, 
      quantity || 0, 
      min_quantity || 5, 
      price, 
      accessoryId
    ).run();
    const updatedAccessory = await env.DB.prepare(`
      SELECT * FROM accessories WHERE id = ?
    `).bind(accessoryId).first();
    if (!updatedAccessory) {
      return createError('Accessory not found', 404);
    }
    return createSuccess(updatedAccessory, 'Accessory updated successfully');
  } catch (error) {
    console.error('Update accessory error:', error);
    return createError('Failed to update accessory', 500);
  }
});
// Delete accessory
router.delete('/accessories/:id', authMiddleware, requireAdmin, async (request, env) => {
  try {
    const accessoryId = request.params.id;
    const salesCount = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM accessory_sales WHERE accessory_id = ?
    `).bind(accessoryId).first();
    if (salesCount.count > 0) {
      return createError('Cannot delete accessory that has sales history');
    }
    await env.DB.prepare(`
      DELETE FROM accessories WHERE id = ?
    `).bind(accessoryId).run();
    return createSuccess(null, 'Accessory deleted successfully');
  } catch (error) {
    console.error('Delete accessory error:', error);
    return createError('Failed to delete accessory', 500);
  }
});
// Update accessory quantity
router.patch('/accessories/:id/quantity', authMiddleware, requireAdmin, async (request, env) => {
  try {
    const accessoryId = request.params.id;
    const { quantity, operation } = await request.json();
    if (!quantity || !operation) {
      return createError('Quantity and operation are required');
    }
    let updateQuery;
    if (operation === 'add') {
      updateQuery = `UPDATE accessories SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    } else if (operation === 'subtract') {
      updateQuery = `UPDATE accessories SET quantity = GREATEST(0, quantity - ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    } else if (operation === 'set') {
      updateQuery = `UPDATE accessories SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    } else {
      return createError('Invalid operation. Use: add, subtract, or set');
    }
    await env.DB.prepare(updateQuery).bind(quantity, accessoryId).run();
    const updatedAccessory = await env.DB.prepare(`
      SELECT * FROM accessories WHERE id = ?
    `).bind(accessoryId).first();
    if (!updatedAccessory) {
      return createError('Accessory not found', 404);
    }
    return createSuccess(updatedAccessory, 'Accessory quantity updated successfully');
  } catch (error) {
    console.error('Update quantity error:', error);
    return createError('Failed to update accessory quantity', 500);
  }
});
// Sell accessory
router.post('/accessories/:id/sell', authMiddleware, requireCashier, async (request, env) => {
  try {
    const accessoryId = request.params.id;
    const { quantity, unit_price } = await request.json();
    if (!quantity || !unit_price || quantity <= 0) {
      return createError('Valid quantity and unit price are required');
    }
    const accessory = await env.DB.prepare(`
      SELECT * FROM accessories WHERE id = ?
    `).bind(accessoryId).first();
    if (!accessory) {
      return createError('Accessory not found', 404);
    }
    if (accessory.quantity < quantity) {
      return createError('Insufficient stock');
    }
    await env.DB.prepare('BEGIN TRANSACTION').run();
    try {
      const saleResult = await env.DB.prepare(`
        INSERT INTO accessory_sales (accessory_id, quantity_sold, unit_price, total_price, sold_by)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        accessoryId, 
        quantity, 
        unit_price, 
        quantity * unit_price, 
        request.user.id
      ).run();
      await env.DB.prepare(`
        UPDATE accessories 
        SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(quantity, accessoryId).run();
      await env.DB.prepare('COMMIT').run();
      const sale = await env.DB.prepare(`
        SELECT s.*, a.name as accessory_name
        FROM accessory_sales s
        JOIN accessories a ON s.accessory_id = a.id
        WHERE s.id = ?
      `).bind(saleResult.meta.last_row_id).first();
      return createSuccess(sale, 'Accessory sold successfully');
    } catch (error) {
      await env.DB.prepare('ROLLBACK').run();
      throw error;
    }
  } catch (error) {
    console.error('Sell accessory error:', error);
    return createError('Failed to sell accessory', 500);
  }
});
// Get accessory sales history
router.get('/accessories/:id/sales', authMiddleware, requireCashier, async (request, env) => {
  try {
    const accessoryId = request.params.id;
    const { start_date, end_date } = request.query;
    let query = `
      SELECT s.*, a.name as accessory_name, u.username as sold_by_name
      FROM accessory_sales s
      JOIN accessories a ON s.accessory_id = a.id
      JOIN users u ON s.sold_by = u.id
      WHERE s.accessory_id = ?
    `;
    const params = [accessoryId];
    if (start_date) {
      query += ` AND DATE(s.created_at) >= ?`;
      params.push(start_date);
    }
    if (end_date) {
      query += ` AND DATE(s.created_at) <= ?`;
      params.push(end_date);
    }
    query += ` ORDER BY s.created_at DESC`;
    const sales = await env.DB.prepare(query).bind(...params).all();
    return createSuccess(sales.results, 'Sales history retrieved successfully');
  } catch (error) {
    console.error('Get sales history error:', error);
    return createError('Failed to get sales history', 500);
  }
});

// Protected routes
router.use('/parts', authMiddleware, partsRoutes);
router.use('/accessories', authMiddleware, accessoriesRoutes);
router.use('/customers', authMiddleware, customersRoutes);
router.use('/repairs', authMiddleware, repairsRoutes);
router.use('/bills', authMiddleware, billsRoutes);
router.use('/reports', authMiddleware, reportsRoutes);
router.use('/settings', authMiddleware, settingsRoutes);

// Health check endpoint
router.get('/health', async (request, env) => {
  return new Response(JSON.stringify({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    environment: env.ENVIRONMENT 
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
});

// Default route
router.get('/', async (request, env) => {
  return new Response(JSON.stringify({ 
    message: 'TechClinc Mobile Repair Shop API',
    version: '1.0.0',
    endpoints: {
      auth: '/auth',
      parts: '/parts',
      accessories: '/accessories',
      customers: '/customers',
      repairs: '/repairs',
      bills: '/bills',
      reports: '/reports',
      settings: '/settings'
    }
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
});

export default {
  async fetch(request, env, ctx) {
    return router.handle(request, env, ctx);
  }
}; 