#!/bin/bash
# Kyro Chat — VPS Deploy Script
# Usage: ./deploy.sh [build|start|stop|restart|logs|status]

set -e

APP_DIR="/home/ubuntu/kyro-chat"
LOG_DIR="$APP_DIR/logs"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

case "${1:-deploy}" in
  build)
    echo -e "${YELLOW}Building...${NC}"
    cd "$APP_DIR"
    npm install --production=false
    npm run build
    echo -e "${GREEN}Build complete${NC}"
    ;;

  start)
    echo -e "${YELLOW}Starting services...${NC}"
    mkdir -p "$LOG_DIR"
    cd "$APP_DIR"
    pm2 start ecosystem.config.cjs
    pm2 save
    echo -e "${GREEN}Services started${NC}"
    ;;

  stop)
    echo -e "${YELLOW}Stopping services...${NC}"
    pm2 stop kyro-api kyro-web
    echo -e "${GREEN}Services stopped${NC}"
    ;;

  restart)
    echo -e "${YELLOW}Restarting services...${NC}"
    pm2 restart kyro-api kyro-web
    echo -e "${GREEN}Services restarted${NC}"
    ;;

  logs)
    pm2 logs --lines 50
    ;;

  status)
    pm2 status
    ;;

  deploy)
    echo -e "${YELLOW}Deploying Kyro Chat...${NC}"
    mkdir -p "$LOG_DIR"
    cd "$APP_DIR"

    # Install deps
    npm install --production=false

    # Build
    npm run build

    # Stop existing
    pm2 stop kyro-api kyro-web 2>/dev/null || true

    # Start
    pm2 start ecosystem.config.cjs
    pm2 save

    echo -e "${GREEN}Deploy complete!${NC}"
    pm2 status
    ;;

  *)
    echo "Usage: $0 {build|start|stop|restart|logs|status|deploy}"
    exit 1
    ;;
esac
