# NextEra Workforce Management System - Frontend

A comprehensive, enterprise-grade workforce management frontend application built with modern React technologies and AI-driven scheduling capabilities.

## 🚀 Overview

NextEra Workforce is a complete workforce management solution featuring real-time scheduling, employee self-service portals, GPS-based attendance tracking, and advanced analytics. The frontend provides an intuitive, mobile-responsive interface for employees, managers, and administrators.

## ✨ Key Features

### 🔐 Authentication & Security
- **Multi-role Authentication** - Employee, Manager, Administrator roles with JWT-based security
- **Password Recovery** - Email-based reset system with secure token validation
- **Session Management** - Auto-timeout, refresh tokens, and secure logout
- **Role-based Access Control** - Granular permissions for different user types

### 👤 Employee Self-Service Portal
- **Personal Dashboard** - Real-time metrics, upcoming shifts, and quick actions
- **Schedule Management** - View personal schedules with calendar and list views
- **Time-off Requests** - Submit, track, and manage vacation/sick leave requests
- **Availability Management** - Set weekly availability patterns and preferences
- **Profile Management** - Update personal information, emergency contacts, and skills
- **Shift Swapping** - Request and approve shift swaps with team members

### 📅 Advanced Scheduling System
- **AI-Powered Schedule Generation** - Google OR-Tools optimization with constraint programming
- **Visual Schedule Management** - Drag-and-drop Kanban-style interface
- **Conflict Detection** - Real-time validation for overlaps, rest periods, and skill requirements
- **Multi-view Support** - Week, month, and timeline views for schedules
- **Bulk Operations** - Generate, publish, and modify schedules in bulk

### 👥 Team Management (Manager/Admin)
- **Employee Directory** - Comprehensive user management with search and filters
- **Team Analytics** - Attendance tracking, hours worked, and performance metrics
- **Schedule Oversight** - View and manage team schedules across departments
- **Approval Workflows** - Review and approve time-off requests and schedule changes

### 📊 Analytics & Reporting
- **Interactive Dashboards** - Real-time KPIs with charts and trend analysis
- **Advanced Reports** - Attendance, labor costs, time-off, and custom reports
- **Data Export** - CSV, JSON, and PDF export capabilities
- **Predictive Analytics** - Workforce trends and scheduling optimization insights

### 📱 Communication System
- **Real-time Messaging** - Direct messages and team announcements
- **Push Notifications** - Schedule updates, approvals, and important alerts
- **Message Threading** - Organized conversations with search capabilities

### 🗺️ Location Services
- **GPS Attendance** - Location-based clock-in/out with geofencing
- **Location Management** - Configure work sites with radius validation
- **Attendance Tracking** - Real-time monitoring with compliance reporting

### ⚙️ Administration
- **System Configuration** - Customize workflows, policies, and integrations
- **User Management** - Advanced user administration with bulk operations
- **Security Center** - Access controls, audit logs, and compliance tools
- **Data Management** - Backup, restore, and data integrity monitoring

## 🛠️ Technology Stack

### Core Technologies
- **React 18** - Modern React with hooks and concurrent features
- **TypeScript** - Type-safe development with full IntelliSense
- **Vite** - Lightning-fast development and optimized builds
- **React Router** - Client-side routing with nested routes

### UI Framework
- **shadcn/ui** - High-quality, accessible component library
- **Radix UI** - Unstyled, accessible UI primitives
- **Tailwind CSS** - Utility-first CSS framework
- **Lucide React** - Beautiful, customizable icons

### State Management & API
- **Zustand** - Lightweight state management
- **TanStack Query** - Powerful data fetching and caching
- **React Hook Form** - Performant forms with validation
- **Zod** - TypeScript-first schema validation

### Data Visualization
- **Recharts** - Responsive charts and analytics
- **Date-fns** - Modern date utility library
- **React DnD Kit** - Drag and drop interactions

### Development Tools
- **ESLint** - Code linting and formatting
- **TypeScript ESLint** - TypeScript-specific linting rules
- **PostCSS** - CSS post-processing
- **Autoprefixer** - Automatic vendor prefixes

