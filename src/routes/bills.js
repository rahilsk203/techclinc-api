import { Router } from '../utils/router.js';
import { createError, createSuccess } from '../middleware/error.js';
import { requireAdmin, requireCashier } from '../middleware/auth.js';

const router = new Router();

// Get all bills
router.get('/', async (request, env) => {
  try {
    const { customer_id, repair_id, payment_status, start_date, end_date } = request.query;
    
    let query = `
      SELECT b.*, c.name as customer_name, c.phone as customer_phone,
             u.username as created_by_name
      FROM bills b
      JOIN customers c ON b.customer_id = c.id
      JOIN users u ON b.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (customer_id) {
      query += ` AND b.customer_id = ?`;
      params.push(customer_id);
    }

    if (repair_id) {
      query += ` AND b.repair_id = ?`;
      params.push(repair_id);
    }

    if (payment_status) {
      query += ` AND b.payment_status = ?`;
      params.push(payment_status);
    }

    if (start_date) {
      query += ` AND DATE(b.created_at) >= ?`;
      params.push(start_date);
    }

    if (end_date) {
      query += ` AND DATE(b.created_at) <= ?`;
      params.push(end_date);
    }

    query += ` ORDER BY b.created_at DESC`;

    const bills = await env.DB.prepare(query).bind(...params).all();

    return createSuccess(bills.results, 'Bills retrieved successfully');
  } catch (error) {
    console.error('Get bills error:', error);
    return createError('Failed to get bills', 500);
  }
});

// Get single bill with details
router.get('/:id', async (request, env) => {
  try {
    const billId = request.params.id;
    
    const bill = await env.DB.prepare(`
      SELECT b.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email,
             u.username as created_by_name
      FROM bills b
      JOIN customers c ON b.customer_id = c.id
      JOIN users u ON b.created_by = u.id
      WHERE b.id = ?
    `).bind(billId).first();

    if (!bill) {
      return createError('Bill not found', 404);
    }

    // Get bill items
    const items = await env.DB.prepare(`
      SELECT bi.*, 
             CASE 
               WHEN bi.item_type = 'part' THEN p.name
               WHEN bi.item_type = 'accessory' THEN a.name
             END as item_name
      FROM bill_items bi
      LEFT JOIN parts p ON bi.item_type = 'part' AND bi.item_id = p.id
      LEFT JOIN accessories a ON bi.item_type = 'accessory' AND bi.item_id = a.id
      WHERE bi.bill_id = ?
      ORDER BY bi.created_at
    `).bind(billId).all();

    return createSuccess({
      ...bill,
      items: items.results
    }, 'Bill details retrieved successfully');
  } catch (error) {
    console.error('Get bill error:', error);
    return createError('Failed to get bill', 500);
  }
});

// Generate bill from repair
router.post('/from-repair/:repair_id', requireCashier, async (request, env) => {
  try {
    const repairId = request.params.id;
    const { tax_rate = 0, payment_method } = await request.json();

    // Verify repair exists and is completed
    const repair = await env.DB.prepare(`
      SELECT r.*, c.name as customer_name
      FROM repairs r
      JOIN customers c ON r.customer_id = c.id
      WHERE r.id = ?
    `).bind(repairId).first();

    if (!repair) {
      return createError('Repair not found', 404);
    }

    if (repair.status !== 'completed') {
      return createError('Cannot generate bill for incomplete repair');
    }

    // Check if bill already exists for this repair
    const existingBill = await env.DB.prepare(`
      SELECT id FROM bills WHERE repair_id = ?
    `).bind(repairId).first();

    if (existingBill) {
      return createError('Bill already exists for this repair');
    }

    // Get parts used in repair
    const repairParts = await env.DB.prepare(`
      SELECT rp.*, p.name as part_name
      FROM repair_parts rp
      JOIN parts p ON rp.part_id = p.id
      WHERE rp.repair_id = ?
    `).bind(repairId).all();

    if (repairParts.results.length === 0) {
      return createError('No parts found for this repair');
    }

    // Calculate subtotal
    const subtotal = repairParts.results.reduce((sum, part) => sum + part.total_price, 0);
    const taxAmount = subtotal * (tax_rate / 100);
    const totalAmount = subtotal + taxAmount;

    // Generate bill number
    const billNumber = `BILL-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

    // Start transaction
    await env.DB.prepare('BEGIN TRANSACTION').run();

    try {
      // Create bill
      const billResult = await env.DB.prepare(`
        INSERT INTO bills (repair_id, customer_id, bill_number, subtotal, tax_amount, 
                          total_amount, payment_status, payment_method, created_by)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      `).bind(
        repairId, 
        repair.customer_id, 
        billNumber, 
        subtotal, 
        taxAmount, 
        totalAmount, 
        payment_method || null, 
        request.user.id
      ).run();

      // Add bill items for parts
      for (const part of repairParts.results) {
        await env.DB.prepare(`
          INSERT INTO bill_items (bill_id, item_type, item_id, quantity, unit_price, total_price, pricing_mode)
          VALUES (?, 'part', ?, ?, ?, ?, ?)
        `).bind(
          billResult.meta.last_row_id,
          part.part_id,
          part.quantity_used,
          part.unit_price,
          part.total_price,
          part.pricing_mode
        ).run();
      }

      await env.DB.prepare('COMMIT').run();

      const newBill = await env.DB.prepare(`
        SELECT b.*, c.name as customer_name, c.phone as customer_phone,
               u.username as created_by_name
        FROM bills b
        JOIN customers c ON b.customer_id = c.id
        JOIN users u ON b.created_by = u.id
        WHERE b.id = ?
      `).bind(billResult.meta.last_row_id).first();

      return createSuccess(newBill, 'Bill generated successfully');
    } catch (error) {
      await env.DB.prepare('ROLLBACK').run();
      throw error;
    }
  } catch (error) {
    console.error('Generate bill error:', error);
    return createError('Failed to generate bill', 500);
  }
});

