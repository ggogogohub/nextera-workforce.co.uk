#!/bin/bash

# MongoDB Test Data Import Script
# Usage: ./import_all.sh [database_name]
# Default database name: employee_scheduling

DB_NAME=${1:-employee_scheduling}

echo "🚀 Starting MongoDB import for database: $DB_NAME"
echo "================================================"

# Check if mongoimport is available
if ! command -v mongoimport &> /dev/null; then
    echo "❌ Error: mongoimport command not found. Please install MongoDB tools."
    exit 1
fi

# Import each collection
collections=("users" "schedules" "timeoff" "messages" "notifications" "teams")

for collection in "${collections[@]}"; do
    echo "📥 Importing $collection..."
    if mongoimport --db "$DB_NAME" --collection "$collection" --file "${collection}.json" --jsonArray --drop; then
        echo "✅ Successfully imported $collection"
    else
        echo "❌ Failed to import $collection"
        exit 1
    fi
    echo ""
done

echo "🎉 All collections imported successfully!"
echo ""
echo "📋 Test Credentials:"
echo "==================="
echo "Administrator: admin@company.com / Admin123!"
echo "Manager:       manager@company.com / Manager123!"
echo "Employee 1:    employee1@company.com / Employee123!"
echo "Employee 2:    employee2@company.com / Employee123!"
echo "Test User:     test@example.com / testpass123"
echo ""
echo "🌐 Frontend: http://localhost:8080"
echo "🔧 Backend:  http://localhost:8000"
echo "📚 API Docs: http://localhost:8000/docs"
