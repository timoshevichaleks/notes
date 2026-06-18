FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npx nest build auth
CMD ["node", "dist/apps/auth/main.js"]
