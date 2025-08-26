# Local TinyASR Ready Example

## Overview
This project provides a local, lightweight ASR using TinyASR for offline transcription,
embedding generation via SentenceTransformers, a React frontend, and Docker support.

### Features
- /transcribe endpoint: upload audio → transcript
- /embed_file endpoint: upload audio → transcript + embedding vector
- React frontend for file upload & streaming
- Docker + docker-compose for one-command launch
- TinyASR checkpoint included (~10MB) for instant demo

## Local Setup

1. Backend
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
./run.sh
```
Server: http://localhost:8000

2. Frontend
```bash
cd frontend
npm install
npm run dev
```
Frontend: http://localhost:5173

## Docker Setup
```bash
docker-compose build
docker-compose up
```
- API: http://localhost:8000
- Web: http://localhost:8080

## GitHub Repo Setup
```bash
git init
git add .
git commit -m "Initial commit with TinyASR scaffold"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

## Notes
- TinyASR checkpoint is included for demonstration. Replace with your own trained model if needed.
- Embedding model downloads on first run (internet required).
- Training pipeline scripts are included in src/model/ for future improvements.
