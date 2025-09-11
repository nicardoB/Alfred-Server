import fetch from 'node-fetch';

const SERVER_URL = 'https://alfred-mcp-server-production.up.railway.app';

async function testAndroidFormat() {
  try {
    console.log('🔍 Testing Android client format...\n');

    // 1. Connect (same as working test)
    console.log('1. Connecting...');
    const connectResponse = await fetch(`${SERVER_URL}/api/v1/mcp/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientInfo: { version: '1.0.0', platform: 'android' } })
    });
    
    const connectData = await connectResponse.json();
    console.log('✅ Connect Response:', connectData);
    
    if (!connectData.success) {
      throw new Error('Failed to connect');
    }
    
    const sessionId = connectData.sessionId;
    console.log(`📱 Session ID: ${sessionId}\n`);

    // 2. Test Android format (what Android client sends)
    console.log('2. Testing Android format...');
    const androidResponse = await fetch(`${SERVER_URL}/api/v1/mcp/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        sessionId: sessionId, 
        text: "Hello Alfred, how are you today?" 
      })
    });
    
    console.log('Android Response Status:', androidResponse.status);
    const androidData = await androidResponse.text();
    console.log('Android Response Body:', androidData);

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testAndroidFormat();
