#!/bin/bash

# Alfred Development Environment - Complete Startup
# Double-click this file to start everything

# Change to the Alfred Server directory
cd "$(dirname "$0")"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

echo "🚀 Starting Complete Alfred Development Environment..."
echo "=================================================="

# 1. Clean up any existing processes
log "Cleaning up existing processes..."
pkill -f "node.*server.js" || true
pkill -f "next dev" || true
pkill -f "ollama serve" || true
sleep 2

# 2. Start Ollama
log "Starting Ollama..."
if ! pgrep -f "ollama serve" > /dev/null; then
    ollama serve > /tmp/ollama.log 2>&1 &
    sleep 3
    
    # Check if Ollama started
    if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
        success "Ollama running on http://localhost:11434"
    else
        error "Failed to start Ollama"
        echo "Press any key to close..."
        read -n 1
        exit 1
    fi
else
    success "Ollama already running"
fi

# 3. Check for required model
log "Checking for llama3.1 model..."
if ollama list | grep -q "llama3.1"; then
    success "llama3.1 model available"
else
    warn "Downloading llama3.1 model (this may take a few minutes)..."
    ollama pull llama3.1
    success "llama3.1 model downloaded"
fi

# 4. Start Alfred Server
log "Starting Alfred Server..."
export NODE_ENV=development
export DATABASE_URL=
export OLLAMA_BASE_URL=http://localhost:11434
export OLLAMA_MODEL=llama3.1
export PORT=3001
export OWNER_SETUP_KEY=DEV_SETUP

# Start server in background
npm start > /tmp/alfred-server.log 2>&1 &
SERVER_PID=$!

# Wait for server to start
log "Waiting for Alfred Server to start..."
for i in {1..30}; do
    if curl -s http://localhost:3001/health >/dev/null 2>&1; then
        success "Alfred Server running on http://localhost:3001"
        break
    fi
    sleep 1
done

# Check if server started successfully
if ! curl -s http://localhost:3001/health >/dev/null 2>&1; then
    error "Alfred Server failed to start"
    echo "Server logs:"
    tail -n 20 /tmp/alfred-server.log
    echo "Press any key to close..."
    read -n 1
    exit 1
fi

# 5. Start Chat Client
log "Starting Chat Client..."
cd ../alfred-chat

# Start chat client in background on port 3000
npm run dev -- -p 3000 > /tmp/alfred-chat.log 2>&1 &
CHAT_PID=$!

# Wait for chat client to start
log "Waiting for Chat Client to start..."
CHAT_PORT=3000
for i in {1..30}; do
    if curl -s http://localhost:3000 >/dev/null 2>&1; then
        success "Chat Client running on http://localhost:3000"
        break
    fi
    sleep 1
done

# Check if chat client started successfully
if ! curl -s http://localhost:3000 >/dev/null 2>&1; then
    error "Chat Client failed to start"
    echo "Chat logs:"
    tail -n 20 /tmp/alfred-chat.log
    echo "Press any key to close..."
    read -n 1
    exit 1
fi

# 6. Create owner account if needed
log "Checking owner account..."
OWNER_RESPONSE=$(curl -s -X POST http://localhost:3001/api/v1/auth/setup-owner \
  -H "Content-Type: application/json" \
  -d '{
    "email": "owner@local.test",
    "password": "LocalDev#2024",
    "setupKey": "DEV_SETUP"
  }')

if echo "$OWNER_RESPONSE" | grep -q "created successfully"; then
    success "Owner account created"
elif echo "$OWNER_RESPONSE" | grep -q "already exists"; then
    success "Owner account already exists"
else
    warn "Owner account status unclear"
fi

# 7. Open development tools
log "Opening development tools..."
sleep 2

# Open Chat Client
open http://localhost:3000

# Save PIDs for stop script
cd "$(dirname "$0")"
echo "$SERVER_PID" > /tmp/alfred-server.pid
echo "$CHAT_PID" > /tmp/alfred-chat.pid
pgrep -f "ollama serve" > /tmp/ollama.pid || true

# Show final status
echo
echo "🎉 Alfred Development Environment Ready!"
echo "========================================"
echo
echo "📊 Services:"
echo "  • Ollama:        http://localhost:11434"
echo "  • Alfred Server: http://localhost:3001"
echo "  • Chat Client:   http://localhost:3000 (opened)"
echo
echo "🔑 Login Credentials:"
echo "  • Email:    owner@local.test"
echo "  • Password: LocalDev#2024"
echo
echo "🛑 To stop everything: Double-click 'dev-stop.command'"
echo "📋 Server logs: tail -f /tmp/alfred-server.log"
echo "📋 Chat logs:   tail -f /tmp/alfred-chat.log"
echo

echo "Press any key to close this window (services will keep running)..."
read -n 1
