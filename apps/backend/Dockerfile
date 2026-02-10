# apps/backend/Dockerfile

FROM node:20-alpine

# ffmpeg required for Media Stream: MP3→mulaw (TTS) and mulaw→WAV (transcription)
RUN apk add --no-cache ffmpeg

# Set working directory
WORKDIR /app

# Copy only package files first (leveraging Docker layer caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy remaining project files
COPY . .

# ✅ Ensure Prisma CLI is available (install it as a dev dependency if not already)
RUN npx prisma generate --schema=./prisma/schema.prisma

# 👇 Build the NestJS app
RUN npm run build

# Expose NestJS default port
EXPOSE 3000

# Start the production build (assumes you've prebuilt with tsc)
CMD ["npm", "run", "start:prod"]
