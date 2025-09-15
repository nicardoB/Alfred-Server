import dotenv from 'dotenv';
import { setupDatabase } from './src/config/database.js';
import { logger } from './src/utils/logger.js';

// Load environment variables
dotenv.config();

async function testDatabaseSetup() {
  try {
    console.log('🧪 Testing database setup locally...');
    
    // Test with your Railway PostgreSQL URL
    const testDatabaseUrl = process.env.DATABASE_URL;
    
    if (!testDatabaseUrl) {
      console.log('❌ No DATABASE_URL found in environment');
      console.log('💡 Create a .env file with your Railway PostgreSQL DATABASE_URL');
      return;
    }
    
    console.log('🔗 Using DATABASE_URL:', testDatabaseUrl.substring(0, 30) + '...');
    
    // Setup database
    const sequelize = await setupDatabase();
    
    console.log('✅ Database setup completed successfully!');
    console.log('📊 Testing table creation...');
    
    // Test basic operations
    const User = (await import('./src/models/User.js')).getUserModel();
    const userCount = await User.count();
    console.log(`👥 Users table exists, current count: ${userCount}`);
    
    const Conversation = (await import('./src/models/Conversation.js')).getConversationModel();
    const convCount = await Conversation.count();
    console.log(`💬 Conversations table exists, current count: ${convCount}`);
    
    console.log('🎉 All tests passed! Database setup is working correctly.');
    
    await sequelize.close();
    
  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    console.error('🔍 Full error:', error);
    process.exit(1);
  }
}

testDatabaseSetup();
