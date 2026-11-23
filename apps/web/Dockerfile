FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/ui-login/package.json packages/ui-login/package.json
COPY services/api/package.json services/api/package.json
RUN npm ci

COPY apps/web apps/web
WORKDIR /app/apps/web
ARG TMS_API_BASE_URL
ENV TMS_API_BASE_URL=$TMS_API_BASE_URL
ARG TMS_FIREBASE_API_KEY
ENV TMS_FIREBASE_API_KEY=$TMS_FIREBASE_API_KEY
ARG TMS_FIREBASE_APP_ID
ENV TMS_FIREBASE_APP_ID=$TMS_FIREBASE_APP_ID
ARG TMS_FIREBASE_PROJECT_ID
ENV TMS_FIREBASE_PROJECT_ID=$TMS_FIREBASE_PROJECT_ID
ARG TMS_FIREBASE_MESSAGING_SENDER_ID
ENV TMS_FIREBASE_MESSAGING_SENDER_ID=$TMS_FIREBASE_MESSAGING_SENDER_ID
ARG TMS_FIREBASE_AUTH_DOMAIN
ENV TMS_FIREBASE_AUTH_DOMAIN=$TMS_FIREBASE_AUTH_DOMAIN
ARG TMS_FIREBASE_WEB_VAPID_KEY
ENV TMS_FIREBASE_WEB_VAPID_KEY=$TMS_FIREBASE_WEB_VAPID_KEY
RUN npm run build

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
