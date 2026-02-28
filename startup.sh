#!/usr/bin/env bash
# ============================================================================
# startup.sh — Bootstrap and start the Slack Clone dev environment
#
# Usage:
#   chmod +x startup.sh
#   ./startup.sh
#
# This script:
#   1. Installs all dependencies (pnpm install)
#   2. Generates the Prisma client
#   3. Pushes the schema to the SQLite database
#   4. Seeds demo data if the database is empty
#   5. Starts the dev server (tsx watch server.ts)
# ============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# --- Pre-flight checks ---

# Check Node.js version
if ! command -v node &>/dev/null; then
  error "Node.js is not installed. Install Node.js 20+ LTS first."
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  error "Node.js 20+ is required. Current version: $(node -v)"
  exit 1
fi
ok "Node.js $(node -v)"

# Check pnpm
if ! command -v pnpm &>/dev/null; then
  warn "pnpm is not installed. Installing via corepack..."
  corepack enable
  corepack prepare pnpm@latest --activate
fi
ok "pnpm $(pnpm -v)"

# --- Create .env if missing ---

if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    info "Creating .env from .env.example..."
    cp .env.example .env
    warn "Edit .env to add your AUTH_SECRET and OAuth credentials."
  else
    error ".env.example not found. Cannot create .env."
    exit 1
  fi
fi
ok ".env file exists"

# --- Create uploads directory ---

UPLOAD_DIR="${UPLOAD_DIR:-./public/uploads}"
THUMB_DIR="$UPLOAD_DIR/thumbs"
if [ ! -d "$UPLOAD_DIR" ]; then
  mkdir -p "$UPLOAD_DIR"
  info "Created upload directory: $UPLOAD_DIR"
fi
if [ ! -d "$THUMB_DIR" ]; then
  mkdir -p "$THUMB_DIR"
  info "Created thumbnail directory: $THUMB_DIR"
fi

# --- Step 1: Install dependencies ---

info "Installing dependencies..."
pnpm install
ok "Dependencies installed"

# --- Step 2: Generate Prisma client ---

info "Generating Prisma client..."
npx prisma generate
ok "Prisma client generated"

# --- Step 3: Push schema to database ---

info "Pushing schema to database..."
npx prisma db push
ok "Database schema synced"

# --- Step 4: Seed demo data ---

info "Seeding database (skips if data exists)..."
npx prisma db seed
ok "Seed complete"

# --- Step 5: Start dev server ---

# Detect LAN IP
LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "unknown")

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Slack Clone is starting on port 3000      ${NC}"
echo -e "${GREEN}  Local:   http://localhost:3000             ${NC}"
echo -e "${GREEN}  Network: http://${LAN_IP}:3000             ${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""

exec pnpm dev
