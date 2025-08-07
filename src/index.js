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
import authRoutes from './routes/auth.js';

const router = new Router();

// Global middleware
router.use(corsMiddleware);
router.use(errorHandler);

// Protected routes
router.use('/auth', authRoutes);
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
