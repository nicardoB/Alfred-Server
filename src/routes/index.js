import { Router } from 'express';
import { mcpRoutes } from './mcp.js';
import { audioRoutes } from './audio.js';
import { sessionRoutes } from './session.js';
import { healthRoutes } from './health.js';
import { monitoringRoutes } from './monitoring.js';
import authRoutes from './auth.js';
import chatRoutes from './chat.js';
import dashboardRoutes from './dashboard.js';
import docsRoutes from './docs.js';

export function setupRoutes(app, dependencies) {
  const { sessionManager, smartAIRouter, emailNotifier } = dependencies;
  
  // API versioning
  const apiV1 = Router();
  
  // Mount route modules
  console.log('ROUTE REGISTRATION DEBUG - Mounting auth routes');
  apiV1.use('/auth', authRoutes);
  apiV1.use('/chat', chatRoutes);
  apiV1.use('/mcp', mcpRoutes(sessionManager, smartAIRouter));
  apiV1.use('/audio', audioRoutes(sessionManager, smartAIRouter));
  apiV1.use('/session', sessionRoutes(sessionManager));
  apiV1.use('/health', healthRoutes());
  apiV1.use('/monitoring', monitoringRoutes(emailNotifier));
  apiV1.use('/dashboard', dashboardRoutes);
  
  // Mount API version
  app.use('/api/v1', apiV1);
  
  // Root redirect (must come before docs routes to avoid conflicts)
  app.get('/', (req, res) => {
    console.log('ROOT ENDPOINT DEBUG - Request received');
    res.json({
      name: 'Alfred MCP Server',
      version: '1.0.2-DEBUG-TEST',
      endpoints: {
        auth: '/api/v1/auth',
        chat: '/api/v1/chat',
        health: '/api/v1/health',
        session: '/api/v1/session',
        mcp: '/api/v1/mcp',
        audio: '/api/v1/audio',
        monitoring: '/api/v1/monitoring',
        dashboard: '/api/v1/dashboard',
        docs: '/api-docs',
        openapi: '/openapi.yaml'
      }
    });
  });
  
  // Mount documentation routes (after root redirect)
  app.use('/', docsRoutes);
}
