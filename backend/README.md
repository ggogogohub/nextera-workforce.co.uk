# Employee Scheduling System - Backend API

A comprehensive FastAPI-based backend system for employee scheduling, time-off management, and workforce analytics.

## Features

### Core Functionality
- **User Management**: Employee registration, authentication, and profile management
- **Schedule Management**: Create, update, and manage employee schedules
- **Time-Off Requests**: Submit, review, and approve time-off requests
- **Messaging System**: Internal communication with announcements and direct messages
- **Analytics & Reporting**: Workforce metrics, attendance tracking, and detailed reports
- **Role-Based Access Control**: Different permission levels for employees, managers, and administrators

### API Endpoints

#### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password with token

#### Users
- `GET /api/users/` - List users (paginated)
- `POST /api/users/` - Create new user
- `GET /api/users/{user_id}` - Get user details
- `PUT /api/users/{user_id}` - Update user
- `DELETE /api/users/{user_id}` - Delete user

#### Schedules
- `GET /api/schedules/` - List schedules (with filters)
- `POST /api/schedules/` - Create schedule
- `GET /api/schedules/{schedule_id}` - Get schedule details
- `PUT /api/schedules/{schedule_id}` - Update schedule
- `DELETE /api/schedules/{schedule_id}` - Delete schedule
- `POST /api/schedules/generate` - Generate schedules automatically

#### Time-Off Requests
- `GET /api/time-off/` - List time-off requests
- `POST /api/time-off/` - Create time-off request
- `GET /api/time-off/{request_id}` - Get request details
- `PUT /api/time-off/{request_id}` - Update request
- `DELETE /api/time-off/{request_id}` - Delete request
- `POST /api/time-off/{request_id}/review` - Review request (approve/reject)

#### Messages
- `GET /api/messages/` - List messages
- `POST /api/messages/` - Send message
- `GET /api/messages/{message_id}` - Get message details
- `POST /api/messages/{message_id}/read` - Mark as read
- `POST /api/messages/{message_id}/acknowledge` - Acknowledge message
- `DELETE /api/messages/{message_id}` - Delete message

#### Analytics
- `GET /api/analytics/workforce` - Workforce metrics
- `GET /api/analytics/schedule-adherence` - Schedule adherence data
- `GET /api/analytics/activity` - Activity logs
- `GET /api/analytics/dashboard-stats` - Dashboard statistics

#### Reports
- `GET /api/reports/attendance` - Attendance report
- `GET /api/reports/hours` - Hours worked report
- `GET /api/reports/time-off` - Time-off report
- `GET /api/reports/export/{report_type}` - Export reports

#### Dashboard
- `GET /api/dashboard/stats` - Dashboard statistics
- `GET /api/dashboard/recent-activity` - Recent activity
- `GET /api/dashboard/upcoming-shifts` - Upcoming shifts

#### Teams
- `GET /api/teams/` - List teams
- `GET /api/teams/{team_id}` - Get team details
- `POST /api/teams/{team_id}/members` - Add team member
- `DELETE /api/teams/{team_id}/members/{user_id}` - Remove team member
- `GET /api/teams/{team_id}/schedule` - Get team schedule

#### Profile
- `GET /api/profile/` - Get current user profile
- `PUT /api/profile/` - Update profile
- `POST /api/profile/change-password` - Change password
- `GET /api/profile/activity` - Get user activity
- `GET /api/profile/preferences` - Get preferences
- `PUT /api/profile/preferences` - Update preferences
- `GET /api/profile/stats` - Get user statistics

#### Roles
- `GET /api/roles/` - List available roles
- `GET /api/roles/permissions` - Get role permissions
- `PUT /api/roles/{user_id}/role` - Update user role

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd backend
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Set up environment variables**
   Create a `.env` file in the backend directory:
   ```env
   MONGODB_URL=mongodb://localhost:27017
   DATABASE_NAME=employee_scheduling
   SECRET_KEY=your-secret-key-here
   ACCESS_TOKEN_EXPIRE_MINUTES=60
   
   # Email configuration (optional)
   SMTP_SERVER=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USERNAME=your-email@gmail.com
   SMTP_PASSWORD=your-app-password
   FROM_EMAIL=noreply@company.com
   ```

