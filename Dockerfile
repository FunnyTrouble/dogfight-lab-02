FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci
COPY . .
RUN npm run build:production

FROM node:22-alpine AS runtime
ARG GIT_SHA=local
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 LOG_DIR=/tmp/dogfight-logs
ENV GIT_SHA=$GIT_SHA
WORKDIR /app
COPY package*.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist/server dist/server
COPY --from=build /app/dist/shared dist/shared
COPY --from=build /app/client/dist client/dist
COPY --from=build /app/client/public client/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/server/src/index.js"]
