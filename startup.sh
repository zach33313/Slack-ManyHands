#!/usr/bin/env bash
# ============================================================================
# startup.sh — Bootstrap and start the Slack Clone dev environment
#
# Usage:
#   chmod +x startup.sh
#   ./startup.sh
#
# This script:
#   1. Checks Node.js >= 18
#   2. Sets DATABASE_URL and AUTH_SECRET env vars if not already set
#   3. Installs all dependencies (pnpm install)
#   4. Generates the Prisma client
#   5. Pushes the schema to the SQLite database
#   6. Seeds demo data if the database is empty
#   7. Starts the dev server (npm run dev → tsx watch server.ts)
# ============================================================================

set -euo pipefail

# Ensure this script stays executable across clones and re-runs
chmod +x startup.sh

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

# Check Node.js version (>= 18 required)
if ! command -v node &>/dev/null; then
  error "Node.js is not installed. Install Node.js 18+ LTS first."
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  error "Node.js 18+ is required. Current version: $(node -v)"
  exit 1
fi
ok "Node.js $(node -v)"

# Check pnpm; fall back to npm for installs if unavailable
if command -v pnpm &>/dev/null; then
  PKG_MANAGER="pnpm"
  PKG_ADD="pnpm add"
  PKG_ADD_DEV="pnpm add -D"
  ok "pnpm $(pnpm -v)"
elif command -v npm &>/dev/null; then
  PKG_MANAGER="npm"
  PKG_ADD="npm install"
  PKG_ADD_DEV="npm install --save-dev"
  warn "pnpm not found; using npm"
else
  error "Neither pnpm nor npm found. Install Node.js 18+ LTS (includes npm)."
  exit 1
fi

# --- Ensure .env exists ---

if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    info "Creating .env from .env.example..."
    cp .env.example .env
  else
    error ".env.example not found. Cannot create .env."
    exit 1
  fi
fi
ok ".env file exists"

# --- Set DATABASE_URL if not already set ---

if grep -q '^DATABASE_URL=' .env 2>/dev/null; then
  # Already present in .env — export it for the current process
  # shellcheck disable=SC2046
  export $(grep '^DATABASE_URL=' .env | head -1 | xargs)
else
  info "DATABASE_URL not found in .env — setting default SQLite path"
  echo 'DATABASE_URL="file:./dev.db"' >> .env
fi
: "${DATABASE_URL:=file:./dev.db}"
export DATABASE_URL
ok "DATABASE_URL=${DATABASE_URL}"

# --- Set AUTH_SECRET if blank or missing ---

# Read current value from .env (strip quotes and whitespace)
CURRENT_SECRET=$(grep '^AUTH_SECRET=' .env 2>/dev/null | head -1 | sed 's/^AUTH_SECRET=//;s/^"//;s/"$//;s/^'"'"'//;s/'"'"'$//' || true)

if [ -z "$CURRENT_SECRET" ]; then
  if command -v openssl &>/dev/null; then
    GENERATED_SECRET=$(openssl rand -hex 32)
  else
    # Fallback: read from /dev/urandom
    GENERATED_SECRET=$(head -c 32 /dev/urandom | xxd -p | tr -d '\n' 2>/dev/null || LC_ALL=C tr -dc 'a-f0-9' < /dev/urandom | head -c 64)
  fi
  # Replace the AUTH_SECRET line (handles both empty-value and missing-key cases)
  if grep -q '^AUTH_SECRET=' .env; then
    # Replace the existing blank line
    sed -i.bak "s|^AUTH_SECRET=.*|AUTH_SECRET=\"${GENERATED_SECRET}\"|" .env && rm -f .env.bak
  else
    echo "AUTH_SECRET=\"${GENERATED_SECRET}\"" >> .env
  fi
  export AUTH_SECRET="$GENERATED_SECRET"
  warn "AUTH_SECRET was empty — generated and saved to .env"
else
  export AUTH_SECRET="$CURRENT_SECRET"
fi
ok "AUTH_SECRET is set"

# --- Export remaining .env vars for the current process ---