4. **Start MongoDB**
   Make sure MongoDB is running on your system.

5. **Run the application**
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

## Project Structure

```
backend/
├── main.py                 # FastAPI application entry point
├── requirements.txt        # Python dependencies
├── README.md              # This file
├── app/
│   ├── __init__.py
│   ├── db.py              # Database connection
│   ├── models/            # Pydantic models
│   │   ├── user.py
│   │   └── schedule.py
│   ├── schemas/           # API schemas
│   │   ├── auth.py
│   │   ├── user.py
│   │   ├── schedule.py
│   │   ├── timeoff.py
│   │   ├── message.py
│   │   └── analytics.py
│   ├── routes/            # API route handlers
│   │   ├── auth.py
│   │   ├── users.py
│   │   ├── schedules.py
│   │   ├── time_off.py
│   │   ├── messages.py
│   │   ├── analytics.py
│   │   ├── dashboard.py
│   │   ├── teams.py
│   │   ├── reports.py
│   │   ├── profile.py
│   │   └── roles.py
│   ├── services/          # Business logic
│   │   ├── auth_service.py
│   │   └── scheduler.py
│   └── utils/             # Utility functions
│       ├── auth.py
│       └── logger.py
```

## Database Schema

### Users Collection
```json
{
  "_id": "ObjectId",
  "email": "string",
  "hashed_password": "string",
  "firstName": "string",
  "lastName": "string",
  "role": "employee|manager|administrator",
  "department": "string",
  "phoneNumber": "string",
  "isActive": "boolean",
  "createdAt": "datetime",
  "updatedAt": "datetime"
}
```

### Schedules Collection
```json
{
  "_id": "ObjectId",
  "employeeId": "string",
  "date": "string (YYYY-MM-DD)",
  "startTime": "string (HH:MM)",
  "endTime": "string (HH:MM)",
  "location": "string",
  "role": "string",
  "department": "string",
  "status": "scheduled|confirmed|completed|missed|cancelled",
  "createdAt": "datetime",
  "updatedAt": "datetime"
}
```

### Time-Off Requests Collection
```json
{
  "_id": "ObjectId",
  "employeeId": "string",
  "startDate": "string (YYYY-MM-DD)",
  "endDate": "string (YYYY-MM-DD)",
  "reason": "string",
  "type": "vacation|sick|personal|emergency|other",
  "status": "pending|approved|rejected|cancelled",
  "submittedAt": "datetime",
  "reviewedAt": "datetime",
  "reviewedBy": "string",
  "reviewerNotes": "string",
  "totalDays": "number"
}
```

### Messages Collection
```json
{
  "_id": "ObjectId",
  "senderId": "string",
  "recipientId": "string",
  "departmentId": "string",
  "subject": "string",
  "content": "string",
  "type": "direct|announcement|system|emergency",
  "priority": "low|normal|high|urgent",
  "sentAt": "datetime",
  "readBy": "object",
  "acknowledgments": "object",
  "requiresAcknowledgment": "boolean"
}
```

### Activity Logs Collection
```json
{
  "_id": "ObjectId",
  "userId": "string",
  "action": "string",
  "details": "object",
  "timestamp": "datetime",
  "ipAddress": "string"
}
```

## Authentication

The API uses JWT (JSON Web Tokens) for authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

## Role-Based Access Control

- **Employee**: Can view own schedules, submit time-off requests, view messages
- **Manager**: Can manage team schedules, approve time-off requests, view team analytics
- **Administrator**: Full system access, user management, system configuration

## Error Handling

The API returns standard HTTP status codes:
- `200` - Success
- `201` - Created
- `204` - No Content
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `422` - Validation Error
- `500` - Internal Server Error

## Development

### Running Tests
```bash
pytest
```

### Code Formatting
```bash
black .
isort .
```

### API Documentation
Once the server is running, visit:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Production Deployment

1. Set up a production MongoDB instance
2. Configure environment variables for production
3. Use a production WSGI server like Gunicorn
4. Set up reverse proxy with Nginx
5. Configure SSL certificates
6. Set up monitoring and logging

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

This project is licensed under the MIT License.
