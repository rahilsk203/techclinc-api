import { Router } from '../utils/router.js';
import { createError, createSuccess } from '../middleware/error.js';
import { requireAdmin } from '../middleware/auth.js';

const router = new Router();

// Get all settings
router.get('/', requireAdmin, async (request, env) => {
  try {
    const settings = await env.SHOP_CONFIG.list();
    const settingsData = {};

    for (const key of settings.keys) {
      const value = await env.SHOP_CONFIG.get(key.name);
      try {
        settingsData[key.name] = JSON.parse(value);
      } catch {
        settingsData[key.name] = value;
      }
    }

    return createSuccess(settingsData, 'Settings retrieved successfully');
  } catch (error) {
    console.error('Get settings error:', error);
    return createError('Failed to get settings', 500);
  }
});

// Get specific setting
router.get('/:key', requireAdmin, async (request, env) => {
  try {
    const key = request.params.key;
    const value = await env.SHOP_CONFIG.get(key);

    if (value === null) {
      return createError('Setting not found', 404);
    }

    try {
      const parsedValue = JSON.parse(value);
      return createSuccess({ key, value: parsedValue }, 'Setting retrieved successfully');
    } catch {
      return createSuccess({ key, value }, 'Setting retrieved successfully');
    }
  } catch (error) {
    console.error('Get setting error:', error);
    return createError('Failed to get setting', 500);
  }
});

// Update setting
router.put('/:key', requireAdmin, async (request, env) => {
  try {
    const key = request.params.key;
    const { value, description } = await request.json();

    if (value === undefined) {
      return createError('Value is required');
    }

    // Validate setting key
    const validKeys = [
      'shop_name',
      'shop_address',
      'shop_phone',
      'shop_email',
      'tax_rate',
      'currency',
      'business_hours',
      'notification_settings',
      'inventory_alerts',
      'backup_settings',
      'security_settings'
    ];

    if (!validKeys.includes(key)) {
      return createError('Invalid setting key');
    }

    // Store setting with metadata
    const settingData = {
      value,
      description: description || '',
      updated_at: new Date().toISOString(),
      updated_by: request.user.id
    };

    await env.SHOP_CONFIG.put(key, JSON.stringify(settingData));

    return createSuccess({ key, ...settingData }, 'Setting updated successfully');
  } catch (error) {
    console.error('Update setting error:', error);
    return createError('Failed to update setting', 500);
  }
});

// Delete setting
router.delete('/:key', requireAdmin, async (request, env) => {
  try {
    const key = request.params.key;

    // Check if setting exists
    const value = await env.SHOP_CONFIG.get(key);
    if (value === null) {
      return createError('Setting not found', 404);
    }

    await env.SHOP_CONFIG.delete(key);

    return createSuccess(null, 'Setting deleted successfully');
  } catch (error) {
    console.error('Delete setting error:', error);
    return createError('Failed to delete setting', 500);
  }
});

