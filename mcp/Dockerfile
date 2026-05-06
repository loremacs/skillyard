FROM node:22-alpine

RUN apk add --no-cache python3 make g++ sqlite-dev

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/
COPY tsconfig.json ./
RUN npm install --save-dev typescript @types/node tsx
RUN npx tsc

ENV PORT=3333
ENV SKILLYARD_DIR=/skills

EXPOSE 3333

CMD ["node", "dist/index.js"]
