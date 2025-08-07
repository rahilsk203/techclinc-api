import { Router } from '../utils/router.js';
import { createError, createSuccess } from '../middleware/error.js';
import { requireAdmin } from '../middleware/auth.js';

const router = new Router();

// Get inventory alerts (low stock)
router.get('/inventory-alerts', async (request, env) => {
  try {
    // Get parts with low stock
    const lowStockParts = await env.DB.prepare(`
      SELECT p.*, b.name as box_name, b.location as box_location
      FROM parts p
      LEFT JOIN storage_boxes b ON p.box_id = b.id
      WHERE p.quantity <= p.min_quantity
      ORDER BY p.quantity ASC
    `).all();

    // Get accessories with low stock
    const lowStockAccessories = await env.DB.prepare(`
      SELECT * FROM accessories
      WHERE quantity <= min_quantity
      ORDER BY quantity ASC
    `).all();

    return createSuccess({
      parts: lowStockParts.results,
      accessories: lowStockAccessories.results,
      total_alerts: lowStockParts.results.length + lowStockAccessories.results.length
    }, 'Inventory alerts retrieved successfully');
  } catch (error) {
    console.error('Get inventory alerts error:', error);
    return createError('Failed to get inventory alerts', 500);
  }
});

// Get sales summary
router.get('/sales-summary', async (request, env) => {
  try {
    const { start_date, end_date } = request.query;
    
    let dateFilter = '';
    const params = [];

    if (start_date && end_date) {
      dateFilter = 'WHERE DATE(created_at) BETWEEN ? AND ?';
      params.push(start_date, end_date);
    } else if (start_date) {
      dateFilter = 'WHERE DATE(created_at) >= ?';
      params.push(start_date);
    } else if (end_date) {
      dateFilter = 'WHERE DATE(created_at) <= ?';
      params.push(end_date);
    }

    // Get accessory sales summary
    const accessorySales = await env.DB.prepare(`
      SELECT 
        COUNT(*) as total_sales,
        SUM(quantity_sold) as total_quantity,
        SUM(total_price) as total_revenue
      FROM accessory_sales
      ${dateFilter}
    `).bind(...params).first();

    // Get repair bills summary
    const repairBills = await env.DB.prepare(`
      SELECT 
        COUNT(*) as total_bills,
        SUM(total_amount) as total_revenue,
        AVG(total_amount) as avg_bill_amount
      FROM bills
      WHERE repair_id IS NOT NULL
      ${dateFilter ? dateFilter.replace('WHERE', 'AND') : ''}
    `).bind(...params).first();

    // Get accessory bills summary
    const accessoryBills = await env.DB.prepare(`
      SELECT 
        COUNT(*) as total_bills,
        SUM(total_amount) as total_revenue,
        AVG(total_amount) as avg_bill_amount
      FROM bills
      WHERE repair_id IS NULL
      ${dateFilter ? dateFilter.replace('WHERE', 'AND') : ''}
    `).bind(...params).first();

    // Get top selling accessories
    const topAccessories = await env.DB.prepare(`
      SELECT 
        a.name,
        SUM(s.quantity_sold) as total_quantity,
        SUM(s.total_price) as total_revenue
      FROM accessory_sales s
      JOIN accessories a ON s.accessory_id = a.id
      ${dateFilter}
      GROUP BY a.id, a.name
      ORDER BY total_quantity DESC
      LIMIT 10
    `).bind(...params).all();

    return createSuccess({
      accessory_sales: accessorySales,
      repair_bills: repairBills,
      accessory_bills: accessoryBills,
      top_accessories: topAccessories.results,
      total_revenue: (accessorySales.total_revenue || 0) + (repairBills.total_revenue || 0) + (accessoryBills.total_revenue || 0)
    }, 'Sales summary retrieved successfully');
  } catch (error) {
    console.error('Get sales summary error:', error);
    return createError('Failed to get sales summary', 500);
  }
});

