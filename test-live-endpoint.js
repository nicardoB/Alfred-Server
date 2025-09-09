import fetch from 'node-fetch';

const SERVER_URL = 'https://alfred-mcp-server-production.up.railway.app';

async function testMCPFlow() {
  try {
    console.log('🚀 Testing Alfred MCP Server Live Endpoint...\n');

    // 1. Connect
    console.log('1. Connecting to MCP server...');
    const connectResponse = await fetch(`${SERVER_URL}/api/v1/mcp/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientInfo: { version: '1.0.0', platform: 'test' } })
    });
    
    const connectData = await connectResponse.json();
    console.log('✅ Connect Response:', connectData);
    
    if (!connectData.success) {
      throw new Error('Failed to connect');
    }
    
    const sessionId = connectData.sessionId;
    console.log(`📱 Session ID: ${sessionId}\n`);

    // 2. Send text command
    console.log('2. Sending text command: "Hey Alfred, hello"...');
    const textResponse = await fetch(`${SERVER_URL}/api/v1/mcp/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        text: 'Hey Alfred, hello',
        metadata: { source: 'test-script', timestamp: new Date().toISOString() }
      })
    });
    
    const textData = await textResponse.json();
    console.log('✅ Text Response:', textData);
    console.log(`🤖 AI Response: "${textData.response?.content || textData.response}"\n`);

    // 3. Disconnect
    console.log('3. Disconnecting...');
    const disconnectResponse = await fetch(`${SERVER_URL}/api/v1/mcp/disconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    });
    
    const disconnectData = await disconnectResponse.json();
    console.log('✅ Disconnect Response:', disconnectData);
    
    console.log('\n🎉 End-to-end MCP flow test SUCCESSFUL!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Full error:', error);
  }
}

testMCPFlow();
