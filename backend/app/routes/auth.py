from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from fastapi.security import OAuth2PasswordRequestForm
from app.services.auth_service import verify_password, hash_password, create_access_token, create_refresh_token, decode_refresh_token, generate_password_reset_token, verify_password_reset_token, send_reset_email
from app.services.token_service import store_refresh_token, verify_refresh_token, revoke_refresh_token, blacklist_token, revoke_all_user_tokens
from app.schemas.auth import TokenResponse, UserLogin, UserRegister, PasswordReset, PasswordResetConfirm, RefreshTokenRequest
from app.schemas.user import UserOut
from app.db import get_db
from app.utils.logger import log_event
from app.utils.auth import get_current_user, get_current_user_for_logout # Import new dependency
from app.services.audit_service import audit_service
from datetime import datetime, timedelta
from bson import ObjectId
from jose import JWTError, jwt
import os

router = APIRouter()

@router.post("/login", response_model=TokenResponse)
async def login(user_login: UserLogin, request: Request, response: Response):
    db = get_db()
    user = await db["users"].find_one({"email": user_login.email})
    
    # Get client info for audit logging
    ip_address = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("User-Agent", "unknown")
    
    if not user or not verify_password(user_login.password, user["hashed_password"]):
        # Log failed authentication attempt
        await audit_service.log_authentication_failure(
            email=user_login.email,
            ip_address=ip_address,
            user_agent=user_agent,
            failure_reason="Invalid credentials"
        )
        await log_event("auth_failed", {"email": user_login.email})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    
    if not user.get("isActive", True):
        # Log failed attempt due to inactive account
        await audit_service.log_authentication_failure(
            email=user_login.email,
            ip_address=ip_address,
            user_agent=user_agent,
            failure_reason="Account inactive"
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is inactive")
    
    # Update last login
    await db["users"].update_one(
        {"_id": user["_id"]}, 
        {"$set": {"lastLogin": datetime.utcnow()}}
    )
    
    # Create tokens
    user_id = str(user["_id"])
    access_token = create_access_token({"sub": user_id})
    refresh_token = create_refresh_token({"sub": user_id})
    
    # Store refresh token in database
    refresh_payload = decode_refresh_token(refresh_token)
    refresh_expires = datetime.fromtimestamp(refresh_payload["exp"])
    
    await store_refresh_token(
        user_id=user_id,
        token_id=refresh_payload["jti"],
        refresh_token=refresh_token,
        expires_at=refresh_expires,
        device_info=request.headers.get("User-Agent"),
        ip_address=request.client.host if request.client else None
    )
    
    # Determine cookie settings based on environment so that the front-end running on a different
    # port (e.g. http://localhost:8080) can still receive / send the cookie in cross-site requests.
    cookie_secure = os.getenv("COOKIE_SECURE", "false").lower() == "true"
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        max_age=7 * 24 * 60 * 60,  # 7 days
        httponly=True,
        secure=cookie_secure,
        samesite="none" if cookie_secure else "lax",
        domain=os.getenv("COOKIE_DOMAIN", None),
        path="/"
    )
    
    # Log successful authentication
    await audit_service.log_authentication_success(
        user_id=user_id,
        user_email=user["email"],
        ip_address=ip_address,
        user_agent=user_agent,
        session_id=refresh_payload["jti"]
    )
    
    await log_event("auth_success", {"user_id": user_id})
    
    # Convert MongoDB document to UserOut format
    user["_id"] = str(user["_id"]) # Ensure the aliased field is a string
    user_out = UserOut(**user)
    
    return {
        "user": user_out,
        "token": access_token,  # Frontend expects this field name
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }

