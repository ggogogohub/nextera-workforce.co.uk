# MongoDB Test Data for Employee Scheduling System

This folder contains JSON files with test data for importing into MongoDB collections. The data is carefully crafted to match the exact schema expected by the backend API.

## Collections and Files

| Collection | File | Description |
|------------|------|-------------|
| `users` | `users.json` | User accounts with properly hashed passwords |
| `schedules` | `schedules.json` | Employee work schedules |
| `timeoff` | `timeoff.json` | Time-off requests and approvals |
| `messages` | `messages.json` | Internal messaging system data |
| `notifications` | `notifications.json` | System notifications |
| `teams` | `teams.json` | Team structure and assignments |

## Import Instructions

### Using MongoDB Compass
1. Open MongoDB Compass
2. Connect to your MongoDB instance
3. Select your database (default: `employee_scheduling`)
4. For each collection:
   - Click "CREATE COLLECTION" or select existing collection
   - Click "ADD DATA" → "Import JSON or CSV file"
   - Select the corresponding JSON file
   - Click "Import"

### Using MongoDB CLI (mongoimport)
```bash
# Navigate to the mongodb_test_data folder
cd mongodb_test_data

# Import each collection (replace 'employee_scheduling' with your database name)
mongoimport --db employee_scheduling --collection users --file users.json --jsonArray
mongoimport --db employee_scheduling --collection schedules --file schedules.json --jsonArray
mongoimport --db employee_scheduling --collection timeoff --file timeoff.json --jsonArray
mongoimport --db employee_scheduling --collection messages --file messages.json --jsonArray
mongoimport --db employee_scheduling --collection notifications --file notifications.json --jsonArray
mongoimport --db employee_scheduling --collection teams --file teams.json --jsonArray
```

### Using MongoDB Shell (mongosh)
```javascript
// Connect to your database
use employee_scheduling

// Load and insert data for each collection
load('users.json')
db.users.insertMany(/* paste users.json content */)

// Repeat for other collections...
```

## Test User Credentials

After importing the data, you can login with these test accounts:

### Administrator Account
- **Email**: `admin@company.com`
- **Password**: `Admin123!`
- **Role**: Administrator
- **Access**: Full system access

### Manager Account
- **Email**: `manager@company.com`
- **Password**: `Manager123!`
- **Role**: Manager
- **Access**: Team management, scheduling, approvals

### Employee Accounts
- **Email**: `employee1@company.com`
- **Password**: `Employee123!`
- **Role**: Employee (Sales)

- **Email**: `employee2@company.com`
- **Password**: `Employee123!`
- **Role**: Employee (Support)

### Test Account (Used in Frontend Testing)
- **Email**: `test@example.com`
- **Password**: `testpass123`
- **Role**: Employee (Testing)

## Data Relationships

The test data includes proper relationships between collections:

- **Users** are referenced in schedules, messages, timeoff requests, and team assignments
- **Schedules** are linked to specific employees with realistic shift patterns
- **Messages** show communication between managers and employees
- **Time-off requests** include both pending and approved statuses
- **Notifications** are tied to specific users and events
- **Teams** organize users by department with proper manager assignments

## Password Security

All passwords are properly hashed using bcrypt with the same algorithm used by the backend:
- Salt rounds: 12
- Algorithm: bcrypt
- Complexity requirements: Uppercase, lowercase, and digits

## Data Validation

The JSON data strictly follows the Pydantic models defined in the backend:
- Proper field names and types
- Required fields included
- Optional fields appropriately set
- Date formats in ISO 8601 standard
- ObjectId format for MongoDB `_id` fields

## Testing Scenarios

This data enables testing of:
- ✅ User authentication and authorization
- ✅ Schedule management and viewing
- ✅ Time-off request workflows
- ✅ Internal messaging system
- ✅ Notification delivery
- ✅ Team management
- ✅ Role-based access control
- ✅ Dashboard analytics and metrics

## Notes

- All timestamps are in UTC format
- User IDs are consistent across all collections for proper relationships
- The data represents a realistic small company scenario
- Schedules span multiple days for testing calendar views
- Mix of pending/approved statuses for workflow testing
