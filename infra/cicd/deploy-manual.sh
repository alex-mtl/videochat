#!/bin/bash

# Deployment Script for mao-dao project
# Usage: ./deploy-manual.sh

# --------------------------
# Configuration
# --------------------------
TARGET_DIR="/var/www/mao-dao"
FILES_TO_DEPLOY=(
  "./ws"
  "./videochat"
  "./public/js"
  "./public/css"
  "./public/sfx"
  "./videochat.js"
  "./ws.js"
  "./db.js"
  "./cron-60.js"
)

# --------------------------
# Validate Environment Variables
# --------------------------
if [ -z "$PROD_SSH_KEY" ] || [ -z "$PROD_CREDS" ]; then
  echo "ERROR: Required environment variables not set!"
  echo "Please ensure PROD_SSH_KEY and PROD_CREDS are defined"
  exit 1
fi

# --------------------------
# Deployment Function
# --------------------------
deploy_files() {
  for file in "${FILES_TO_DEPLOY[@]}"; do
    echo "Deploying $file to $TARGET_DIR..."

    if ! scp -i "$PROD_SSH_KEY" -r "$file" "$PROD_CREDS:$TARGET_DIR/"; then
      echo "ERROR: Failed to deploy $file"
      exit 1
    fi

    echo "Successfully deployed $file"
  done
}

# --------------------------
# Main Execution
# --------------------------
echo "Starting deployment to $PROD_CREDS"
deploy_files
echo "All files deployed successfully to $TARGET_DIR"