# Alfred Server - Local Development Environment

## 🚀 Quick Start

### Start Development Environment
**Double-click `dev-start.command`** in Finder

This will:
- ✅ Start Ollama (local AI models)
- ✅ Start Alfred Server (port 3001)
- ✅ Start Chat Client (port 3000)
- ✅ Create/verify owner account
- ✅ Open browser automatically

### Stop Development Environment
**Double-click `dev-stop.command`** in Finder

This will:
- ✅ Stop Alfred Server
- ✅ Stop Chat Client
- ✅ Clean up processes
- ✅ Option to stop Ollama
- ✅ Clean up logs

## 🔑 Login Credentials

- **Email**: `owner@local.test`
- **Password**: `LocalDev#2024`

## 📊 Service URLs

- **Chat Client**: http://localhost:3000
- **Alfred Server API**: http://localhost:3001
- **Swagger UI**: http://localhost:3001/api-docs
- **Ollama**: http://localhost:11434

## 🏗️ Architecture

```
Local Development Stack:
├── Chat Client (localhost:3000) - Next.js frontend
├── Alfred Server (localhost:3001) - Node.js API + SQLite
├── Ollama (localhost:11434) - Local AI models
└── All communication via localhost (no network complexity)
```

## 🧪 Testing Workflow

1. **Start environment**: Double-click `dev-start.command`
2. **Browser opens** to chat client automatically
3. **Login** with credentials above
4. **Send test message**: "Hello, which AI provider are you using?"
5. **Expect**: Fast response from Ollama (local, free)

## 🔧 Manual Commands (Alternative)

If you prefer terminal commands:

```bash
# Start everything
./dev-start.command

# Stop everything
./dev-stop.command

# View logs
tail -f /tmp/alfred-server.log
tail -f /tmp/alfred-chat.log
```

## 🗂️ Project Structure

```
Alfred-Server/
├── dev-start.command      # One-click startup
├── dev-stop.command       # One-click shutdown
├── src/                   # Server source code
├── data/                  # SQLite database
├── package.json           # Dependencies
└── .env                   # Environment variables

../alfred-chat/
├── src/                   # Chat client source
├── .env.local            # Points to localhost:3001
└── package.json          # Dependencies
```

## 🚨 Troubleshooting

### Port Conflicts
```bash
# Check what's using ports
lsof -nP -iTCP:3000,3001,11434 -sTCP:LISTEN

# Kill conflicting processes
pkill -f "node.*server.js" || true
pkill -f "next dev" || true
pkill -f "ollama serve" || true
```

### Database Issues
```bash
# Reset database (loses data)
rm -rf ./data/
mkdir -p ./data/

# Restart with fresh database
NODE_ENV=development FORCE_DB_SYNC=true ./dev-start.command
```

### Missing Models
```bash
# Download required model
ollama pull llama3.1
```

## 🎯 Daily Workflow

1. **Morning**: Double-click `dev-start.command`
2. **Development**: Code, test, iterate
3. **Evening**: Double-click `dev-stop.command`

## 🔄 Next Steps (Future)

- **Production deployment** to Railway
- **Cloud Ollama** on Oracle Cloud
- **Multi-provider testing** (OpenAI, Claude)
- **Performance optimization**

---

This local setup provides a **fast, reliable, cost-free** development environment using your local machine's resources.
