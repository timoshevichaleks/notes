FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npx nest build notes
CMD ["node", "dist/apps/notes/main.js"]
