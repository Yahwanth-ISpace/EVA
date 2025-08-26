# Local ASR Full E2E Demo

## Quickstart (Local)
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
./run.sh
```

```bash
cd frontend
npm install
npm run dev
```

- Backend: http://localhost:8000
- Frontend: http://localhost:5173

## Quickstart (Docker)
```bash
docker-compose build
docker-compose up
```
- Backend: http://localhost:8000
- Frontend: http://localhost:8080

## GitHub Push
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/local-asr-e2e.git
git push -u origin main
```

## Notes
- Replace `src/model/tinyasr.py` with your actual TinyASR model code.
```
