import { Router } from '../utils/router.js';
import { createError, createSuccess } from '../middleware/error.js';
import { requireAdmin, requireCashier } from '../middleware/auth.js';

const router = new Router();

// Get all accessories
router.get('/', async (request, env) => {
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
router.get('/:id', async (request, env) => {
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
router.post('/', requireAdmin, async (request, env) => {
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
router.put('/:id', requireAdmin, async (request, env) => {
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
router.delete('/:id', requireAdmin, async (request, env) => {
  try {
    const accessoryId = request.params.id;

    // Check if accessory has been sold
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
router.patch('/:id/quantity', requireAdmin, async (request, env) => {
  try {
    const accessoryId = request.params.id;
    const { quantity, operation } = await request.json(); // operation: 'add', 'subtract', 'set'
    
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
router.post('/:id/sell', requireCashier, async (request, env) => {
  try {
    const accessoryId = request.params.id;
    const { quantity, unit_price } = await request.json();
    
    if (!quantity || !unit_price || quantity <= 0) {
      return createError('Valid quantity and unit price are required');
    }

    // Check if accessory exists and has sufficient stock
    const accessory = await env.DB.prepare(`
      SELECT * FROM accessories WHERE id = ?
    `).bind(accessoryId).first();

    if (!accessory) {
      return createError('Accessory not found', 404);
    }

    if (accessory.quantity < quantity) {
      return createError('Insufficient stock');
    }

    // Start transaction
    await env.DB.prepare('BEGIN TRANSACTION').run();

    try {
      // Create sale record
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

      // Update accessory quantity
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
router.get('/:id/sales', requireCashier, async (request, env) => {
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

export default router; 