FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
ENV NODE_ENV=production BIND_HOST=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 4178
CMD ["sh","-c","node database/migrate.js && node backend/src/server.js"]
