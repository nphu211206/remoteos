#!/bin/bash
# RemoteOS Startup Script
# Handles building, fixing imports, and starting all services

echo "========================================"
echo " RemoteOS - Starting System"
echo "========================================"

# Kill existing processes
echo "[0/5] Cleaning up..."
taskkill //F //IM node.exe 2>/dev/null
sleep 2

# Build shared package
echo "[1/5] Building shared package..."
cd /c/Users/Admin/remoteos
pnpm run --filter @remoteos/shared build 2>&1 | tail -1

# Fix imports
echo "[2/5] Fixing ESM imports..."
cd /c/Users/Admin/remoteos/packages/shared/dist
find . -name "*.js" -type f -exec sed -i "s|from '\\.\\.\/\\([^']*\\)'|from '../\\1.js'|g" {} \;
find . -name "*.js" -type f -exec sed -i "s|from '\\.\/\\([^']*\\)'|from './\\1.js'|g" {} \;
find . -name "*.js" -type f -exec sed -i "s|\\.js\\.js|.js|g" {} \;
echo "   Imports fixed"

# Build all packages
echo "[3/5] Building all packages..."
pnpm build 2>&1 | tail -3

# Fix imports again after build
cd /c/Users/Admin/remoteos/packages/shared/dist
find . -name "*.js" -type f -exec sed -i "s|from '\\.\\.\/\\([^']*\\)'|from '../\\1.js'|g" {} \;
find . -name "*.js" -type f -exec sed -i "s|from '\\.\/\\([^']*\\)'|from './\\1.js'|g" {} \;
find . -name "*.js" -type f -exec sed -i "s|\\.js\\.js|.js|g" {} \;

# Start server
echo "[4/5] Starting server..."
cd /c/Users/Admin/remoteos
pnpm run --filter @remoteos/server dev > /tmp/remoteos-server.log 2>&1 &
sleep 8

# Verify server
if curl -s http://localhost:3000/health | grep -q healthy; then
    echo "   Server: OK"
else
    echo "   Server: FAILED"
    exit 1
fi

# Start agent
echo "[5/5] Starting agent..."
cd /c/Users/Admin/remoteos/packages/agent
node --env-file=../../.env dist/index.js > /tmp/remoteos-agent.log 2>&1 &
sleep 10

# Verify agent
if curl -s http://localhost:3000/api/v1/devices | grep -q online; then
    echo "   Agent: OK"
else
    echo "   Agent: FAILED (will retry)"
fi

# Clear Telegram updates (reads token from .env)
source ../../.env 2>/dev/null || true
if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
    curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=-1" > /dev/null 2>&1
fi

# Start bot
echo "[6/6] Starting bot..."
cd /c/Users/Admin/remoteos/packages/bot
node --env-file=../../.env dist/index.js > /tmp/remoteos-bot.log 2>&1 &
sleep 5

echo ""
echo "========================================"
echo " RemoteOS System Started!"
echo "========================================"
echo " Server: http://localhost:3000"
echo " Agent:  Running in background"
echo " Bot:    @remoteos_np_bot"
echo "========================================"
echo ""
echo "Logs:"
echo "  Server: /tmp/remoteos-server.log"
echo "  Agent:  /tmp/remoteos-agent.log"
echo "  Bot:    /tmp/remoteos-bot.log"
echo ""

# Monitor for 30 seconds
echo "Monitoring for 30s..."
for i in $(seq 1 6); do
    sleep 5
    AGENT_STATUS=$(curl -s http://localhost:3000/api/v1/devices 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('devices',[{}])[0].get('status','unknown'))" 2>/dev/null)
    BOT_LINES=$(wc -l < /tmp/remoteos-bot.log 2>/dev/null)
    echo "  [$((i*5))s] Agent: $AGENT_STATUS, Bot log: $BOT_LINES lines"
done

echo ""
echo "System ready! Send messages to @remoteos_np_bot on Telegram."
