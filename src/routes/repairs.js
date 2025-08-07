import { Router } from '../utils/router.js';
import { createError, createSuccess } from '../middleware/error.js';
import { requireAdmin, requireTechnician } from '../middleware/auth.js';

const router = new Router();

// Get all repairs
router.get('/', async (request, env) => {
  try {
    const { status, customer_id, technician_id, start_date, end_date } = request.query;
    
    let query = `
      SELECT r.*, c.name as customer_name, c.phone as customer_phone,
             u.username as technician_name
      FROM repairs r
      JOIN customers c ON r.customer_id = c.id
      LEFT JOIN users u ON r.assigned_technician_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ` AND r.status = ?`;
      params.push(status);
    }

    if (customer_id) {
      query += ` AND r.customer_id = ?`;
      params.push(customer_id);
    }

    if (technician_id) {
      query += ` AND r.assigned_technician_id = ?`;
      params.push(technician_id);
    }

    if (start_date) {
      query += ` AND DATE(r.created_at) >= ?`;
      params.push(start_date);
    }

    if (end_date) {
      query += ` AND DATE(r.created_at) <= ?`;
      params.push(end_date);
    }

    query += ` ORDER BY r.created_at DESC`;

    const repairs = await env.DB.prepare(query).bind(...params).all();

    return createSuccess(repairs.results, 'Repairs retrieved successfully');
  } catch (error) {
    console.error('Get repairs error:', error);
    return createError('Failed to get repairs', 500);
  }
});

// Get single repair with details
router.get('/:id', async (request, env) => {
  try {
    const repairId = request.params.id;
    
    const repair = await env.DB.prepare(`
      SELECT r.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email,
             u.username as technician_name
      FROM repairs r
      JOIN customers c ON r.customer_id = c.id
      LEFT JOIN users u ON r.assigned_technician_id = u.id
      WHERE r.id = ?
    `).bind(repairId).first();

    if (!repair) {
      return createError('Repair not found', 404);
    }

    // Get parts used in this repair
    const parts = await env.DB.prepare(`
      SELECT rp.*, p.name as part_name, p.repair_price, p.sealing_price
      FROM repair_parts rp
      JOIN parts p ON rp.part_id = p.id
      WHERE rp.repair_id = ?
    `).bind(repairId).all();

    return createSuccess({
      ...repair,
      parts: parts.results
    }, 'Repair details retrieved successfully');
  } catch (error) {
    console.error('Get repair error:', error);
    return createError('Failed to get repair', 500);
  }
});

// Create repair
router.post('/', requireTechnician, async (request, env) => {
  try {
    const { 
      customer_id, mobile_model, reported_issue, 
      assigned_technician_id, estimated_completion_date, notes 
    } = await request.json();
    
    if (!customer_id || !mobile_model || !reported_issue) {
      return createError('Customer ID, mobile model, and reported issue are required');
    }

    // Verify customer exists
    const customer = await env.DB.prepare(`
      SELECT id FROM customers WHERE id = ?
    `).bind(customer_id).first();

    if (!customer) {
      return createError('Customer not found', 404);
    }

    // Verify technician exists if assigned
    if (assigned_technician_id) {
      const technician = await env.DB.prepare(`
        SELECT id FROM users WHERE id = ? AND role IN ('admin', 'technician')
      `).bind(assigned_technician_id).first();

      if (!technician) {
        return createError('Technician not found', 404);
      }
    }

    const result = await env.DB.prepare(`
      INSERT INTO repairs (customer_id, mobile_model, reported_issue, assigned_technician_id, 
                          estimated_completion_date, notes, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `).bind(
      customer_id, 
      mobile_model, 
      reported_issue, 
      assigned_technician_id || null, 
      estimated_completion_date || null, 
      notes || null
    ).run();

    const newRepair = await env.DB.prepare(`
      SELECT r.*, c.name as customer_name, c.phone as customer_phone,
             u.username as technician_name
      FROM repairs r
      JOIN customers c ON r.customer_id = c.id
      LEFT JOIN users u ON r.assigned_technician_id = u.id
      WHERE r.id = ?
    `).bind(result.meta.last_row_id).first();

    return createSuccess(newRepair, 'Repair created successfully');
  } catch (error) {
    console.error('Create repair error:', error);
    return createError('Failed to create repair', 500);
  }
});

// Update repair
router.put('/:id', requireTechnician, async (request, env) => {
  try {
    const repairId = request.params.id;
    const { 
      mobile_model, reported_issue, assigned_technician_id, 
      estimated_completion_date, notes, status 
    } = await request.json();
    
    if (!mobile_model || !reported_issue) {
      return createError('Mobile model and reported issue are required');
    }

    // Verify repair exists
    const existingRepair = await env.DB.prepare(`
      SELECT * FROM repairs WHERE id = ?
    `).bind(repairId).first();

    if (!existingRepair) {
      return createError('Repair not found', 404);
    }

    // Verify technician exists if assigned
    if (assigned_technician_id) {
      const technician = await env.DB.prepare(`
        SELECT id FROM users WHERE id = ? AND role IN ('admin', 'technician')
      `).bind(assigned_technician_id).first();

      if (!technician) {
        return createError('Technician not found', 404);
      }
    }

    await env.DB.prepare(`
      UPDATE repairs 
      SET mobile_model = ?, reported_issue = ?, assigned_technician_id = ?,
          estimated_completion_date = ?, notes = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      mobile_model, 
      reported_issue, 
      assigned_technician_id || null, 
      estimated_completion_date || null, 
      notes || null, 
      status || existingRepair.status, 
      repairId
    ).run();

    const updatedRepair = await env.DB.prepare(`
      SELECT r.*, c.name as customer_name, c.phone as customer_phone,
             u.username as technician_name
      FROM repairs r
      JOIN customers c ON r.customer_id = c.id
      LEFT JOIN users u ON r.assigned_technician_id = u.id
      WHERE r.id = ?
    `).bind(repairId).first();

    return createSuccess(updatedRepair, 'Repair updated successfully');
  } catch (error) {
    console.error('Update repair error:', error);
    return createError('Failed to update repair', 500);
  }
});