// Create bill for accessories only
router.post('/accessories', requireCashier, async (request, env) => {
  try {
    const { customer_id, items, tax_rate = 0, payment_method } = await request.json();
    
    if (!customer_id || !items || !Array.isArray(items) || items.length === 0) {
      return createError('Customer ID and items array are required');
    }

    // Verify customer exists
    const customer = await env.DB.prepare(`
      SELECT id FROM customers WHERE id = ?
    `).bind(customer_id).first();

    if (!customer) {
      return createError('Customer not found', 404);
    }

    // Verify all accessories exist and have sufficient stock
    for (const item of items) {
      const accessory = await env.DB.prepare(`
        SELECT * FROM accessories WHERE id = ?
      `).bind(item.accessory_id).first();

      if (!accessory) {
        return createError(`Accessory with ID ${item.accessory_id} not found`);
      }

      if (accessory.quantity < item.quantity) {
        return createError(`Insufficient stock for ${accessory.name}`);
      }
    }

    // Calculate totals
    let subtotal = 0;
    for (const item of items) {
      const accessory = await env.DB.prepare(`
        SELECT price FROM accessories WHERE id = ?
      `).bind(item.accessory_id).first();
      subtotal += accessory.price * item.quantity;
    }

    const taxAmount = subtotal * (tax_rate / 100);
    const totalAmount = subtotal + taxAmount;

    // Generate bill number
    const billNumber = `BILL-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

    // Start transaction
    await env.DB.prepare('BEGIN TRANSACTION').run();

    try {
      // Create bill
      const billResult = await env.DB.prepare(`
        INSERT INTO bills (customer_id, bill_number, subtotal, tax_amount, 
                          total_amount, payment_status, payment_method, created_by)
        VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
      `).bind(
        customer_id, 
        billNumber, 
        subtotal, 
        taxAmount, 
        totalAmount, 
        payment_method || null, 
        request.user.id
      ).run();

      // Add bill items and update accessory quantities
      for (const item of items) {
        const accessory = await env.DB.prepare(`
          SELECT * FROM accessories WHERE id = ?
        `).bind(item.accessory_id).first();

        // Add bill item
        await env.DB.prepare(`
          INSERT INTO bill_items (bill_id, item_type, item_id, quantity, unit_price, total_price)
          VALUES (?, 'accessory', ?, ?, ?, ?)
        `).bind(
          billResult.meta.last_row_id,
          item.accessory_id,
          item.quantity,
          accessory.price,
          accessory.price * item.quantity
        ).run();

        // Update accessory quantity
        await env.DB.prepare(`
          UPDATE accessories 
          SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(item.quantity, item.accessory_id).run();

        // Record accessory sale
        await env.DB.prepare(`
          INSERT INTO accessory_sales (accessory_id, quantity_sold, unit_price, total_price, sold_by)
          VALUES (?, ?, ?, ?, ?)
        `).bind(
          item.accessory_id,
          item.quantity,
          accessory.price,
          accessory.price * item.quantity,
          request.user.id
        ).run();
      }

      await env.DB.prepare('COMMIT').run();

      const newBill = await env.DB.prepare(`
        SELECT b.*, c.name as customer_name, c.phone as customer_phone,
               u.username as created_by_name
        FROM bills b
        JOIN customers c ON b.customer_id = c.id
        JOIN users u ON b.created_by = u.id
        WHERE b.id = ?
      `).bind(billResult.meta.last_row_id).first();

      return createSuccess(newBill, 'Accessory bill created successfully');
    } catch (error) {
      await env.DB.prepare('ROLLBACK').run();
      throw error;
    }
  } catch (error) {
    console.error('Create accessory bill error:', error);
    return createError('Failed to create accessory bill', 500);
  }
});

