#!/usr/bin/env python
"""
全量备份 — PostgreSQL + MinIO + Milvus
用法:
  python scripts/backup.py                               # 默认输出 backups/
  python scripts/backup.py -o /backups                   # Docker 内使用
  python scripts/backup.py --dry-run                      # 仅打印计划
  python scripts/backup.py --skip-postgres --skip-minio   # 选择性备份
"""
import argparse
import json
import logging
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

# 确保 /app 在 sys.path 中（从 Docker 内运行时脚本目录可能不包含 backend 包）
_APP_ROOT = os.environ.get("APP_ROOT", "/app")
if _APP_ROOT not in sys.path:
    sys.path.insert(0, _APP_ROOT)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("backup")

PG_USER = os.environ.get("POSTGRES_USER", "raguser")
PG_DB   = os.environ.get("POSTGRES_DB", "ragsystem")
PG_HOST = os.environ.get("POSTGRES_HOST", "postgres")
PG_PASS = os.environ.get("POSTGRES_PASSWORD", "ragpassword")


def _check_file(path: Path, label: str):
    sz = path.stat().st_size
    if sz < 100:
        logger.warning("%s is very small (%d bytes) — may be incomplete", label, sz)
    else:
        logger.info("%s: %d bytes", label, sz)


# ── PostgreSQL ───────────────────────────────────────────────

def backup_postgres(output_dir: Path) -> Path:
    """pg_dump custom format (compressed, per-table restore)"""
    out = output_dir / "postgres.dump"
    logger.info("pg_dump → %s", out)

    cmd = [
        "pg_dump", "-U", PG_USER, "-d", PG_DB, "-h", PG_HOST,
        "-Fc", "--no-owner", "--no-acl",
    ]
    env = os.environ.copy()
    env["PGPASSWORD"] = PG_PASS

    with open(out, "wb") as f:
        r = subprocess.run(cmd, env=env, stdout=f, stderr=subprocess.PIPE)
    if r.returncode != 0:
        err = r.stderr.decode(errors="replace") if r.stderr else ""
        raise RuntimeError(f"pg_dump exit={r.returncode}: {err}")
    _check_file(out, "postgres.dump")
    return out


# ── MinIO ────────────────────────────────────────────────────

def backup_minio(output_dir: Path) -> Path:
    """下载 MinIO bucket 中所有对象到本地目录"""
    from minio import Minio
    from app.core.config import settings

    dest = output_dir / "minio"
    dest.mkdir(parents=True, exist_ok=True)

    client = Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )
    if not client.bucket_exists(settings.minio_bucket):
        logger.warning("Bucket '%s' not found, skipping", settings.minio_bucket)
        return dest

    count = 0
    for obj in client.list_objects(settings.minio_bucket, recursive=True):
        fpath = dest / obj.object_name
        fpath.parent.mkdir(parents=True, exist_ok=True)
        resp = client.get_object(settings.minio_bucket, obj.object_name)
        try:
            with open(fpath, "wb") as f:
                for chunk in resp.stream(65536):
                    f.write(chunk)
        finally:
            resp.close()
            resp.release_conn()
        count += 1

    logger.info("MinIO: %d objects → %s", count, dest)
    return dest


# ── Milvus ───────────────────────────────────────────────────

def backup_milvus(output_dir: Path, batch: int = 1000) -> Path:
    """导出 rag_chunks collection metadata 为 JSON"""
    from pymilvus import connections, Collection, utility
    from app.core.config import settings

    connections.connect(alias="backup", host=settings.milvus_host, port=settings.milvus_port, timeout=30)

    name = "rag_chunks"
    if not utility.has_collection(name, using="backup"):
        logger.warning("Collection '%s' not found, skipping", name)
        connections.disconnect("backup")
        return output_dir / "milvus"

    col = Collection(name, using="backup")
    col.load()
    total = col.num_entities
    logger.info("Milvus: exporting %d chunks from '%s'", total, name)

    fields = [
        "id", "chunk_id", "document_id", "knowledge_base_id",
        "parent_chunk_id", "chunk_index", "chunk_text", "section_title",
    ]

    milvus_dir = output_dir / "milvus"
    milvus_dir.mkdir(parents=True, exist_ok=True)

    all_rows = []
    offset = 0
    part = 0

    while offset < total:
        try:
            results = col.query(expr="chunk_index >= 0", output_fields=fields,
                                limit=batch, offset=offset)
        except Exception:
            results = col.query(expr="id != ''", output_fields=fields,
                                limit=batch, offset=offset)

        if not results:
            break

        for r in results:
            row = {}
            for k, v in r.items():
                if isinstance(v, bytes):
                    row[k] = v.decode("utf-8", errors="replace")
                elif isinstance(v, datetime):
                    row[k] = v.isoformat()
                else:
                    row[k] = v
            all_rows.append(row)

        offset += len(results)
        logger.info("  %d/%d chunks", offset, total)

        # flush to disk every 50000 rows to keep memory low
        if len(all_rows) >= 50000:
            _write_json(milvus_dir / f"chunks_part_{part:04d}.json", all_rows)
            all_rows = []
            part += 1

    if all_rows:
        _write_json(milvus_dir / f"chunks_part_{part:04d}.json", all_rows)

    connections.disconnect("backup")
    logger.info("Milvus: %d chunks saved → %s", total, milvus_dir)
    return milvus_dir


def _write_json(path: Path, rows: list[dict]):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, default=str)


# ── main ─────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(description="RAG 系统全量备份")
    p.add_argument("--output", "-o", help="输出目录（默认 backups/<timestamp>/）")
    p.add_argument("--skip-postgres", action="store_true")
    p.add_argument("--skip-minio", action="store_true")
    p.add_argument("--skip-milvus", action="store_true")
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    ts = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    output_dir = Path(args.output) if args.output else (
        Path(__file__).resolve().parent.parent / "backups" / ts)

    if args.dry_run:
        print(f"[DRY RUN] → {output_dir}")
        for t in ("postgres", "minio", "milvus"):
            skip = getattr(args, f"skip_{t}")
            print(f"  {t}: {'SKIP' if skip else 'backup'}")
        return

    output_dir.mkdir(parents=True, exist_ok=True)
    logger.info("Backup started → %s", output_dir)

    failures = []
    tasks = [
        ("PostgreSQL", "postgres", backup_postgres),
        ("MinIO",      "minio",    backup_minio),
        ("Milvus",     "milvus",   backup_milvus),
    ]
    for name, key, fn in tasks:
        if getattr(args, f"skip_{key}"):
            continue
        try:
            fn(output_dir)
        except Exception as e:
            logger.error("%s backup FAILED: %s", name, e)
            failures.append((name, str(e)))

    with open(output_dir / "manifest.json", "w") as f:
        json.dump({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "postgres": "skip" if args.skip_postgres else ("fail" if any(n=="PostgreSQL" for n,_ in failures) else "ok"),
            "minio":    "skip" if args.skip_minio    else ("fail" if any(n=="MinIO"      for n,_ in failures) else "ok"),
            "milvus":   "skip" if args.skip_milvus   else ("fail" if any(n=="Milvus"     for n,_ in failures) else "ok"),
        }, f, indent=2)

    if failures:
        logger.error("Backup completed with %d failure(s)", len(failures))
        sys.exit(1)
    logger.info("Backup complete → %s", output_dir)


if __name__ == "__main__":
    main()