// Update repair status
router.patch('/:id/status', requireTechnician, async (request, env) => {
  try {
    const repairId = request.params.id;
    const { status, notes } = await request.json();
    
    if (!status) {
      return createError('Status is required');
    }

    const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return createError('Invalid status');
    }

    // Verify repair exists
    const existingRepair = await env.DB.prepare(`
      SELECT * FROM repairs WHERE id = ?
    `).bind(repairId).first();

    if (!existingRepair) {
      return createError('Repair not found', 404);
    }

    const updateData = {
      status,
      updated_at: 'CURRENT_TIMESTAMP'
    };

    if (status === 'completed') {
      updateData.actual_completion_date = 'CURRENT_TIMESTAMP';
    }

    if (notes) {
      updateData.notes = notes;
    }

    const updateFields = Object.keys(updateData).map(key => `${key} = ?`).join(', ');
    const updateValues = Object.values(updateData);

    await env.DB.prepare(`
      UPDATE repairs SET ${updateFields} WHERE id = ?
    `).bind(...updateValues, repairId).run();

    const updatedRepair = await env.DB.prepare(`
      SELECT r.*, c.name as customer_name, c.phone as customer_phone,
             u.username as technician_name
      FROM repairs r
      JOIN customers c ON r.customer_id = c.id
      LEFT JOIN users u ON r.assigned_technician_id = u.id
      WHERE r.id = ?
    `).bind(repairId).first();

    return createSuccess(updatedRepair, 'Repair status updated successfully');
  } catch (error) {
    console.error('Update status error:', error);
    return createError('Failed to update repair status', 500);
  }
});

