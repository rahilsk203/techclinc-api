# TechClinc Mobile Repair Shop Backend

A complete mobile repair shop backend system built with Cloudflare Workers, D1 (SQL database), and KV storage. This system provides comprehensive inventory management, repair tracking, billing, and reporting capabilities.

## 🚀 Features

### Core Functionality
- **Secure Authentication**: JWT-based authentication with role-based access control
- **Parts Inventory**: Manage mobile parts with dual pricing (repair/seal) and storage boxes
- **Accessories Management**: Track mobile accessories with sales logging
- **Customer Management**: Complete customer database with repair history
- **Repair Tracking**: Full repair job lifecycle with status management
- **Advanced Billing**: Dynamic bill generation with tax calculation
- **Reporting & Analytics**: Comprehensive reporting and inventory alerts
- **Settings Management**: Configurable shop settings via KV storage

### Security Features
- JWT token authentication
- Role-based access control (Admin, Technician, Cashier)
- Secure password hashing
- Admin registration with secure key
- Session management via KV storage

### Database Schema
- **Users**: Authentication and role management
- **Storage Boxes**: Organization for parts
- **Parts**: Inventory with dual pricing
- **Accessories**: Independent accessory management
- **Customers**: Customer information and history
- **Repairs**: Repair job tracking
- **Repair Parts**: Parts used in repairs
- **Accessory Sales**: Sales tracking
- **Bills**: Billing and payment management
- **Bill Items**: Detailed bill breakdown

## 🛠️ Setup & Installation

### Prerequisites
- Node.js 18+ and npm
- Cloudflare account
- Wrangler CLI (`npm install -g wrangler`)

### 1. Clone and Install Dependencies
```bash
git clone <repository-url>
cd techclinc-api
npm install
```

### 2. Configure Cloudflare Resources

#### Create D1 Database
```bash
wrangler d1 create techclinc-db
```

#### Create KV Namespaces
```bash
wrangler kv:namespace create "SHOP_CONFIG"
wrangler kv:namespace create "AUTH_TOKENS"
```

### 3. Update Configuration

Edit `wrangler.toml` with your resource IDs:
```toml
[[d1_databases]]
binding = "DB"
database_name = "techclinc-db"
database_id = "your-database-id-here"

[[kv_namespaces]]
binding = "SHOP_CONFIG"
id = "your-kv-config-id-here"

[[kv_namespaces]]
binding = "AUTH_TOKENS"
id = "your-kv-auth-id-here"

[vars]
JWT_SECRET = "your-secure-jwt-secret-here"
ADMIN_REGISTRATION_KEY = "your-admin-registration-key-here"
```

### 4. Initialize Database
```bash
# Apply database schema
wrangler d1 migrations apply techclinc-db

# Or run schema directly
wrangler d1 execute techclinc-db --file=./schema.sql
```

### 5. Deploy
```bash
# Development
npm run dev

# Production
npm run deploy:prod
```

## 📚 API Documentation

### Authentication Endpoints

#### POST /auth/login
Login with username/email and password.
```json
{
  "username": "admin",
  "password": "password123"
}
```

#### POST /auth/register
Register new admin user (requires registration key).
```json
{
  "username": "admin",
  "email": "admin@techclinc.com",
  "password": "password123",
  "registrationKey": "your-admin-key"
}
```

#### POST /auth/logout
Logout and invalidate token.

#### GET /auth/profile
Get current user profile.

### Parts Management

#### GET /parts
Get all parts with optional filters.
```
Query params: search, box_id, low_stock
```

#### POST /parts
Create new part.
```json
{
  "name": "iPhone Screen",
  "description": "Original iPhone screen",
  "box_id": 1,
  "quantity": 10,
  "min_quantity": 5,
  "repair_price": 50.00,
  "sealing_price": 80.00
}
```

#### PUT /parts/:id
Update part details.

#### PATCH /parts/:id/quantity
Update part quantity.
```json
{
  "quantity": 5,
  "operation": "add" // add, subtract, set
}
```

### Storage Boxes

#### GET /parts/boxes
Get all storage boxes.

#### POST /parts/boxes
Create new storage box.
```json
{
  "name": "iPhone Parts",
  "description": "Storage for iPhone components",
  "location": "Shelf A1"
}
```

### Accessories Management

#### GET /accessories
Get all accessories.

#### POST /accessories
Create new accessory.
```json
{
  "name": "Phone Case",
  "description": "Protective phone case",
  "quantity": 20,
  "min_quantity": 5,
  "price": 15.00
}
```

#### POST /accessories/:id/sell
Sell accessory.
```json
{
  "quantity": 2,
  "unit_price": 15.00
}
```

