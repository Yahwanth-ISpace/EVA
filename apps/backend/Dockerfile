# apps/backend/Dockerfile

FROM node:22-alpine

RUN apk add --no-cache ffmpeg \
  && addgroup -S app \
  && adduser -S app -G app

WORKDIR /app

COPY package*.json ./
RUN npm ci \
  && mkdir -p uploads \
  && chown -R app:app /app

COPY . .
RUN npx prisma generate --schema=./prisma/schema.prisma \
  && npm run build \
  && chown -R app:app /app

USER app

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
