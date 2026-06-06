"""
重建 Milvus 索引 —— schema 变更后重新 embedding 所有已发布文档

用法:
    docker compose exec backend python scripts/migrate_milvus_schema.py
    docker compose exec backend python scripts/migrate_milvus_schema.py --dry-run  # 仅检查

工作流程:
    1. 检查 Milvus collection schema 是否有 is_active 字段
    2. 若没有 → get_collection() 自动 drop & recreate
    3. 为所有 published 文档重新创建 embed 任务
    4. Worker 自动消费任务 → re-embed → insert Milvus
"""
import asyncio
import os
import sys
import uuid

_APP_ROOT = os.environ.get("APP_ROOT", "/app")
sys.path.insert(0, _APP_ROOT)

from app.services.milvus_service import connect, get_collection, COLLECTION_NAME
from app.db.session import async_session
from app.db.models.document import Document, DocStatus, DocumentProcessingTask, TaskType, TaskStatus
from sqlalchemy import select


async def check_schema() -> bool:
    """检查 collection 是否有 is_active 字段，若没有则触发重建"""
    print("=" * 60)
    print("Milvus Schema Migration Check")
    print("=" * 60)

    col = get_collection()
    existing_fields = {f.name for f in col.schema.fields}

    if "is_active" in existing_fields:
        print("[OK] is_active field already exists in Milvus schema")
        return True

    print("[INFO] is_active field NOT found. Collection has been recreated with new schema.")
    print("[INFO] Old vectors have been dropped. Need to re-index all published documents.")
    return False


async def create_reindex_tasks(dry_run: bool = False) -> int:
    """为所有已发布文档创建 embed 任务"""
    async with async_session() as db:
        result = await db.execute(
            select(Document).where(Document.status == DocStatus.published)
        )
        docs = result.scalars().all()

        if not docs:
            print("[INFO] No published documents found")
            return 0

        print(f"[INFO] Found {len(docs)} published document(s)")

        for doc in docs:
            if not doc.versions:
                continue

            version = doc.versions[0]
            if dry_run:
                print(f"  [DRY-RUN] Would create embed task for: {doc.title} (v{version.version_number})")
                continue

            task = DocumentProcessingTask(
                id=str(uuid.uuid4()),
                document_version_id=version.id,
                task_type=TaskType.embed,
                status=TaskStatus.pending,
            )
            db.add(task)
            print(f"  [CREATE] Embed task for: {doc.title} (v{version.version_number})")

        if not dry_run:
            await db.commit()
            print(f"[DONE] Created embed tasks for {len(docs)} document(s)")

    return len(docs)


async def main():
    dry_run = "--dry-run" in sys.argv
    force = "--force" in sys.argv

    try:
        has_field = await check_schema()

        if has_field and not dry_run and not force:
            print("\n[SKIP] Schema already up to date. No migration needed.")
            print("Use --dry-run to check, or --force to re-create embed tasks anyway.")
            return

        count = await create_reindex_tasks(dry_run=dry_run)

        if dry_run:
            print(f"\n[DRY-RUN] Would create {count} embed task(s)")
        else:
            print(f"\n[DONE] {count} embed task(s) created. Worker will process them automatically.")

    except Exception as e:
        print(f"[ERROR] {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
