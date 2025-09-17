# Oracle Cloud Free Tier Ollama Setup

## Overview
Deploy Ollama on Oracle Cloud's Always Free tier for $0/month cost. Perfect for single user testing and initial deployment.

## Oracle Cloud Free Tier Specs
- **4 ARM CPUs** (Ampere A1)
- **24GB RAM** 
- **200GB Storage**
- **Always Free** (no time limits)
- **10TB monthly bandwidth**

## Performance Expectations
- **Response Time**: 8-15 seconds for simple queries
- **Model**: llama3.1:7b (optimized for ARM)
- **Concurrent Users**: 1-2 comfortably
- **Upgrade Trigger**: When responses consistently >15 seconds

## Step-by-Step Setup

### 1. Create Oracle Cloud Account
1. Visit [oracle.com/cloud/free](https://oracle.com/cloud/free)
2. Sign up with credit card (won't be charged for free tier)
3. Complete identity verification

### 2. Create Compute Instance
```bash
# Instance Configuration:
- Shape: VM.Standard.A1.Flex (ARM)
- CPUs: 4 (max free tier)
- Memory: 24GB (max free tier)
- OS: Ubuntu 22.04 LTS
- Boot Volume: 200GB
```

### 3. Configure Security Rules
```bash
# Add ingress rule for Ollama
Port: 11434
Protocol: TCP
Source: 0.0.0.0/0 (or restrict to Alfred Server IP)
```

### 4. Install Ollama on ARM
```bash
# SSH into Oracle instance
ssh ubuntu@your-oracle-ip

# Install Ollama (ARM compatible)
curl -fsSL https://ollama.ai/install.sh | sh

# Start Ollama service
sudo systemctl enable ollama
sudo systemctl start ollama

# Configure to listen on all interfaces
sudo mkdir -p /etc/systemd/system/ollama.service.d
echo '[Service]
Environment="OLLAMA_HOST=0.0.0.0"' | sudo tee /etc/systemd/system/ollama.service.d/override.conf

sudo systemctl daemon-reload
sudo systemctl restart ollama
```

### 5. Pull ARM-Optimized Model
```bash
# Pull smaller model optimized for ARM
ollama pull llama3.1:7b

# Verify installation
ollama list
curl http://localhost:11434/api/tags
```

### 6. Configure Alfred Server
```bash
# Add to Railway environment variables
OLLAMA_URL=http://your-oracle-ip:11434
OLLAMA_MODEL=llama3.1:7b
OLLAMA_ENABLED=true
```

### 7. Test Integration
```bash
# Test from Alfred Server
curl -X POST http://your-oracle-ip:11434/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama3.1:7b",
    "prompt": "What is 2+2?",
    "stream": false
  }'
```

## Performance Optimization

### ARM-Specific Optimizations
```bash
# Enable memory optimization
export OLLAMA_NUM_PARALLEL=1
export OLLAMA_MAX_LOADED_MODELS=1

# Restart with optimizations
sudo systemctl restart ollama
```

### Monitoring
```bash
# Check resource usage
htop
ollama ps

# Monitor response times
curl -w "@curl-format.txt" -X POST http://localhost:11434/api/generate
```

## Expected Performance Metrics

| Query Type | Response Time | Quality |
|------------|---------------|---------|
| Simple Q&A | 8-12 seconds | Good |
| Basic Math | 5-8 seconds | Excellent |
| Short Summaries | 10-15 seconds | Good |
| Complex Reasoning | 15-25 seconds | Fair |

## Scaling Triggers

**Upgrade to Vast.ai GPU when:**
- Responses consistently >15 seconds
- You use Alfred >2 hours/day
- You invite first friend/family member

**Cost Comparison:**
- Oracle Free: $0/month, 8-15s responses
- Vast.ai GPU: $5-15/month, 2-5s responses
- Your current API costs: ~$2.10/month

## Troubleshooting

### Common Issues
1. **Port 11434 blocked**: Check Oracle security rules
2. **ARM compatibility**: Use llama3.1:7b, not larger models
3. **Memory issues**: Restart ollama service
4. **Slow responses**: Expected on ARM, upgrade trigger

### Firewall Configuration
```bash
# Ubuntu firewall
sudo ufw allow 11434
sudo ufw reload

# Oracle Cloud security list
# Add ingress rule: TCP 11434 from 0.0.0.0/0
```

This setup gives you free AI inference for simple queries, reducing your API costs from $2.10/month to $0 while you test and develop the system.
