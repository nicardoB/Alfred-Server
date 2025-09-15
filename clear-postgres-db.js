import dotenv from 'dotenv';
import { Sequelize } from 'sequelize';

// Load environment variables
dotenv.config();

async function clearPostgresDatabase() {
  try {
    console.log('🗑️  Clearing PostgreSQL database...');
    
    const sequelize = new Sequelize(process.env.DATABASE_URL, {
      dialect: 'postgres',
      logging: false
    });
    
    await sequelize.authenticate();
    console.log('✅ Connected to PostgreSQL');
    
    // Drop all tables and indexes
    await sequelize.query('DROP SCHEMA public CASCADE;');
    await sequelize.query('CREATE SCHEMA public;');
    await sequelize.query('GRANT ALL ON SCHEMA public TO postgres;');
    await sequelize.query('GRANT ALL ON SCHEMA public TO public;');
    
    console.log('✅ Database cleared successfully');
    
    await sequelize.close();
    
  } catch (error) {
    console.error('❌ Failed to clear database:', error.message);
    process.exit(1);
  }
}

clearPostgresDatabase();
