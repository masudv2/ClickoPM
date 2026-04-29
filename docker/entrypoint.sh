#!/bin/sh
set -e

# Ensure upload directory exists
mkdir -p "${LOCAL_UPLOAD_DIR:-/data/uploads}"

echo "Running database migrations..."
./migrate up

echo "Starting server..."
exec ./server
