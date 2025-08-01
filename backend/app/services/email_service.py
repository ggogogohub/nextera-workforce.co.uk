from itsdangerous import URLSafeTimedSerializer
import os
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig

conf = ConnectionConfig(
    MAIL_USERNAME=os.getenv("SMTP_USER"),
    MAIL_PASSWORD=os.getenv("SMTP_PASSWORD"),
    MAIL_FROM=os.getenv("SMTP_USER"),
    MAIL_PORT=int(os.getenv("SMTP_PORT")),
    MAIL_SERVER=os.getenv("SMTP_SERVER"),
    MAIL_TLS=True,
    MAIL_SSL=False,
    USE_CREDENTIALS=True
)

def generate_password_reset_token(email: str) -> str:
    serializer = URLSafeTimedSerializer(os.getenv("SECRET_KEY"))
    return serializer.dumps(email, salt="password-reset-salt")

def verify_password_reset_token(token: str, expires_sec=3600*24):
    serializer = URLSafeTimedSerializer(os.getenv("SECRET_KEY"))
    try:
        email = serializer.loads(token, salt="password-reset-salt", max_age=expires_sec)
    except Exception:
        return None
    return email

async def send_reset_email(email: str, token: str):
    reset_link = f"{os.getenv('FRONTEND_URL')}/reset-password?token={token}"
    message = MessageSchema(
        subject="Password Reset",
        recipients=[email],
        body=f"Click here to reset your password: {reset_link}",
        subtype="html"
    )
    fm = FastMail(conf)
    await fm.send_message(message)