@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(user: UserRegister, request: Request, response: Response):
    db = get_db()
    existing = await db["users"].find_one({"email": user.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed = hash_password(user.password)
    user_dict = user.dict(exclude={"password"})
    user_dict.update({
        "hashed_password": hashed, 
        "createdAt": datetime.utcnow(),
        "isActive": True,
        "skills": [],
        "availability": []
    })
    
    res = await db["users"].insert_one(user_dict)
    new_user = await db["users"].find_one({"_id": res.inserted_id})
    
    # Create tokens
    user_id = str(res.inserted_id)
    access_token = create_access_token({"sub": user_id})
    refresh_token = create_refresh_token({"sub": user_id})
    
    # Store refresh token in database
    refresh_payload = decode_refresh_token(refresh_token)
    refresh_expires = datetime.fromtimestamp(refresh_payload["exp"])
    
    await store_refresh_token(
        user_id=user_id,
        token_id=refresh_payload["jti"],
        refresh_token=refresh_token,
        expires_at=refresh_expires,
        device_info=request.headers.get("User-Agent"),
        ip_address=request.client.host if request.client else None
    )
    
    # Determine cookie settings based on environment so that the front-end running on a different
    # port (e.g. http://localhost:8080) can still receive / send the cookie in cross-site requests.
    cookie_secure = os.getenv("COOKIE_SECURE", "false").lower() == "true"
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        max_age=7 * 24 * 60 * 60,  # 7 days
        httponly=True,
        secure=cookie_secure,
        samesite="none" if cookie_secure else "lax",
        domain=os.getenv("COOKIE_DOMAIN", None),
        path="/"
    )
    
    await log_event("user_registered", {"user_id": user_id})
    
    # Convert MongoDB document to UserOut format
    new_user["id"] = str(new_user["_id"])
    user_out = UserOut(**new_user)
    
    return {
        "user": user_out,
        "token": access_token,  # Frontend expects this field name
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }

@router.post("/logout")
async def logout(request: Request, response: Response, current_user: dict = Depends(get_current_user_for_logout)): # Use new dependency
    import logging
    logger = logging.getLogger("uvicorn.error")
    
    # Get refresh token from cookie
    refresh_token = request.cookies.get("refresh_token")
    
    # Get access token from Authorization header
    auth_header = request.headers.get("Authorization")
    access_token = None
    if auth_header and auth_header.startswith("Bearer "):
        access_token = auth_header.split(" ")[1]
    
    user_id = str(current_user["_id"])
    
    logger.info(f"Logout called for user: {user_id}")
    
    # Blacklist access token if present
    if access_token:
        try:
            access_payload = jwt.decode(access_token, os.getenv("SECRET_KEY", "testing_secret_key_for_development_only"), algorithms=["HS256"])
            access_token_id = access_payload.get("jti")
            access_expires = datetime.fromtimestamp(access_payload["exp"])
            
            logger.info(f"Blacklisting access token jti: {access_token_id}")
            
            if access_token_id:
                await blacklist_token(
                    token_id=access_token_id,
                    token_type="access",
                    user_id=user_id,
                    expires_at=access_expires,
                    reason="logout"
                )
        except JWTError:
            pass  # Token already invalid
    
    # Revoke refresh token if present
    if refresh_token:
        try:
            refresh_payload = decode_refresh_token(refresh_token)
            refresh_token_id = refresh_payload.get("jti")
            refresh_expires = datetime.fromtimestamp(refresh_payload["exp"])
            
            logger.info(f"Blacklisting refresh token jti: {refresh_token_id}")
            
            if refresh_token_id:
                await revoke_refresh_token(refresh_token_id, user_id)
                await blacklist_token(
                    token_id=refresh_token_id,
                    token_type="refresh",
                    user_id=user_id,
                    expires_at=refresh_expires,
                    reason="logout"
                )
        except JWTError:
            pass  # Token already invalid
    
    # Clear refresh token cookie – use the same domain/secure settings we used when setting it.
    cookie_secure = os.getenv("COOKIE_SECURE", "false").lower() == "true"
    response.delete_cookie(
        key="refresh_token",
        httponly=True,
        secure=cookie_secure,
        samesite="none" if cookie_secure else "lax",
        domain=os.getenv("COOKIE_DOMAIN", None),
        path="/"
    )
    
    # Log logout event
    ip_address = request.client.host if request.client else "unknown"
    await audit_service.log_logout(
        user_id=user_id,
        user_email=current_user.get("email", "unknown"),
        ip_address=ip_address,
        session_id=refresh_payload.get("jti", "unknown") if refresh_token else "unknown",
        logout_type="manual"
    )
    
    await log_event("user_logout", {"user_id": user_id})
    
    return {"message": "Successfully logged out"}

@router.post("/refresh")
async def refresh_token(request: Request, response: Response):
    # Get refresh token from cookie or request body
    refresh_token = request.cookies.get("refresh_token")
    
    if not refresh_token:
        # Fallback to request body for API clients
        try:
            body = await request.json()
            refresh_token = body.get("refresh_token")
        except:
            pass
    
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token not provided"
        )
    
    # Verify refresh token
    payload = await verify_refresh_token(refresh_token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )
    
    user_id = payload.get("sub")
    old_token_id = payload.get("jti")
    
    # Revoke old refresh token
    await revoke_refresh_token(old_token_id, user_id)
    
    # Blacklist old refresh token
    old_expires = datetime.fromtimestamp(payload["exp"])
    await blacklist_token(
        token_id=old_token_id,
        token_type="refresh",
        user_id=user_id,
        expires_at=old_expires,
        reason="refresh"
    )
    
    # Create new tokens
    new_access_token = create_access_token({"sub": user_id})
    new_refresh_token = create_refresh_token({"sub": user_id})
    
    # Store new refresh token
    new_refresh_payload = decode_refresh_token(new_refresh_token)
    new_refresh_expires = datetime.fromtimestamp(new_refresh_payload["exp"])
    
    await store_refresh_token(
        user_id=user_id,
        token_id=new_refresh_payload["jti"],
        refresh_token=new_refresh_token,
        expires_at=new_refresh_expires,
        device_info=request.headers.get("User-Agent"),
        ip_address=request.client.host if request.client else None
    )
    
    # Determine cookie settings based on environment so that the front-end running on a different
    # port (e.g. http://localhost:8080) can still receive / send the cookie in cross-site requests.
    cookie_secure = os.getenv("COOKIE_SECURE", "false").lower() == "true"
    response.set_cookie(
        key="refresh_token",
        value=new_refresh_token,
        max_age=7 * 24 * 60 * 60,  # 7 days
        httponly=True,
        secure=cookie_secure,
        samesite="none" if cookie_secure else "lax",
        domain=os.getenv("COOKIE_DOMAIN", None),
        path="/"
    )
    
    await log_event("token_refreshed", {"user_id": user_id})
    
    return {
        "token": new_access_token,  # Front-end compatibility
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer"
    }

@router.post("/forgot-password")
async def forgot_password(password_reset: PasswordReset):
    db = get_db()
    user = await db["users"].find_one({"email": password_reset.email})
    if not user:
        # Don't reveal if email exists or not
        return {"message": "If the email exists, a reset link has been sent"}
    
    token = generate_password_reset_token(password_reset.email)
    await send_reset_email(password_reset.email, token)
    return {"message": "Reset email sent"}

@router.post("/reset-password")
async def reset_password(reset_data: PasswordResetConfirm):
    db = get_db()
    email = verify_password_reset_token(reset_data.token)
    if not email:
        raise HTTPException(400, "Invalid or expired token")
    
    # Get user to revoke all tokens
    user = await db["users"].find_one({"email": email})
    if user:
        user_id = str(user["_id"])
        # Revoke all refresh tokens for security
        await revoke_all_user_tokens(user_id)
    
    hashed = hash_password(reset_data.password)
    await db["users"].update_one(
        {"email": email}, 
        {"$set": {"hashed_password": hashed, "updatedAt": datetime.utcnow()}}
    )
    await log_event("password_reset", {"email": email})
    return {"message": "Password updated successfully"}
