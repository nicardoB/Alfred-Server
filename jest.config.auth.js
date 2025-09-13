export default {
  testEnvironment: 'node',
  testMatch: [
    '**/tests/auth/**/*.test.js'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  collectCoverageFrom: [
    'src/models/**/*.js',
    'src/middleware/authentication.js',
    'src/config/permissions.js',
    'src/routes/auth.js'
  ],
  coverageDirectory: 'coverage/auth',
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true,
  testTimeout: 10000
};
