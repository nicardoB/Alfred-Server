#!/bin/bash

# Alfred Development Environment - Complete Shutdown
# Double-click this file to stop everything

# Change to the Alfred Server directory
cd "$(dirname "$0")"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
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

echo "🛑 Stopping Alfred Development Environment..."
echo "============================================="

# Stop Alfred Server
log "Stopping Alfred Server..."
if [ -f /tmp/alfred-server.pid ]; then
    SERVER_PID=$(cat /tmp/alfred-server.pid)
    if kill -0 "$SERVER_PID" 2>/dev/null; then
        kill "$SERVER_PID"
        success "Alfred Server stopped"
    fi
    rm -f /tmp/alfred-server.pid
fi

# Stop Chat Client
log "Stopping Chat Client..."
if [ -f /tmp/alfred-chat.pid ]; then
    CHAT_PID=$(cat /tmp/alfred-chat.pid)
    if kill -0 "$CHAT_PID" 2>/dev/null; then
        kill "$CHAT_PID"
        success "Chat Client stopped"
    fi
    rm -f /tmp/alfred-chat.pid
fi

# Stop any remaining Node processes
log "Cleaning up Node processes..."
pkill -f "node.*server.js" || true
pkill -f "next dev" || true
success "Node processes cleaned up"

# Ask about Ollama
echo
read -p "Stop Ollama too? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log "Stopping Ollama..."
    if [ -f /tmp/ollama.pid ]; then
        OLLAMA_PID=$(cat /tmp/ollama.pid)
        if kill -0 "$OLLAMA_PID" 2>/dev/null; then
            kill "$OLLAMA_PID"
            success "Ollama stopped"
        fi
        rm -f /tmp/ollama.pid
    fi
    pkill -f "ollama serve" || true
else
    success "Ollama left running"
fi

# Clean up log files
log "Cleaning up log files..."
rm -f /tmp/alfred-server.log /tmp/alfred-chat.log /tmp/ollama.log

echo
success "🎉 Alfred Development Environment Stopped"
echo
echo "To restart: Double-click 'dev-start.command'"
echo

echo "Press any key to close this window..."
read -n 1
