#!/usr/bin/env node

/**
 * Test cost tracking integration with proper database setup
 */

import { setupDatabase } from './src/config/database.js';
import { SmartAIRouter } from './src/ai/SmartAIRouter.js';
import { costTracker } from './src/monitoring/CostTracker.js';

async function testCostTrackingWithDatabase() {
  console.log('🧪 Testing cost tracking with proper database setup...\n');

  try {
    // First, set up the database properly
    console.log('🔧 Setting up database...');
    await setupDatabase();
    console.log('✅ Database setup complete');

    // Initialize cost tracker
    await costTracker.ensureInitialized();
    console.log('✅ CostTracker initialized');

    // Get initial stats
    const initialStats = await costTracker.getUsageStats();
    console.log('📊 Initial stats:', {
      totalCost: initialStats.summary.totalCost,
      totalRequests: initialStats.summary.totalRequests,
      totalTokens: initialStats.summary.totalTokens
    });

    // Create SmartAIRouter instance
    const router = new SmartAIRouter();
    console.log('✅ SmartAIRouter created');

    // Test direct cost tracking call
    console.log('\n🔍 Testing direct CostTracker.trackUsage()...');
    const trackingResult = await costTracker.trackUsage({
      provider: 'openai',
      inputTokens: 100,
      outputTokens: 50,
      userId: 'test-user-123',
      toolContext: 'chat',
      sessionId: 'test-session'
    });
    console.log('Direct tracking result:', trackingResult ? 'SUCCESS' : 'FAILED');

    // Get stats after direct tracking
    const afterDirectStats = await costTracker.getUsageStats();
    console.log('📊 After direct tracking:', {
      totalCost: afterDirectStats.summary.totalCost,
      totalRequests: afterDirectStats.summary.totalRequests,
      totalTokens: afterDirectStats.summary.totalTokens
    });

    // Test SmartAIRouter processTextCommand
    console.log('\n🤖 Testing SmartAIRouter.processTextCommand()...');
    const aiResult = await router.processTextCommand('Hello, this is a test message for cost tracking.', {
      sessionId: 'test-session',
      requestId: 'test-request',
      metadata: {
        userId: 'test-user-123',
        toolContext: 'chat'
      }
    });

    console.log('SmartAIRouter result:', {
      provider: aiResult.provider,
      hasResponse: !!aiResult.response,
      responseContent: aiResult.response?.content?.substring(0, 100) + '...'
    });

    // Get final stats
    const finalStats = await costTracker.getUsageStats();
    console.log('\n📊 Final stats:', {
      totalCost: finalStats.summary.totalCost,
      totalRequests: finalStats.summary.totalRequests,
      totalTokens: finalStats.summary.totalTokens
    });

    // Calculate changes
    const costChange = finalStats.summary.totalCost - initialStats.summary.totalCost;
    const requestChange = finalStats.summary.totalRequests - initialStats.summary.totalRequests;
    const tokenChange = finalStats.summary.totalTokens - initialStats.summary.totalTokens;

    console.log('\n📈 CHANGES:');
    console.log(`Cost change: $${costChange.toFixed(6)}`);
    console.log(`Request change: ${requestChange}`);
    console.log(`Token change: ${tokenChange}`);

    console.log('\n🎯 RESULT:');
    if (requestChange >= 2 && tokenChange > 0 && costChange > 0) {
      console.log('✅ SUCCESS: Cost tracking integration is working!');
      return true;
    } else if (requestChange >= 1) {
      console.log('⚠️  PARTIAL: Direct tracking works, but SmartAIRouter integration may have issues.');
      return false;
    } else {
      console.log('❌ FAILED: Cost tracking not working.');
      return false;
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}

testCostTrackingWithDatabase();
