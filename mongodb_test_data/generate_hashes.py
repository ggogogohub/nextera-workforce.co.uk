from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Generate hashed passwords for test users
passwords = {
    "Admin123!": pwd_context.hash("Admin123!"),
    "Manager123!": pwd_context.hash("Manager123!"),
    "Employee123!": pwd_context.hash("Employee123!"),
    "testpass123": pwd_context.hash("testpass123")
}

for plain, hashed in passwords.items():
    print(f"Password: {plain}")
    print(f"Hash: {hashed}")
    print("---")
