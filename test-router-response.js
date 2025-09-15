#!/usr/bin/env node

/**
 * Test SmartAIRouter response structure directly
 */

import fetch from 'node-fetch';

const BASE_URL = 'https://alfred-server-production.up.railway.app';
const TEST_CREDENTIALS = {
  email: 'nick.bhatia@gmail.com',
  password: 'SecureOwner2024!'
};

async function testRouterResponse() {
  console.log('🔍 Testing SmartAIRouter response structure...\n');

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
        clientInfo: { version: '1.0', name: 'router-test' }
      })
    });

    const sessionData = await sessionResponse.json();
    const sessionId = sessionData.sessionId;
    console.log('✅ Session created:', sessionId);

    // Make AI request and capture full response
    console.log('\n🤖 Making AI request to examine response structure...');
    
    const aiResponse = await fetch(`${BASE_URL}/api/v1/mcp/text`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionId: sessionId,
        text: 'Hello, please respond with a short message.',
        metadata: { source: 'router-test' }
      })
    });

    console.log('Response status:', aiResponse.status);
    console.log('Response headers:', Object.fromEntries(aiResponse.headers.entries()));

    if (aiResponse.ok) {
      const responseData = await aiResponse.json();
      console.log('\n📋 COMPLETE MCP RESPONSE STRUCTURE:');
      console.log('=====================================');
      console.log(JSON.stringify(responseData, null, 2));
      
      console.log('\n🔍 RESPONSE ANALYSIS:');
      console.log('====================');
      console.log('Success:', responseData.success);
      console.log('Provider:', responseData.provider);
      console.log('Content length:', responseData.content?.length || 0);
      console.log('Has usage data:', 'usage' in responseData);
      console.log('Has cost data:', 'cost' in responseData);
      console.log('Response keys:', Object.keys(responseData));
      
      if (responseData.usage) {
        console.log('\n💰 USAGE DATA FOUND:');
        console.log(JSON.stringify(responseData.usage, null, 2));
      } else {
        console.log('\n❌ NO USAGE DATA IN RESPONSE');
      }
      
    } else {
      const errorText = await aiResponse.text();
      console.log('❌ Request failed:', errorText);
    }

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
    console.error('Test failed:', error.message);
  }
}

testRouterResponse();
