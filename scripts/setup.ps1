# 一键部署脚本 (Windows PowerShell) — 从零到可用的 RAG 系统
# 用法: .\scripts\setup.ps1
# 环境要求: Docker Desktop, Python 3.10+

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $ROOT

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  企业级 RAG 系统 — 一键部署" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. .env 检查 ──────────────────────────────────────────
if (-not (Test-Path ".env")) {
    Write-Host "📋 未检测到 .env 文件，从 .env.example 复制..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host ""
    Write-Host "⚠️  请编辑 .env 文件，填入你的 LLM API Key:" -ForegroundColor Yellow
    Write-Host "   LLM_API_KEY=sk-your-api-key-here" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "按回车键继续（编辑完 .env 后）"
}

# ── 2. 模型文件检查 ────────────────────────────────────────
if (-not (Test-Path "models/bge-m3/config.json")) {
    Write-Host ""
    Write-Host "📥 模型文件未就绪，开始下载..." -ForegroundColor Yellow
    Write-Host "   (bge-m3 ~2GB + bge-reranker-v2-m3 ~1GB，首次约需 5-15 分钟)" -ForegroundColor Yellow
    Write-Host ""

    $hfCli = Get-Command huggingface-cli -ErrorAction SilentlyContinue
    if ($hfCli) {
        huggingface-cli download BAAI/bge-m3               --local-dir models/bge-m3               --local-dir-use-symlinks False
        huggingface-cli download BAAI/bge-reranker-v2-m3    --local-dir models/bge-reranker-v2-m3    --local-dir-use-symlinks False
    } else {
        python -c "import huggingface_hub" 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "📦 安装 huggingface_hub ..."
            pip install huggingface_hub
        }
        python scripts/download_models.py
    }
}

# ── 3. Docker Compose 启动 ─────────────────────────────────
Write-Host ""
Write-Host "🐳 启动 Docker 服务..." -ForegroundColor Cyan

# Detect docker compose (v2) vs docker-compose (v1)
$dc = $null
if (Get-Command "docker" -ErrorAction SilentlyContinue) {
    docker compose version 2>$null
    if ($LASTEXITCODE -eq 0) { $dc = "docker compose" }
}
if (-not $dc) {
    if (Get-Command "docker-compose" -ErrorAction SilentlyContinue) { $dc = "docker-compose" }
}
if (-not $dc) {
    Write-Host "❌ 未检测到 Docker Compose，请先安装 Docker Desktop" -ForegroundColor Red
    exit 1
}

Invoke-Expression "$dc up -d --build"

Write-Host ""
Write-Host "⏳ 等待服务就绪..." -ForegroundColor Yellow

$maxWait = 120
$elapsed = 0
while ($elapsed -lt $maxWait) {
    try {
        $res = Invoke-WebRequest -Uri "http://localhost:8000/api/health/db" -UseBasicParsing -TimeoutSec 2
        if ($res.StatusCode -eq 200) {
            Write-Host "✅ 后端已就绪" -ForegroundColor Green
            break
        }
    } catch {}
    Start-Sleep -Seconds 3
    $elapsed += 3
}

if ($elapsed -ge $maxWait) {
    Write-Host "⚠️  后端启动超时，请运行 docker compose logs backend 查看日志" -ForegroundColor Red
    exit 1
}

# ── 4. 数据库初始化 ────────────────────────────────────────
Write-Host ""
Write-Host "🗄️  初始化种子数据..." -ForegroundColor Cyan
Invoke-Expression "$dc exec -T backend PYTHONPATH=/app python app/db/seed.py" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  种子数据初始化可能已跳过（已有数据时会自动跳过）" -ForegroundColor Yellow
}

# ── 5. 完成 ────────────────────────────────────────────────
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  🎉 部署完成！" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  前端:         http://localhost:3000" -ForegroundColor White
Write-Host "  Swagger:      http://localhost:8000/docs" -ForegroundColor White
Write-Host "  MinIO Console: http://localhost:9001" -ForegroundColor White
Write-Host ""
Write-Host "  登录账号: superadmin / admin123" -ForegroundColor White
Write-Host ""
Write-Host "  常用命令:" -ForegroundColor Gray
Write-Host "    docker compose ps              查看服务状态"
Write-Host "    docker compose logs backend    后端日志"
Write-Host "    docker compose logs worker     Worker 日志"
Write-Host "    docker compose restart backend  重启后端"
Write-Host ""
