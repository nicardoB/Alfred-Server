# Alfred Server - Quick Local Setup Guide

## Problem: Commands Hanging
The current local setup is experiencing hanging issues with Ollama and network calls. Here's a reliable containerized solution.

## Solution: Docker-Based Local Environment

### Files Created
1. `docker-compose.local.yml` - Docker Compose configuration
2. `Dockerfile.local` - Alfred Server container
3. `local-dev.sh` - Management script
4. This guide

### Quick Start (5 minutes)

```bash
# 1. Make the script executable
chmod +x local-dev.sh

# 2. Start everything (Ollama + Alfred Server)
./local-dev.sh start

# 3. Pull AI models (in background)
./local-dev.sh pull-models

# 4. Test the setup
./local-dev.sh test

# 5. Open Swagger UI
open http://localhost:3001/api-docs
```

### What This Solves
- ✅ **No hanging processes** - Clean containerized environment
- ✅ **Reliable Ollama** - Proper health checks and networking
- ✅ **Easy start/stop** - Single command management
- ✅ **Port conflicts** - Containers handle networking
- ✅ **Clean state** - Fresh database each time
- ✅ **API testing** - Swagger UI ready to use

### Available Commands

```bash
./local-dev.sh start        # Start all services
./local-dev.sh stop         # Stop all services  
./local-dev.sh restart      # Restart everything
./local-dev.sh logs         # View logs
./local-dev.sh status       # Check health
./local-dev.sh test         # Run tests
./local-dev.sh pull-models  # Download AI models
./local-dev.sh clean        # Reset everything
```

### Services
- **Ollama**: http://localhost:11434 (AI models)
- **Alfred Server**: http://localhost:3001 (API)
- **Swagger UI**: http://localhost:3001/api-docs (Testing)

### Testing Workflow

1. **Start environment**: `./local-dev.sh start`
2. **Open Swagger**: http://localhost:3001/api-docs
3. **Create owner**: POST `/api/v1/auth/setup-owner`
   ```json
   {
     "email": "owner@local.test",
     "password": "LocalDev#2024",
     "setupKey": "DEV_SETUP"
   }
   ```
4. **Login**: POST `/api/v1/auth/login`
5. **Copy JWT**: Use "Authorize" button in Swagger
6. **Test MCP**: 
   - POST `/api/v1/mcp/connect`
   - POST `/api/v1/mcp/text` (expect `"provider": "ollama"`)
   - POST `/api/v1/mcp/disconnect`

### Provider Testing

**Test Ollama (free, local)**:
```bash
./local-dev.sh start
# In Swagger: MCP text call should return "provider": "ollama"
```

**Test OpenAI (requires API key)**:
```bash
# Add OPENAI_API_KEY to .env
echo "OPENAI_API_KEY=your-key-here" >> .env
./local-dev.sh restart
# Disable Ollama temporarily to force OpenAI
```

**Test Claude (requires API key)**:
```bash
# Add ANTHROPIC_API_KEY to .env  
echo "ANTHROPIC_API_KEY=your-key-here" >> .env
./local-dev.sh restart
```

### Troubleshooting

**If Docker isn't installed**:
```bash
# Install Docker Desktop from docker.com
# Or via Homebrew:
brew install --cask docker
```

**If services won't start**:
```bash
./local-dev.sh clean  # Reset everything
./local-dev.sh start  # Try again
```

**If models are missing**:
```bash
./local-dev.sh pull-models  # Download llama3.1 and mistral
```

### Next Steps After Testing

1. **Verify Ollama-first routing** ✅
2. **Test OpenAI fallback** ✅  
3. **Test Claude integration** ✅
4. **Verify cost tracking** ✅
5. **Deploy to Railway** (production)
6. **Set up Oracle Cloud Ollama** (production)

This containerized approach eliminates the hanging issues and provides a reliable, repeatable local development environment.
