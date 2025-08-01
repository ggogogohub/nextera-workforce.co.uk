import re
import secrets
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
import os

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET_KEY = os.getenv("SECRET_KEY", "testing_secret_key_for_development_only")
REFRESH_SECRET_KEY = os.getenv("REFRESH_SECRET_KEY", "refresh_secret_key_for_development_only")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def hash_password(password: str) -> str:
    # Enforce complexity: at least one uppercase, one lowercase, one digit
    if not re.match(r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$', password):
        raise ValueError("Password must include uppercase, lowercase letters and digits")
    return pwd_context.hash(password)

def create_access_token(data: dict, previous_jti: str = None) -> str:
    """Create access token with enhanced security and rotation tracking"""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    jti = secrets.token_urlsafe(32)  # Unique token ID for blacklisting
    
    # Add rotation tracking for immediate revocation
    to_encode.update({
        "exp": expire, 
        "type": "access", 
        "jti": jti,
        "iat": datetime.utcnow().timestamp(),
        "prev_jti": previous_jti  # Track previous token for rotation
    })
    
    # Validate SECRET_KEY strength
    if SECRET_KEY is None or SECRET_KEY == "testing_secret_key_for_development_only":
        raise ValueError("CRITICAL: Production SECRET_KEY required. Default development key detected.")
        
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    jti = secrets.token_urlsafe(32)  # Unique token ID for blacklisting
    to_encode.update({"exp": expire, "type": "refresh", "jti": jti})
    
    # Ensure REFRESH_SECRET_KEY is not None
    if REFRESH_SECRET_KEY is None:
        raise ValueError("REFRESH_SECRET_KEY is not set. Please set it in your environment variables.")
        
    return jwt.encode(to_encode, REFRESH_SECRET_KEY, algorithm=ALGORITHM)

def decode_access_token(token: str) -> dict:
    try:
        # Ensure SECRET_KEY is not None
        if SECRET_KEY is None:
            raise ValueError("SECRET_KEY is not set. Please set it in your environment variables.")
            
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "access":
            raise JWTError("Invalid token type")
        return payload
    except JWTError:
        raise

def decode_refresh_token(token: str) -> dict:
    try:
        # Ensure REFRESH_SECRET_KEY is not None
        if REFRESH_SECRET_KEY is None:
            raise ValueError("REFRESH_SECRET_KEY is not set. Please set it in your environment variables.")
            
        payload = jwt.decode(token, REFRESH_SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "refresh":
            raise JWTError("Invalid token type")
        return payload
    except JWTError:
        raise

# Password reset functionality
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

RESET_TOKEN_EXPIRE_MINUTES = 60

# Email configuration
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", "noreply@company.com")

# In-memory storage for reset tokens (in production, use Redis or database)
reset_tokens = {}

def generate_password_reset_token(email: str) -> str:
    """Generate a password reset token for the given email"""
    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(minutes=RESET_TOKEN_EXPIRE_MINUTES)
    
    reset_tokens[token] = {
        "email": email,
        "expires_at": expires_at
    }
    
    return token

def verify_password_reset_token(token: str) -> str:
    """Verify a password reset token and return the associated email"""
    token_data = reset_tokens.get(token)
    
    if not token_data:
        return None
    
    if datetime.utcnow() > token_data["expires_at"]:
        # Token expired, remove it
        del reset_tokens[token]
        return None
    
    return token_data["email"]

async def send_reset_email(email: str, token: str):
    """Send password reset email"""
    try:
        # Create reset URL (in production, this would be your frontend URL)
        reset_url = f"http://localhost:3000/reset-password?token={token}"
        
        # Create email content
        subject = "Password Reset Request"
        body = f"""
        Hello,
        
        You have requested to reset your password. Please click the link below to reset your password:
        
        {reset_url}
        
        This link will expire in {RESET_TOKEN_EXPIRE_MINUTES} minutes.
        
        If you did not request this password reset, please ignore this email.
        
        Best regards,
        Your Team
        """
        
        # Create message
        msg = MIMEMultipart()
        msg['From'] = FROM_EMAIL
        msg['To'] = email
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'plain'))
        
        # Send email (only if SMTP is configured)
        if SMTP_USERNAME and SMTP_PASSWORD:
            server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
            server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            text = msg.as_string()
            server.sendmail(FROM_EMAIL, email, text)
            server.quit()
        else:
            # In development, just log the reset URL
            print(f"Password reset URL for {email}: {reset_url}")
            
    except Exception as e:
        print(f"Failed to send reset email: {e}")
        # Don't raise exception to avoid exposing email configuration issues

def cleanup_expired_tokens():
    """Clean up expired reset tokens"""
    current_time = datetime.utcnow()
    expired_tokens = [
        token for token, data in reset_tokens.items()
        if current_time > data["expires_at"]
    ]
    
    for token in expired_tokens:
        del reset_tokens[token]
