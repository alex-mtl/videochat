#!/bin/bash

# Renew SSL certificate
sudo certbot --nginx -d video.ttl10.net --force-renewal --non-interactive

# Copy new certificate files
sudo cp /etc/letsencrypt/live/video.ttl10.net/fullchain.pem video.ttl10.cert.pem
sudo cp /etc/letsencrypt/live/video.ttl10.net/privkey.pem video.ttl10.key.pem

# Restart PM2 WebSocket server
pm2 restart ws
pm2 restart videochat
