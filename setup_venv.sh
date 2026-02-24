#!/bin/bash
# ============================================================
#  setup_venv.sh — Create the virtualenv and install deps
#
#  Run this once after cloning, or whenever the venv is lost.
#  Uses 'virtualenv' (not python -m venv) so that
#  activate_this.py is generated — required by PythonAnywhere's
#  WSGI configuration.
# ============================================================
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$PROJECT_DIR/venv"

echo "=============================="
echo " Social Agent — Venv Setup"
echo "=============================="
echo "Project : $PROJECT_DIR"
echo "Venv    : $VENV_DIR"
echo ""

# 1. Ensure virtualenv is available
if ! command -v virtualenv &> /dev/null; then
    echo "[1/3] Installing virtualenv ..."
    pip install --user virtualenv -q
    # Re-export PATH so the just-installed virtualenv is found
    export PATH="$HOME/.local/bin:$PATH"
else
    echo "[1/3] virtualenv already available — skipping install."
fi

# 2. Create the virtualenv (produces activate_this.py)
if [ -d "$VENV_DIR" ]; then
    echo "[2/3] Venv already exists at $VENV_DIR — skipping creation."
else
    echo "[2/3] Creating virtualenv at $VENV_DIR ..."
    virtualenv "$VENV_DIR"
    echo "      Done."
fi

# Confirm activate_this.py was created (PythonAnywhere requirement)
if [ ! -f "$VENV_DIR/bin/activate_this.py" ]; then
    echo ""
    echo "ERROR: $VENV_DIR/bin/activate_this.py was not created."
    echo "       Ensure you are using 'virtualenv', not 'python -m venv'."
    exit 1
fi

# 3. Install project dependencies into the venv
echo "[3/3] Installing dependencies into venv ..."
"$VENV_DIR/bin/pip" install -r "$PROJECT_DIR/requirements.txt" -q
echo "      Done."

echo ""
echo "=============================="
echo " Setup complete!"
echo ""
echo " Next steps:"
echo "   • Reload your PythonAnywhere web app from the Web tab."
echo "   • The WSGI file must point to:"
echo "     activate_this = '$VENV_DIR/bin/activate_this.py'"
echo "=============================="
