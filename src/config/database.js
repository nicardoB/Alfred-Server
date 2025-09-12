import { Sequelize } from 'sequelize';
import { logger } from '../utils/logger.js';
import { initializeCostUsageModel } from '../models/CostUsage.js';

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
    initializeCostUsageModel(sequelize);
    
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
