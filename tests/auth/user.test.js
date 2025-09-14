import { jest } from '@jest/globals';
import { Sequelize } from 'sequelize';
import { defineUserModel } from '../../src/models/User.js';

describe('User Model', () => {
  let sequelize;
  let User;

  beforeAll(async () => {
    // Setup in-memory SQLite for testing
    sequelize = new Sequelize('sqlite::memory:', {
      logging: false
    });
    
    User = defineUserModel(sequelize);
    await sequelize.sync();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  afterEach(async () => {
    await User.destroy({ where: {} });
  });

  describe('User Creation', () => {
    test('should create user with valid data', async () => {
      const userData = {
        email: 'test@example.com',
        hashedPassword: 'password123',
        role: 'owner'
      };

      const user = await User.create(userData);

      expect(user.email).toBe('test@example.com');
      expect(user.role).toBe('owner');
      expect(user.hashedPassword).not.toBe('password123'); // Should be hashed
      expect(user.approved).toBe(false);
      expect(parseFloat(user.monthlyBudget)).toBe(35.00);
    });

    test('should hash password on creation', async () => {
      const plainPassword = 'mySecurePassword123';
      const user = await User.create({
        email: 'test@example.com',
        hashedPassword: plainPassword,
        role: 'family'
      });

      expect(user.hashedPassword).not.toBe(plainPassword);
      expect(user.hashedPassword.length).toBeGreaterThan(50); // bcrypt hash length
    });

    test('should validate email format', async () => {
      await expect(User.create({
        email: 'invalid-email',
        hashedPassword: 'password123',
        role: 'friend'
      })).rejects.toThrow();
    });

    test('should enforce unique email constraint', async () => {
      await User.create({
        email: 'duplicate@example.com',
        hashedPassword: 'password123',
        role: 'owner'
      });

      await expect(User.create({
        email: 'duplicate@example.com',
        hashedPassword: 'password456',
        role: 'family'
      })).rejects.toThrow();
    });

    test('should validate role values', async () => {
      await expect(User.create({
        email: 'test@example.com',
        hashedPassword: 'password123',
        role: 'invalid_role'
      })).rejects.toThrow();
    });
  });

  describe('Password Validation', () => {
    test('should validate correct password', async () => {
      const plainPassword = 'mySecurePassword123';
      const user = await User.create({
        email: 'test@example.com',
        hashedPassword: plainPassword,
        role: 'owner'
      });

      const isValid = await user.validatePassword(plainPassword);
      expect(isValid).toBe(true);
    });

    test('should reject incorrect password', async () => {
      const user = await User.create({
        email: 'test@example.com',
        hashedPassword: 'correctPassword',
        role: 'owner'
      });

      const isValid = await user.validatePassword('wrongPassword');
      expect(isValid).toBe(false);
    });
  });

  describe('Permission System', () => {
    test('should check user permissions correctly', async () => {
      const user = await User.create({
        email: 'test@example.com',
        hashedPassword: 'password123',
        role: 'owner',
        permissions: {
          'system.admin': true,
          'monitoring.dashboard': true,
          'ai.chat': false
        }
      });

      expect(user.hasPermission('system.admin')).toBe(true);
      expect(user.hasPermission('monitoring.dashboard')).toBe(true);
      expect(user.hasPermission('ai.chat')).toBe(false);
      expect(user.hasPermission('nonexistent.permission')).toBe(false);
    });
  });

  describe('Account Locking', () => {
    test('should detect locked account', async () => {
      const futureDate = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now
      const user = await User.create({
        email: 'test@example.com',
        hashedPassword: 'password123',
        role: 'owner',
        lockedUntil: futureDate
      });

      expect(user.isLocked()).toBe(true);
    });

    test('should detect unlocked account', async () => {
      const pastDate = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago
      const user = await User.create({
        email: 'test@example.com',
        hashedPassword: 'password123',
        role: 'owner',
        lockedUntil: pastDate
      });

      expect(user.isLocked()).toBe(false);
    });

    test('should not be locked when lockedUntil is null', async () => {
      const user = await User.create({
        email: 'test@example.com',
        hashedPassword: 'password123',
        role: 'owner',
        lockedUntil: null
      });

      expect(user.isLocked()).toBe(false);
    });
  });

  describe('Password Update', () => {
    test('should hash password on update', async () => {
      const user = await User.create({
        email: 'test@example.com',
        hashedPassword: 'oldPassword',
        role: 'owner'
      });

      const originalHash = user.hashedPassword;
      
      user.hashedPassword = 'newPassword';
      await user.save();

      expect(user.hashedPassword).not.toBe('newPassword');
      expect(user.hashedPassword).not.toBe(originalHash);
      
      const isValid = await user.validatePassword('newPassword');
      expect(isValid).toBe(true);
    });
  });
});
