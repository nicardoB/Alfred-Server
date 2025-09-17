# Alfred Smart AI Router - Local Testing Guide

## 🎯 Testing Strategy

Test all AI provider routing scenarios through the **chat client** at http://localhost:3000 to verify the Smart AI Router's decision-making logic.

## 🔧 Setup for Testing

```bash
# Start development environment
./dev-start.command

# Login to chat client
# Email: owner@local.test
# Password: LocalDev#2024
```

## 🧪 Test Scenarios

### **Scenario 1: Ollama-First (Default)**
**Setup:** Normal startup (Ollama running)
**Test Messages:**
- "Hello, which provider are you?"
- "What's 2+2?"
- "Tell me a simple fact"

**Expected:** `provider: "ollama"` - Fast, local responses

---

### **Scenario 2: OpenAI Fallback**
**Setup:** Stop Ollama while keeping server running
```bash
pkill -f "ollama serve"
```
**Test Messages:**
- "Hello, which provider are you?"
- "What's the weather like?"

**Expected:** `provider: "openai"` - Cloud-based responses

---

### **Scenario 3: Code-Specific Routing**
**Setup:** Normal startup (all providers available)
**Test Messages:**
- "Write a Python function to sort a list"
- "Debug this JavaScript: `const x = [1,2,3]; x.push()`"
- "Create a React component for a button"

**Expected:** `provider: "copilot"` - GitHub Copilot for code

---

### **Scenario 4: Complex Reasoning (Claude)**
**Setup:** Add Claude API key to test
```bash
echo "ANTHROPIC_API_KEY=your-key-here" >> .env
./dev-stop.command && ./dev-start.command
```
**Test Messages:**
- "Analyze the philosophical implications of AI consciousness"
- "Write a detailed business plan for a startup"
- "Explain quantum computing in depth"

**Expected:** `provider: "claude"` - Claude for complex reasoning

---

### **Scenario 5: Tool Context Routing**
**Setup:** Normal startup
**Test Messages with Different Contexts:**
- **Chat context:** "How are you today?"
- **Code context:** "Fix this bug in my code"
- **Voice context:** "Transcribe this audio"

**Expected:** Different providers based on tool context

---

### **Scenario 6: Cost-Conscious Routing**
**Setup:** Normal startup
**Test Messages:**
- "Quick yes/no: Is Paris in France?"
- "Simple math: 15 + 27 = ?"
- "One word answer: What color is grass?"

**Expected:** `provider: "ollama"` or `"claude_haiku"` - Low-cost options

---

### **Scenario 7: Provider Fallback Chain**
**Setup:** Disable multiple providers to test fallback
```bash
# Disable Ollama and test OpenAI fallback
pkill -f "ollama serve"

# Later: Disable OpenAI in code and test Claude fallback
# (Requires code modification)
```
**Test Messages:**
- "Hello, which provider handled this?"

**Expected:** Graceful fallback through provider chain

---

## 🔍 How to Verify Results

### **Method 1: Chat UI Response**
Look for provider identification in AI responses:
- Ollama: "I'm running locally via Ollama"
- OpenAI: "I'm powered by OpenAI"
- Claude: "I'm Claude, made by Anthropic"

### **Method 2: Browser Developer Tools**
1. Open DevTools (F12)
2. Go to Network tab
3. Send message
4. Look for API calls to `/api/v1/mcp/text`
5. Check response for `"provider"` field

### **Method 3: Server Logs**
```bash
tail -f /tmp/alfred-server.log | grep -i provider
```

### **Method 4: Direct API Testing**
```bash
# Get JWT token
JWT=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@local.test","password":"LocalDev#2024"}' | jq -r '.token')

# Test specific message
curl -s -X POST http://localhost:3001/api/v1/mcp/text \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test","text":"Your test message","metadata":{"toolContext":"chat"}}' | jq '{provider, content}'
```

## 📊 Expected Routing Logic

```
Query Analysis → Smart AI Router Decision:

Simple/Factual → Ollama (free, local)
Code/Programming → GitHub Copilot (specialized)
Complex Reasoning → Claude Sonnet (powerful)
Quick/Speed → Claude Haiku (fast, cheap)
Voice/Audio → OpenAI (specialized)
Fallback → OpenAI GPT (reliable default)
```

## 🎯 Success Criteria

- ✅ **Ollama-first** for simple queries when available
- ✅ **Intelligent routing** based on query complexity
- ✅ **Tool-specific routing** (code → Copilot)
- ✅ **Graceful fallbacks** when providers unavailable
- ✅ **Cost optimization** (free local when possible)
- ✅ **Performance** (fast responses for simple queries)

## 🚨 Troubleshooting

**If routing seems wrong:**
1. Check server logs for routing decisions
2. Verify API keys are set correctly
3. Confirm providers are available (health checks)
4. Test with incognito browser (clear cache)

**If providers fail:**
1. Check network connectivity
2. Verify API key validity
3. Check rate limits
4. Review error logs

---

**Test each scenario systematically and document which provider handles each type of query!**
