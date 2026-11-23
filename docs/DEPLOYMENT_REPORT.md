# EVA: Deployment and Operations Guide

**Environment documented here: UAT (User Acceptance Testing)**

This guide explains how to update, start, stop, and check the EVA application on the server. It is written so that someone with little technical background can follow it step by step. If you can use PuTTY and copy and paste commands, you can use this guide.

---

## How to use this guide

| If you want to... | Go to |
| --- | --- |
| Find the website links | [Section 1](#1-the-links) |
| Know if the app is working right now | [Section 2](#2-is-the-app-working-right-now-2-minute-check) |
| Update the app with the latest code (the most common task) | [Section 5](#5-the-daily-task-update-the-app-with-the-latest-code) |
| Restart one part of the app | [Section 7](#7-i-want-to-do-x-task-finder) |
| Fix something that is broken | [Section 8](#8-something-is-wrong-troubleshooting) |
| Set up a brand-new server | [Section 9](#9-setting-up-a-brand-new-server-one-time) |
| Just see the commands on one page | [Section 12](#12-one-page-cheat-sheet) |

Words in `code style` are commands or file names. Copy and paste them exactly as shown. Text in angle brackets such as `<SERVER_IP>` is something you replace with your own value (without the brackets).

---

## 1. The links

| Part | Link | What you will see |
| --- | --- | --- |
| **Frontend** (the website people use) | https://eva-uat.ispace.com/ | The EVA.AI web app (login page) |
| **Backend** (the API, the "engine" behind the website) | https://eva-api-uat.ispace.com/ | The plain text `Hello World!` |

Notes:

- The backend link is not meant to be used in a browser by regular users. It shows `Hello World!` only to prove it is alive. The frontend talks to it automatically.
- Both links were checked on 23 Nov 2026 and responded normally.
- The third part, the **AI server**, has **no public link on purpose**. It is only reachable from inside the server (see the next section).

---

## 2. Is the app working right now? (2-minute check)

**Check 1: Frontend.** Open https://eva-uat.ispace.com/ in your browser. The EVA login page should load.

**Check 2: Backend.** Open https://eva-api-uat.ispace.com/ in your browser. You should see `Hello World!`.

**Check 3: AI server.** This one can only be checked from the server. Connect with PuTTY (see section 5, step 1) and run:

```bash
curl http://127.0.0.1:8000/
```

You should see: `{"status":"ok"}`

**Check 4: See all three running.** On the server, run:

```bash
screen -ls
```

You should see three sessions marked `(Detached)`: `eva-backend`, `eva-frontend`, `eva-ai`. "Detached" means "running in the background", which is what we want.

| Result | Meaning |
| --- | --- |
| Check 1 fails, Check 2 works | Frontend is down. See section 7, "Restart the frontend". |
| Check 2 fails, Check 1 works | Backend is down. See section 7, "Restart the backend". |
| Check 3 fails | AI server is down. See section 7, "Restart the AI server". |
| All fail | The server itself may be off or rebooted. See section 8, "Server was rebooted". |

---

## 3. Plain-English glossary

| Word | Simple meaning |
| --- | --- |
| **Server** | A computer that is always on, somewhere else, that runs EVA for everyone. |
| **PuTTY** | A program on your computer that lets you type commands on the server remotely. |
| **Terminal / command line** | The black window where you type commands. |
| **Frontend** | The website that users see and click on. |
| **Backend** | The behind-the-scenes program that handles logins, data, phone calls, and so on. |
| **AI server** | A helper program (written in Python) that converts speech to text and answers knowledge questions. Only the backend talks to it. |
| **Git / `git pull`** | The system that stores the code. `git pull` downloads the newest version of the code to the server. |
| **Build (`npm run build`)** | Turns the code into the final ready-to-run version. You must build after every `git pull` that changed code. |
| **`npm`** | A tool that installs and runs the frontend and backend (both are made with Node.js). |
| **Python virtual environment ("venv")** | A private box of Python tools used only by the AI server, so it does not clash with other programs. |
| **`uvicorn`** | The program that actually runs the Python AI server. |
| **Screen** | A tool that keeps a program running even after you close PuTTY. Think of it as a set of "tabs" that stay open on the server. |
| **Session** | One screen "tab". We have three: one per part of the app. |
| **Attach / reattach** (`screen -r`) | Open a session so you can see it and type in it. |
| **Detach** (`Ctrl+A`, then `d`) | Leave a session, but keep it running in the background. |
| **`Ctrl+C`** | Stops the program that is running in the current window. |
| **`.env` file** | A private settings file with passwords, keys, and web addresses. It is **not** stored in Git, so `git pull` never changes it. |
| **Port** | A numbered door on the server. Backend uses 3000, frontend uses 5173, AI server uses 8000. |
| **`127.0.0.1` / localhost** | Means "this same computer only". Nobody on the internet can reach an address that uses it. |
| **UAT** | The testing environment where the team checks new work before it goes live. |

---

## 4. The big picture

EVA has **three programs** that run on the server, and each one runs in its own screen session.

```
                         INTERNET
                            |
        +-------------------+--------------------+
        |                                        |
 Frontend (website)                      Backend (engine)
 https://eva-uat.ispace.com              https://eva-api-uat.ispace.com
 runs on server port 5173                runs on server port 3000
        |                                        |
        |   (browser calls the backend)          |
        +----------------------------------------+
                                                 |
                                                 | private, inside the server only
                                                 v
                                        AI server (Python)
                                        http://127.0.0.1:8000
                                        NOT reachable from the internet
```

What each part does:

| Program | Folder on server | Screen session name | Port | Start command | Visible on internet? |
| --- | --- | --- | --- | --- | --- |
| Frontend | `apps/client` | `eva-frontend` | 5173 | `npm run start` | Yes, via https://eva-uat.ispace.com/ |
| Backend | `apps/backend` | `eva-backend` | 3000 | `npm run start:prod` | Yes, via https://eva-api-uat.ispace.com/ |
| AI server | `apps/ai-server` | `eva-ai` | 8000 | `uvicorn main:app --host 127.0.0.1 --port 8000` | **No (internal only, by design)** |

**Why is the AI server not public?** It is started with `--host 127.0.0.1`, which means "only accept connections from this same computer". The backend runs on the same server, so it can reach the AI server, but nobody on the internet can. This is a security choice. Do not change `127.0.0.1` to `0.0.0.0` unless you are told to.

**Outside services** the backend also needs (nothing to install, but their keys must be correct in the `.env` file): MongoDB (the database), Twilio (phone calls), ElevenLabs (voice), Gemini/OpenAI/Groq (AI models), the Sabrina API, and Qdrant (knowledge search for the AI server).

> The secure `https://` addresses and the forwarding from those addresses to ports 3000 and 5173 are handled by the server's web gateway (the part that sits in front of the app). That is set up once and does not change during normal updates. If the links ever stop working but the screen sessions are running, ask whoever manages the server gateway or network.

---

## 5. The daily task: update the app with the latest code

Use this whenever developers say "the new code is ready". It takes about 5 to 10 minutes.

**What you need:** the server address (`<SERVER_IP>`), your login name and password for the server, and the name of the Git branch the server uses (ask the developers if unsure; the project's current branch is `EVA-testing-V2`).

### Step 1: Log in to the server

1. Open **PuTTY**.
2. Type the server IP address in **Host Name (or IP address)**. Leave the port as `22`.
3. Click **Open**.
4. When asked, type your username and press Enter, then your password and press Enter. (Nothing appears while you type a password. This is normal.)

You are now on the server.

### Step 2: Go to the EVA folder

```bash
cd ~/EVA
```

If the project is somewhere else on your server, use that path. Below it is written as `~/EVA`.

### Step 3: Download the latest code

```bash
git pull origin EVA-testing-V2
```

(Replace `EVA-testing-V2` with your branch name if different.)

You should see a list of changed files, or `Already up to date.` If it says "Already up to date", there is nothing new and you can stop here.

### Step 4: Find out what changed (optional but useful)

```bash
git diff --name-only ORIG_HEAD HEAD
```

This lists the files that were updated. Use it to decide what to do next:

| If the list contains a file starting with... | Then you need to... |
| --- | --- |
| `apps/backend/` | Rebuild and restart the **backend** (steps 5 and 7) |
| `apps/client/` | Rebuild and restart the **frontend** (steps 6 and 8) |
| `apps/ai-server/` | Restart the **AI server** (step 9) |
| `package.json` or `package-lock.json` inside a folder | Also run `npm ci` in that folder before building (shown below) |
| `requirements.txt` inside `apps/ai-server/` | Also run `pip install -r requirements.txt` (shown in step 9) |

If you are not sure, simply do all the steps. It is safe, only slower.

### Step 5: Build the backend

```bash
cd ~/EVA/apps/backend
npm ci            # ONLY if package.json or package-lock.json changed
npm run build
```

Wait for it to finish and show your prompt again. If you see red `error` messages, stop and go to section 8 ("Build fails").

### Step 6: Build the frontend

```bash
cd ~/EVA/apps/client
npm ci            # ONLY if package.json or package-lock.json changed
npm run build
```

Wait for it to finish. A successful build ends with lines mentioning `dist/` and `built in ...`.

> **Important:** the frontend's backend address (`VITE_BACKEND_URL` in `apps/client/.env`) is "baked in" during this build. It must be `https://eva-api-uat.ispace.com` (see section 10). If you ever change that file, you must build again.

### Step 7: Restart the backend

```bash
screen -r eva-backend
```

You now see the backend's window. Then:

1. Press **Ctrl+C**. This stops the old backend. Wait until you see your command prompt.
2. Make sure you are in the backend folder, then start it:

```bash
cd ~/EVA/apps/backend
npm run start:prod
```

3. Wait for a few seconds. You should see lines of startup messages ending with something like `[EVA] Backend http://127.0.0.1:3000`.
4. **Detach**: press **Ctrl+A**, release both keys, then press **d**. You are back at the normal server prompt and the backend keeps running.

### Step 8: Restart the frontend

```bash
screen -r eva-frontend
```

1. Press **Ctrl+C**.
2. Start it again:

```bash
cd ~/EVA/apps/client
npm run start
```

3. You should see a message with `Local:` and `Network:` addresses on port 5173.
4. Detach: **Ctrl+A**, then **d**.

### Step 9: Restart the AI server (only if `apps/ai-server` changed, or it is down)

```bash
screen -r eva-ai
```

1. Press **Ctrl+C**.
2. Go to the AI server folder and turn on its Python environment:

```bash
cd ~/EVA/apps/ai-server
source .venv/bin/activate
```

After this, your prompt starts with `(.venv)`. That means the Python environment is on.

3. Only if `requirements.txt` changed, install the new packages:

```bash
pip install -r requirements.txt
```

4. Start the AI server (private, internal only):

```bash
uvicorn main:app --host 127.0.0.1 --port 8000
```

5. You should see `Uvicorn running on http://127.0.0.1:8000`. The first start after a fresh install can take a few minutes because it downloads AI models.
6. Detach: **Ctrl+A**, then **d**.

### Step 10: Check everything works

Go to section 2 and run the 2-minute check. Then close PuTTY. Everything keeps running.

---

## 6. Screen explained (the part that confuses most people)

**What problem does it solve?** If you start a program in PuTTY and then close PuTTY, the program stops. Screen keeps the program running on the server even when you are not connected.

**The mental model:** each of our three programs lives in its own named "tab" on the server. You can open a tab to look at it, then leave it running.

| I want to... | Do this |
| --- | --- |
| See which tabs exist | `screen -ls` |
| Open a tab to look at it | `screen -r eva-backend` (or `eva-frontend`, `eva-ai`) |
| **Leave** a tab without stopping it | Press **Ctrl+A**, let go, then press **d** |
| **Stop** the program inside a tab | Open the tab, then press **Ctrl+C** |
| Create a new tab with a name | `screen -S eva-backend` |
| Open a tab that says "attached elsewhere" | `screen -d -r eva-backend` |
| Scroll up to read older messages | Open the tab, press **Ctrl+A**, then **[**, use the arrow keys or PageUp, press **Esc** to exit |
| Delete a tab completely | `screen -X -S eva-backend quit` |
| Remove broken, dead tabs from the list | `screen -wipe` |

Three rules to remember:

1. **To leave, always detach** (**Ctrl+A** then **d**). Do not type `exit`, because that closes the tab and stops the program.
2. **Ctrl+C stops the program. Ctrl+A then d leaves it running.** Do not mix them up.
3. Always check `screen -ls` after you finish. All three must say `(Detached)`.

How to read `screen -ls`:

```
There are screens on:
    12345.eva-backend    (Detached)    <- good, running in background
    12346.eva-frontend   (Detached)    <- good
    12347.eva-ai         (Detached)    <- good
```

- `(Attached)` means someone has it open right now.
- `(Dead ???)` means the tab is broken. Run `screen -wipe`, then recreate it (section 9, step 7).
- A missing name means the tab is gone and must be recreated.

---

## 7. "I want to do X" task finder

| # | I want to... | Steps |
| --- | --- | --- |
| 1 | **Update everything with the latest code** | Section 5 |
| 2 | **Update only the backend** | Section 5, steps 1, 2, 3, 5, 7, 10 |
| 3 | **Update only the frontend** | Section 5, steps 1, 2, 3, 6, 8, 10 |
| 4 | **Restart the backend** (no code change) | `screen -r eva-backend` → **Ctrl+C** → `cd ~/EVA/apps/backend` → `npm run start:prod` → **Ctrl+A**, **d**. No build needed. |
| 5 | **Restart the frontend** (no code change) | `screen -r eva-frontend` → **Ctrl+C** → `cd ~/EVA/apps/client` → `npm run start` → **Ctrl+A**, **d**. No build needed unless the code changed. |
| 6 | **Restart the AI server** (no code change) | `screen -r eva-ai` → **Ctrl+C** → `cd ~/EVA/apps/ai-server` → `source .venv/bin/activate` → `uvicorn main:app --host 127.0.0.1 --port 8000` → **Ctrl+A**, **d** |
| 7 | **Change a setting in the backend** (any key in `apps/backend/.env`) | Edit the file (`nano ~/EVA/apps/backend/.env`, save with **Ctrl+O**, Enter, exit with **Ctrl+X**), then restart the backend (row 4). No build needed. |
| 8 | **Change the backend address the website uses** | Edit `~/EVA/apps/client/.env`, then **rebuild** the frontend (`npm run build`), then restart it (row 5). A restart alone is not enough. |
| 9 | **Change which websites are allowed to call the backend** (`CORS_ORIGINS`) | Edit `apps/backend/.env`, restart the backend (row 4). It must exactly match the frontend address: `https://eva-uat.ispace.com` |
| 10 | **Install new Python packages for the AI server** | `screen -r eva-ai` → **Ctrl+C** → `source .venv/bin/activate` → `pip install -r requirements.txt` → start `uvicorn` (row 6) |
| 11 | **Go back to an older version** (rollback) | `cd ~/EVA`, run `git log --oneline -10` to see recent versions, pick the code in the left column of the one you want, run `git checkout <that code>`, then rebuild and restart the affected parts (section 5, steps 5 to 9). To return to normal later, run `git checkout EVA-testing-V2`. Ask a developer before rolling back. |
| 12 | **Read what the backend is doing** (logs) | `screen -r eva-backend`, scroll with **Ctrl+A** then **[**, leave with **Ctrl+A**, **d** |
| 13 | **Stop everything** | For each of the three sessions: `screen -r <name>` → **Ctrl+C** → **Ctrl+A**, **d** |
| 14 | **Start everything after a reboot** | Section 9, step 7 |

---

## 8. Something is wrong (troubleshooting)

Find the symptom, then read the cause and fix.

### The website does not load, or shows an error

1. Run the 2-minute check (section 2) to find which part is down.
2. Run `screen -ls`. If a session is missing, recreate it (section 9, step 7).
3. If the session exists, open it (`screen -r <name>`), read the last messages, and press **Ctrl+A**, **d** to leave. If you see an error, copy the last 20 lines and send them to a developer.

### Login works but pages show errors or nothing loads (browser says "CORS" or "blocked")

The backend's setting `CORS_ORIGINS` does not match the website address. It must be exactly `https://eva-uat.ispace.com` (no trailing slash, `https`, not `http`). Fix it in `apps/backend/.env` and restart the backend (section 7, rows 7 and 4).

### The website calls the wrong address (for example `localhost`)

The frontend was built with the wrong backend address. Open `apps/client/.env` and check that both lines read:

```
VITE_BACKEND_URL=https://eva-api-uat.ispace.com
VITE_CHAT_BACKEND_URL=https://eva-api-uat.ispace.com
```

Then rebuild and restart the frontend (section 7, row 8).

### The backend will not start and shows "Missing required production configuration: ..."

Some required setting is missing in `apps/backend/.env`. The message lists exactly which ones. Add them (ask a developer for values) and start the backend again. Required settings in production include: `JWT_SECRET`, `SSN_ENCRYPTION_KEY`, `LOGIN_RSA_PRIVATE_KEY`, the Twilio keys, `BACKEND_URL`, `SABRINA_API_URL`, `SABRINA_VERIFICATION_CODE`, `VERIFICATIONS_API_TOKEN`, `AI_SERVICE_TOKEN`, `DATABASE_URL`, and `CORS_ORIGINS`.

### The backend will not start and shows "must use https in production"

`BACKEND_URL` or `SABRINA_API_URL` in `apps/backend/.env` starts with `http://`. In production it must start with `https://`. For UAT, `BACKEND_URL` must be `https://eva-api-uat.ispace.com`.

### Error "address already in use" or "EADDRINUSE"

An old copy of the program is still running on that port. Do this:

```bash
ss -ltnp | grep -E ':(3000|5173|8000)\b'
```

This shows which program is using which port and its number (`pid=12345`). Stop it with `kill 12345` (use the real number), then start the program again. Another cause is a second screen session with the same program. Check with `screen -ls` and delete the duplicate (section 6).

### `npm run build` fails with red errors

- If the message mentions "TypeScript" or a file name with a line number, this is a code problem. Send the message to a developer. Do not restart the app if the build failed. The old version is still running.
- If you see `command not found`, Node.js is not installed or not on the path (section 9, step 2).
- If you see "out of memory" or "killed", the server is low on memory. Close unused programs and try again, or ask for more server memory.

### `git pull` says "Your local changes would be overwritten"

Someone edited code files directly on the server. Do not continue. Run `git status` and send the result to a developer. They will decide whether to keep or discard those edits.

### `screen -r` says "There is no screen to be resumed"

That session does not exist. Recreate it (section 9, step 7).

### `screen -r` says "There are several suitable screens"

Add the name: `screen -r eva-backend`.

### `screen -r` says the session is attached elsewhere

Someone else (or an old PuTTY window) has it open. Use `screen -d -r eva-backend` to take it over.

### Server was rebooted, so nothing is running

Screen sessions do not survive a reboot. Recreate all three (section 9, step 7). To make this automatic in future, see section 11.

### The AI server errors about a missing package, or `uvicorn: command not found`

You forgot to turn on the Python environment. Run:

```bash
cd ~/EVA/apps/ai-server
source .venv/bin/activate
```

Your prompt must start with `(.venv)`. Then start `uvicorn` again. If packages are missing, run `pip install -r requirements.txt`.

### Phone calls or voice fail

The backend needs `ffmpeg` (an audio tool) installed on the server. Check with `ffmpeg -version`. If it says "not found", ask for it to be installed (`sudo apt install -y ffmpeg`). The backend prints a warning at startup when ffmpeg is missing.

---

## 9. Setting up a brand-new server (one time)

Only needed if the server is replaced or rebuilt. Ask a developer or IT administrator to help the first time.

### Step 1: Log in with PuTTY (as in section 5, step 1)

### Step 2: Install the required software

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git screen ffmpeg curl python3.12 python3.12-venv python3-pip

# Node.js 22 (the same version the project's Docker files use)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

node -v    # should print v22.something
npm -v
python3.12 --version
```

### Step 3: Download the code

```bash
cd ~
git clone https://github.com/Yahwanth-ISpace/CovrAi.git EVA
cd ~/EVA
git checkout EVA-testing-V2
```

### Step 4: Create the settings files (`.env`)

These are not in Git, so you create them by hand. Section 10 lists every setting. Ask a developer for the secret values.

```bash
nano ~/EVA/apps/backend/.env
nano ~/EVA/apps/client/.env
nano ~/EVA/apps/ai-server/.env
```

Save in nano with **Ctrl+O**, press Enter, then exit with **Ctrl+X**.

### Step 5: Install and build the frontend and backend

```bash
cd ~/EVA/apps/backend
npm ci
npm run build

cd ~/EVA/apps/client
npm ci
npm run build
```

### Step 6: Create the Python environment for the AI server

The AI server is Python, so it gets its own private environment. Create it once:

```bash
cd ~/EVA/apps/ai-server
python3.12 -m venv .venv        # creates the environment (first time only)
source .venv/bin/activate       # turns it on; the prompt now starts with (.venv)
pip install -r requirements.txt # installs the AI server's packages (takes several minutes)
```

> Do not copy the `venv` or `.venv` folders from a Windows computer. They do not work on Linux. Always create a fresh one on the server.

### Step 7: Start all three programs in screen

Run each block, then detach with **Ctrl+A**, then **d**, before starting the next one.

```bash
# 1) Backend
screen -S eva-backend
cd ~/EVA/apps/backend
npm run start:prod
#    now press Ctrl+A, then d

# 2) Frontend
screen -S eva-frontend
cd ~/EVA/apps/client
npm run start
#    now press Ctrl+A, then d

# 3) AI server (private)
screen -S eva-ai
cd ~/EVA/apps/ai-server
source .venv/bin/activate
uvicorn main:app --host 127.0.0.1 --port 8000
#    now press Ctrl+A, then d
```

Finally run `screen -ls` (all three should say Detached), then do the 2-minute check in section 2.

### Step 8: Network access

Make sure the server's web gateway forwards `https://eva-uat.ispace.com` to port **5173** and `https://eva-api-uat.ispace.com` to port **3000**. Do **not** open port **8000** (AI server) or **27017** (database) to the internet.

---

## 10. Settings reference (`.env` files)

Settings files are private and live only on the server. They are not updated by `git pull`. Never share them or paste them in chats or emails because they contain passwords and keys.

### 10.1 Frontend: `~/EVA/apps/client/.env`

```
VITE_BACKEND_URL=https://eva-api-uat.ispace.com
VITE_CHAT_BACKEND_URL=https://eva-api-uat.ispace.com
```

After any change here you must run `npm run build` again, then restart the frontend.

### 10.2 Backend: `~/EVA/apps/backend/.env`

Settings that matter for the links (UAT values):

| Setting | UAT value | Notes |
| --- | --- | --- |
| `NODE_ENV` | `production` | Turns on the strict safety checks. |
| `PORT` | `3000` | |
| `BACKEND_URL` | `https://eva-api-uat.ispace.com` | Must start with `https://`. Twilio uses this address to reach the backend, so it must be the public link. |
| `CORS_ORIGINS` | `https://eva-uat.ispace.com` | The website allowed to call the backend. No trailing slash. |
| `AI_SERVER_URL` | `http://127.0.0.1:8000` | The private AI server on the same machine. |
| `AI_SERVICE_TOKEN` | a long random secret | Required in production. Must be **identical** to the one in the AI server's `.env`. |
| `TRUST_PROXY` | `true` if the server sits behind a gateway | Lets the backend see real visitor addresses. Ask whoever configured the gateway. |

Other settings (values are secret, ask a developer): `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `SSN_ENCRYPTION_KEY`, `LOGIN_RSA_PRIVATE_KEY`, `VERIFICATIONS_API_TOKEN`, `SABRINA_API_URL` (must be `https://`), `SABRINA_LOGIN_API_URL`, `SABRINA_USERNAME`, `SABRINA_PASSWORD`, `SABRINA_VERIFICATION_CODE`, `SABRINA_SUBSCRIPTION_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_IVR_PHONE_NUMBER`, `IVR_AGENT_PHONE_NUMBER`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`.

> The backend reads this file from the folder you start it in. Always `cd ~/EVA/apps/backend` before `npm run start:prod`.

### 10.3 AI server: `~/EVA/apps/ai-server/.env`

| Setting | Value |
| --- | --- |
| `PROVIDER` | `gemini` |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` | Secret keys |
| `EMBEDDER` | `all-MiniLM-L6-v2` |
| `QDRANT_URL` | Your Qdrant Cloud address |
| `QDRANT_API_KEY` | Secret key. **Type it in capital letters exactly like this.** On Linux, `QDrant_API_KEY` is a different name and will be ignored. |
| `COLLECTION` | `kb_default` |
| `AI_SERVICE_TOKEN` | Same value as the backend's `AI_SERVICE_TOKEN` |
| `AI_REQUIRE_AUTH` | `true` (recommended) |

To make a random secret for `AI_SERVICE_TOKEN`: `openssl rand -base64 48`. Copy the same value into both files.

---

## 11. Optional extras (for technical staff)

**Auto-start after reboot.** Screen sessions disappear when the server restarts. To start them automatically, run `crontab -e` and add (replace `<user>` and check `which npm`):

```
@reboot cd /home/<user>/EVA/apps/backend && /usr/bin/screen -dmS eva-backend /usr/bin/npm run start:prod
@reboot cd /home/<user>/EVA/apps/client && /usr/bin/screen -dmS eva-frontend /usr/bin/npm run start
@reboot cd /home/<user>/EVA/apps/ai-server && /usr/bin/screen -dmS eva-ai /home/<user>/EVA/apps/ai-server/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
```

For automatic restart after crashes too, use `systemd` or `pm2` instead of screen.

**Docker.** The repo has Dockerfiles for the backend and AI server and a `docker-compose.yaml` that publishes services on `127.0.0.1` only. The current UAT setup does not use it. Start it with `docker compose up -d --build` from `~/EVA`.

**Security notes found while preparing this guide:**

- The local `.env` files on developer machines contain real secrets in plain text, including the database password. The frontend's `.env` also contains an ElevenLabs key that the frontend never uses. Remove it, and rotate any secret that has been shared.
- The built frontend (`apps/client/dist`) in a developer's folder was built against `http://localhost:3000`. Never copy `dist` between computers. Always build on the server.
- The API documentation page (Swagger) is turned off when `NODE_ENV=production`. This is intentional.

---

## 12. One-page cheat sheet

**Links**

- Frontend: https://eva-uat.ispace.com/
- Backend: https://eva-api-uat.ispace.com/ (shows `Hello World!`)
- AI server: private, `http://127.0.0.1:8000` (server only)

**Update everything**

```bash
cd ~/EVA
git pull origin EVA-testing-V2

cd ~/EVA/apps/backend && npm run build
cd ~/EVA/apps/client  && npm run build

screen -r eva-backend     # Ctrl+C  ->  cd ~/EVA/apps/backend && npm run start:prod   ->  Ctrl+A, d
screen -r eva-frontend    # Ctrl+C  ->  cd ~/EVA/apps/client  && npm run start        ->  Ctrl+A, d
screen -r eva-ai          # Ctrl+C  ->  cd ~/EVA/apps/ai-server && source .venv/bin/activate
                          #             uvicorn main:app --host 127.0.0.1 --port 8000  ->  Ctrl+A, d
```

**Check**

```bash
screen -ls                                  # three sessions, all "Detached"
curl http://127.0.0.1:8000/                 # {"status":"ok"}
ss -ltnp | grep -E ':(3000|5173|8000)\b'    # ports in use
```

**Keys**

| Keys | Effect |
| --- | --- |
| **Ctrl+C** | Stop the running program |
| **Ctrl+A**, then **d** | Leave the session, keep the program running |
| **Ctrl+A**, then **[** | Scroll up to read logs (**Esc** to exit) |

**Remember**

1. Build (`npm run build`) after every `git pull` that changed frontend or backend code.
2. Frontend address changes need a rebuild. Backend settings changes need only a restart.
3. Always detach with **Ctrl+A**, **d**. Never close a session with `exit`.
4. The AI server always runs with `--host 127.0.0.1` and with `(.venv)` active.
5. If unsure, do not guess. Copy the last 20 lines from the screen and send them to a developer.
