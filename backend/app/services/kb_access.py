"""KB 访问解析 — 根据用户身份查询 KnowledgeBasePermission 确定可访问的知识库"""
from sqlalchemy import select, or_

from app.db.session import AsyncSession
from app.db.models import User
from app.db.models.associations import department_members
from app.db.models.knowledge_base import KnowledgeBase, KnowledgeBasePermission, UserKBOverride


async def get_accessible_kb_ids(
    user: User,
    permission_type: str,
    db: AsyncSession,
) -> list[str]:
    """返回用户有权以 permission_type 访问的企业 KB ID 列表。

    解析顺序：
    1. 无任何权限配置的 KB → 全员开放
    2. 匹配 KnowledgeBasePermission（user_id / department_id / role_id）
       department_id 同时检查 FK 和 M2M 成员关系
    3. 应用 UserKBOverride（deny 剔除，allow 放行）
    """
    # 所有活跃企业 KB
    all_result = await db.execute(
        select(KnowledgeBase.id).where(
            KnowledgeBase.type == "enterprise",
            KnowledgeBase.is_active == True,
        )
    )
    all_kb_ids = [row[0] for row in all_result.fetchall()]
    if not all_kb_ids:
        return []

    # 哪些 KB 有权限配置
    perm_kb_result = await db.execute(
        select(KnowledgeBasePermission.knowledge_base_id).distinct()
    )
    kb_with_perm_ids = {row[0] for row in perm_kb_result.fetchall()}

    # Admin/SuperAdmin 拥有所有 KB 的访问权限
    role_names = [r.name for r in (user.roles or [])]
    if "SuperAdmin" in role_names or "Admin" in role_names:
        return all_kb_ids

    # 无权限配置的 KB → 全员开放
    accessible = {kb_id for kb_id in all_kb_ids if kb_id not in kb_with_perm_ids}

    # 有权限配置的 KB → 需要匹配用户身份
    if kb_with_perm_ids:
        role_ids = [r.id for r in user.roles] if user.roles else []

        # 收集用户所属的所有部门 ID（FK + M2M）
        dept_ids = []
        if user.department_id:
            dept_ids.append(user.department_id)
        m2m_result = await db.execute(
            select(department_members.c.department_id).where(
                department_members.c.user_id == user.id
            )
        )
        dept_ids.extend(row[0] for row in m2m_result.fetchall())
        dept_ids = list(set(dept_ids))

        conditions = []
        if user.id:
            conditions.append(KnowledgeBasePermission.user_id == user.id)
        if dept_ids:
            conditions.append(KnowledgeBasePermission.department_id.in_(dept_ids))
        if role_ids:
            conditions.append(KnowledgeBasePermission.role_id.in_(role_ids))

        if conditions:
            match_result = await db.execute(
                select(KnowledgeBasePermission.knowledge_base_id).where(
                    KnowledgeBasePermission.permission_type == permission_type,
                    KnowledgeBasePermission.knowledge_base_id.in_(kb_with_perm_ids),
                    or_(*conditions),
                )
            )
            accessible.update(row[0] for row in match_result.fetchall())

    # 用户级覆盖
    override_result = await db.execute(
        select(UserKBOverride).where(UserKBOverride.user_id == user.id)
    )
    for ov in override_result.scalars().all():
        if ov.override_type == "deny":
            accessible.discard(ov.knowledge_base_id)
        elif ov.override_type == "allow":
            if ov.knowledge_base_id in all_kb_ids:
                accessible.add(ov.knowledge_base_id)

    return [kb_id for kb_id in all_kb_ids if kb_id in accessible]
