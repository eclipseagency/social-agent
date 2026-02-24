#!/usr/bin/env python3
"""
update.py — Pull latest changes & reload the app
Works on PythonAnywhere, VPS, or any Linux server.
"""
import os
import sys
import subprocess

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
BRANCH = "master"
VENV_PIP = os.path.join(PROJECT_DIR, "venv", "bin", "pip")
VENV_PYTHON = os.path.join(PROJECT_DIR, "venv", "bin", "python")
ACTIVATE_THIS = os.path.join(PROJECT_DIR, "venv", "bin", "activate_this.py")


def _ensure_venv():
    """Run setup_venv.sh if the virtualenv (and activate_this.py) is missing."""
    if not os.path.isfile(ACTIVATE_THIS):
        print("\n[•] Venv missing — running setup_venv.sh ...")
        result = subprocess.run(
            ["bash", os.path.join(PROJECT_DIR, "setup_venv.sh")],
            cwd=PROJECT_DIR,
        )
        if result.returncode != 0:
            print("    ERROR: setup_venv.sh failed. Fix the venv before continuing.")
            sys.exit(1)
        print("    Done.")


_ensure_venv()

pip_cmd = VENV_PIP if os.path.isfile(VENV_PIP) else sys.executable
python_cmd = VENV_PYTHON if os.path.isfile(VENV_PYTHON) else sys.executable

STEPS = [
    ("Pulling latest code",        ["git", "fetch", "origin", BRANCH]),
    ("Checking out branch",        ["git", "checkout", BRANCH]),
    ("Pulling changes",            ["git", "pull", "origin", BRANCH]),
    ("Installing dependencies",    [pip_cmd, "install", "-r", "requirements.txt", "-q"]),
    ("Running migrations",         [python_cmd, "migrations.py"]),
]

def run(label, cmd):
    print(f"\n[•] {label} ...")
    result = subprocess.run(cmd, cwd=PROJECT_DIR, capture_output=True, text=True)
    if result.stdout.strip():
        print(result.stdout.strip())
    if result.returncode != 0:
        print(f"    ERROR: {result.stderr.strip()}")
        sys.exit(1)
    print(f"    Done.")

def reload_app():
    print("\n[•] Reloading app ...")

    # PythonAnywhere: touch wsgi.py to trigger reload
    wsgi = os.path.join(PROJECT_DIR, "wsgi.py")
    if os.path.exists(wsgi):
        import pathlib
        pathlib.Path(wsgi).touch()
        print("    Touched wsgi.py — PythonAnywhere will reload.")

    # Gunicorn: send HUP signal
    result = subprocess.run(["pgrep", "-x", "gunicorn"], capture_output=True, text=True)
    if result.returncode == 0:
        subprocess.run(["pkill", "-HUP", "gunicorn"])
        print("    Sent HUP to gunicorn.")

    print("    Done.")

if __name__ == "__main__":
    print("=" * 40)
    print("  Social Agent — Update Script")
    print("=" * 40)
    print(f"  Dir    : {PROJECT_DIR}")
    print(f"  Branch : {BRANCH}")

    for label, cmd in STEPS:
        run(label, cmd)

    reload_app()

    print("\n" + "=" * 40)
    print("  Update complete!")
    print("=" * 40)
