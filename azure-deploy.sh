#!/usr/bin/env bash
set -euo pipefail

# Prototype deployment script for Azure App Service (Linux, Python 3.11)
# Usage: export RESOURCE_GROUP=... APP_NAME=... REGION=... then run ./azure-deploy.sh
# Cosmos-related settings are optional. If not used, they are skipped.

if [[ -z "${RESOURCE_GROUP:-}" || -z "${APP_NAME:-}" || -z "${REGION:-}" ]]; then
  echo "RESOURCE_GROUP, APP_NAME, and REGION env vars are required." >&2
  exit 1
fi

COSMOS_URI=${COSMOS_URI:-}
COSMOS_KEY=${COSMOS_KEY:-}
COSMOS_DB=${COSMOS_DB:-}
COSMOS_CONTAINER=${COSMOS_CONTAINER:-}

az group create -n "$RESOURCE_GROUP" -l "$REGION"
az appservice plan create -g "$RESOURCE_GROUP" -n "${APP_NAME}-plan" --sku B1 --is-linux
az webapp create -g "$RESOURCE_GROUP" -p "${APP_NAME}-plan" -n "$APP_NAME" --runtime "PYTHON:3.11"

if [[ -n "$COSMOS_URI" ]]; then
  az webapp config appsettings set -g "$RESOURCE_GROUP" -n "$APP_NAME" --settings \
    COSMOS_URI="$COSMOS_URI" COSMOS_KEY="$COSMOS_KEY" COSMOS_DB="$COSMOS_DB" COSMOS_CONTAINER="$COSMOS_CONTAINER"
fi

# Local Git deployment endpoint; user can push this repo directly
az webapp deployment source config-local-git -g "$RESOURCE_GROUP" -n "$APP_NAME"
echo "Deployment endpoint configured. Use: git remote add azure <deployment-url>; git push azure main"
