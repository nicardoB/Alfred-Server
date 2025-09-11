import { Router } from 'express';
import { mcpRoutes } from './mcp.js';
import { audioRoutes } from './audio.js';
import { sessionRoutes } from './session.js';
import { healthRoutes } from './health.js';
import { monitoringRoutes } from './monitoring.js';

export function setupRoutes(app, dependencies) {
  const { sessionManager, smartAIRouter } = dependencies;
  
  // API versioning
  const apiV1 = Router();
  
  // Mount route modules
  apiV1.use('/mcp', mcpRoutes(sessionManager, smartAIRouter));
  apiV1.use('/audio', audioRoutes(sessionManager, smartAIRouter));
  apiV1.use('/session', sessionRoutes(sessionManager));
  apiV1.use('/health', healthRoutes());
  apiV1.use('/monitoring', monitoringRoutes());
  
  // Mount API version
  app.use('/api/v1', apiV1);
  
  // Root redirect
  app.get('/', (req, res) => {
    res.json({
      name: 'Alfred MCP Server',
      version: '1.0.0',
      endpoints: {
        health: '/api/v1/health',
        session: '/api/v1/session',
        mcp: '/api/v1/mcp',
        audio: '/api/v1/audio',
        monitoring: '/api/v1/monitoring'
      }
    });
  });
}
