FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npx nest build worker
# Worker applies DB migrations once on startup, then runs the queue consumer.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/apps/worker/main.js"]
