# frontend/lims-front-v3/Dockerfile
FROM python:3.12-slim

WORKDIR /app

# フロントの静的ファイルを全部コピー
COPY . .

EXPOSE 8000

CMD ["python", "-m", "http.server", "8000"]