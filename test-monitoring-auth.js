#!/usr/bin/env node

/**
 * Test monitoring endpoint authentication directly
 */

import fetch from 'node-fetch';

const BASE_URL = 'https://alfred-server-production.up.railway.app';
const TEST_CREDENTIALS = {
  email: 'nick.bhatia@gmail.com',
  password: 'SecureOwner2024!'
};

async function testMonitoringAuth() {
  console.log('🔍 Testing monitoring endpoint authentication...\n');

  try {
    // Login
    const loginResponse = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(TEST_CREDENTIALS)
    });

    const loginData = await loginResponse.json();
    const token = loginData.token;
    console.log('✅ Authenticated, token length:', token.length);

    // Test monitoring endpoint with detailed headers
    console.log('\n📊 Testing /api/v1/monitoring/costs endpoint...');
    console.log('Authorization header:', `Bearer ${token.substring(0, 20)}...`);
    
    const response = await fetch(`${BASE_URL}/api/v1/monitoring/costs`, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Success! Cost data received:', {
        totalCost: data.data?.summary?.totalCost,
        totalRequests: data.data?.summary?.totalRequests
      });
    } else {
      const errorText = await response.text();
      console.log('❌ Failed:', errorText);
    }

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testMonitoringAuth();
