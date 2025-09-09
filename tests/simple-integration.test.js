import request from 'supertest';
import express from 'express';
import { mcpRoutes } from '../src/routes/mcp.js';
import { SessionManager } from '../src/session/SessionManager.js';
import { SmartAIRouter } from '../src/ai/SmartAIRouter.js';

describe('MCP Server Integration', () => {
  let app;
  let sessionManager;
  let smartAIRouter;

  beforeAll(() => {
    sessionManager = new SessionManager();
    smartAIRouter = new SmartAIRouter();
    
    app = express();
    app.use(express.json());
    app.use('/mcp', mcpRoutes(sessionManager, smartAIRouter));
  });

  test('Complete MCP flow works', async () => {
    // 1. Connect
    const connectResponse = await request(app)
      .post('/mcp/connect')
      .send({ clientInfo: { version: '1.0.0' } });

    expect(connectResponse.status).toBe(200);
    expect(connectResponse.body.success).toBe(true);
    const sessionId = connectResponse.body.sessionId;

    // 2. Send text command
    const textResponse = await request(app)
      .post('/mcp/text')
      .send({
        sessionId,
        text: 'Hello Alfred',
        metadata: { source: 'test' }
      });

    expect(textResponse.status).toBe(200);
    expect(textResponse.body.success).toBe(true);
    expect(textResponse.body.response).toBeDefined();

    // 3. Disconnect
    const disconnectResponse = await request(app)
      .post('/mcp/disconnect')
      .send({ sessionId });

    expect(disconnectResponse.status).toBe(200);
    expect(disconnectResponse.body.success).toBe(true);
  });

  test('Smart AI Router provider selection works', () => {
    const router = new SmartAIRouter();
    
    // Test provider selection logic
    expect(router.selectProvider('debug this code')).toBe('copilot');
    expect(router.selectProvider('analyze this complex problem')).toBe('claude');
    expect(router.selectProvider('what is the weather')).toBe('openai'); // Simple query goes to OpenAI
  });

  test('Session management works', async () => {
    const manager = new SessionManager();
    
    const session = await manager.createSession('test-123', { user: 'test' });
    expect(session.id).toBe('test-123');
    
    const retrieved = await manager.getSession('test-123');
    expect(retrieved.id).toBe('test-123');
    
    const ended = await manager.endSession('test-123');
    expect(ended).toBe(true);
    
    const notFound = await manager.getSession('test-123');
    expect(notFound).toBe(null);
  });
});