// Get repair statistics
router.get('/repair-stats', async (request, env) => {
  try {
    const { start_date, end_date } = request.query;
    
    let dateFilter = '';
    const params = [];

    if (start_date && end_date) {
      dateFilter = 'WHERE DATE(created_at) BETWEEN ? AND ?';
      params.push(start_date, end_date);
    } else if (start_date) {
      dateFilter = 'WHERE DATE(created_at) >= ?';
      params.push(start_date);
    } else if (end_date) {
      dateFilter = 'WHERE DATE(created_at) <= ?';
      params.push(end_date);
    }

    // Get repair status distribution
    const statusStats = await env.DB.prepare(`
      SELECT 
        status,
        COUNT(*) as count
      FROM repairs
      ${dateFilter}
      GROUP BY status
    `).bind(...params).all();

    // Get repairs by technician
    const technicianStats = await env.DB.prepare(`
      SELECT 
        u.username as technician_name,
        COUNT(*) as total_repairs,
        COUNT(CASE WHEN r.status = 'completed' THEN 1 END) as completed_repairs,
        AVG(CASE WHEN r.status = 'completed' 
            THEN JULIANDAY(r.actual_completion_date) - JULIANDAY(r.created_at) 
            END) as avg_completion_days
      FROM repairs r
      LEFT JOIN users u ON r.assigned_technician_id = u.id
      ${dateFilter}
      GROUP BY u.id, u.username
      ORDER BY total_repairs DESC
    `).bind(...params).all();

    // Get most used parts
    const topParts = await env.DB.prepare(`
      SELECT 
        p.name,
        SUM(rp.quantity_used) as total_quantity,
        SUM(rp.total_price) as total_value
      FROM repair_parts rp
      JOIN parts p ON rp.part_id = p.id
      JOIN repairs r ON rp.repair_id = r.id
      ${dateFilter}
      GROUP BY p.id, p.name
      ORDER BY total_quantity DESC
      LIMIT 10
    `).bind(...params).all();

    return createSuccess({
      status_distribution: statusStats.results,
      technician_performance: technicianStats.results,
      top_used_parts: topParts.results
    }, 'Repair statistics retrieved successfully');
  } catch (error) {
    console.error('Get repair stats error:', error);
    return createError('Failed to get repair statistics', 500);
  }
});

// Get financial summary
router.get('/financial-summary', requireAdmin, async (request, env) => {
  try {
    const { start_date, end_date } = request.query;
    
    let dateFilter = '';
    const params = [];

    if (start_date && end_date) {
      dateFilter = 'WHERE DATE(created_at) BETWEEN ? AND ?';
      params.push(start_date, end_date);
    } else if (start_date) {
      dateFilter = 'WHERE DATE(created_at) >= ?';
      params.push(start_date);
    } else if (end_date) {
      dateFilter = 'WHERE DATE(created_at) <= ?';
      params.push(end_date);
    }

    // Get total revenue
    const totalRevenue = await env.DB.prepare(`
      SELECT SUM(total_amount) as total
      FROM bills
      ${dateFilter}
    `).bind(...params).first();

    // Get revenue by payment status
    const revenueByStatus = await env.DB.prepare(`
      SELECT 
        payment_status,
        COUNT(*) as bill_count,
        SUM(total_amount) as total_amount
      FROM bills
      ${dateFilter}
      GROUP BY payment_status
    `).bind(...params).all();

    // Get daily revenue for chart
    const dailyRevenue = await env.DB.prepare(`
      SELECT 
        DATE(created_at) as date,
        SUM(total_amount) as revenue,
        COUNT(*) as bill_count
      FROM bills
      ${dateFilter}
      GROUP BY DATE(created_at)
      ORDER BY date
    `).bind(...params).all();

    // Get revenue by type (repair vs accessory)
    const revenueByType = await env.DB.prepare(`
      SELECT 
        CASE 
          WHEN repair_id IS NOT NULL THEN 'repair'
          ELSE 'accessory'
        END as bill_type,
        COUNT(*) as bill_count,
        SUM(total_amount) as total_amount
      FROM bills
      ${dateFilter}
      GROUP BY bill_type
    `).bind(...params).all();

    return createSuccess({
      total_revenue: totalRevenue.total || 0,
      revenue_by_status: revenueByStatus.results,
      daily_revenue: dailyRevenue.results,
      revenue_by_type: revenueByType.results
    }, 'Financial summary retrieved successfully');
  } catch (error) {
    console.error('Get financial summary error:', error);
    return createError('Failed to get financial summary', 500);
  }
});

