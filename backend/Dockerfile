FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY knexfile.js ./knexfile.js
COPY migrations ./migrations

EXPOSE 3001
CMD sh -c "npx knex migrate:latest && node dist/server.js"
