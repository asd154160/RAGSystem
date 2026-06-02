"""
种子数据脚本：创建默认角色、权限和 SuperAdmin 用户。
运行: python app/db/seed.py
"""
import uuid

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.session import sync_engine, Base
from app.db.models import User, Department, Role, Permission

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


def seed():
    Base.metadata.create_all(sync_engine)

    with Session(sync_engine) as db:
        existing = db.query(Permission).first()
        if existing:
            print("种子数据已存在，跳过。")
            return

        perm_objs: dict[str, Permission] = {}
        for code, desc in PERMISSION_DESCRIPTIONS.items():
            perm = Permission(id=str(uuid.uuid4()), code=code, description=desc)
            db.add(perm)
            perm_objs[code] = perm
        db.flush()

        role_objs: dict[str, Role] = {}
        for role_name, perm_codes in ROLE_PERMISSIONS.items():
            role = Role(
                id=str(uuid.uuid4()),
                name=role_name,
                description=f"{role_name} 角色",
                permissions=[perm_objs[p] for p in perm_codes],
            )
            db.add(role)
            role_objs[role_name] = role
        db.flush()

        default_users = [
            ("superadmin", "superadmin@ragsystem.local", "admin123", "SuperAdmin", True),
            ("admin",      "admin@ragsystem.local",      "admin123", "Admin",      False),

            ("reviewer",   "reviewer@ragsystem.local",   "reviewer123", "Reviewer",  False),
            ("user",       "user@ragsystem.local",       "user123",   "User",       False),
            ("userin",     "userin@ragsystem.local",     "userin123", "userin",     True),
        ]
        for username, email, password, role_name, personal_rag in default_users:
            db.add(User(
                id=str(uuid.uuid4()),
                username=username,
                email=email,
                hashed_password=hash_password(password),
                is_active=True,
                personal_rag_enabled=personal_rag,
                roles=[role_objs[role_name]],
            ))

        db.commit()
        print("种子数据创建完成。")
        print("  账号列表:")
        for username, _, password, role_name, _ in default_users:
            print(f"    {role_name:11s} {username} / {password}")


if __name__ == "__main__":
    seed()
