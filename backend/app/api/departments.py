from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.core.security import get_current_user, require_role
from app.db.session import AsyncSession, get_db
from app.db.models import Department, User
from app.schemas.department import DepartmentCreate, DepartmentUpdate, DepartmentResponse, MemberAdd, MemberBrief

router = APIRouter(prefix="/api/departments", tags=["departments"])


async def _build_dept_dict(db: AsyncSession, dept: Department) -> dict:
    """单部门构建，内部委托批量方法（避免 N+1）。"""
    enriched = await _enrich_depts(db, [dept])
    return enriched[0]


async def _enrich_depts(db: AsyncSession, depts: list[Department]) -> list[dict]:
    """批量构建部门响应，一次 GROUP BY 查询所有 user_count。"""
    dept_ids = [d.id for d in depts]

    user_counts = {}
    if dept_ids:
        rows = await db.execute(
            select(User.department_id, func.count(User.id))
            .where(User.department_id.in_(dept_ids))
            .group_by(User.department_id)
        )
        user_counts = {row[0]: row[1] for row in rows.fetchall()}

    results = []
    for d in depts:
        member_briefs = [
            MemberBrief(id=u.id, username=u.username, email=u.email)
            for u in (d.members or [])
        ]
        results.append({
            "id": d.id, "name": d.name, "description": d.description,
            "parent_id": d.parent_id, "is_active": d.is_active,
            "created_at": d.created_at,
            "members": member_briefs, "user_count": user_counts.get(d.id, 0),
        })
    return results


@router.get("", response_model=list[DepartmentResponse])
async def list_departments(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Department).options(
            selectinload(Department.children),
            selectinload(Department.members),
        ).order_by(Department.created_at)
    )
    depts = result.scalars().all()
    return [DepartmentResponse(**d) for d in await _enrich_depts(db, depts)]


@router.post("", response_model=DepartmentResponse, status_code=status.HTTP_201_CREATED)
async def create_department(
    data: DepartmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_role("SuperAdmin", "Admin")),
):
    existing = await db.execute(select(Department).where(Department.name == data.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="部门名称已存在")

    dept = Department(**data.model_dump())
    db.add(dept)
    await db.commit()
    await db.refresh(dept)
    return DepartmentResponse(**(await _build_dept_dict(db, dept)))


@router.get("/{dept_id}", response_model=DepartmentResponse)
async def get_department(
    dept_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Department).options(
            selectinload(Department.children),
            selectinload(Department.members),
        ).where(Department.id == dept_id)
    )
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="部门不存在")
    return DepartmentResponse(**(await _build_dept_dict(db, dept)))


@router.patch("/{dept_id}", response_model=DepartmentResponse)
async def update_department(
    dept_id: str,
    data: DepartmentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_role("SuperAdmin", "Admin")),
):
    result = await db.execute(
        select(Department).options(
            selectinload(Department.children),
            selectinload(Department.members),
        ).where(Department.id == dept_id)
    )
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="部门不存在")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(dept, key, value)

    await db.commit()
    await db.refresh(dept)
    return DepartmentResponse(**(await _build_dept_dict(db, dept)))


@router.delete("/{dept_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_department(
    dept_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_role("SuperAdmin", "Admin")),
):
    result = await db.execute(select(Department).where(Department.id == dept_id))
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="部门不存在")

    await db.delete(dept)
    await db.commit()


@router.post("/{dept_id}/members", status_code=status.HTTP_200_OK)
async def add_member(
    dept_id: str,
    data: MemberAdd,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Department).options(selectinload(Department.members)).where(Department.id == dept_id)
    )
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="部门不存在")

    user_result = await db.execute(select(User).where(User.id == data.user_id))
    member = user_result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    if member in dept.members:
        return {"message": "用户已在部门中"}

    dept.members.append(member)
    await db.commit()
    return {"message": "成员已添加"}


@router.delete("/{dept_id}/members/{user_id}", status_code=status.HTTP_200_OK)
async def remove_member(
    dept_id: str,
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Department).options(selectinload(Department.members)).where(Department.id == dept_id)
    )
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="部门不存在")

    user_result = await db.execute(select(User).where(User.id == user_id))
    member = user_result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    if member in dept.members:
        dept.members.remove(member)
        await db.commit()

    return {"message": "成员已移除"}
