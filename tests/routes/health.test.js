import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Import the health routes
const { healthRoutes } = await import('../../src/routes/health.js');

describe('Health Routes', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use('/health', healthRoutes());
  });

  describe('GET /health', () => {
    test('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('version', '2.0.0-DEPLOYMENT-TEST');
      expect(response.body).toHaveProperty('uptime');
      
      // Validate timestamp format
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
      
      // Validate uptime is a number
      expect(typeof response.body.uptime).toBe('number');
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    });

    test('should return consistent structure on multiple calls', async () => {
      const response1 = await request(app).get('/health').expect(200);
      const response2 = await request(app).get('/health').expect(200);

      // Structure should be consistent
      expect(Object.keys(response1.body)).toEqual(Object.keys(response2.body));
      expect(response1.body.status).toBe(response2.body.status);
      expect(response1.body.version).toBe(response2.body.version);
      
      // Uptime should increase between calls
      expect(response2.body.uptime).toBeGreaterThanOrEqual(response1.body.uptime);
    });
  });
});
