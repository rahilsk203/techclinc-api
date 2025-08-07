import { Router } from '../utils/router.js';
import { createError, createSuccess } from '../middleware/error.js';
import { requireAdmin, requireCashier } from '../middleware/auth.js';

const router = new Router();

// Get all customers
router.get('/', async (request, env) => {
  try {
    const { search, phone, email } = request.query;
    
    let query = `
      SELECT * FROM customers WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ` AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (phone) {
      query += ` AND phone LIKE ?`;
      params.push(`%${phone}%`);
    }

    if (email) {
      query += ` AND email LIKE ?`;
      params.push(`%${email}%`);
    }

    query += ` ORDER BY name`;

    const customers = await env.DB.prepare(query).bind(...params).all();

    return createSuccess(customers.results, 'Customers retrieved successfully');
  } catch (error) {
    console.error('Get customers error:', error);
    return createError('Failed to get customers', 500);
  }
});

// Get single customer
router.get('/:id', async (request, env) => {
  try {
    const customerId = request.params.id;
    
    const customer = await env.DB.prepare(`
      SELECT * FROM customers WHERE id = ?
    `).bind(customerId).first();

    if (!customer) {
      return createError('Customer not found', 404);
    }

    return createSuccess(customer, 'Customer retrieved successfully');
  } catch (error) {
    console.error('Get customer error:', error);
    return createError('Failed to get customer', 500);
  }
});

// Create customer
router.post('/', requireCashier, async (request, env) => {
  try {
    const { name, phone, email, address } = await request.json();
    
    if (!name) {
      return createError('Customer name is required');
    }

    // Check if customer with same phone or email already exists
    if (phone || email) {
      const existingCustomer = await env.DB.prepare(`
        SELECT id FROM customers 
        WHERE (phone = ? AND phone IS NOT NULL) OR (email = ? AND email IS NOT NULL)
      `).bind(phone || null, email || null).first();

      if (existingCustomer) {
        return createError('Customer with this phone or email already exists');
      }
    }

    const result = await env.DB.prepare(`
      INSERT INTO customers (name, phone, email, address)
      VALUES (?, ?, ?, ?)
    `).bind(name, phone || null, email || null, address || null).run();

    const newCustomer = await env.DB.prepare(`
      SELECT * FROM customers WHERE id = ?
    `).bind(result.meta.last_row_id).first();

    return createSuccess(newCustomer, 'Customer created successfully');
  } catch (error) {
    console.error('Create customer error:', error);
    return createError('Failed to create customer', 500);
  }
});

// Update customer
router.put('/:id', requireCashier, async (request, env) => {
  try {
    const customerId = request.params.id;
    const { name, phone, email, address } = await request.json();
    
    if (!name) {
      return createError('Customer name is required');
    }

    // Check if customer exists
    const existingCustomer = await env.DB.prepare(`
      SELECT * FROM customers WHERE id = ?
    `).bind(customerId).first();

    if (!existingCustomer) {
      return createError('Customer not found', 404);
    }

    // Check if phone or email conflicts with other customers
    if (phone || email) {
      const conflictingCustomer = await env.DB.prepare(`
        SELECT id FROM customers 
        WHERE id != ? AND ((phone = ? AND phone IS NOT NULL) OR (email = ? AND email IS NOT NULL))
      `).bind(customerId, phone || null, email || null).first();

      if (conflictingCustomer) {
        return createError('Phone or email already exists for another customer');
      }
    }

    await env.DB.prepare(`
      UPDATE customers 
      SET name = ?, phone = ?, email = ?, address = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(name, phone || null, email || null, address || null, customerId).run();

    const updatedCustomer = await env.DB.prepare(`
      SELECT * FROM customers WHERE id = ?
    `).bind(customerId).first();

    return createSuccess(updatedCustomer, 'Customer updated successfully');
  } catch (error) {
    console.error('Update customer error:', error);
    return createError('Failed to update customer', 500);
  }
});

// Delete customer
router.delete('/:id', requireAdmin, async (request, env) => {
  try {
    const customerId = request.params.id;

    // Check if customer has any repairs or bills
    const repairsCount = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM repairs WHERE customer_id = ?
    `).bind(customerId).first();

    const billsCount = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM bills WHERE customer_id = ?
    `).bind(customerId).first();

    if (repairsCount.count > 0 || billsCount.count > 0) {
      return createError('Cannot delete customer with repair or billing history');
    }

    await env.DB.prepare(`
      DELETE FROM customers WHERE id = ?
    `).bind(customerId).run();

    return createSuccess(null, 'Customer deleted successfully');
  } catch (error) {
    console.error('Delete customer error:', error);
    return createError('Failed to delete customer', 500);
  }
});

// Get customer repair history
router.get('/:id/repairs', async (request, env) => {
  try {
    const customerId = request.params.id;
    
    const repairs = await env.DB.prepare(`
      SELECT r.*, u.username as technician_name
      FROM repairs r
      LEFT JOIN users u ON r.assigned_technician_id = u.id
      WHERE r.customer_id = ?
      ORDER BY r.created_at DESC
    `).bind(customerId).all();

    return createSuccess(repairs.results, 'Customer repair history retrieved successfully');
  } catch (error) {
    console.error('Get repair history error:', error);
    return createError('Failed to get repair history', 500);
  }
});

// Get customer billing history
router.get('/:id/bills', async (request, env) => {
  try {
    const customerId = request.params.id;
    
    const bills = await env.DB.prepare(`
      SELECT b.*, u.username as created_by_name
      FROM bills b
      JOIN users u ON b.created_by = u.id
      WHERE b.customer_id = ?
      ORDER BY b.created_at DESC
    `).bind(customerId).all();

    return createSuccess(bills.results, 'Customer billing history retrieved successfully');
  } catch (error) {
    console.error('Get billing history error:', error);
    return createError('Failed to get billing history', 500);
  }
});

export default router; 