# Railway Environment Variables Setup

This guide explains how to add the required API keys to Railway environment variables to enable real AI provider responses.

## Required Environment Variables

### 1. ANTHROPIC_API_KEY
- **Purpose**: Enables Claude AI responses via Anthropic API
- **How to get**: Sign up at [console.anthropic.com](https://console.anthropic.com/)
- **Variable name**: `ANTHROPIC_API_KEY`
- **Example value**: `sk-ant-api03-...`

### 2. OPENAI_API_KEY  
- **Purpose**: Enables OpenAI GPT responses and Whisper transcription
- **How to get**: Sign up at [platform.openai.com](https://platform.openai.com/api-keys)
- **Variable name**: `OPENAI_API_KEY`
- **Example value**: `sk-proj-...`

### 3. GITHUB_TOKEN (Optional)
- **Purpose**: For GitHub Copilot integration (currently mock implementation)
- **How to get**: Generate at [github.com/settings/tokens](https://github.com/settings/tokens)
- **Variable name**: `GITHUB_TOKEN`
- **Example value**: `ghp_...`

## How to Add Environment Variables to Railway

### Method 1: Railway Dashboard
1. Go to [railway.app](https://railway.app) and log in
2. Navigate to your Alfred-Server project
3. Click on the service/deployment
4. Go to the "Variables" tab
5. Click "New Variable"
6. Add each variable:
   - Name: `ANTHROPIC_API_KEY`
   - Value: Your actual API key
   - Click "Add"
7. Repeat for `OPENAI_API_KEY` and `GITHUB_TOKEN`
8. Deploy the changes

### Method 2: Railway CLI
```bash
# Install Railway CLI if not already installed
npm install -g @railway/cli

# Login to Railway
railway login

# Link to your project (if not already linked)
railway link

# Add environment variables
railway variables set ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
railway variables set OPENAI_API_KEY=sk-proj-your-key-here
railway variables set GITHUB_TOKEN=ghp_your-token-here

# Deploy the changes
railway up
```

## Verification

After adding the environment variables:

1. Check the deployment logs for successful startup
2. Test the MCP endpoints:
   ```bash
   # Test connection
   curl -X POST https://your-railway-url.railway.app/api/mcp/connect \
     -H "Content-Type: application/json" \
     -d '{"clientId": "test-client"}'

   # Test text command (should now return real AI responses)
   curl -X POST https://your-railway-url.railway.app/api/mcp/text \
     -H "Content-Type: application/json" \
     -d '{"sessionId": "session-id-from-connect", "text": "Hello, how are you?"}'
   ```

3. Look for these log messages indicating successful API key configuration:
   - `Claude processing: [your text]` (instead of "using mock response")
   - `OpenAI processing: [your text]` (instead of "using mock response")

## Security Notes

- Never commit API keys to version control
- Use Railway's secure environment variable storage
- Rotate API keys regularly
- Monitor API usage and costs
- Set up billing alerts on AI provider platforms

## Troubleshooting

### API Key Not Working
- Verify the key is correct and not expired
- Check API key permissions and quotas
- Ensure the key format matches the provider's requirements

### Deployment Issues
- Check Railway deployment logs for errors
- Verify environment variables are properly set
- Ensure the service restarts after adding variables

### API Rate Limits
- Monitor usage on provider dashboards
- Implement rate limiting if needed
- Consider upgrading to paid tiers for higher limits
