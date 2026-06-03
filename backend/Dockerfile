FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-docker.txt requirements.txt
COPY whl/ /app/whl/

# Install torch from local wheel first (CUDA 12.4 version, 908MB downloaded separately)
RUN pip install --no-cache-dir /app/whl/torch-2.5.1+cu124-cp312-cp312-linux_x86_64.whl

# Install remaining packages from Tsinghua mirror
RUN pip config set global.index-url https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple && \
    pip install --no-cache-dir --timeout 600 --retries 5 --extra-index-url https://download.pytorch.org/whl/cu124 --trusted-host mirrors.tuna.tsinghua.edu.cn -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
