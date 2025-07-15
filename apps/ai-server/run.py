import os
import subprocess
import sys
from pathlib import Path

VENV_ACTIVATE = Path("venv/Scripts/activate.bat")  # For Windows
SERVER_COMMAND = "uvicorn main:app --host 0.0.0.0 --port 5001"

if not VENV_ACTIVATE.exists():
    print("Virtual environment not found. Please create one with: python -m venv venv")
    sys.exit(1)

print("🔁 Activating virtual environment...")
os.system(f'call {VENV_ACTIVATE}')

print("🚀 Starting AI server...")
subprocess.call(SERVER_COMMAND, shell=True)
