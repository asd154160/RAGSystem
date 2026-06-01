from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.security import get_current_user, require_role
from app.db.session import AsyncSession, get_db
from app.db.models import Department, User
from app.schemas.department import DepartmentCreate, DepartmentUpdate, DepartmentResponse, MemberAdd

router = APIRouter(prefix="/api/departments", tags=["departments"])


@router.get("", response_model=list[DepartmentResponse])
async def list_departments(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Department).options(selectinload(Department.children)).order_by(Department.created_at)
    )
    return result.scalars().all()


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
    return dept


@router.get("/{dept_id}", response_model=DepartmentResponse)
async def get_department(
    dept_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Department).options(selectinload(Department.children)).where(Department.id == dept_id)
    )
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="部门不存在")
    return dept


@router.patch("/{dept_id}", response_model=DepartmentResponse)
async def update_department(
    dept_id: str,
    data: DepartmentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_role("SuperAdmin", "Admin")),
):
    result = await db.execute(
        select(Department).options(selectinload(Department.children)).where(Department.id == dept_id)
    )
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="部门不存在")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(dept, key, value)

    await db.commit()
    await db.refresh(dept)
    return dept


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
