import { Sequelize } from 'sequelize';
import { logger } from '../utils/logger.js';
import { initializeCostUsageModel } from '../models/CostUsage.js';
import { initializeUserModel } from '../models/User.js';
import { initializeSessionModel } from '../models/Session.js';
import { initializeApiKeyModel } from '../models/ApiKey.js';
import { initializeAuditLogModel } from '../models/AuditLog.js';

let sequelize;

/**
 * Database setup and configuration
 */
export async function setupDatabase() {
  try {
    logger.info('Setting up database connection...');
    
    // Mock database setup for testing
    if (process.env.NODE_ENV === 'test') {
      logger.info('Using mock database for testing');
      return true;
    }
    
    // Use Railway PostgreSQL or fallback to SQLite for local development
    const databaseUrl = process.env.DATABASE_URL;
    
    if (databaseUrl) {
      // Railway PostgreSQL
      sequelize = new Sequelize(databaseUrl, {
        dialect: 'postgres',
        logging: false,
        dialectOptions: {
          ssl: {
            require: true,
            rejectUnauthorized: false
          }
        }
      });
    } else {
      // Local SQLite fallback
      sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: './data/alfred.db',
        logging: false
      });
    }
    
    // Initialize models
    await initializeCostUsageModel(sequelize);
    await initializeUserModel(sequelize);
    await initializeSessionModel(sequelize);
    await initializeApiKeyModel(sequelize);
    await initializeAuditLogModel(sequelize);
    
    // Set up model associations
    const User = (await import('../models/User.js')).getUserModel();
    const Session = (await import('../models/Session.js')).getSessionModel();
    const ApiKey = (await import('../models/ApiKey.js')).getApiKeyModel();
    const AuditLog = (await import('../models/AuditLog.js')).getAuditLogModel();
    
    if (User && Session && ApiKey && AuditLog) {
      // User associations
      User.hasMany(Session, { foreignKey: 'userId', as: 'sessions' });
      User.hasMany(ApiKey, { foreignKey: 'userId', as: 'apiKeys' });
      User.hasMany(AuditLog, { foreignKey: 'userId', as: 'auditLogs' });
      
      // Session associations
      Session.belongsTo(User, { foreignKey: 'userId', as: 'user' });
      
      // ApiKey associations
      ApiKey.belongsTo(User, { foreignKey: 'userId', as: 'user' });
      
      // AuditLog associations
      AuditLog.belongsTo(User, { foreignKey: 'userId', as: 'user' });
    }
    
    // Test the connection
    await sequelize.authenticate();
    logger.info('Database connection established successfully');
    
    // Sync models
    await sequelize.sync({ alter: true });
    logger.info('Database models synchronized');
    
    return sequelize;
    
  } catch (error) {
    logger.error('Database setup failed:', error);
    throw error;
  }
}

export function getDatabase() {
  return sequelize;
}
