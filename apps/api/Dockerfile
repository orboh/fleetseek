FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE ${PORT:-3001}

CMD ["node", "src/index.js"]