## 🏗️ Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── ui/             # shadcn/ui components
│   ├── layout/         # Layout components (Sidebar, Header)
│   ├── forms/          # Form components
│   ├── shared/         # Shared business components
│   ├── auth/           # Authentication components
│   ├── admin/          # Admin-specific components
│   └── manager/        # Manager-specific components
├── pages/              # Route-level page components
│   ├── Dashboard.tsx   # Main dashboard
│   ├── Schedule.tsx    # Personal schedule view
│   ├── TimeOff.tsx     # Time-off management
│   ├── TeamManagement.tsx  # Team management (Manager+)
│   ├── ScheduleManagement.tsx  # Schedule admin (Manager+)
│   ├── Analytics.tsx   # Analytics dashboard (Manager+)
│   ├── Reports.tsx     # Reporting system (Manager+)
│   ├── Administration.tsx  # System admin (Admin only)
│   └── Profile.tsx     # User profile management
├── lib/                # Utility libraries
│   ├── api.ts          # API client configuration
│   ├── auth.ts         # Authentication logic
│   └── utils.ts        # Utility functions
├── hooks/              # Custom React hooks
├── types/              # TypeScript type definitions
└── styles/             # Global styles and Tailwind config
```

## 🚦 Getting Started

### Prerequisites
- **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
- **npm** or **bun** package manager

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd project_AT3/frontend
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   bun install
   ```

3. **Start development server**
   ```bash
   npm run dev
   # or
   bun dev
   ```

4. **Open your browser**
   Navigate to `http://localhost:5173`

### Build for Production

```bash
# Build optimized production bundle
npm run build

# Preview production build locally
npm run preview
```

## 🔧 Configuration

### Environment Variables
Create a `.env.local` file in the root directory:

```env
VITE_API_BASE_URL=http://localhost:8000/api
VITE_APP_VERSION=1.0.0
```

### API Integration
The frontend connects to a FastAPI backend. Ensure the backend is running on the configured API base URL.

## 📱 Mobile Responsiveness

- **Mobile-first Design** - Optimized for smartphones and tablets
- **Touch-friendly Interface** - Large touch targets and intuitive gestures
- **Progressive Web App** - Installable with offline capabilities
- **Responsive Layouts** - Adapts seamlessly to all screen sizes

## 🔒 Security Features

- **JWT Authentication** - Secure token-based authentication
- **Role-based Authorization** - Granular permission controls
- **CSRF Protection** - Cross-site request forgery prevention
- **XSS Protection** - Input sanitization and content security policies
- **Secure Routing** - Protected routes with role validation

## 🎯 User Roles & Permissions

### Employee
- View personal schedule and time-off balances
- Submit time-off requests and availability changes
- Clock in/out with GPS verification
- Access personal analytics and messaging

### Manager
- All employee permissions plus:
- Manage team schedules and approve requests
- Access team analytics and reporting
- Configure schedules and handle conflicts
- Manage department settings

### Administrator
- All manager permissions plus:
- System-wide configuration and user management
- Advanced security and audit controls
- Data backup and system maintenance
- Full access to all modules and reports

## 🚀 Performance Optimizations

- **Code Splitting** - Lazy-loaded routes for faster initial loads
- **Bundle Optimization** - Tree-shaking and minification
- **Image Optimization** - Responsive images with modern formats
- **Caching Strategy** - Intelligent API caching with TanStack Query
- **Virtual Scrolling** - Efficient rendering of large datasets

## 🧪 Testing

```bash
# Run unit tests
npm run test

# Run integration tests
npm run test:integration

# Generate coverage report
npm run test:coverage
```

## 📦 Deployment

The application is production-ready and can be deployed to:

- **Vercel** - Optimized for React applications
- **Netlify** - Static site hosting with edge functions
- **AWS S3/CloudFront** - Scalable cloud hosting
- **Docker** - Containerized deployment
- **Traditional Web Servers** - Apache, Nginx, IIS

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Support

For support and questions:
- **Email**: support@nextera-workforce.com
- **Documentation**: [nextera-workforce.co.uk](https://nextera-workforce.co.uk)
- **Issue Tracker**: GitHub Issues

---

**Built with ❤️ by SONU**