// Get customer analytics
router.get('/customer-analytics', async (request, env) => {
  try {
    const { start_date, end_date } = request.query;
    
    let dateFilter = '';
    const params = [];

    if (start_date && end_date) {
      dateFilter = 'WHERE DATE(created_at) BETWEEN ? AND ?';
      params.push(start_date, end_date);
    } else if (start_date) {
      dateFilter = 'WHERE DATE(created_at) >= ?';
      params.push(start_date);
    } else if (end_date) {
      dateFilter = 'WHERE DATE(created_at) <= ?';
      params.push(end_date);
    }

    // Get top customers by revenue
    const topCustomers = await env.DB.prepare(`
      SELECT 
        c.name,
        c.phone,
        COUNT(b.id) as bill_count,
        SUM(b.total_amount) as total_spent,
        AVG(b.total_amount) as avg_bill_amount
      FROM bills b
      JOIN customers c ON b.customer_id = c.id
      ${dateFilter}
      GROUP BY c.id, c.name, c.phone
      ORDER BY total_spent DESC
      LIMIT 10
    `).bind(...params).all();

    // Get customer retention (customers with multiple repairs)
    const customerRetention = await env.DB.prepare(`
      SELECT 
        repair_count,
        COUNT(*) as customer_count
      FROM (
        SELECT 
          customer_id,
          COUNT(*) as repair_count
        FROM repairs
        ${dateFilter}
        GROUP BY customer_id
      ) repair_counts
      GROUP BY repair_count
      ORDER BY repair_count
    `).bind(...params).all();

    // Get new customers per month
    const newCustomers = await env.DB.prepare(`
      SELECT 
        strftime('%Y-%m', created_at) as month,
        COUNT(*) as new_customers
      FROM customers
      ${dateFilter}
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month
    `).bind(...params).all();

    return createSuccess({
      top_customers: topCustomers.results,
      customer_retention: customerRetention.results,
      new_customers: newCustomers.results
    }, 'Customer analytics retrieved successfully');
  } catch (error) {
    console.error('Get customer analytics error:', error);
    return createError('Failed to get customer analytics', 500);
  }
});

// Export data (CSV format)
router.get('/export/:type', requireAdmin, async (request, env) => {
  try {
    const exportType = request.params.type;
    const { start_date, end_date } = request.query;
    
    let dateFilter = '';
    const params = [];

    if (start_date && end_date) {
      dateFilter = 'WHERE DATE(created_at) BETWEEN ? AND ?';
      params.push(start_date, end_date);
    } else if (start_date) {
      dateFilter = 'WHERE DATE(created_at) >= ?';
      params.push(start_date);
    } else if (end_date) {
      dateFilter = 'WHERE DATE(created_at) <= ?';
      params.push(end_date);
    }

    let data;
    let filename;
    let headers;

    switch (exportType) {
      case 'repairs':
        data = await env.DB.prepare(`
          SELECT 
            r.id, r.mobile_model, r.reported_issue, r.status, r.created_at,
            c.name as customer_name, c.phone as customer_phone,
            u.username as technician_name
          FROM repairs r
          JOIN customers c ON r.customer_id = c.id
          LEFT JOIN users u ON r.assigned_technician_id = u.id
          ${dateFilter}
          ORDER BY r.created_at DESC
        `).bind(...params).all();
        
        filename = `repairs_${new Date().toISOString().split('T')[0]}.csv`;
        headers = ['ID', 'Mobile Model', 'Reported Issue', 'Status', 'Created At', 'Customer Name', 'Customer Phone', 'Technician'];
        break;

      case 'bills':
        data = await env.DB.prepare(`
          SELECT 
            b.bill_number, b.subtotal, b.tax_amount, b.total_amount, b.payment_status, b.created_at,
            c.name as customer_name, c.phone as customer_phone,
            u.username as created_by
          FROM bills b
          JOIN customers c ON b.customer_id = c.id
          JOIN users u ON b.created_by = u.id
          ${dateFilter}
          ORDER BY b.created_at DESC
        `).bind(...params).all();
        
        filename = `bills_${new Date().toISOString().split('T')[0]}.csv`;
        headers = ['Bill Number', 'Subtotal', 'Tax Amount', 'Total Amount', 'Payment Status', 'Created At', 'Customer Name', 'Customer Phone', 'Created By'];
        break;

      case 'accessory-sales':
        data = await env.DB.prepare(`
          SELECT 
            s.quantity_sold, s.unit_price, s.total_price, s.created_at,
            a.name as accessory_name,
            u.username as sold_by
          FROM accessory_sales s
          JOIN accessories a ON s.accessory_id = a.id
          JOIN users u ON s.sold_by = u.id
          ${dateFilter}
          ORDER BY s.created_at DESC
        `).bind(...params).all();
        
        filename = `accessory_sales_${new Date().toISOString().split('T')[0]}.csv`;
        headers = ['Quantity Sold', 'Unit Price', 'Total Price', 'Created At', 'Accessory Name', 'Sold By'];
        break;

      default:
        return createError('Invalid export type. Use: repairs, bills, or accessory-sales');
    }

    // Convert to CSV
    const csvContent = [
      headers.join(','),
      ...data.results.map(row => 
        headers.map(header => {
          const value = row[header.toLowerCase().replace(/\s+/g, '_')];
          return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
        }).join(',')
      )
    ].join('\n');

    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });
  } catch (error) {
    console.error('Export data error:', error);
    return createError('Failed to export data', 500);
  }
});

export default router; 