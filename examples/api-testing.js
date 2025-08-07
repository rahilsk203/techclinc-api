// TechClinc API Testing Examples
// This file contains examples of how to interact with the TechClinc API

const API_BASE_URL = 'https://techclinc-api.techclinic-api.workers.dev';

// Helper function for API calls
async function apiCall(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(`API Error: ${data.message || response.statusText}`);
  }
  
  return data;
}

// Authentication Examples
async function authenticationExamples() {
  console.log('🔐 Authentication Examples');
  
  // 1. Register Admin User
  try {
    const registerData = {
      username: 'admin',
      email: 'admin@techclinc.com',
      password: 'securepassword123',
      registrationKey: 'your-admin-key-here'
    };
    
    const registerResponse = await apiCall('/auth/register', {
      method: 'POST',
      body: JSON.stringify(registerData)
    });
    
    console.log('✅ Admin registered:', registerResponse.data);
  } catch (error) {
    console.log('❌ Registration failed:', error.message);
  }
  
  // 2. Login
  try {
    const loginData = {
      username: 'admin',
      password: 'securepassword123'
    };
    
    const loginResponse = await apiCall('/auth/login', {
      method: 'POST',
      body: JSON.stringify(loginData)
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful, token received');
    
    return token;
  } catch (error) {
    console.log('❌ Login failed:', error.message);
    return null;
  }
}

// Storage Boxes Examples
async function storageBoxExamples(token) {
  console.log('\n📦 Storage Boxes Examples');
  
  const headers = { 'Authorization': `Bearer ${token}` };
  
  // 1. Create Storage Box
  try {
    const boxData = {
      name: 'iPhone Parts',
      description: 'Storage for iPhone components',
      location: 'Shelf A1'
    };
    
    const boxResponse = await apiCall('/parts/boxes', {
      method: 'POST',
      headers,
      body: JSON.stringify(boxData)
    });
    
    console.log('✅ Storage box created:', boxResponse.data);
    return boxResponse.data.id;
  } catch (error) {
    console.log('❌ Create box failed:', error.message);
    return null;
  }
}

// Parts Examples
async function partsExamples(token, boxId) {
  console.log('\n🔧 Parts Examples');
  
  const headers = { 'Authorization': `Bearer ${token}` };
  
  // 1. Create Part
  try {
    const partData = {
      name: 'iPhone 12 Screen',
      description: 'Original iPhone 12 LCD screen',
      box_id: boxId,
      quantity: 10,
      min_quantity: 5,
      repair_price: 50.00,
      sealing_price: 80.00
    };
    
    const partResponse = await apiCall('/parts', {
      method: 'POST',
      headers,
      body: JSON.stringify(partData)
    });
    
    console.log('✅ Part created:', partResponse.data);
    return partResponse.data.id;
  } catch (error) {
    console.log('❌ Create part failed:', error.message);
    return null;
  }
}

// Accessories Examples
async function accessoriesExamples(token) {
  console.log('\n📱 Accessories Examples');
  
  const headers = { 'Authorization': `Bearer ${token}` };
  
  // 1. Create Accessory
  try {
    const accessoryData = {
      name: 'iPhone Case',
      description: 'Protective phone case',
      quantity: 20,
      min_quantity: 5,
      price: 15.00
    };
    
    const accessoryResponse = await apiCall('/accessories', {
      method: 'POST',
      headers,
      body: JSON.stringify(accessoryData)
    });
    
    console.log('✅ Accessory created:', accessoryResponse.data);
    return accessoryResponse.data.id;
  } catch (error) {
    console.log('❌ Create accessory failed:', error.message);
    return null;
  }
}

// Customer Examples
async function customerExamples(token) {
  console.log('\n👤 Customer Examples');
  
  const headers = { 'Authorization': `Bearer ${token}` };
  
  // 1. Create Customer
  try {
    const customerData = {
      name: 'John Doe',
      phone: '+1234567890',
      email: 'john@example.com',
      address: '123 Main St, City, State 12345'
    };
    
    const customerResponse = await apiCall('/customers', {
      method: 'POST',
      headers,
      body: JSON.stringify(customerData)
    });
    
    console.log('✅ Customer created:', customerResponse.data);
    return customerResponse.data.id;
  } catch (error) {
    console.log('❌ Create customer failed:', error.message);
    return null;
  }
}

// Repair Examples
async function repairExamples(token, customerId, partId) {
  console.log('\n🔧 Repair Examples');
  
  const headers = { 'Authorization': `Bearer ${token}` };
  
  // 1. Create Repair
  try {
    const repairData = {
      customer_id: customerId,
      mobile_model: 'iPhone 12',
      reported_issue: 'Broken screen',
      estimated_completion_date: '2024-01-15',
      notes: 'Customer needs it by Friday'
    };
    
    const repairResponse = await apiCall('/repairs', {
      method: 'POST',
      headers,
      body: JSON.stringify(repairData)
    });
    
    console.log('✅ Repair created:', repairResponse.data);
    return repairResponse.data.id;
  } catch (error) {
    console.log('❌ Create repair failed:', error.message);
    return null;
  }
}

// Billing Examples
async function billingExamples(token, customerId, accessoryId) {
  console.log('\n💰 Billing Examples');
  
  const headers = { 'Authorization': `Bearer ${token}` };
  
  // 1. Create Accessory Bill
  try {
    const billData = {
      customer_id: customerId,
      items: [
        {
          accessory_id: accessoryId,
          quantity: 2
        }
      ],
      tax_rate: 8.5,
      payment_method: 'cash'
    };
    
    const billResponse = await apiCall('/bills/accessories', {
      method: 'POST',
      headers,
      body: JSON.stringify(billData)
    });
    
    console.log('✅ Accessory bill created:', billResponse.data);
    return billResponse.data.id;
  } catch (error) {
    console.log('❌ Create bill failed:', error.message);
    return null;
  }
}

// Reports Examples
async function reportsExamples(token) {
  console.log('\n📊 Reports Examples');
  
  const headers = { 'Authorization': `Bearer ${token}` };
  
  // 1. Get Inventory Alerts
  try {
    const alertsResponse = await apiCall('/reports/inventory-alerts', {
      headers
    });
    
    console.log('✅ Inventory alerts:', alertsResponse.data);
  } catch (error) {
    console.log('❌ Get alerts failed:', error.message);
  }
  
  // 2. Get Sales Summary
  try {
    const salesResponse = await apiCall('/reports/sales-summary', {
      headers
    });
    
    console.log('✅ Sales summary:', salesResponse.data);
  } catch (error) {
    console.log('❌ Get sales summary failed:', error.message);
  }
}

// Settings Examples
async function settingsExamples(token) {
  console.log('\n⚙️ Settings Examples');
  
  const headers = { 'Authorization': `Bearer ${token}` };
  
  // 1. Initialize Default Settings
  try {
    const initResponse = await apiCall('/settings/initialize', {
      method: 'POST',
      headers
    });
    
    console.log('✅ Settings initialized:', initResponse.data);
  } catch (error) {
    console.log('❌ Initialize settings failed:', error.message);
  }
  
  // 2. Update Shop Name
  try {
    const updateData = {
      value: 'TechClinc Mobile Repair Shop',
      description: 'Updated shop name'
    };
    
    const updateResponse = await apiCall('/settings/shop_name', {
      method: 'PUT',
      headers,
      body: JSON.stringify(updateData)
    });
    
    console.log('✅ Shop name updated:', updateResponse.data);
  } catch (error) {
    console.log('❌ Update setting failed:', error.message);
  }
}

// Main function to run all examples
async function runAllExamples() {
  console.log('🚀 TechClinc API Testing Examples');
  console.log('==================================');
  
  try {
    // Authentication
    const token = await authenticationExamples();
    if (!token) {
      console.log('❌ Cannot proceed without authentication');
      return;
    }
    
    // Create resources
    const boxId = await storageBoxExamples(token);
    const partId = await partsExamples(token, boxId);
    const accessoryId = await accessoriesExamples(token);
    const customerId = await customerExamples(token);
    
    // Create repair and billing
    const repairId = await repairExamples(token, customerId, partId);
    const billId = await billingExamples(token, customerId, accessoryId);
    
    // Get reports
    await reportsExamples(token);
    
    // Manage settings
    await settingsExamples(token);
    
    console.log('\n🎉 All examples completed successfully!');
    
  } catch (error) {
    console.log('❌ Example execution failed:', error.message);
  }
}

// Export functions for individual testing
module.exports = {
  authenticationExamples,
  storageBoxExamples,
  partsExamples,
  accessoriesExamples,
  customerExamples,
  repairExamples,
  billingExamples,
  reportsExamples,
  settingsExamples,
  runAllExamples
};

// Run examples if this file is executed directly
if (typeof window === 'undefined' && require.main === module) {
  runAllExamples();
} 