// Initialize default settings
router.post('/initialize', requireAdmin, async (request, env) => {
  try {
    const defaultSettings = {
      shop_name: {
        value: 'TechClinc Mobile Repair Shop',
        description: 'Shop name for invoices and reports'
      },
      shop_address: {
        value: '123 Main Street, City, State 12345',
        description: 'Shop address for invoices'
      },
      shop_phone: {
        value: '+1 (555) 123-4567',
        description: 'Shop phone number'
      },
      shop_email: {
        value: 'info@techclinc.com',
        description: 'Shop email address'
      },
      tax_rate: {
        value: 8.5,
        description: 'Default tax rate percentage'
      },
      currency: {
        value: 'USD',
        description: 'Default currency for billing'
      },
      business_hours: {
        value: {
          monday: '9:00 AM - 6:00 PM',
          tuesday: '9:00 AM - 6:00 PM',
          wednesday: '9:00 AM - 6:00 PM',
          thursday: '9:00 AM - 6:00 PM',
          friday: '9:00 AM - 6:00 PM',
          saturday: '10:00 AM - 4:00 PM',
          sunday: 'Closed'
        },
        description: 'Business operating hours'
      },
      notification_settings: {
        value: {
          low_stock_email: true,
          low_stock_threshold: 5,
          daily_sales_report: false,
          weekly_inventory_report: true
        },
        description: 'Notification preferences'
      },
      inventory_alerts: {
        value: {
          enabled: true,
          email_recipients: [],
          auto_reorder: false,
          reorder_threshold: 3
        },
        description: 'Inventory alert settings'
      },
      backup_settings: {
        value: {
          auto_backup: true,
          backup_frequency: 'daily',
          retention_days: 30
        },
        description: 'Data backup configuration'
      },
      security_settings: {
        value: {
          session_timeout: 24,
          password_expiry_days: 90,
          max_login_attempts: 5,
          require_2fa: false
        },
        description: 'Security configuration'
      }
    };

    const initializedSettings = {};

    for (const [key, setting] of Object.entries(defaultSettings)) {
      const settingData = {
        ...setting,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        created_by: request.user.id,
        updated_by: request.user.id
      };

      await env.SHOP_CONFIG.put(key, JSON.stringify(settingData));
      initializedSettings[key] = settingData;
    }

    return createSuccess(initializedSettings, 'Default settings initialized successfully');
  } catch (error) {
    console.error('Initialize settings error:', error);
    return createError('Failed to initialize settings', 500);
  }
});

// Get system information
router.get('/system/info', requireAdmin, async (request, env) => {
  try {
    // Get database statistics
    const dbStats = await env.DB.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM customers) as total_customers,
        (SELECT COUNT(*) FROM repairs) as total_repairs,
        (SELECT COUNT(*) FROM bills) as total_bills,
        (SELECT COUNT(*) FROM parts) as total_parts,
        (SELECT COUNT(*) FROM accessories) as total_accessories
    `).first();

    // Get storage box count
    const boxCount = await env.DB.prepare(`
      SELECT COUNT(*) as total_boxes FROM storage_boxes
    `).first();

    // Get recent activity
    const recentRepairs = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM repairs 
      WHERE created_at >= datetime('now', '-7 days')
    `).first();

    const recentBills = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM bills 
      WHERE created_at >= datetime('now', '-7 days')
    `).first();

    const systemInfo = {
      database_stats: {
        ...dbStats,
        total_boxes: boxCount.total_boxes
      },
      recent_activity: {
        repairs_last_7_days: recentRepairs.count,
        bills_last_7_days: recentBills.count
      },
      environment: env.ENVIRONMENT || 'development',
      timestamp: new Date().toISOString()
    };

    return createSuccess(systemInfo, 'System information retrieved successfully');
  } catch (error) {
    console.error('Get system info error:', error);
    return createError('Failed to get system information', 500);
  }
});

// Get setting history
router.get('/:key/history', requireAdmin, async (request, env) => {
  try {
    const key = request.params.key;
    
    // Note: KV doesn't store history by default, so this would need to be implemented
    // with a separate history tracking mechanism if required
    
    return createSuccess([], 'Setting history not available in current implementation');
  } catch (error) {
    console.error('Get setting history error:', error);
    return createError('Failed to get setting history', 500);
  }
});

// Bulk update settings
router.post('/bulk-update', requireAdmin, async (request, env) => {
  try {
    const { settings } = await request.json();

    if (!settings || !Array.isArray(settings)) {
      return createError('Settings array is required');
    }

    const updatedSettings = {};

    for (const setting of settings) {
      const { key, value, description } = setting;

      if (!key || value === undefined) {
        continue;
      }

      const settingData = {
        value,
        description: description || '',
        updated_at: new Date().toISOString(),
        updated_by: request.user.id
      };

      await env.SHOP_CONFIG.put(key, JSON.stringify(settingData));
      updatedSettings[key] = settingData;
    }

    return createSuccess(updatedSettings, 'Settings updated successfully');
  } catch (error) {
    console.error('Bulk update settings error:', error);
    return createError('Failed to update settings', 500);
  }
});

export default router; 