### Customer Management

#### GET /customers
Get all customers with search.

#### POST /customers
Create new customer.
```json
{
  "name": "John Doe",
  "phone": "+1234567890",
  "email": "john@example.com",
  "address": "123 Main St"
}
```

### Repair Management

#### GET /repairs
Get all repairs with filters.

#### POST /repairs
Create new repair job.
```json
{
  "customer_id": 1,
  "mobile_model": "iPhone 12",
  "reported_issue": "Broken screen",
  "assigned_technician_id": 2,
  "estimated_completion_date": "2024-01-15",
  "notes": "Customer needs it by Friday"
}
```

#### PATCH /repairs/:id/status
Update repair status.
```json
{
  "status": "in_progress",
  "notes": "Started repair work"
}
```

#### POST /repairs/:id/parts
Add parts to repair.
```json
{
  "part_id": 1,
  "quantity_used": 1,
  "pricing_mode": "repair"
}
```

### Billing System

#### POST /bills/from-repair/:repair_id
Generate bill from completed repair.
```json
{
  "tax_rate": 8.5,
  "payment_method": "cash"
}
```

#### POST /bills/accessories
Create bill for accessories only.
```json
{
  "customer_id": 1,
  "items": [
    {
      "accessory_id": 1,
      "quantity": 2
    }
  ],
  "tax_rate": 8.5,
  "payment_method": "card"
}
```

#### PATCH /bills/:id/payment
Update payment status.
```json
{
  "payment_status": "paid",
  "payment_method": "cash"
}
```

### Reports & Analytics

#### GET /reports/inventory-alerts
Get low stock alerts.

#### GET /reports/sales-summary
Get sales summary with date filters.

#### GET /reports/repair-stats
Get repair statistics.

#### GET /reports/financial-summary
Get financial summary (admin only).

#### GET /reports/customer-analytics
Get customer analytics.

#### GET /reports/export/:type
Export data as CSV (repairs, bills, accessory-sales).

### Settings Management

#### GET /settings
Get all shop settings.

#### PUT /settings/:key
Update specific setting.
```json
{
  "value": "New Shop Name",
  "description": "Updated shop name"
}
```

#### POST /settings/initialize
Initialize default settings.

## 🔐 Security & Access Control

### User Roles
- **Admin**: Full system access
- **Technician**: Repair management, parts usage
- **Cashier**: Customer management, billing, accessory sales

### Authentication Flow
1. User logs in with credentials
2. System validates and returns JWT token
3. Token stored in KV for session management
4. All subsequent requests require Bearer token
5. Role-based middleware enforces permissions

## 📊 Database Schema

### Key Tables
- **users**: Authentication and roles
- **storage_boxes**: Parts organization
- **parts**: Inventory with dual pricing
- **accessories**: Accessory management
- **customers**: Customer database
- **repairs**: Repair job tracking
- **repair_parts**: Parts used in repairs
- **accessory_sales**: Sales tracking
- **bills**: Billing management
- **bill_items**: Bill details

## 🚀 Deployment

### Environment Variables
- `JWT_SECRET`: Secure secret for JWT signing
- `ADMIN_REGISTRATION_KEY`: Key required for admin registration
- `ENVIRONMENT`: Environment name (development/production)

### Production Deployment
```bash
# Set production environment variables
wrangler secret put JWT_SECRET
wrangler secret put ADMIN_REGISTRATION_KEY

# Deploy to production
npm run deploy:prod
```

### Environment Management
- Development: `wrangler dev`
- Staging: `npm run deploy:staging`
- Production: `npm run deploy:prod`

## 🔧 Development

### Local Development
```bash
# Start local development server
npm run dev

# Run database locally
npm run db:local
```

### Testing
```bash
# Run tests (when implemented)
npm test
```

### Code Structure
```
src/
├── index.js              # Main entry point
├── middleware/           # Authentication and error handling
├── routes/              # API route handlers
├── utils/               # Utility functions
└── models/              # Data models (if needed)
```

## 📈 Monitoring & Maintenance

### Health Check
- Endpoint: `GET /health`
- Returns system status and environment info

### Error Handling
- Comprehensive error responses
- Logging for debugging
- Graceful error recovery

### Performance
- Optimized database queries
- Efficient KV storage usage
- Minimal response times

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes
4. Test thoroughly
5. Submit pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Contact: support@techclinc.com

## 🔄 Version History

- **v1.0.0**: Initial release with core functionality
- Complete mobile repair shop backend system
- Cloudflare Workers + D1 + KV architecture
- Role-based authentication and authorization
- Comprehensive inventory and billing management 