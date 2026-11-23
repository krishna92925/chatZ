# Build from the repository root:  docker build -f backend/Dockerfile -t chatz-api .
FROM node:22-alpine AS build
WORKDIR /app
COPY shared ./shared
COPY backend/package*.json ./backend/
RUN cd backend && npm ci
COPY backend ./backend
RUN cd backend && npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/backend/node_modules ./backend/node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/migrations ./backend/migrations
COPY --from=build /app/backend/package.json ./backend/package.json
WORKDIR /app/backend
USER node
EXPOSE 4000
CMD ["node", "dist/backend/src/server.js"]
