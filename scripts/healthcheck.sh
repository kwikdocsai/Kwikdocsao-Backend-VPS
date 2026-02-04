#!/bin/sh
# ============================================
# Health Check Script for KwikDocs Backend
# ============================================

set -e

# Health check endpoint
HEALTH_URL="http://localhost:${AUTH_API_PORT:-5000}/api/health"

# Make HTTP request
response=$(wget --spider --server-response "$HEALTH_URL" 2>&1 | grep "HTTP/" | awk '{print $2}')

if [ "$response" = "200" ]; then
    echo "✅ Health check passed"
    exit 0
else
    echo "❌ Health check failed (status: $response)"
    exit 1
fi
