// Test the new simplified response format
const SERVER_URL = 'https://alfred-mcp-server-production.up.railway.app';

async function testSimplifiedResponse() {
    console.log('🧪 Testing simplified MCP server response format...\n');
    
    try {
        // 1. Connect
        console.log('1. Connecting...');
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
        console.log('✅ Text Response (NEW FORMAT):', textData);
        
        // Test simple parsing
        console.log('\n🔍 Simple parsing test:');
        console.log('- Success:', textData.success);
        console.log('- Content:', textData.content);
        console.log('- Provider:', textData.provider);
        console.log('- Confidence:', textData.confidence);
        
        // Test string-based extraction (what Android will use)
        const responseStr = JSON.stringify(textData);
        console.log('\n📱 Android string parsing simulation:');
        
        const contentStart = responseStr.indexOf('"content":"') + 11;
        const contentEnd = responseStr.indexOf('"', contentStart);
        const extractedContent = responseStr.substring(contentStart, contentEnd);
        
        console.log('- Extracted content:', extractedContent);
        console.log('- Match original?', extractedContent === textData.content);
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testSimplifiedResponse();
