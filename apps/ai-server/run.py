import os
import subprocess
import venv
from pathlib import Path

VENV_NAME = "ai-server"
VENV_PATH = Path(VENV_NAME)
IS_WINDOWS = os.name == "nt"
PYTHON_BIN = VENV_PATH / ("Scripts" if IS_WINDOWS else "bin") / ("python.exe" if IS_WINDOWS else "python")
PIP_BIN = VENV_PATH / ("Scripts" if IS_WINDOWS else "bin") / ("pip.exe" if IS_WINDOWS else "pip")
SERVER_COMMAND = [str(PYTHON_BIN), "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

# Step 1: Create venv if it doesn't exist
if not PYTHON_BIN.exists():
    print(f"🔧 Virtual environment '{VENV_NAME}' not found. Creating it...")
    venv.create(VENV_PATH, with_pip=True)
    print(f"✅ Virtual environment '{VENV_NAME}' created.")

# Step 2: Install requirements
requirements_path = Path("requirements.txt")
if requirements_path.exists():
    print("📦 Installing dependencies...")
    subprocess.check_call([str(PIP_BIN), "install", "-r", str(requirements_path)])

# Step 3: Run server using venv's Python
print("🚀 Starting AI server with virtual environment Python...")
subprocess.check_call(SERVER_COMMAND)
