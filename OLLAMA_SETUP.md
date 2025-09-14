# Ollama Setup for Alfred Free-First Routing

## Overview
Ollama provides free local LLM inference for Alfred's smart routing system. When available, it handles 90%+ of queries locally at zero cost, with intelligent escalation to paid models for complex tasks.

## Local Development Setup

### 1. Install Ollama
```bash
# macOS/Linux
curl -fsSL https://ollama.ai/install.sh | sh

# Or download from https://ollama.ai/download
```

### 2. Pull Required Model
```bash
# Pull Llama 3.1 8B (recommended for routing decisions)
ollama pull llama3.1:8b

# Alternative lightweight options:
# ollama pull llama3.1:7b
# ollama pull mistral:7b
```

### 3. Start Ollama Service
```bash
# Start Ollama (runs on localhost:11434)
ollama serve

# Verify it's running
curl http://localhost:11434/api/tags
```

### 4. Configure Alfred-Server
```bash
# Add to .env
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
```

## Production Deployment Options

### Option 1: Railway Deployment
Deploy Ollama alongside Alfred-Server on Railway:

```bash
# Deploy Ollama service
railway up --dockerfile Dockerfile.ollama

# Update Alfred-Server environment
OLLAMA_URL=https://ollama-service.railway.app
```

### Option 2: Dedicated Server
Run Ollama on a dedicated server with GPU acceleration:

```bash
# Docker with GPU support
docker run -d \
  --gpus all \
  -v ollama:/root/.ollama \
  -p 11434:11434 \
  --name ollama \
  ollama/ollama

# Pull model
docker exec -it ollama ollama pull llama3.1:8b
```

### Option 3: Cloud GPU Services
- **RunPod**: GPU instances starting at $0.20/hour
- **Vast.ai**: Competitive GPU pricing
- **Lambda Labs**: Dedicated GPU cloud

## Fallback Behavior

If Ollama is unavailable, Alfred automatically falls back to:
1. **GPT-4o Mini** (cheapest paid option: $0.15/$0.60 per 1M tokens)
2. **Claude Haiku** (fast and affordable: $0.25/$1.25 per 1M tokens)

## Cost Comparison

| Model | Input Cost | Output Cost | Typical Message |
|-------|------------|-------------|-----------------|
| **Ollama (Local)** | $0.00 | $0.00 | **$0.00** |
| GPT-4o Mini | $0.15/1M | $0.60/1M | $0.001-0.005 |
| Claude Haiku | $0.25/1M | $1.25/1M | $0.002-0.008 |
| Claude Sonnet | $3.00/1M | $15.00/1M | $0.02-0.10 |

## Smart Routing Logic

Ollama analyzes each query and decides:
- **LOCAL** (90%): Simple conversations, Q&A, basic tasks
- **GPT4_MINI** (7%): Moderate complexity, good quality needed
- **CLAUDE_SONNET** (2%): Complex reasoning, analysis, research
- **COPILOT** (1%): Code generation, programming tasks

## Monitoring

Check Ollama status:
```bash
# Health check
curl http://localhost:11434/api/tags

# Model info
ollama show llama3.1:8b

# Usage stats (if available)
ollama ps
```

## Troubleshooting

### Common Issues
1. **Port 11434 in use**: Kill existing Ollama process
2. **Model not found**: Run `ollama pull llama3.1:8b`
3. **Out of memory**: Use smaller model like `llama3.1:7b`
4. **Slow responses**: Consider GPU acceleration or cloud deployment

### Performance Optimization
- **RAM**: 8GB+ recommended for 8B models
- **GPU**: NVIDIA GPU significantly improves speed
- **Storage**: SSD recommended for model loading
- **Network**: Local deployment eliminates latency

## Security Considerations

- Ollama runs locally - no data sent to external services
- Perfect for sensitive conversations requiring privacy
- Family members can use without external API costs
- Complies with data privacy requirements
