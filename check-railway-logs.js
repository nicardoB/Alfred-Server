#!/usr/bin/env node

/**
 * Simple test to trigger debug logging on Railway and check response
 */

import fetch from 'node-fetch';

const BASE_URL = 'https://alfred-server-production.up.railway.app';
const TEST_CREDENTIALS = {
  email: 'nick.bhatia@gmail.com',
  password: 'SecureOwner2024!'
};

async function triggerDebugLogging() {
  console.log('🔍 Triggering debug logging on Railway...\n');

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

    // Make one AI request to trigger debug logging
    console.log('\n🤖 Making AI request to trigger debug logging...');
    
    const aiResponse = await fetch(`${BASE_URL}/api/v1/mcp/text`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionId: sessionId,
        text: 'Hello, this is a test message for debug logging.',
        metadata: { source: 'debug-test' }
      })
    });

    if (aiResponse.ok) {
      const aiData = await aiResponse.json();
      console.log(`✅ Response from ${aiData.provider}: ${aiData.content?.length || 0} chars`);
      console.log('Response preview:', aiData.content?.substring(0, 100) + '...');
    } else {
      console.log(`❌ Request failed: ${aiResponse.status}`);
      const errorText = await aiResponse.text();
      console.log('Error:', errorText);
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

    console.log('\n✅ Debug logging should now be visible in Railway logs');
    console.log('Check Railway dashboard > Deployments > Logs for debug output');

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

triggerDebugLogging();
