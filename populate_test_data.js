import { costTracker } from './src/monitoring/CostTracker.js';

// Generate some realistic test usage data
async function populateTestData() {
  console.log('Populating test cost data...');
  
  // Simulate Claude usage
  costTracker.trackUsage({
    provider: 'claude',
    inputTokens: 1500,
    outputTokens: 800,
    userId: 'test-user-1',
    toolContext: 'chat'
  });
  costTracker.trackUsage({
    provider: 'claude',
    inputTokens: 2200,
    outputTokens: 1200,
    userId: 'test-user-2',
    toolContext: 'chat'
  });
  costTracker.trackUsage({
    provider: 'claude',
    inputTokens: 800,
    outputTokens: 400,
    userId: 'test-user-3',
    toolContext: 'chat'
  });
  
  // Simulate OpenAI usage
  costTracker.trackUsage({
    provider: 'openai',
    inputTokens: 1200,
    outputTokens: 600,
    userId: 'test-user-4',
    toolContext: 'chat'
  });
  costTracker.trackUsage({
    provider: 'openai',
    inputTokens: 1800,
    outputTokens: 900,
    userId: 'test-user-5',
    toolContext: 'chat'
  });
  costTracker.trackUsage({
    provider: 'openai',
    inputTokens: 900,
    outputTokens: 450,
    userId: 'test-user-6',
    toolContext: 'chat'
  });
  
  // Simulate Copilot usage
  costTracker.trackUsage({
    provider: 'copilot',
    inputTokens: 1000,
    outputTokens: 500,
    userId: 'test-user-7',
    toolContext: 'chat'
  });
  costTracker.trackUsage({
    provider: 'copilot',
    inputTokens: 1500,
    outputTokens: 750,
    userId: 'test-user-8',
    toolContext: 'chat'
  });
  
  const stats = costTracker.getUsageStats();
  console.log('Test data populated:');
  console.log(`Total cost: $${stats.summary.totalCost}`);
  console.log(`Total requests: ${stats.summary.totalRequests}`);
  
  console.log('\nProvider breakdown:');
  Object.entries(stats.providers).forEach(([provider, data]) => {
    console.log(`${provider}: $${data.totalCost} (${data.requests} requests)`);
  });
}

populateTestData().catch(console.error);
