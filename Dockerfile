FROM node:24-bookworm-slim AS web-build
WORKDIR /src
COPY web/package.json web/package-lock.json ./web/
RUN npm --prefix web ci --include=dev
COPY web/ ./web/
COPY shared/ ./shared/
RUN npm --prefix web run build

FROM python:3.11-slim-bookworm
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
COPY requirements.txt ./
RUN python -m pip install --no-cache-dir -r requirements.txt
COPY server/ ./server/
COPY --from=web-build /src/web/dist ./web/dist
USER 10001:10001
EXPOSE 8000
CMD ["sh", "-c", "exec python -m uvicorn server.main:create_hosted_app --factory --host 0.0.0.0 --port \"${PORT:-8000}\""]
