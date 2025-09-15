#!/usr/bin/env node

/**
 * Debug script to test cost tracking with detailed logging
 */

import fetch from 'node-fetch';

const BASE_URL = 'https://alfred-server-production.up.railway.app';
const TEST_CREDENTIALS = {
  email: 'nick.bhatia@gmail.com',
  password: 'SecureOwner2024!'
};

async function debugCostTracking() {
  console.log('🔍 Debug Cost Tracking Integration...\n');

  try {
    // Login
    const loginResponse = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(TEST_CREDENTIALS)
    });

    const loginData = await loginResponse.json();
    const token = loginData.token;
    console.log('✅ Authenticated');

    // Create MCP session
    const sessionResponse = await fetch(`${BASE_URL}/api/v1/mcp/connect`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        clientInfo: { version: '1.0', name: 'debug-test' }
      })
    });

    const sessionData = await sessionResponse.json();
    const sessionId = sessionData.sessionId;
    console.log('✅ Session created:', sessionId);

    // Make AI request with detailed response
    console.log('\n🤖 Making AI request...');
    const aiResponse = await fetch(`${BASE_URL}/api/v1/mcp/text`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionId: sessionId,
        text: 'Say "Hello world" and nothing else.',
        metadata: { source: 'debug-test' }
      })
    });

    if (!aiResponse.ok) {
      console.error('AI request failed:', aiResponse.status, await aiResponse.text());
      return;
    }

    const aiData = await aiResponse.json();
    console.log('AI Response:', JSON.stringify(aiData, null, 2));

    // Wait a bit for async cost tracking to complete
    console.log('\n⏳ Waiting for cost tracking to process...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check server logs by making another request to see if usage was tracked
    console.log('\n📊 Checking cost data immediately...');
    const costsResponse = await fetch(`${BASE_URL}/api/v1/monitoring/costs`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const costsData = await costsResponse.json();
    console.log('Cost Data:', JSON.stringify(costsData.data.summary, null, 2));

    // Check provider-specific costs
    console.log('\nProvider Costs:', JSON.stringify(costsData.data.providers, null, 2));

    // Cleanup
    await fetch(`${BASE_URL}/api/v1/mcp/disconnect`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sessionId: sessionId })
    });

  } catch (error) {
    console.error('Debug failed:', error.message);
  }
}

debugCostTracking();
