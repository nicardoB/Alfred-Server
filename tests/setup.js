import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Test timeout for async operations
jest.setTimeout(10000);
