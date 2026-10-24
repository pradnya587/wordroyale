FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=4002
RUN addgroup -S app && adduser -S app -G app
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn-v1.22.22 /usr/local/bin/yarn /usr/local/bin/yarnpkg
COPY --from=deps --chown=app:app /app/node_modules ./node_modules
COPY --chown=app:app package.json ./
COPY --chown=app:app src ./src
COPY --chown=app:app data ./data
USER app
EXPOSE 4002
HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=5 CMD wget -qO- http://127.0.0.1:4002/health || exit 1
CMD ["node", "src/server.js"]
