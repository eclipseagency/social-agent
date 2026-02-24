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

STEPS = [
    ("Pulling latest code",        ["git", "fetch", "origin", BRANCH]),
    ("Checking out branch",        ["git", "checkout", BRANCH]),
    ("Pulling changes",            ["git", "pull", "origin", BRANCH]),
    ("Installing dependencies",    [sys.executable, "-m", "pip", "install", "-r", "requirements.txt", "-q"]),
    ("Running migrations",         [sys.executable, "migrations.py"]),
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
