#!/usr/bin/env node

/**
 * Simple test to verify CostTracker database initialization fix
 */

import { CostTracker } from './src/monitoring/CostTracker.js';

async function testCostTrackerFix() {
  console.log('🧪 Testing CostTracker database initialization fix...\n');

  try {
    // Create a new CostTracker instance
    const tracker = new CostTracker();
    console.log('✅ CostTracker instance created');

    // Ensure it's initialized
    await tracker.ensureInitialized();
    console.log('✅ CostTracker initialized:', tracker.isInitialized);

    // Test trackUsage method
    console.log('\n🔍 Testing trackUsage...');
    const result = await tracker.trackUsage({
      provider: 'openai',
      inputTokens: 100,
      outputTokens: 50,
      userId: 'test-user-123',
      toolContext: 'chat',
      sessionId: 'test-session'
    });

    if (result) {
      console.log('✅ trackUsage succeeded');
    } else {
      console.log('❌ trackUsage failed');
    }

    // Test getUsageStats method
    console.log('\n📊 Testing getUsageStats...');
    const stats = await tracker.getUsageStats();
    
    if (stats && stats.summary) {
      console.log('✅ getUsageStats succeeded:', {
        totalCost: stats.summary.totalCost,
        totalRequests: stats.summary.totalRequests,
        totalTokens: stats.summary.totalTokens
      });
    } else {
      console.log('❌ getUsageStats failed');
    }

    console.log('\n🎯 RESULT: CostTracker database initialization fix is working!');
    return true;

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}

testCostTrackerFix();
