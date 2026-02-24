#!/bin/bash
# ============================================================
#  update.sh — Pull latest changes & reload the app
# ============================================================
set -e

BRANCH="master"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=============================="
echo " Social Agent — Update Script"
echo "=============================="
echo "Project : $PROJECT_DIR"
echo "Branch  : $BRANCH"
echo ""

cd "$PROJECT_DIR"

# 1. Pull latest code
echo "[1/4] Pulling latest code from $BRANCH ..."
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull origin "$BRANCH"
echo "      Done."

# 2. Install / update dependencies
echo "[2/4] Installing Python dependencies ..."
pip install -r requirements.txt -q
echo "      Done."

# 3. Run database migrations
echo "[3/4] Running database migrations ..."
python migrations.py
echo "      Done."

# 4. Reload the app
echo "[4/4] Reloading app ..."

# PythonAnywhere: touch the WSGI file to trigger a reload
WSGI_FILE="$PROJECT_DIR/wsgi.py"
if [ -f "$WSGI_FILE" ]; then
    touch "$WSGI_FILE"
    echo "      Touched wsgi.py — PythonAnywhere will reload automatically."
fi

# If running with gunicorn, send HUP signal
if pgrep -x "gunicorn" > /dev/null; then
    pkill -HUP gunicorn
    echo "      Sent HUP to gunicorn."
fi

echo ""
echo "=============================="
echo " Update complete!"
echo "=============================="
