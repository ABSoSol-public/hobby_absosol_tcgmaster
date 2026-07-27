FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
# .template statt direkt nach conf.d — das offizielle nginx-Image ersetzt darin
# ${VAR}-Platzhalter per envsubst beim Start (z. B. ${FORCE_HTTPS}); echte
# nginx-Variablen wie $host bleiben unangetastet, da sie keine echten Env-Vars sind.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 80