# Safe export: skip lines starting with # and blank lines.
# Strip surrounding double/single quotes from values (dotenv convention) so that
# e.g. AUTH_URL="http://localhost:3000" exports as http://localhost:3000, not
# "http://localhost:3000" (literal quotes), which would break new URL() parsing.
while IFS= read -r line || [ -n "$line" ]; do
  # Skip comments and blank lines
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line// }" ]] && continue
  # Split into key and raw value
  key="${line%%=*}"
  val="${line#*=}"
  # Strip exactly one pair of surrounding double or single quotes
  if [[ "$val" == '"'*'"' ]]; then
    val="${val:1:${#val}-2}"
  elif [[ "$val" == "'"*"'" ]]; then
    val="${val:1:${#val}-2}"
  fi
  # Only export if not already set in environment
  if [ -z "${!key:-}" ]; then
    export "${key}=${val}" 2>/dev/null || true
  fi
done < .env

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

# --- Step 1: Install all dependencies ---

info "Installing dependencies..."
$PKG_MANAGER install
ok "Dependencies installed"

# --- Step 1b: Install security / sanitization dependencies ---

info "Installing dompurify (XSS sanitization) and type definitions..."
$PKG_ADD dompurify --silent 2>/dev/null || warn "dompurify install may have failed (non-critical)"
$PKG_ADD_DEV @types/dompurify --silent 2>/dev/null || warn "@types/dompurify install may have failed (non-critical)"
ok "dompurify installed"

# --- Step 1c: Install additional Tiptap extensions for Canvas feature ---

info "Installing additional Tiptap extensions for canvas..."
$PKG_ADD \
  @tiptap/extension-highlight \
  @tiptap/extension-task-list \
  @tiptap/extension-task-item \
  @tiptap/extension-table \
  @tiptap/extension-horizontal-rule \
  --silent 2>/dev/null || warn "Some Tiptap extension installs may have failed (non-critical)"
ok "Tiptap extensions installed"

# --- Step 1d: Install UX and personalization dependencies ---

info "Installing UX and personalization dependencies..."
$PKG_ADD \
  "@dnd-kit/core" \
  "@dnd-kit/sortable" \
  "@dnd-kit/utilities" \
  canvas-confetti \
  date-fns \
  --silent 2>/dev/null || warn "Some UX dependency installs may have failed (non-critical)"
$PKG_ADD_DEV \
  @types/canvas-confetti \
  --silent 2>/dev/null || warn "Some UX dev dependency installs may have failed (non-critical)"
ok "UX dependencies installed"

# --- Step 2: Generate Prisma client ---

info "Generating Prisma client..."
npx prisma generate
ok "Prisma client generated"

# --- Step 3: Push schema to database ---

info "Pushing schema to database..."
npx prisma db push --accept-data-loss
ok "Database schema synced"

# --- Step 4: Seed demo data ---

info "Seeding database (skips if data exists)..."
npx prisma db seed
ok "Seed complete"

# --- TURN Server (coturn) — optional, for cross-network calls ---
#
# Voice/video calls use WebRTC peer-to-peer connections. On the same LAN this
# works with STUN alone, but across different networks (symmetric NAT, cellular,
# corporate firewalls) you need a TURN relay server.
#
# Quick coturn setup (Ubuntu/Debian):
#
#   sudo apt install coturn
#   sudo systemctl enable coturn
#
#   # Edit /etc/turnserver.conf:
#   listening-port=3478
#   tls-listening-port=5349
#   realm=your-domain.com
#   server-name=your-domain.com
#   # Static credentials (simple setup):
#   lt-cred-mech
#   user=slackturn:changeme
#   # Or use a shared secret for time-limited credentials:
#   # use-auth-secret
#   # static-auth-secret=your-secret-here
#
#   sudo systemctl restart coturn
#
# Then set in your .env:
#   NEXT_PUBLIC_TURN_URL="turn:your-domain.com:3478"
#   NEXT_PUBLIC_TURN_USERNAME="slackturn"
#   NEXT_PUBLIC_TURN_CREDENTIAL="changeme"
#
# For TLS (recommended in production):
#   NEXT_PUBLIC_TURN_URL="turns:your-domain.com:5349"
#
# Test with: turnutils_uclient -T -u slackturn -w changeme your-domain.com

# --- Step 5: Start dev server ---

# Detect LAN IP for display only
LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Slack Clone is starting on port 3000      ${NC}"
echo -e "${GREEN}  Local:   http://localhost:3000             ${NC}"
echo -e "${GREEN}  Network: http://${LAN_IP}:3000             ${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""

# npm run dev → tsx watch server.ts (see package.json "dev" script)
exec npm run dev
