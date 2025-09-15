import request from 'supertest';
import { jest } from '@jest/globals';
import express from 'express';

// Mock authentication middleware
jest.unstable_mockModule('../../src/middleware/authentication.js', () => ({
  authenticate: (req, res, next) => {
    req.user = { id: 'test-user-id', role: 'owner' };
    next();
  },
  requireRole: (roles) => (req, res, next) => next(),
  requireOwner: (req, res, next) => next(),
  requireFriend: (req, res, next) => next(),
  requirePermission: (permission) => (req, res, next) => next(),
  rateLimit: (limit) => (req, res, next) => next()
}));

// Mock SmartAIRouter
const mockRouter = {
  selectProvider: jest.fn(),
  processText: jest.fn(),
  getUsageStats: jest.fn()
};

jest.unstable_mockModule('../../src/ai/SmartAIRouter.js', () => ({
  SmartAIRouter: jest.fn().mockImplementation(() => mockRouter)
}));

// Mock CostTracker
const mockCostTracker = {
  trackUsage: jest.fn(),
  getUsageStats: jest.fn().mockResolvedValue({
    summary: { totalCost: 0.001, totalRequests: 1 },
    providers: {}
  })
};

jest.unstable_mockModule('../../src/monitoring/CostTracker.js', () => ({
  CostTracker: jest.fn().mockImplementation(() => mockCostTracker)
}));

const { app } = await import('../../src/server.js');

