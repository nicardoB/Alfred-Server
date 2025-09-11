// Proposed simplified response formats for Alfred MCP Server

// Current complex format:
const currentTextResponse = {
  "success": true,
  "requestId": "2c29e829-d6a9-4134-bbea-86e60f298384",
  "response": {
    "provider": "claude",
    "response": {
      "content": "Claude response to: Hello Alfred, how are you today?",
      "confidence": 0.9,
      "provider": "claude"
    },
    "confidence": 0.9,
    "processingTimeMs": 0
  },
  "timestamp": "2025-09-11T07:50:49.938Z"
};

// Proposed simplified format:
const simplifiedTextResponse = {
  "success": true,
  "sessionId": "session-123",
  "content": "Claude response to: Hello Alfred, how are you today?",
  "confidence": 0.9,
  "timestamp": "2025-09-11T07:50:49.938Z"
};

// Connect response (already simple):
const connectResponse = {
  "success": true,
  "sessionId": "1e05ebad-f343-4c84-91dc-360bcb867295",
  "timestamp": "2025-09-11T07:50:49.706Z"
};

console.log('Current format requires nested parsing:');
console.log('content =', currentTextResponse.response.response.content);

console.log('\nSimplified format is direct:');
console.log('content =', simplifiedTextResponse.content);