// Update bill payment status
router.patch('/:id/payment', requireCashier, async (request, env) => {
  try {
    const billId = request.params.id;
    const { payment_status, payment_method } = await request.json();
    
    if (!payment_status) {
      return createError('Payment status is required');
    }

    const validStatuses = ['pending', 'paid', 'partial'];
    if (!validStatuses.includes(payment_status)) {
      return createError('Invalid payment status');
    }

    // Verify bill exists
    const bill = await env.DB.prepare(`
      SELECT * FROM bills WHERE id = ?
    `).bind(billId).first();

    if (!bill) {
      return createError('Bill not found', 404);
    }

    await env.DB.prepare(`
      UPDATE bills 
      SET payment_status = ?, payment_method = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(payment_status, payment_method || null, billId).run();

    const updatedBill = await env.DB.prepare(`
      SELECT b.*, c.name as customer_name, c.phone as customer_phone,
             u.username as created_by_name
      FROM bills b
      JOIN customers c ON b.customer_id = c.id
      JOIN users u ON b.created_by = u.id
      WHERE b.id = ?
    `).bind(billId).first();

    return createSuccess(updatedBill, 'Bill payment status updated successfully');
  } catch (error) {
    console.error('Update payment error:', error);
    return createError('Failed to update bill payment status', 500);
  }
});

// Delete bill
router.delete('/:id', requireAdmin, async (request, env) => {
  try {
    const billId = request.params.id;

    // Verify bill exists
    const bill = await env.DB.prepare(`
      SELECT * FROM bills WHERE id = ?
    `).bind(billId).first();

    if (!bill) {
      return createError('Bill not found', 404);
    }

    // Start transaction
    await env.DB.prepare('BEGIN TRANSACTION').run();

    try {
      // Delete bill items
      await env.DB.prepare(`
        DELETE FROM bill_items WHERE bill_id = ?
      `).bind(billId).run();

      // Delete bill
      await env.DB.prepare(`
        DELETE FROM bills WHERE id = ?
      `).bind(billId).run();

      await env.DB.prepare('COMMIT').run();

      return createSuccess(null, 'Bill deleted successfully');
    } catch (error) {
      await env.DB.prepare('ROLLBACK').run();
      throw error;
    }
  } catch (error) {
    console.error('Delete bill error:', error);
    return createError('Failed to delete bill', 500);
  }
});

export default router; 