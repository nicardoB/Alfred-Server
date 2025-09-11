import { costTracker } from './src/monitoring/CostTracker.js';

// Generate some realistic test usage data
async function populateTestData() {
  console.log('Populating test cost data...');
  
  // Simulate Claude usage
  costTracker.trackUsage('claude', 1500, 800);  // ~$0.0165
  costTracker.trackUsage('claude', 2200, 1200); // ~$0.0246
  costTracker.trackUsage('claude', 800, 400);   // ~$0.0084
  
  // Simulate OpenAI usage
  costTracker.trackUsage('openai', 1200, 600);  // ~$0.0005 (gpt-4o-mini)
  costTracker.trackUsage('openai', 1800, 900);  // ~$0.0008
  costTracker.trackUsage('openai', 900, 450);   // ~$0.0004
  
  // Simulate Copilot usage
  costTracker.trackUsage('copilot', 1000, 500); // ~$0.0060
  costTracker.trackUsage('copilot', 1500, 750); // ~$0.0090
  
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
