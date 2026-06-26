# 🦷 EVA: AI-Powered Dental Insurance Verification System

EVA is a monorepo that automates the process of verifying dental insurance coverage using voice calls and AI. The system transcribes phone call audio, extracts insurance details using an LLM (e.g., Mistral via Ollama), and stores the results for each patient.

## 🏗️ Monorepo Structure

```
EVA/
├── apps/
│   ├── backend/            # NestJS backend
│   ├── ai-server/          # FastAPI server for Whisper + Ollama
│   └── clinet/             # React frontend with Tailwind CSS
└── Docker/                 # Docker file for Whisper is available
```

---

## ⚙️ Setup Instructions

### 1. Clone the Repo

```bash
git clone https://github.com/YOUR_USERNAME/EVA.git
cd EVA
```

### 2. Backend (NestJS)

```bash
cd apps/backend
npm install

# Create .env file with:
# DATABASE_URL="file:./dev.db"
# JWT_SECRET="your-secret-key"
# OLLAMA_URL="http://localhost:11434"

npx prisma generate

npm run start:dev
```

### 3. AI Server (FastAPI)

`🐳 Run the Whisper-based AI server entirely through Docker:`

```bash
cd EVA

# This will create a image in local docker to give you whisper services
docker build -f Docker/Dockerfile -t whisper-ai-server .
docker run -p 5001:5001 whisper-ai-server

# Make sure Ollama is running (if installed run this from terminal/cmd):
ollama run mistral

# Find the FastAPI docs with this URL:
http://localhost:5001/redoc
```

### 4. Frontend (React + Tailwind)

```bash
cd client
npm install
npm run dev
```

---

## 🧠 How It Works

1. Patient submits a request with memberId & clinic details.
2. AI Agent (Jambonz or Bitrix24) makes a call to the clinic and records the insurance response.
3. The audio file is sent to the backend.
4. The backend calls the FastAPI server to transcribe the audio using Whisper.
5. The transcript is then passed to Mistral via Ollama to extract insurance details.
6. Details are stored in the database via Prisma.
7. The frontend displays verified data to the user.

---

## 🧪 Testing with Postman

Use the provided `EVA.postman_collection.json` file to test all endpoints including:

- `POST /auth/login` & `/auth/register`
- `POST /verification/from-audio/:patientId`
- `GET /verification`
- `POST /transcription`

Make sure to attach a valid `.mp3` file in your requests.

---

## 🧱 Technologies Used

- 📦 NestJS + Prisma + JWT (backend)
- 🧠 FastAPI + Whisper + Ollama (AI services)
- 💻 React + Tailwind CSS (frontend)
- 📞 Jambonz / Bitrix24 for call automation

---

## 🔒 Authentication

JWT-based authentication is enabled for secure API access. Use the `/auth/login` to receive a token and include it in your headers as:

```
Authorization: Bearer YOUR_TOKEN_HERE
```

---

## 📂 Uploads

Uploaded audio files are temporarily stored in the `/uploads` directory and automatically deleted after processing.

---

## 📌 Notes

- Mistral should be running via Ollama (`ollama run mistral`)
- Make sure Whisper model (e.g., `base`) is downloaded before starting the AI server
- FFmpeg is **not** required since Whisper loads audio via Python only

---

## 📞 Next Steps

- Integrate with Jambonz/Bitrix24 to trigger voice calls
- Automate call recording and sending to `/verification/from-audio/:patientId`

---

## 👨‍💻 Author

AI Team — Built for end-to-end AI-based dental claim automation 💡
