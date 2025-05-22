#!/bin/bash

# Renew SSL certificate
sudo certbot --nginx -d mao-dao.com --force-renewal --non-interactive

# Copy new certificate files
sudo cp /etc/letsencrypt/live/mao-dao.com/fullchain.pem keys/cert.pem
sudo cp /etc/letsencrypt/live/mao-dao.com/privkey.pem keys/key.pem

# Restart PM2 WebSocket server
pm2 restart mao-dao-ws
pm2 restart mao-dao-vc
