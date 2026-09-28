FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl python3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# Static generation must not require or embed production database credentials.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    APP_ORIGIN=http://localhost:3000 \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build \
  && mkdir -p /home/node/.invision-u-secrets \
  && chown -R node:node /app /home/node/.invision-u-secrets

ENV NODE_ENV=production PORT=3000 HOME=/home/node
USER node
EXPOSE 3000

# Runtime DATABASE_URL and APP_ORIGIN are supplied by the deployment environment.
CMD ["sh", "-c", "npm run db:migrate && npm run start:container"]
