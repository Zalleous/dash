# The dashboard as a container: built in one stage, run with only the production dependencies in the next.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/build build
# The settings and the timer live in /data/dash.db; links.json, if any, is mounted at /app/links.json.
RUN mkdir /data && chown node:node /data
USER node
ENV NODE_ENV=production PORT=3000 DB_PATH=/data/dash.db
EXPOSE 3000
CMD ["node", "build"]
