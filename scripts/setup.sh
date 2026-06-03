#!/usr/bin/env bash
#
# 一键部署脚本 — 从零到可用的 RAG 系统
#
# 用法:
#   chmod +x scripts/setup.sh
#   bash scripts/setup.sh
#
# 环境要求: Docker Desktop (WSL2 GPU 支持), NVIDIA GPU (8GB+ VRAM), Python 3.10+
#

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=========================================="
echo "  企业级 RAG 系统 — 一键部署"
echo "=========================================="
echo ""

# ── 1. .env 检查 ──────────────────────────────────────────
if [ ! -f .env ]; then
    echo "📋 未检测到 .env 文件，从 .env.example 复制..."
    cp .env.example .env
    echo ""
    echo "⚠️  请编辑 .env 文件，填入你的 LLM API Key:"
    echo "   LLM_API_KEY=sk-your-api-key-here"
    echo ""
    read -p "按回车键继续（编辑完 .env 后）..." _ </dev/tty || true
fi

# ── 2. PyTorch wheel 检查 ──────────────────────────────────
if ! ls backend/whl/torch-*.whl >/dev/null 2>&1; then
    echo ""
    echo "❌ 缺少 PyTorch CUDA wheel 文件！"
    echo "   请从 https://download.pytorch.org/whl/cu124 下载："
    echo "   torch-2.5.1+cu124-cp312-cp312-linux_x86_64.whl"
    echo "   放入 backend/whl/ 目录后重新运行。"
    echo ""
    exit 1
fi
echo "✅ PyTorch CUDA wheel 已就绪"

# ── 3. 模型文件检查 ────────────────────────────────────────
if [ ! -d "models/bge-m3" ] || [ ! -f "models/bge-m3/config.json" ]; then
    echo ""
    echo "📥 模型文件未就绪，开始下载..."
    echo "   (bge-m3 ~2GB + bge-reranker-v2-m3 ~1GB，首次下载约需 5-15 分钟)"
    echo ""

    # Prefer huggingface-cli if available
    if command -v huggingface-cli &>/dev/null; then
        huggingface-cli download BAAI/bge-m3                --local-dir models/bge-m3                --local-dir-use-symlinks False
        huggingface-cli download BAAI/bge-reranker-v2-m3     --local-dir models/bge-reranker-v2-m3     --local-dir-use-symlinks False
    else
        # Fall back to Python script
        if python3 -c "import huggingface_hub" 2>/dev/null; then
            python3 scripts/download_models.py
        else
            echo "📦 安装 huggingface_hub ..."
            pip install huggingface_hub
            python3 scripts/download_models.py
        fi
    fi
fi

# ── 4. Docker Compose 启动 ─────────────────────────────────
echo ""
echo "🐳 启动 Docker 服务..."

if docker compose version &>/dev/null; then
    DOCKER_COMPOSE="docker compose"
elif command -v docker-compose &>/dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    echo "❌ 未检测到 Docker Compose，请先安装 Docker Desktop"
    exit 1
fi

$DOCKER_COMPOSE up -d --build

echo ""
echo "⏳ 等待服务就绪..."

# Wait for backend health
MAX_WAIT=60
ELAPSED=0
while [ $ELAPSED -lt $MAX_WAIT ]; do
    if curl -sf http://localhost:8000/api/health/db > /dev/null 2>&1; then
        echo "✅ 后端已就绪"
        break
    fi
    sleep 2
    ELAPSED=$((ELAPSED + 2))
done

if [ $ELAPSED -ge $MAX_WAIT ]; then
    echo "⚠️  后端启动超时，请运行 docker compose logs backend 查看日志"
    exit 1
fi

# ── 5. 数据库初始化 ────────────────────────────────────────
echo ""
echo "🗄️  初始化种子数据..."
$DOCKER_COMPOSE exec -T backend PYTHONPATH=/app python app/db/seed.py 2>&1 | head -5 || {
    echo "⚠️  种子数据初始化可能已跳过（已有数据时会自动跳过）"
}

# ── 6. 完成 ────────────────────────────────────────────────
echo ""
echo "=========================================="
echo "  🎉 部署完成！"
echo "=========================================="
echo ""
echo "  前端:         http://localhost:3000"
echo "  Swagger:      http://localhost:8000/docs"
echo "  MinIO Console: http://localhost:9001"
echo ""
echo "  登录账号: superadmin / admin123"
echo ""
echo "  常用命令:"
echo "    docker compose ps            查看服务状态"
echo "    docker compose logs backend  后端日志"
echo "    docker compose logs worker   Worker 日志"
echo "    docker compose restart backend  重启后端"
echo ""
