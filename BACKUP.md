# 备份与恢复方案

> RAG 系统数据备份策略。第一版编写方案，自动化脚本在后续版本实现。

## 数据资产清单

| 数据 | 存储位置 | 重要性 | 备份频率建议 |
|------|---------|--------|-------------|
| PostgreSQL | Docker volume `postgres_data` | 高（用户、文档、配置、会话） | 每日全量 + WAL 增量 |
| MinIO 文件 | Docker volume `minio_data` | 高（上传的原始文档） | 每日增量 |
| Milvus 向量 | Docker volume `milvus_data` | 中（可从 chunks 重建） | 每周 |
| 配置文件 | `.env`, `docker-compose.yml` | 高 | 每次修改后 |
| 日志文件 | `backend/logs/` | 低 | 按天归档 |

## PostgreSQL 备份

### 全量备份

```bash
# 每日凌晨 3:00 执行（crontab）
docker compose exec -T postgres pg_dump -U raguser ragsystem > /backup/postgres/ragsystem_$(date +%Y%m%d).sql

# 压缩
gzip /backup/postgres/ragsystem_$(date +%Y%m%d).sql
```

### 恢复

```bash
# 1. 停止应用
docker compose stop backend worker

# 2. 恢复数据库
docker compose exec -T postgres psql -U raguser ragsystem < /backup/postgres/ragsystem_20260601.sql

# 3. 重启
docker compose start backend worker
```

### 保留策略

- 保留最近 7 天每日备份
- 保留最近 4 周每周备份
- 保留最近 6 个月每月备份

## MinIO 文件备份

### mc 客户端增量备份

```bash
# 安装 mc 客户端
wget https://dl.min.io/client/mc/release/linux-amd64/mc
chmod +x mc

# 配置 MinIO 别名
mc alias set ragsystem http://localhost:9000 $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD

# 每日增量镜像
mc mirror ragsystem/rag-documents /backup/minio/rag-documents/
```

### 恢复

```bash
mc mirror /backup/minio/rag-documents/ ragsystem/rag-documents/
```

## Milvus 向量数据备份

```bash
# 导出 collection 数据（需 pymilvus）
python -c "
from pymilvus import connections, Collection, utility
connections.connect(host='localhost', port='19530')
# 使用 Milvus backup tool 或导出为 numpy
"

# 替代方案：从 chunks 表重建向量
# embedding_service + index_worker.py 可重新生成全部向量
```

## 配置文件备份

```bash
# 备份关键配置
cp .env /backup/config/.env.$(date +%Y%m%d)
cp docker-compose.yml /backup/config/docker-compose.yml.$(date +%Y%m%d)
```

## 建议备份目录结构

```
/backup/
├── postgres/
│   ├── ragsystem_20260601.sql.gz
│   └── ragsystem_20260602.sql.gz
├── minio/
│   └── rag-documents/
├── milvus/
├── config/
└── logs/
```

## Docker Volume 直接备份

```bash
# 查看 volume 路径
docker volume inspect ragsystem_postgres_data

# 直接打包 volume
tar -czf /backup/volumes/postgres_data_$(date +%Y%m%d).tar.gz \
  /var/lib/docker/volumes/ragsystem_postgres_data/_data/
```

## 灾难恢复流程

1. 恢复 `.env` 和 `docker-compose.yml` 配置
2. 启动基础服务: `docker compose up -d postgres minio milvus redis`
3. 恢复 PostgreSQL: `psql < backup.sql`
4. 恢复 MinIO 文件: `mc mirror`
5. 启动全部服务: `docker compose up -d`
6. 验证: 访问 `http://localhost:3000`，确认登录和问答正常
