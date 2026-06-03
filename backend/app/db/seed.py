"""
种子数据脚本：创建/更新默认角色、权限和用户。
运行: docker compose exec backend PYTHONPATH=/app python app/db/seed.py

每次运行时会比较代码中的 SEED_VERSION 与 DB 中已存储的版本：
- 版本相同 → 跳过
- 新版本更高 → 增量更新（insert/update），不删除已有数据
- 首次运行 → 全量创建
"""
import uuid
import logging

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.session import sync_engine, Base
from app.db.models import User, Role, Permission, SystemConfig

logger = logging.getLogger("seed")

SEED_VERSION = 1

ROLE_PERMISSIONS: dict[str, list[str]] = {
    "SuperAdmin": [
        "manage_user", "manage_department", "manage_knowledge_base",
        "upload_document", "review_document", "publish_document",
        "query_knowledge_base", "manage_model_config", "view_audit_logs",
    ],
    "Admin": [
        "manage_user", "manage_department", "manage_knowledge_base",
        "manage_model_config", "view_audit_logs", "query_knowledge_base",
    ],
    "Reviewer": [
        "review_document", "publish_document", "query_knowledge_base",
    ],
    "User": [
        "query_knowledge_base",
    ],
    "userin": [
        "query_knowledge_base",
    ],
}

PERMISSION_DESCRIPTIONS: dict[str, str] = {
    "manage_user": "管理用户",
    "manage_department": "管理部门",
    "manage_knowledge_base": "管理知识库",
    "upload_document": "上传文档",
    "review_document": "审核文档",
    "publish_document": "发布文档",
    "query_knowledge_base": "检索知识库",
    "manage_model_config": "管理模型配置",
    "view_audit_logs": "查看审计日志",
}

DEFAULT_USERS = [
    ("superadmin", "superadmin@ragsystem.local", "admin123", "SuperAdmin", True),
    ("admin",      "admin@ragsystem.local",      "admin123", "Admin",      False),
    ("reviewer",   "reviewer@ragsystem.local",   "reviewer123", "Reviewer",  False),
    ("user",       "user@ragsystem.local",       "user123",   "User",       False),
    ("userin",     "userin@ragsystem.local",     "userin123", "userin",     True),
]


def _get_stored_version(db: Session) -> int:
    row = db.query(SystemConfig).filter(SystemConfig.key == "seed_version").first()
    return int(row.value) if row else 0


def _set_stored_version(db: Session, version: int):
    row = db.query(SystemConfig).filter(SystemConfig.key == "seed_version").first()
    if row:
        row.value = str(version)
    else:
        db.add(SystemConfig(key="seed_version", value=str(version)))


def _seed_permissions(db: Session) -> dict[str, Permission]:
    existing = {p.code: p for p in db.query(Permission).all()}
    result: dict[str, Permission] = {}

    for code, desc in PERMISSION_DESCRIPTIONS.items():
        if code in existing:
            perm = existing[code]
            if perm.description != desc:
                perm.description = desc
            result[code] = perm
        else:
            perm = Permission(id=str(uuid.uuid4()), code=code, description=desc)
            db.add(perm)
            result[code] = perm

    return result


def _seed_roles(db: Session, perm_objs: dict[str, Permission]) -> dict[str, Role]:
    existing = {r.name: r for r in db.query(Role).all()}
    result: dict[str, Role] = {}

    for role_name, perm_codes in ROLE_PERMISSIONS.items():
        wanted_perms = {perm_objs[p] for p in perm_codes}

        if role_name in existing:
            role = existing[role_name]
            current_perm_ids = {p.id for p in role.permissions}
            wanted_perm_ids = {p.id for p in wanted_perms}
            if current_perm_ids != wanted_perm_ids:
                role.permissions = list(wanted_perms)
            result[role_name] = role
        else:
            role = Role(
                id=str(uuid.uuid4()),
                name=role_name,
                description=f"{role_name} 角色",
                permissions=list(wanted_perms),
            )
            db.add(role)
            result[role_name] = role

    return result


def _seed_users(db: Session, role_objs: dict[str, Role]):
    existing_usernames = {u.username for u in db.query(User).all()}

    for username, email, password, role_name, personal_rag in DEFAULT_USERS:
        if username in existing_usernames:
            continue
        db.add(User(
            id=str(uuid.uuid4()),
            username=username,
            email=email,
            hashed_password=hash_password(password),
            is_active=True,
            personal_rag_enabled=personal_rag,
            roles=[role_objs[role_name]],
        ))


def seed():
    Base.metadata.create_all(sync_engine)

    with Session(sync_engine) as db:
        stored = _get_stored_version(db)

        if stored >= SEED_VERSION:
            print(f"种子数据已是最新（v{stored}），跳过。")
            return

        verb = "更新" if stored > 0 else "创建"
        print(f"种子数据 {verb}中...（v{stored} → v{SEED_VERSION}）")

        perm_objs = _seed_permissions(db)
        db.flush()

        role_objs = _seed_roles(db, perm_objs)
        db.flush()

        _seed_users(db, role_objs)

        _set_stored_version(db, SEED_VERSION)
        db.commit()

        print(f"种子数据完成（v{SEED_VERSION}）。")
        print("  账号列表:")
        for username, email, password, role_name, _ in DEFAULT_USERS:
            print(f"    {role_name:11s} {username} / {password}")


if __name__ == "__main__":
    seed()
