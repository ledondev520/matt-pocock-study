#!/bin/bash
# Runs one request against the server's deploy gate from GitHub Actions.
# Needs MATT_DEPLOY_HOST, MATT_DEPLOY_PORT, MATT_DEPLOY_USER, and the key and known_hosts files
# written by the workflow (DEPLOY_KEY_FILE, DEPLOY_KNOWN_HOSTS_FILE). stdin is passed through.
set -euo pipefail
: "${MATT_DEPLOY_HOST:?}" "${MATT_DEPLOY_PORT:?}" "${MATT_DEPLOY_USER:?}" "${DEPLOY_KEY_FILE:?}" "${DEPLOY_KNOWN_HOSTS_FILE:?}"
[[ $MATT_DEPLOY_PORT =~ ^[0-9]{1,5}$ ]] || { echo "MATT_DEPLOY_PORT is not a port number" >&2; exit 2; }
exec ssh -T \
  -i "$DEPLOY_KEY_FILE" \
  -o BatchMode=yes -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$DEPLOY_KNOWN_HOSTS_FILE" \
  -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=4 \
  -p "$MATT_DEPLOY_PORT" "$MATT_DEPLOY_USER@$MATT_DEPLOY_HOST" "$*"
