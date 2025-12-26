# Build frontend
FROM node:18-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend .
RUN npm run build

# Final image with Python backend and Node runtime for Next.js
FROM node:18-slim
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV NODE_ENV=production

RUN apt-get update \
    && apt-get install -y python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip3 install --no-cache-dir -r requirements.txt

COPY app app
COPY config config
COPY azure-deploy.sh ./
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Frontend runtime artifacts
COPY --from=frontend-builder /app/frontend/package*.json frontend/
COPY --from=frontend-builder /app/frontend/node_modules frontend/node_modules
COPY --from=frontend-builder /app/frontend/.next frontend/.next
COPY --from=frontend-builder /app/frontend/public frontend/public
COPY --from=frontend-builder /app/frontend/next.config.js frontend/next.config.js
COPY --from=frontend-builder /app/frontend/tsconfig.json frontend/tsconfig.json
COPY --from=frontend-builder /app/frontend/app frontend/app

EXPOSE 8000 3000
CMD ["./docker-entrypoint.sh"]
