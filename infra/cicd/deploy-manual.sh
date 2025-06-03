#!/bin/bash

scp -i "$PROD_SSH_KEY" -r ./ws "$PROD_CREDS:/var/www/mao-dao/ws"
