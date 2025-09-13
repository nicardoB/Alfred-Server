import request from 'supertest';

/**
 * Integration test to verify owner account functionality
 * Tests against actual deployed Alfred MCP Server
 */
describe('Owner Account Integration Test', () => {
  const baseUrl = 'https://alfred-server-production.up.railway.app';
  const setupKey = process.env.OWNER_SETUP_KEY || '24a0783d8ffe5aa024b082d98659b67fd0cef227e19d0dfdb930d8b4d56a53a7';
  
  let testOwnerEmail;
  let testOwnerPassword;
  let ownerApiKey;
  let ownerJwtToken;

  beforeAll(() => {
    // Generate unique test credentials
    const timestamp = Date.now();
    testOwnerEmail = `test-owner-${timestamp}@example.com`;
    testOwnerPassword = `SecureTestPass${timestamp}!`;
  });

  describe('Owner Account Creation', () => {
    test('should create owner account with valid setup key', async () => {
      const response = await request(baseUrl)
        .post('/api/v1/auth/setup-owner')
        .send({
          email: testOwnerEmail,
          password: testOwnerPassword,
          setupKey: setupKey
        })
        .expect(201);

      expect(response.body.message).toBe('Owner account created successfully');
      expect(response.body.user.email).toBe(testOwnerEmail);
      expect(response.body.user.role).toBe('owner');
      expect(response.body.apiKey).toMatch(/^ak_/);
      
      // Save API key for subsequent tests
      ownerApiKey = response.body.apiKey;
    });

    test('should reject duplicate owner creation', async () => {
      await request(baseUrl)
        .post('/api/v1/auth/setup-owner')
        .send({
          email: `another-${testOwnerEmail}`,
          password: testOwnerPassword,
          setupKey: setupKey
        })
        .expect(409); // Conflict - owner already exists
    });
  });

  describe('Owner Authentication', () => {
    test('should login with correct credentials', async () => {
      const response = await request(baseUrl)
        .post('/api/v1/auth/login')
        .send({
          email: testOwnerEmail,
          password: testOwnerPassword
        })
        .expect(200);

      expect(response.body.message).toBe('Login successful');
      expect(response.body.token).toBeTruthy();
      expect(response.body.user.role).toBe('owner');
      
      // Save JWT token for subsequent tests
      ownerJwtToken = response.body.token;
    });

    test('should reject incorrect password', async () => {
      await request(baseUrl)
        .post('/api/v1/auth/login')
        .send({
          email: testOwnerEmail,
          password: 'wrongpassword'
        })
        .expect(401);
    });
  });

  describe('Owner API Key Access', () => {
    test('should access profile with API key', async () => {
      const response = await request(baseUrl)
        .get('/api/v1/auth/profile')
        .set('x-api-key', ownerApiKey)
        .expect(200);

      expect(response.body.user.email).toBe(testOwnerEmail);
      expect(response.body.user.role).toBe('owner');
      expect(response.body.user.permissions['system.admin']).toBe(true);
      expect(response.body.user.permissions['monitoring.dashboard']).toBe(true);
    });

    test('should create MCP session with API key', async () => {
      const response = await request(baseUrl)
        .post('/api/v1/mcp/connect')
        .set('x-api-key', ownerApiKey)
        .send({ clientInfo: { version: '1.0' } })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.sessionId).toBeTruthy();
    });
  });

  describe('Owner JWT Token Access', () => {
    test('should access profile with JWT token', async () => {
      const response = await request(baseUrl)
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${ownerJwtToken}`)
        .expect(200);

      expect(response.body.user.email).toBe(testOwnerEmail);
      expect(response.body.user.role).toBe('owner');
    });

    test('should create MCP session with JWT token', async () => {
      const response = await request(baseUrl)
        .post('/api/v1/mcp/connect')
        .set('Authorization', `Bearer ${ownerJwtToken}`)
        .send({ clientInfo: { version: '1.0' } })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.sessionId).toBeTruthy();
    });
  });

  describe('Owner Permissions', () => {
    test('should access owner-only endpoints', async () => {
      // Test API key creation (owner-only)
      const response = await request(baseUrl)
        .post('/api/v1/auth/api-keys')
        .set('x-api-key', ownerApiKey)
        .send({ name: 'Test Integration Key' })
        .expect(201);

      expect(response.body.message).toBe('API key created successfully');
      expect(response.body.apiKey).toMatch(/^ak_/);
    });

    test('should list API keys', async () => {
      const response = await request(baseUrl)
        .get('/api/v1/auth/api-keys')
        .set('x-api-key', ownerApiKey)
        .expect(200);

      expect(response.body.apiKeys).toBeTruthy();
      expect(Array.isArray(response.body.apiKeys)).toBe(true);
      expect(response.body.apiKeys.length).toBeGreaterThan(0);
    });
  });

  describe('Security Validation', () => {
    test('should reject requests without authentication', async () => {
      await request(baseUrl)
        .post('/api/v1/mcp/connect')
        .send({ clientInfo: { version: '1.0' } })
        .expect(401);
    });

    test('should reject invalid API keys', async () => {
      await request(baseUrl)
        .get('/api/v1/auth/profile')
        .set('x-api-key', 'invalid-key')
        .expect(401);
    });

    test('should reject invalid JWT tokens', async () => {
      await request(baseUrl)
        .get('/api/v1/auth/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  describe('Logout and Session Management', () => {
    test('should logout successfully', async () => {
      await request(baseUrl)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${ownerJwtToken}`)
        .expect(200);
    });
  });
});
