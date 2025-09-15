import { Sequelize } from 'sequelize';
import { logger } from '../utils/logger.js';
import { initializeCostUsageModel } from '../models/CostUsage.js';
import { initializeUserModel } from '../models/User.js';
import { initializeSessionModel } from '../models/Session.js';
import { initializeApiKeyModel } from '../models/ApiKey.js';
import { initializeAuditLogModel } from '../models/AuditLog.js';
import { initializeConversationModel } from '../models/Conversation.js';
import { initializeMessageModel } from '../models/Message.js';

let sequelize;

/**
 * Database setup and configuration
 */
export async function setupDatabase() {
  try {
    logger.info('Setting up database connection...');
    
    // Test database setup with actual models
    if (process.env.NODE_ENV === 'test') {
      logger.info('Setting up test database with SQLite');
      sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: ':memory:',
        logging: false
      });
    } else if (process.env.NODE_ENV === 'development' && !process.env.DATABASE_URL) {
      logger.warn('Using SQLite for development - PostgreSQL recommended for production');
      sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: './data/alfred_unified.db',
        logging: false
      });
    } else if (process.env.DATABASE_URL) {
      // Production PostgreSQL
      
      sequelize = new Sequelize(process.env.DATABASE_URL, {
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
      // Fallback to SQLite for Railway deployment without DATABASE_URL
      logger.warn('DATABASE_URL not found, using SQLite fallback');
      sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: './data/alfred_unified.db',
        logging: false
      });
    }
    
    // Initialize models in dependency order
    await initializeUserModel(sequelize);
    await initializeSessionModel(sequelize);
    await initializeApiKeyModel(sequelize);
    await initializeAuditLogModel(sequelize);
    await initializeConversationModel(sequelize);
    await initializeMessageModel(sequelize);
    await initializeCostUsageModel(sequelize);
    
    // Set up model associations
    const User = (await import('../models/User.js')).getUserModel();
    const Session = (await import('../models/Session.js')).getSessionModel();
    const ApiKey = (await import('../models/ApiKey.js')).getApiKeyModel();
    const AuditLog = (await import('../models/AuditLog.js')).getAuditLogModel();
    const Conversation = (await import('../models/Conversation.js')).getConversationModel();
    const Message = (await import('../models/Message.js')).getMessageModel();
    const CostUsage = (await import('../models/CostUsage.js')).getCostUsageModel();
    
    if (User && Session && ApiKey && AuditLog && Conversation && Message && CostUsage) {
      // User associations
      User.hasMany(Session, { foreignKey: 'userId', as: 'sessions' });
      User.hasMany(ApiKey, { foreignKey: 'userId', as: 'apiKeys' });
      User.hasMany(AuditLog, { foreignKey: 'userId', as: 'auditLogs' });
      User.hasMany(Conversation, { foreignKey: 'userId', as: 'conversations' });
      User.hasMany(CostUsage, { foreignKey: 'userId', as: 'costUsage' });
      
      // Session associations
      Session.belongsTo(User, { foreignKey: 'userId', as: 'user' });
      
      // ApiKey associations
      ApiKey.belongsTo(User, { foreignKey: 'userId', as: 'user' });
      
      // AuditLog associations
      AuditLog.belongsTo(User, { foreignKey: 'userId', as: 'user' });
      
      // Conversation associations
      Conversation.belongsTo(User, { foreignKey: 'userId', as: 'user' });
      Conversation.hasMany(Message, { foreignKey: 'conversationId', as: 'messages' });
      Conversation.hasMany(CostUsage, { foreignKey: 'conversationId', as: 'costs' });
      
      // Message associations
      Message.belongsTo(Conversation, { foreignKey: 'conversationId', as: 'conversation' });
      Message.belongsTo(Message, { foreignKey: 'parentMessageId', as: 'parentMessage' });
      Message.hasMany(Message, { foreignKey: 'parentMessageId', as: 'replies' });
      Message.hasMany(CostUsage, { foreignKey: 'messageId', as: 'costs' });
      
      // CostUsage associations
      CostUsage.belongsTo(User, { foreignKey: 'userId', as: 'user' });
      CostUsage.belongsTo(Conversation, { foreignKey: 'conversationId', as: 'conversation' });
      CostUsage.belongsTo(Message, { foreignKey: 'messageId', as: 'message' });
    }
    
    // Test the connection
    await sequelize.authenticate();
    logger.info('Database connection established successfully');
    
    // Sync models in dependency order - force recreate for clean PostgreSQL setup
    await User.sync({ force: true });
    await Session.sync({ force: true });
    await ApiKey.sync({ force: true });
    await AuditLog.sync({ force: true });
    await Conversation.sync({ force: true });
    await Message.sync({ force: true });
    await CostUsage.sync({ force: true });
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