describe('Production Fixes Validation', () => {
  let authToken = 'mock-token';
  let userId = 'test-user-id';

  describe('Routing Fixes Integration', () => {
    it('should route simple greetings to GPT-4o Mini in production', async () => {
      const response = await request(app)
        .post('/api/v1/chat/stream')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          message: 'hello',
          conversationId: null
        });

      expect(response.status).toBe(200);
      
      // Verify routing decision was logged correctly
      const logs = response.body.metadata?.provider;
      expect(logs).toBe('openai'); // Should route to OpenAI (GPT-4o Mini)
    });

    it('should route complex queries to Claude in production', async () => {
      const response = await request(app)
        .post('/api/v1/chat/stream')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          message: 'analyze the complex economic implications of artificial intelligence on global markets',
          conversationId: null
        });

      expect(response.status).toBe(200);
      
      // Verify routing to Claude for complex reasoning
      const logs = response.body.metadata?.provider;
      expect(logs).toBe('claude');
    });
  });

  describe('Cost Aggregation Fixes', () => {
    it('should correctly aggregate costs across multiple requests', async () => {
      const costTracker = new CostTracker();
      
      // Get initial cost state
      const initialStats = await costTracker.getUsageStats();
      const initialCost = initialStats.summary.totalCost;

      // Make first request
      const response1 = await request(app)
        .post('/api/v1/chat/stream')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          message: 'hello',
          conversationId: null
        });

      expect(response1.status).toBe(200);

      // Get cost after first request
      const firstStats = await costTracker.getUsageStats();
      const firstCost = firstStats.summary.totalCost;
      expect(firstCost).toBeGreaterThan(initialCost);

      // Make second request
      const response2 = await request(app)
        .post('/api/v1/chat/stream')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          message: 'how are you?',
          conversationId: null
        });

      expect(response2.status).toBe(200);

      // Get cost after second request
      const secondStats = await costTracker.getUsageStats();
      const secondCost = secondStats.summary.totalCost;
      
      // Cost should have increased from first to second request
      expect(secondCost).toBeGreaterThan(firstCost);
      expect(secondStats.summary.requestCount).toBeGreaterThan(firstStats.summary.requestCount);
    });

    it('should track costs per provider correctly', async () => {
      const costTracker = new CostTracker();

      // Make requests that should route to different providers
      await request(app)
        .post('/api/v1/chat/stream')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          message: 'hello', // Should route to OpenAI
          conversationId: null
        });

      await request(app)
        .post('/api/v1/chat/stream')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          message: 'analyze the complex relationship between economics and technology', // Should route to Claude
          conversationId: null
        });

      const stats = await costTracker.getUsageStats();

      // Should have costs for both providers
      expect(stats.providers.openai).toBeDefined();
      expect(stats.providers.openai.totalCost).toBeGreaterThan(0);
      
      if (stats.providers.claude) {
        expect(stats.providers.claude.totalCost).toBeGreaterThan(0);
      }
    });
  });

  describe('WebSocket Cost Updates', () => {
    it('should emit cost updates via WebSocket after chat requests', (done) => {
      const io = require('socket.io-client');
      const client = io('http://localhost:3000', {
        auth: { token: authToken }
      });

      client.on('connect', () => {
        // Listen for cost updates
        client.on('cost-update', (costData) => {
          expect(costData).toHaveProperty('summary');
          expect(costData).toHaveProperty('providers');
          expect(costData.summary).toHaveProperty('totalCost');
          expect(costData.summary).toHaveProperty('totalTokens');
          
          client.disconnect();
          done();
        });

        // Trigger a chat request to generate cost update
        request(app)
          .post('/api/v1/chat/stream')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            message: 'test message for cost tracking',
            conversationId: null
          })
          .end();
      });

      client.on('connect_error', (error) => {
        done(error);
      });
    }, 10000);
  });

  describe('Model Selection Optimization', () => {
    it('should prefer cheaper models for simple tasks', async () => {
      const router = new SmartAIRouter();
      
      const cheapQueries = [
        'hello',
        'yes',
        'thanks',
        'what is this?'
      ];

      for (const query of cheapQueries) {
        const provider = await router.routeChat(query, {}, router.toolConfigs.chat);
        expect(provider).toBe('openai'); // Should use GPT-4o Mini (cheaper)
      }
    });

    it('should use appropriate models for complex reasoning', async () => {
      const router = new SmartAIRouter();
      
      const complexQueries = [
        'analyze the pros and cons of renewable energy policies',
        'explain the complex relationship between quantum mechanics and general relativity'
      ];

      for (const query of complexQueries) {
        const provider = await router.routeChat(query, {}, router.toolConfigs.chat);
        expect(provider).toBe('claude'); // Should use Claude for complex reasoning
      }
    });
  });

  describe('Error Handling Improvements', () => {
    it('should handle authentication errors gracefully', async () => {
      const response = await request(app)
        .post('/api/v1/chat/stream')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          message: 'test',
          conversationId: null
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle malformed requests gracefully', async () => {
      const response = await request(app)
        .post('/api/v1/chat/stream')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // Missing required message field
          conversationId: null
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Performance Validation', () => {
    it('should handle multiple concurrent requests efficiently', async () => {
      const startTime = Date.now();
      
      const requests = Array(5).fill().map(() =>
        request(app)
          .post('/api/v1/chat/stream')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            message: 'concurrent test message',
            conversationId: null
          })
      );

      const responses = await Promise.all(requests);
      const endTime = Date.now();
      
      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Should complete within reasonable time (adjust threshold as needed)
      expect(endTime - startTime).toBeLessThan(30000); // 30 seconds
    });

    it('should maintain cost accuracy under concurrent load', async () => {
      const costTracker = new CostTracker();
      const initialStats = await costTracker.getUsageStats();
      const initialCount = initialStats.summary.requestCount;

      // Make multiple concurrent requests
      const requests = Array(3).fill().map(() =>
        request(app)
          .post('/api/v1/chat/stream')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            message: 'load test message',
            conversationId: null
          })
      );

      await Promise.all(requests);

      // Wait for cost tracking to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      const finalStats = await costTracker.getUsageStats();
      const finalCount = finalStats.summary.requestCount;

      // Should have tracked all requests
      expect(finalCount).toBeGreaterThanOrEqual(initialCount + 3);
    });
  });
});
