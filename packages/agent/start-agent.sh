#!/bin/bash
# Agent wrapper script with auto-restart
# Keeps the agent running even if it crashes

AGENT_DIR="/c/Users/Admin/remoteos/packages/agent"
LOG_FILE="/tmp/remoteos-agent.log"

echo "Starting RemoteOS Agent with auto-restart..."

while true; do
    echo "[$(date)] Starting agent..." >> "$LOG_FILE"

    cd "$AGENT_DIR"
    node --env-file=../../.env dist/index.js 2>&1 | tee -a "$LOG_FILE"

    EXIT_CODE=$?
    echo "[$(date)] Agent exited with code $EXIT_CODE" >> "$LOG_FILE"

    if [ $EXIT_CODE -eq 0 ]; then
        echo "[$(date)] Agent exited cleanly, restarting in 5s..." >> "$LOG_FILE"
    else
        echo "[$(date)] Agent crashed, restarting in 5s..." >> "$LOG_FILE"
    fi

    sleep 5
done
