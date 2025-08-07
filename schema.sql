-- Users table for authentication and role management
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'technician', 'cashier')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Storage boxes for organizing parts
CREATE TABLE IF NOT EXISTS storage_boxes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    location TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Parts inventory with dual pricing
CREATE TABLE IF NOT EXISTS parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    box_id INTEGER,
    quantity INTEGER DEFAULT 0,
    min_quantity INTEGER DEFAULT 5,
    repair_price DECIMAL(10,2) NOT NULL,
    sealing_price DECIMAL(10,2) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (box_id) REFERENCES storage_boxes(id)
);

-- Accessories inventory
CREATE TABLE IF NOT EXISTS accessories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    quantity INTEGER DEFAULT 0,
    min_quantity INTEGER DEFAULT 5,
    price DECIMAL(10,2) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Repair jobs
CREATE TABLE IF NOT EXISTS repairs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    mobile_model TEXT NOT NULL,
    reported_issue TEXT NOT NULL,
    assigned_technician_id INTEGER,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    estimated_completion_date DATE,
    actual_completion_date DATETIME,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (assigned_technician_id) REFERENCES users(id)
);

-- Parts used in repairs
CREATE TABLE IF NOT EXISTS repair_parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repair_id INTEGER NOT NULL,
    part_id INTEGER NOT NULL,
    quantity_used INTEGER NOT NULL,
    pricing_mode TEXT NOT NULL CHECK (pricing_mode IN ('repair', 'seal')),
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (repair_id) REFERENCES repairs(id),
    FOREIGN KEY (part_id) REFERENCES parts(id)
);

-- Accessory sales
CREATE TABLE IF NOT EXISTS accessory_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    accessory_id INTEGER NOT NULL,
    quantity_sold INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    sold_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (accessory_id) REFERENCES accessories(id),
    FOREIGN KEY (sold_by) REFERENCES users(id)
);

-- Bills table
CREATE TABLE IF NOT EXISTS bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repair_id INTEGER,
    customer_id INTEGER NOT NULL,
    bill_number TEXT UNIQUE NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL,
    payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'partial')),
    payment_method TEXT,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (repair_id) REFERENCES repairs(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Bill items (parts and accessories)
CREATE TABLE IF NOT EXISTS bill_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_id INTEGER NOT NULL,
    item_type TEXT NOT NULL CHECK (item_type IN ('part', 'accessory')),
    item_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    pricing_mode TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (bill_id) REFERENCES bills(id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_parts_box_id ON parts(box_id);
CREATE INDEX IF NOT EXISTS idx_repairs_customer_id ON repairs(customer_id);
CREATE INDEX IF NOT EXISTS idx_repairs_status ON repairs(status);
CREATE INDEX IF NOT EXISTS idx_repair_parts_repair_id ON repair_parts(repair_id);
CREATE INDEX IF NOT EXISTS idx_bills_customer_id ON bills(customer_id);
CREATE INDEX IF NOT EXISTS idx_bills_repair_id ON bills(repair_id);
CREATE INDEX IF NOT EXISTS idx_bill_items_bill_id ON bill_items(bill_id); 