// Add parts to repair
router.post('/:id/parts', requireTechnician, async (request, env) => {
  try {
    const repairId = request.params.id;
    const { part_id, quantity_used, pricing_mode } = await request.json();
    
    if (!part_id || !quantity_used || !pricing_mode) {
      return createError('Part ID, quantity used, and pricing mode are required');
    }

    if (!['repair', 'seal'].includes(pricing_mode)) {
      return createError('Invalid pricing mode. Use: repair or seal');
    }

    // Verify repair exists
    const repair = await env.DB.prepare(`
      SELECT * FROM repairs WHERE id = ?
    `).bind(repairId).first();

    if (!repair) {
      return createError('Repair not found', 404);
    }

    // Verify part exists and has sufficient stock
    const part = await env.DB.prepare(`
      SELECT * FROM parts WHERE id = ?
    `).bind(part_id).first();

    if (!part) {
      return createError('Part not found', 404);
    }

    if (part.quantity < quantity_used) {
      return createError('Insufficient part stock');
    }

    // Calculate unit price based on pricing mode
    const unitPrice = pricing_mode === 'repair' ? part.repair_price : part.sealing_price;
    const totalPrice = quantity_used * unitPrice;

    // Start transaction
    await env.DB.prepare('BEGIN TRANSACTION').run();

    try {
      // Add part to repair
      await env.DB.prepare(`
        INSERT INTO repair_parts (repair_id, part_id, quantity_used, pricing_mode, unit_price, total_price)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(repairId, part_id, quantity_used, pricing_mode, unitPrice, totalPrice).run();

      // Update part quantity
      await env.DB.prepare(`
        UPDATE parts 
        SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(quantity_used, part_id).run();

      await env.DB.prepare('COMMIT').run();

      const repairPart = await env.DB.prepare(`
        SELECT rp.*, p.name as part_name
        FROM repair_parts rp
        JOIN parts p ON rp.part_id = p.id
        WHERE rp.repair_id = ? AND rp.part_id = ?
        ORDER BY rp.created_at DESC
        LIMIT 1
      `).bind(repairId, part_id).first();

      return createSuccess(repairPart, 'Part added to repair successfully');
    } catch (error) {
      await env.DB.prepare('ROLLBACK').run();
      throw error;
    }
  } catch (error) {
    console.error('Add part error:', error);
    return createError('Failed to add part to repair', 500);
  }
});

// Remove part from repair
router.delete('/:id/parts/:part_id', requireTechnician, async (request, env) => {
  try {
    const repairId = request.params.id;
    const partId = request.params.part_id;

    // Get the repair part record
    const repairPart = await env.DB.prepare(`
      SELECT * FROM repair_parts 
      WHERE repair_id = ? AND part_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).bind(repairId, partId).first();

    if (!repairPart) {
      return createError('Part not found in repair', 404);
    }

    // Start transaction
    await env.DB.prepare('BEGIN TRANSACTION').run();

    try {
      // Remove part from repair
      await env.DB.prepare(`
        DELETE FROM repair_parts 
        WHERE repair_id = ? AND part_id = ? AND id = ?
      `).bind(repairId, partId, repairPart.id).run();

      // Restore part quantity
      await env.DB.prepare(`
        UPDATE parts 
        SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(repairPart.quantity_used, partId).run();

      await env.DB.prepare('COMMIT').run();

      return createSuccess(null, 'Part removed from repair successfully');
    } catch (error) {
      await env.DB.prepare('ROLLBACK').run();
      throw error;
    }
  } catch (error) {
    console.error('Remove part error:', error);
    return createError('Failed to remove part from repair', 500);
  }
});

// Delete repair
router.delete('/:id', requireAdmin, async (request, env) => {
  try {
    const repairId = request.params.id;

    // Check if repair has associated bills
    const billsCount = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM bills WHERE repair_id = ?
    `).bind(repairId).first();

    if (billsCount.count > 0) {
      return createError('Cannot delete repair with associated bills');
    }

    // Start transaction
    await env.DB.prepare('BEGIN TRANSACTION').run();

    try {
      // Restore part quantities
      const repairParts = await env.DB.prepare(`
        SELECT part_id, quantity_used FROM repair_parts WHERE repair_id = ?
      `).bind(repairId).all();

      for (const part of repairParts.results) {
        await env.DB.prepare(`
          UPDATE parts 
          SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(part.quantity_used, part.part_id).run();
      }

      // Delete repair parts
      await env.DB.prepare(`
        DELETE FROM repair_parts WHERE repair_id = ?
      `).bind(repairId).run();

      // Delete repair
      await env.DB.prepare(`
        DELETE FROM repairs WHERE id = ?
      `).bind(repairId).run();

      await env.DB.prepare('COMMIT').run();

      return createSuccess(null, 'Repair deleted successfully');
    } catch (error) {
      await env.DB.prepare('ROLLBACK').run();
      throw error;
    }
  } catch (error) {
    console.error('Delete repair error:', error);
    return createError('Failed to delete repair', 500);
  }
});

export default router; 