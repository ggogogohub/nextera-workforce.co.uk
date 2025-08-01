# NextEra Workforce Management System

A comprehensive, enterprise-grade workforce management system featuring AI-driven scheduling, real-time communication, GPS-based attendance tracking, and advanced analytics.

## 🌟 Project Overview

NextEra Workforce is a full-stack solution designed for modern businesses to efficiently manage their workforce. The system provides intelligent scheduling, employee self-service capabilities, and powerful management tools for optimizing operations.

## 🏗️ Architecture

### Frontend
- **Technology**: React 18 + TypeScript + Vite
- **UI Framework**: shadcn/ui + Tailwind CSS
- **Location**: `/frontend`
- **Port**: 8080 (development)

### Backend
- **Technology**: FastAPI + Python
- **Database**: MongoDB
- **Location**: `/backend`
- **Port**: 8000 (development)

### Database
- **Technology**: MongoDB with test data
- **Location**: `/mongodb_test_data`
- **Features**: Pre-populated with sample users, schedules, and configurations

## ✨ Key Features

### 🔐 Authentication & Security
- Multi-role authentication (Employee, Manager, Administrator)
- JWT-based security with refresh tokens
- Password recovery and secure session management
- Role-based access control with granular permissions

### 👤 Employee Self-Service
- Personal dashboard with real-time metrics
- Schedule viewing with calendar and timeline views
- Time-off request submission and tracking
- Availability pattern management
- Profile and emergency contact management
- Shift swap requests with team members

### 📅 AI-Powered Scheduling
- Google OR-Tools constraint programming optimization
- Visual drag-and-drop schedule management
- Automatic conflict detection and resolution
- Multi-view support (week, month, Kanban)
- Bulk schedule generation and publishing

### 👥 Team Management
- Comprehensive employee directory
- Team analytics and performance metrics
- Schedule oversight across departments
- Approval workflows for requests and changes

### 📊 Analytics & Reporting
- Interactive dashboards with real-time KPIs
- Advanced reporting (attendance, labor costs, trends)
- Data export in multiple formats (CSV, JSON, PDF)
- Predictive analytics for workforce optimization

### 📱 Communication
- Real-time messaging system
- Push notifications for schedule updates
- Team announcements and emergency communications
- Message threading with search capabilities

### 🗺️ Location Services
- GPS-based attendance tracking
- Geofencing for work site validation
- Location management with radius controls
- Compliance monitoring and reporting

## 🚀 Quick Start

### Prerequisites
- **Node.js** (v18+) - [Download](https://nodejs.org/)
- **Python** (3.9+) - [Download](https://python.org/)
- **MongoDB** - [Download](https://mongodb.com/) or use MongoDB Atlas
- **Git** - [Download](https://git-scm.com/)

### 1. Clone the Repository
```bash
git clone https://github.com/ggogogohub/nextera-workforce.co.uk.git
cd project_AT3
```

### 2. Backend Setup
```bash
cd backend
pip install -r requirements.txt
# Configure MongoDB connection in .env
python main.py
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### 4. Database Setup
```bash
cd mongodb_test_data
# Follow README.md for importing test data
```

### 5. Access the Application
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs

## 📱 Demo Accounts

| Role | Email | Password | Features |
|------|-------|----------|----------|
| Employee | employee@test.com | password123 | Schedule viewing, time-off requests |
| Manager | manager@test.com | password123 | Team management, schedule creation |
| Admin | admin@test.com | password123 | Full system access |

## 🛠️ Development

### Project Structure
```
project_AT3/
├── frontend/           # React + TypeScript frontend
├── backend/           # FastAPI + Python backend  
├── mongodb_test_data/ # Sample data and import scripts
├── backup/           # Backup configurations
└── README.md         # This file
```

### Environment Configuration

#### Backend (.env)
```env
MONGODB_URI=mongodb://localhost:27017/workforce_management
JWT_SECRET_KEY=your-secret-key
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

#### Frontend (.env.local)
```env
VITE_API_BASE_URL=http://localhost:8000/api
VITE_APP_VERSION=1.0.0
```

### Testing
```bash
# Backend tests
cd backend
python -m pytest tests/

# Frontend tests
cd frontend
npm run test
```

## 🐳 Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up --build

# Access services
# Frontend: http://localhost:8080
# Backend: http://localhost:8000
# MongoDB: localhost:27017
```

## 📦 Production Deployment

### Backend (FastAPI)
- Deploy to AWS, Google Cloud, or Azure
- Use Gunicorn with multiple workers
- Configure MongoDB Atlas for database
- Set up environment variables

### Frontend (React)
- Deploy to Vercel, Netlify, or AWS S3
- Configure environment variables
- Set up CI/CD pipelines
- Enable CDN for optimal performance

## 🔧 Configuration

### Features Configuration
- Role-based permissions in `/backend/app/middleware/`
- Schedule constraints in `/backend/app/services/`
- Notification templates in `/backend/app/utils/`
- UI themes in `/frontend/src/styles/`

### Integration Options
- SMTP for email notifications
- SMS services for alerts
- LDAP/Active Directory for authentication
- Third-party calendar systems
- Payroll system integration

## 📊 System Requirements

### Minimum Requirements
- **CPU**: 2 cores
- **RAM**: 4GB
- **Storage**: 10GB
- **Network**: Broadband internet

### Recommended Requirements
- **CPU**: 4+ cores
- **RAM**: 8GB+
- **Storage**: 50GB+ SSD
- **Network**: High-speed internet
- **Database**: MongoDB Atlas or dedicated instance

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: See individual README files in each directory
- **Issues**: GitHub Issues tracker
- **Website**: nextera-workforce.co.uk

## 🔄 Version History

- **v1.0.0** - Initial release with full feature set
- **Features**: Complete workforce management system
- **Status**: Production ready

---

**⚡ Built with cutting-edge technology for modern workforce management**
