FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-docker.txt requirements.txt

# Install PyTorch (CUDA 12.4) from PyTorch index, then remaining packages from Tsinghua mirror
RUN pip install --no-cache-dir --timeout 600 --retries 5 \
    --index-url https://download.pytorch.org/whl/cu124 \
    torch==2.5.1 && \
    pip config set global.index-url https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple && \
    pip install --no-cache-dir --timeout 600 --retries 5 \
    --extra-index-url https://download.pytorch.org/whl/cu124 \
    --trusted-host mirrors.tuna.tsinghua.edu.cn \
    -r requirements.txt

COPY . .
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
