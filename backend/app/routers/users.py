from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserResponse, UserUpdate
from app.auth import get_current_active_user, get_password_hash
from app.models.user import UserRole
from app.auth import get_current_user
from app.services.audit_log_service import emit_audit_log, get_client_ip

router = APIRouter(
    prefix="/users",
    tags=["users"]
)

@router.post("/", response_model=UserResponse)
def create_user(user: UserCreate, request: Request, bg: BackgroundTasks, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorized to create users")
    db_user = db.query(User).filter(User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    hashed_password = get_password_hash(user.password)
    new_user = User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password,
        role=user.role
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    bg.add_task(emit_audit_log, current_user.username, "CREATE_USER", "User", str(new_user.id), f"Created user '{new_user.username}' with role {new_user.role}", get_client_ip(request))
    return new_user

@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: User = Depends(get_current_active_user)):
    return current_user

@router.get("/", response_model=List[UserResponse])
def read_users(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    # Restrict user listing to Admins only
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorized to list users")
    users = db.query(User).offset(skip).limit(limit).all()
    return users

@router.put("/{user_id}", response_model=UserResponse)
def update_user(user_id: int, user_update: UserUpdate, request: Request, bg: BackgroundTasks, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorized to update users")
    
    db_user = db.query(User).filter(User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # H11: Prevent demoting/deactivating the last active administrator
    is_demoting_or_deactivating_admin = (
        db_user.role == UserRole.ADMIN 
        and (
            (user_update.role and user_update.role != UserRole.ADMIN) 
            or (user_update.is_active is False)
        )
    )
    if is_demoting_or_deactivating_admin:
        active_admins_count = db.query(User).filter(
            User.role == UserRole.ADMIN,
            User.is_active == True
        ).count()
        if active_admins_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot demote or deactivate the last active administrator."
            )

    if user_update.email:
        db_user.email = user_update.email
    if user_update.role:
        db_user.role = user_update.role
    if user_update.is_active is not None:
        db_user.is_active = user_update.is_active
        
    db.commit()
    db.refresh(db_user)
    bg.add_task(emit_audit_log, current_user.username, "UPDATE_USER", "User", str(db_user.id), f"Updated user '{db_user.username}'", get_client_ip(request))
    return db_user

@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, request: Request, bg: BackgroundTasks, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorized to delete users")
        
    db_user = db.query(User).filter(User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Prevent deleting yourself
    if db_user.id == current_user.id:
         raise HTTPException(status_code=400, detail="Cannot delete your own account")

    # H11: Prevent deleting the last active administrator
    if db_user.role == UserRole.ADMIN and db_user.is_active:
        active_admins_count = db.query(User).filter(
            User.role == UserRole.ADMIN,
            User.is_active == True
        ).count()
        if active_admins_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete the last active administrator."
            )

    deleted_username = db_user.username
    db.delete(db_user)
    db.commit()
    bg.add_task(emit_audit_log, current_user.username, "DELETE_USER", "User", str(user_id), f"Deleted user '{deleted_username}'", get_client_ip(request))
    return None
