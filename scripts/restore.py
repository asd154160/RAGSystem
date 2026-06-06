#!/usr/bin/env python
"""
从备份恢复 — PostgreSQL + MinIO + Milvus
用法:
  python scripts/restore.py backups/2026-06-03_120000   # 全量恢复
  python scripts/restore.py --dry-run backups/2026-06-03_120000  # 校验备份完整性
  python scripts/restore.py --skip-postgres backups/...  # 仅 MinIO + Milvus
  python scripts/restore.py --confirm                    # 跳过交互确认（脚本化）

注意: Milvus embedding 向量不会直接恢复，恢复后需通过 worker 重新 embed。
      或者使用 --reindex 自动标记所有文档为待处理。
"""
import argparse
import json
import logging
import os
import subprocess
import sys
from pathlib import Path

_APP_ROOT = os.environ.get("APP_ROOT", "/app")
if _APP_ROOT not in sys.path:
    sys.path.insert(0, _APP_ROOT)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("restore")

PG_USER = os.environ.get("POSTGRES_USER", "raguser")
PG_DB   = os.environ.get("POSTGRES_DB", "ragsystem")
PG_HOST = os.environ.get("POSTGRES_HOST", "postgres")
PG_PASS = os.environ.get("POSTGRES_PASSWORD", "ragpassword")


# ── validation ───────────────────────────────────────────────

def validate_backup(backup_dir: Path) -> dict:
    """检查备份目录完整性，返回状态摘要"""
    manifest_path = backup_dir / "manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"manifest.json not found in {backup_dir}")

    status = {"valid": True, "components": {}}

    pg_dump = backup_dir / "postgres.dump"
    status["components"]["postgres"] = {
        "ok": pg_dump.exists(),
        "size": pg_dump.stat().st_size if pg_dump.exists() else 0,
        "path": str(pg_dump),
    }

    minio_dir = backup_dir / "minio"
    minio_ok = minio_dir.is_dir() and any(minio_dir.iterdir())
    status["components"]["minio"] = {
        "ok": minio_ok,
        "path": str(minio_dir) if minio_dir.is_dir() else "N/A",
    }

    milvus_dir = backup_dir / "milvus"
    milvus_ok = milvus_dir.is_dir() and any(milvus_dir.iterdir())
    status["components"]["milvus"] = {
        "ok": milvus_ok,
        "path": str(milvus_dir) if milvus_dir.is_dir() else "N/A",
    }

    status["valid"] = all(c["ok"] for c in status["components"].values())
    return status


# ── PostgreSQL ───────────────────────────────────────────────

def restore_postgres(backup_dir: Path):
    """pg_restore 从 custom format dump 恢复"""
    dump = backup_dir / "postgres.dump"
    if not dump.exists():
        raise FileNotFoundError(str(dump))

    logger.info("Restoring PostgreSQL from %s", dump)

    # 先断开所有连接（需要超级用户权限，这里用 psql 清理）
    env = os.environ.copy()
    env["PGPASSWORD"] = PG_PASS

    # terminate active connections to target DB
    term = [
        "psql", "-U", PG_USER, "-d", "postgres", "-h", PG_HOST, "-c",
        f"SELECT pg_terminate_backend(pg_stat_activity.pid) "
        f"FROM pg_stat_activity WHERE pg_stat_activity.datname = '{PG_DB}' "
        f"AND pid <> pg_backend_pid();",
    ]
    subprocess.run(term, env=env, stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)

    # drop & recreate
    for sql in [f'DROP DATABASE IF EXISTS "{PG_DB}"', f'CREATE DATABASE "{PG_DB}"']:
        r = subprocess.run(
            ["psql", "-U", PG_USER, "-d", "postgres", "-h", PG_HOST, "-c", sql],
            env=env, stderr=subprocess.PIPE, stdout=subprocess.PIPE,
        )
        if r.returncode != 0:
            raise RuntimeError(f"psql failed: {r.stderr.decode(errors='replace')}")

    # restore
    restore = [
        "pg_restore", "-U", PG_USER, "-d", PG_DB, "-h", PG_HOST,
        "--no-owner", "--no-acl", "-j", "2", str(dump),
    ]
    r = subprocess.run(restore, env=env, stderr=subprocess.PIPE)
    if r.returncode != 0:
        raise RuntimeError(f"pg_restore failed: {r.stderr.decode(errors='replace')}")
    logger.info("PostgreSQL restore complete")


# ── MinIO ────────────────────────────────────────────────────

def restore_minio(backup_dir: Path):
    """上传备份的文件到 MinIO bucket"""
    from minio import Minio
    from app.core.config import settings

    minio_dir = backup_dir / "minio"
    if not minio_dir.is_dir():
        logger.info("No MinIO backup found, skipping")
        return

    client = Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )
    if not client.bucket_exists(settings.minio_bucket):
        client.make_bucket(settings.minio_bucket)

    count = 0
    for fpath in minio_dir.rglob("*"):
        if fpath.is_file():
            object_name = str(fpath.relative_to(minio_dir)).replace("\\", "/")
            with open(fpath, "rb") as f:
                data = f.read()
            client.put_object(
                settings.minio_bucket, object_name, data, len(data),
            )
            count += 1

    logger.info("MinIO: %d objects restored to bucket '%s'", count, settings.minio_bucket)


