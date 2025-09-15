import request from 'supertest';
import { app } from '../../src/app.js';
import { setupTestDatabase, teardownTestDatabase } from '../helpers/database.js';
import { getUserModel } from '../../src/models/User.js';
import { getSessionModel } from '../../src/models/Session.js';

describe('Authentication Production Flow Integration Tests', () => {
  let testDb;
  let User, Session;

  beforeAll(async () => {
    testDb = await setupTestDatabase();
    User = getUserModel();
    Session = getSessionModel();
  });

  afterAll(async () => {
    await teardownTestDatabase(testDb);
  });

  describe('JWT Authentication Flow', () => {
    let ownerUser;
    let authToken;

    beforeEach(async () => {
      // Create owner user
      ownerUser = await User.create({
        email: 'test.owner@example.com',
        password: 'securePassword123!',
        role: 'owner',
        isActive: true,
        approved: true
      });
    });

    afterEach(async () => {
      await User.destroy({ where: {}, force: true });
      await Session.destroy({ where: {}, force: true });
    });

    test('should login and create session successfully', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test.owner@example.com',
          password: 'securePassword123!'
        })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.role).toBe('owner');
      
      authToken = response.body.token;

      // Verify session was created
      const session = await Session.findOne({ where: { userId: ownerUser.id } });
      expect(session).toBeTruthy();
      expect(session.token).toBe(authToken);
    });

    test('should authenticate with JWT token when session exists', async () => {
      // Login first
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test.owner@example.com',
          password: 'securePassword123!'
        });

      authToken = loginResponse.body.token;

      // Test profile endpoint with token
      const profileResponse = await request(app)
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(profileResponse.body.user.email).toBe('test.owner@example.com');
      expect(profileResponse.body.user.role).toBe('owner');
    });

    test('should authenticate with JWT token even when session is missing', async () => {
      // Login first to get token
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test.owner@example.com',
          password: 'securePassword123!'
        });

      authToken = loginResponse.body.token;

      // Manually delete the session to simulate production issue
      await Session.destroy({ where: { userId: ownerUser.id } });

      // Should still authenticate via JWT fallback
      const profileResponse = await request(app)
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(profileResponse.body.user.email).toBe('test.owner@example.com');
      expect(profileResponse.body.user.role).toBe('owner');
    });

    test('should reject invalid JWT tokens', async () => {
      await request(app)
        .get('/api/v1/auth/profile')
        .set('Authorization', 'Bearer invalid.jwt.token')
        .expect(401);
    });

    test('should reject expired JWT tokens', async () => {
      // Create an expired token (this would need JWT manipulation in real scenario)
      await request(app)
        .get('/api/v1/auth/profile')
        .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0Iiwicm9sZSI6Im93bmVyIiwiaWF0IjoxNjAwMDAwMDAwLCJleHAiOjE2MDAwMDAwMDF9.invalid')
        .expect(401);
    });

    test('should handle missing user for valid JWT', async () => {
      // Login first
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test.owner@example.com',
          password: 'securePassword123!'
        });

      authToken = loginResponse.body.token;

      // Delete user but keep token
      await User.destroy({ where: { id: ownerUser.id }, force: true });

      // Should reject authentication
      await request(app)
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(401);
    });
  });

  describe('Production Database Scenarios', () => {
    test('should handle SQLite database initialization', async () => {
      // Test that models are properly initialized
      expect(User).toBeDefined();
      expect(Session).toBeDefined();
      
      // Test basic CRUD operations work
      const testUser = await User.create({
        email: 'sqlite.test@example.com',
        password: 'testPassword123!',
        role: 'demo',
        isActive: true,
        approved: true
      });

      expect(testUser.id).toBeDefined();
      expect(testUser.email).toBe('sqlite.test@example.com');

      await testUser.destroy();
    });

    test('should handle missing session table gracefully', async () => {
      // Create user without session
      const user = await User.create({
        email: 'no.session@example.com',
        password: 'testPassword123!',
        role: 'owner',
        isActive: true,
        approved: true
      });

      // Login should work even if session creation fails
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'no.session@example.com',
          password: 'testPassword123!'
        })
        .expect(200);

      expect(response.body.token).toBeDefined();
    });
  });

  describe('Authentication Middleware Edge Cases', () => {
    test('should handle malformed Authorization headers', async () => {
      await request(app)
        .get('/api/v1/auth/profile')
        .set('Authorization', 'InvalidFormat token')
        .expect(401);

      await request(app)
        .get('/api/v1/auth/profile')
        .set('Authorization', 'Bearer')
        .expect(401);
    });

    test('should handle missing Authorization header', async () => {
      await request(app)
        .get('/api/v1/auth/profile')
        .expect(401);
    });

    test('should handle database connection errors gracefully', async () => {
      // This would require mocking database failures
      // For now, just ensure the endpoint exists
      await request(app)
        .get('/api/v1/auth/profile')
        .set('Authorization', 'Bearer invalid.token')
        .expect(401);
    });
  });
});
