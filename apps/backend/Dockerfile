# apps/backend/Dockerfile

FROM node:20-alpine

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

# Expose NestJS default port
EXPOSE 3000

# Start the production build (assumes you've prebuilt with tsc)
CMD ["npm", "run", "start:prod"]