# ── Milvus ───────────────────────────────────────────────────

def restore_milvus(backup_dir: Path):
    """
    从 JSON 文件恢复 Milvus collection schema + metadata。
    注意: embedding 向量不会恢复，需后续 worker 重新 embed。
    """
    from pymilvus import connections, Collection, utility, FieldSchema, CollectionSchema, DataType
    from app.core.config import settings

    milvus_dir = backup_dir / "milvus"
    if not milvus_dir.is_dir():
        logger.info("No Milvus backup found, skipping")
        return

    connections.connect(alias="restore", host=settings.milvus_host, port=settings.milvus_port, timeout=30)

    col_name = "rag_chunks"
    if utility.has_collection(col_name, using="restore"):
        logger.info("Dropping existing Milvus collection '%s'", col_name)
        utility.drop_collection(col_name, using="restore")

    fields = [
        FieldSchema(name="id", dtype=DataType.VARCHAR, max_length=100, is_primary=True),
        FieldSchema(name="chunk_id", dtype=DataType.VARCHAR, max_length=100),
        FieldSchema(name="document_id", dtype=DataType.VARCHAR, max_length=100),
        FieldSchema(name="knowledge_base_id", dtype=DataType.VARCHAR, max_length=100),
        FieldSchema(name="parent_chunk_id", dtype=DataType.VARCHAR, max_length=100),
        FieldSchema(name="chunk_index", dtype=DataType.INT64),
        FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=1024),
        FieldSchema(name="chunk_text", dtype=DataType.VARCHAR, max_length=65535),
        FieldSchema(name="section_title", dtype=DataType.VARCHAR, max_length=500),
    ]
    schema = CollectionSchema(fields, description="RAG Chunks Collection")
    col = Collection(col_name, schema=schema, using="restore")
    col.create_index("embedding", {
        "metric_type": "COSINE", "index_type": "IVF_FLAT", "params": {"nlist": 128},
    })
    col.load()

    # re-insert metadata (without embeddings)
    total = 0
    for fpath in sorted(milvus_dir.glob("chunks_part_*.json")):
        with open(fpath, "r", encoding="utf-8") as f:
            rows = json.load(f)

        entities = [
            [r["id"] for r in rows],
            [r["chunk_id"] for r in rows],
            [r["document_id"] for r in rows],
            [r.get("knowledge_base_id", "") for r in rows],
            [r.get("parent_chunk_id", "") for r in rows],
            [r.get("chunk_index", 0) for r in rows],
            [[0.0] * 1024 for _ in rows],  # placeholder embedding
            [r.get("chunk_text", "")[:65535] for r in rows],
            [r.get("section_title", "")[:500] for r in rows],
            [r.get("is_active", True) for r in rows],
        ]
        col.insert(entities)
        total += len(rows)
        logger.info("  Milvus: inserted %d rows (placeholder embeddings)", len(rows))

    col.flush()
    connections.disconnect("restore")
    logger.info("Milvus: %d total rows restored (re-embedding required)", total)


# ── main ─────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(description="RAG 系统备份恢复")
    p.add_argument("backup_dir", help="备份目录路径")
    p.add_argument("--dry-run", action="store_true", help="仅校验备份完整性")
    p.add_argument("--skip-postgres", action="store_true")
    p.add_argument("--skip-minio", action="store_true")
    p.add_argument("--skip-milvus", action="store_true")
    p.add_argument("--confirm", action="store_true", help="跳过交互确认")
    args = p.parse_args()

    backup_dir = Path(args.backup_dir).resolve()
    status = validate_backup(backup_dir)

    print("\n=== Backup Validation ===")
    for comp, info in status["components"].items():
        state = "OK" if info["ok"] else "MISSING"
        size = info.get("size")
        extra = f"  ({size:,} bytes)" if size else ""
        print(f"  {comp:12s} [{state}]{extra}")
    print(f"  {'OVERALL':12s} [{'VALID' if status['valid'] else 'INCOMPLETE'}]\n")

    if args.dry_run:
        return

    if not args.confirm:
        resp = input("This will DESTROY existing data. Type 'yes' to confirm: ")
        if resp.strip().lower() != "yes":
            print("Restore cancelled.")
            return

    logger.info("Restore started from %s", backup_dir)

    failures = []
    tasks = [
        ("PostgreSQL", "postgres", restore_postgres),
        ("MinIO",      "minio",    restore_minio),
        ("Milvus",     "milvus",   restore_milvus),
    ]
    for name, key, fn in tasks:
        if getattr(args, f"skip_{key}"):
            continue
        try:
            fn(backup_dir)
        except Exception as e:
            logger.error("%s restore FAILED: %s", name, e)
            failures.append((name, str(e)))

    if failures:
        logger.error("Restore completed with %d failure(s)", len(failures))
        for name, err in failures:
            logger.error("  %s: %s", name, err)
        sys.exit(1)

    logger.info("Restore complete.")
    logger.info("Next: run `alembic upgrade head` then `python -m app.db.seed` if needed.")
    logger.info("Milvus embeddings are placeholders — documents need re-embedding.")


if __name__ == "__main__":
    main()
