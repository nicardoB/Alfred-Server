// Test the local server with simplified response format
const SERVER_URL = 'http://localhost:3000';

async function testLocalSimplifiedResponse() {
    console.log('🧪 Testing LOCAL simplified MCP server response format...\n');
    
    try {
        // 1. Connect
        console.log('1. Connecting to local server...');
        const connectResponse = await fetch(`${SERVER_URL}/api/v1/mcp/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        
        const connectData = await connectResponse.json();
        console.log('✅ Connect Response:', connectData);
        
        const sessionId = connectData.sessionId;
        
        // 2. Send text command
        console.log('\n2. Sending text command...');
        const textResponse = await fetch(`${SERVER_URL}/api/v1/mcp/text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId,
                text: "Hello Alfred, how are you today?",
                metadata: {
                    source: "test",
                    timestamp: new Date().toISOString()
                }
            })
        });
        
        const textData = await textResponse.json();
        console.log('✅ Text Response (LOCAL):', JSON.stringify(textData, null, 2));
        
        // Test if our flattened structure is working
        console.log('\n🔍 Flattened structure test:');
        console.log('- Success:', textData.success);
        console.log('- Content:', textData.content);
        console.log('- Provider:', textData.provider);
        console.log('- Confidence:', textData.confidence);
        
        if (textData.content && !textData.response) {
            console.log('✅ SUCCESS: Flattened structure is working locally!');
        } else {
            console.log('❌ ISSUE: Still seeing nested structure locally');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testLocalSimplifiedResponse();
