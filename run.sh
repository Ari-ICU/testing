#!/usr/bin/env bash
# ==============================================================================
# 🇰🇭 KhmerVoice AI — Single-Command Full-Stack Runner
# Runs FastAPI Backend (Port 8000) + Next.js Frontend (Port 3001) Concurrently
# ==============================================================================

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

# Terminal Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${CYAN}${BOLD}"
echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║             🇰🇭 KhmerVoice AI — Speech Studio & Movie Dubbing                 ║"
echo "║          VoxCPM 2 Khmer · Multi-Speaker Cinema Dubbing · LoRA Studio         ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# 1. Resolve Python executable
PYTHON_BIN=""
if [ -f "$PROJECT_ROOT/.venv/bin/python" ]; then
    PYTHON_BIN="$PROJECT_ROOT/.venv/bin/python"
elif command -v python3.10 &>/dev/null; then
    PYTHON_BIN="$(command -v python3.10)"
elif command -v python3 &>/dev/null; then
    PYTHON_BIN="$(command -v python3)"
else
    echo -e "${RED}[!] Error: Python 3 not found. Please install Python 3.10+.${NC}"
    exit 1
fi
echo -e "${GREEN}[✓] Using Python:${NC} $PYTHON_BIN ($($PYTHON_BIN --version))"

# 2. Check Node.js
if ! command -v node &>/dev/null; then
    echo -e "${RED}[!] Error: Node.js is not installed. Please install Node 18+.${NC}"
    exit 1
fi
echo -e "${GREEN}[✓] Using Node.js:${NC} $(node -v)"

# 3. Check frontend node_modules
if [ ! -d "$PROJECT_ROOT/frontend/node_modules" ]; then
    echo -e "${YELLOW}[*] Installing frontend dependencies (one-time setup)...${NC}"
    npm install --prefix "$PROJECT_ROOT/frontend"
fi

FRONTEND_PORT="${FRONTEND_PORT:-3001}"

# 4. Cleanup old background processes on ports 8000, 3001, and 3000 if lingering
echo -e "${YELLOW}[*] Checking ports 8000 & ${FRONTEND_PORT}...${NC}"
lsof -ti:8000 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:"$FRONTEND_PORT" 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null || true

# Process tracker
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
    echo ""
    echo -e "${YELLOW}[*] Shutting down KhmerVoice AI servers cleanly...${NC}"
    if [ -n "$BACKEND_PID" ]; then
        kill "$BACKEND_PID" 2>/dev/null || true
    fi
    if [ -n "$FRONTEND_PID" ]; then
        kill "$FRONTEND_PID" 2>/dev/null || true
    fi
    # Ensure child processes on ports are freed
    lsof -ti:8000 2>/dev/null | xargs kill -9 2>/dev/null || true
    lsof -ti:"$FRONTEND_PORT" 2>/dev/null | xargs kill -9 2>/dev/null || true
    lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null || true
    echo -e "${GREEN}[✓] All servers stopped. Have a great day!${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# 5. Start Backend Server
echo -e "${CYAN}[*] Starting FastAPI Backend on http://127.0.0.1:8000 ...${NC}"
PYTHONUNBUFFERED=1 "$PYTHON_BIN" -m uvicorn api.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# Wait briefly for backend to initialize
sleep 2

# 6. Start Frontend Server on port 3001
echo -e "${CYAN}[*] Starting Next.js Studio on http://localhost:${FRONTEND_PORT} ...${NC}"
PORT="$FRONTEND_PORT" npm run dev --prefix "$PROJECT_ROOT/frontend" &
FRONTEND_PID=$!

echo ""
echo -e "${GREEN}${BOLD}══════════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  🚀 KhmerVoice AI is LIVE!${NC}"
echo -e "  🎬 ${BOLD}Web Studio & Movie Dubbing:${NC}  ${CYAN}http://localhost:${FRONTEND_PORT}${NC}"
echo -e "  ⚙️  ${BOLD}FastAPI Backend API:${NC}         ${CYAN}http://localhost:8000${NC}"
echo -e "  📚 ${BOLD}Interactive API Docs:${NC}        ${CYAN}http://localhost:8000/docs${NC}"
echo -e "${GREEN}${BOLD}══════════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  Press [Ctrl + C] anytime to stop all servers.${NC}"
echo ""

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID
