"""KB 访问解析 — 通过 UserKBOverride 控制用户对知识库的查询权限"""
from sqlalchemy import select

from app.db.session import AsyncSession
from app.db.models import User
from app.db.models.knowledge_base import KnowledgeBase, UserKBOverride


async def get_accessible_kb_ids(
    user: User,
    permission_type: str,
    db: AsyncSession,
) -> list[str]:
    """返回用户有权以 permission_type 访问的企业 KB ID 列表。

    规则：
    1. Admin/SuperAdmin → 全部 KB
    2. 默认：所有登录用户可查询所有企业 KB
    3. UserKBOverride.deny → 禁止该用户查询
    4. UserKBOverride.allow → 显式允许（优先级高于 deny 的默认，但这里仅用于显式放行）
    """
    all_result = await db.execute(
        select(KnowledgeBase.id).where(
            KnowledgeBase.type == "enterprise",
            KnowledgeBase.is_active == True,
        )
    )
    all_kb_ids = [row[0] for row in all_result.fetchall()]
    if not all_kb_ids:
        return []

    role_names = [r.name for r in (user.roles or [])]
    if "SuperAdmin" in role_names or "Admin" in role_names:
        return all_kb_ids

    # 用户覆盖
    override_result = await db.execute(
        select(UserKBOverride).where(UserKBOverride.user_id == user.id)
    )
    deny_ids = set()
    allow_ids = set()
    for ov in override_result.scalars().all():
        if ov.override_type == "deny":
            deny_ids.add(ov.knowledge_base_id)
        elif ov.override_type == "allow":
            allow_ids.add(ov.knowledge_base_id)

    accessible = []
    for kb_id in all_kb_ids:
        if kb_id in deny_ids:
            continue
        accessible.append(kb_id)

    for kb_id in allow_ids:
        if kb_id not in accessible and kb_id in all_kb_ids:
            accessible.append(kb_id)

    return accessible
