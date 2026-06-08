"""KB 访问解析 — 通过 UserKBOverride 和 DepartmentKBOverride 控制用户对知识库的查询权限

优先级：用户级 override > 部门级 override > 默认允许
"""

from sqlalchemy import select

from app.db.session import AsyncSession
from app.db.models import User, KnowledgeBase, UserKBOverride, DepartmentKBOverride
from app.db.models.associations import department_members


async def get_accessible_kb_ids(
    user: User,
    permission_type: str,
    db: AsyncSession,
) -> list[str]:
    """返回用户有权以 permission_type 访问的企业 KB ID 列表。

    规则（按优先级）：
    1. Admin/SuperAdmin → 全部 KB
    2. 用户级 UserKBOverride.deny → 禁止（最高优先级）
    3. 用户级 UserKBOverride.allow → 允许（覆盖部门拒绝）
    4. 部门级 DepartmentKBOverride：多部门中任一 allow 即允许，全部 deny 则拒绝
    5. 默认：所有登录用户可查询所有企业 KB
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

    has_admin = any(p.code == "manage_knowledge_base" for r in (user.roles or []) for p in (r.permissions or []))
    if has_admin:
        return all_kb_ids

    # 收集用户所属部门 ID（主部门 + 多部门成员）
    dept_ids = []
    if user.department_id:
        dept_ids.append(user.department_id)
    dept_member_result = await db.execute(
        select(department_members.c.department_id).where(
            department_members.c.user_id == user.id
        )
    )
    for (did,) in dept_member_result.fetchall():
        if did not in dept_ids:
            dept_ids.append(did)

    # 部门级覆盖
    dept_deny: set[str] = set()
    dept_allow: set[str] = set()
    if dept_ids:
        dept_override_result = await db.execute(
            select(DepartmentKBOverride).where(
                DepartmentKBOverride.department_id.in_(dept_ids)
            )
        )
        for ov in dept_override_result.scalars().all():
            if ov.override_type == "deny":
                dept_deny.add(ov.knowledge_base_id)
            elif ov.override_type == "allow":
                dept_allow.add(ov.knowledge_base_id)

    # 用户级覆盖
    user_override_result = await db.execute(
        select(UserKBOverride).where(UserKBOverride.user_id == user.id)
    )
    user_deny: set[str] = set()
    user_allow: set[str] = set()
    for ov in user_override_result.scalars().all():
        if ov.override_type == "deny":
            user_deny.add(ov.knowledge_base_id)
        elif ov.override_type == "allow":
            user_allow.add(ov.knowledge_base_id)

    # 构建可访问列表，按优先级：用户 > 部门 > 默认
    accessible: list[str] = []
    for kb_id in all_kb_ids:
        if kb_id in user_deny:
            continue
        if kb_id in user_allow:
            accessible.append(kb_id)
            continue
        # 部门级：任一部门 allow 即放行，否则有 deny 则拒绝
        if kb_id in dept_deny and kb_id not in dept_allow:
            continue
        accessible.append(kb_id)

    return accessible
