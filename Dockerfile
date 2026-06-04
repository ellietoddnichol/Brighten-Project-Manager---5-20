FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY api/package.json api/package-lock.json ./api/
RUN npm ci --prefix api

COPY . .

ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npm run build
RUN npm run build --prefix api

FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV API_PORT=8080
ENV APP_STATIC_DIR=/app/public

COPY api/package.json api/package-lock.json ./api/
RUN npm ci --prefix api --omit=dev

COPY --from=build /app/api/dist ./api/dist
COPY --from=build /app/dist/app/browser ./public

EXPOSE 8080

CMD ["node", "api/dist/server.js"]
