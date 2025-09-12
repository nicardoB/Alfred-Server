import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Import our modules
import { setupDatabase } from './config/database.js';
import { setupRoutes } from './routes/index.js';
import { setupWebSocket } from './websocket/handler.js';
import { SmartAIRouter } from './ai/SmartAIRouter.js';
import { SessionManager } from './session/SessionManager.js';
import { logger } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Configure this properly for production
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Security middleware with CSP configuration for dashboard
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https:", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
}));
app.use(cors());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.raw({ type: 'audio/*', limit: '10mb' }));

// Initialize core services
const sessionManager = new SessionManager();
const smartAIRouter = new SmartAIRouter();
import EmailNotifier from './monitoring/EmailNotifier.js';
const emailNotifier = new EmailNotifier();

// Setup database connection
const database = await setupDatabase();

// Initialize email notifier
await emailNotifier.initialize();

// Setup routes with dependencies
setupRoutes(app, { sessionManager, smartAIRouter, emailNotifier });

// Setup WebSocket handling
setupWebSocket(io, { sessionManager, smartAIRouter });

// Start email threshold monitoring if enabled
if (emailNotifier.isInitialized) {
  const { costTracker } = await import('./monitoring/CostTracker.js');
  await emailNotifier.startThresholdMonitoring(costTracker);
  console.log('Email threshold monitoring started');
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    requestId: req.headers['x-request-id'] || 'unknown'
  });
});

// Start server
server.listen(PORT, () => {
  logger.info(`Alfred MCP Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV}`);
  logger.info(`WebSocket enabled for real-time communication`);
  logger.info('Cost monitoring dashboard available at /api/v1/monitoring/dashboard');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

export { app, server, io };
