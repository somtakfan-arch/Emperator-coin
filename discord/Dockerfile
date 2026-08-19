FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
# Данные бота (заявки, выговоры, активность). На хостинге подключи сюда volume.
VOLUME ["/app/data"]
CMD ["node", "src/bot.js"]
