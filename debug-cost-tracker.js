import { setupDatabase } from './src/config/database.js';
import { CostTracker } from './src/monitoring/CostTracker.js';
import { getCostUsageModel } from './src/models/CostUsage.js';

async function debugCostTracker() {
  try {
    console.log('Setting up database...');
    // Use a unique test database file
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'sqlite:./data/debug-test.db';
    
    const sequelize = await setupDatabase();
    await sequelize.sync({ force: true });
    
    console.log('Getting CostUsage model...');
    const CostUsage = getCostUsageModel();
    console.log('CostUsage model:', CostUsage ? 'Available' : 'Not available');
    
    console.log('Initializing CostTracker...');
    const costTracker = new CostTracker();
    await costTracker.ensureInitialized();
    console.log('CostTracker initialized:', costTracker.isInitialized);
    
    console.log('Creating test user...');
    const { getUserModel } = await import('./src/models/User.js');
    const User = getUserModel();
    const user = await User.create({
      id: 'test-user',
      username: 'testuser',
      email: 'test@example.com',
      hashedPassword: 'dummy-hash',
      role: 'owner',
      isActive: true,
      permissions: { 'ai.chat': true }
    });
    
    console.log('Testing trackUsage...');
    const result = await costTracker.trackUsage({
      provider: 'openai',
      inputTokens: 100,
      outputTokens: 50,
      userId: user.id,
      toolContext: 'chat',
      sessionId: 'test-session'
    });
    
    console.log('TrackUsage result:', result);
    
    console.log('Checking database records...');
    const records = await CostUsage.findAll();
    console.log('Records found:', records.length);
    
    if (records.length > 0) {
      console.log('First record:', JSON.stringify(records[0].toJSON(), null, 2));
    }
    
    console.log('Testing getUsageStats...');
    const stats = await costTracker.getUsageStats();
    console.log('Usage stats:', JSON.stringify(stats, null, 2));
    
    await sequelize.close();
  } catch (error) {
    console.error('Debug error:', error);
    console.error('Stack:', error.stack);
  }
}

debugCostTracker();
