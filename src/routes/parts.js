import { Router } from '../utils/router.js';
import { createError, createSuccess } from '../middleware/error.js';
import { requireAdmin, requireTechnician } from '../middleware/auth.js';

const router = new Router();

// --- PARTS & BOXES ROUTES ---
// Get all storage boxes
router.get('/boxes', async (request, env) => {
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
router.post('/boxes', requireAdmin, async (request, env) => {
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
router.put('/boxes/:id', requireAdmin, async (request, env) => {
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
router.delete('/boxes/:id', requireAdmin, async (request, env) => {
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
router.get('/', async (request, env) => {
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
router.get('/:id', async (request, env) => {
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
router.post('/', requireAdmin, async (request, env) => {
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
router.put('/:id', requireAdmin, async (request, env) => {
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
router.delete('/:id', requireAdmin, async (request, env) => {
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
router.patch('/:id/quantity', requireTechnician, async (request, env) => {
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

export default router;
