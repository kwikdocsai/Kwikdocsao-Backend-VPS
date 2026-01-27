#!/bin/sh
# ============================================
# KwikDocs Backend - Startup Script
# ============================================
# Este script valida o ambiente antes de iniciar o servidor

set -e  # Exit on error

echo "🚀 Starting KwikDocs Backend..."
echo "================================"

# --------------------------------------------
# 1. Validate Environment Variables
# --------------------------------------------
echo "📋 Validating environment variables..."

required_vars="DATABASE_URL JWT_SECRET NODE_ENV"

for var in $required_vars; do
    if [ -z "$(eval echo \$$var)" ]; then
        echo "❌ ERROR: Required environment variable $var is not set!"
        exit 1
    fi
done

echo "✅ All required environment variables are set"

# --------------------------------------------
# 2. Test Database Connection
# --------------------------------------------
echo "🔌 Testing database connection..."

# Simple connection test using node
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT NOW()')
    .then(() => {
        console.log('✅ Database connection successful');
        pool.end();
    })
    .catch(err => {
        console.error('❌ Database connection failed:', err.message);
        process.exit(1);
    });
" || exit 1

# --------------------------------------------
# 3. Run Migrations (Optional - uncomment if needed)
# --------------------------------------------
# echo "📦 Running database migrations..."
# npm run migrate || {
#     echo "⚠️  Migrations failed, but continuing..."
# }

# --------------------------------------------
# 4. Start Server
# --------------------------------------------
echo "🎯 Starting server on port ${AUTH_API_PORT:-5000}..."
echo "================================"

exec node dist/server.js
