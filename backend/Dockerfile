FROM node:22-bookworm-slim AS production-dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim AS test

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY test ./test
COPY migrations ./migrations
COPY scripts ./scripts
RUN npm test

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY src ./src
COPY migrations ./migrations
COPY scripts ./scripts
USER node
EXPOSE 8000
CMD ["node", "src/server.js"]
