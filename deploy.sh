#!/usr/bin/env sh
# ---------------------------------------------------------------------------
# Local LAN preview for the chess-and-friends dashboard.
#
# Why a container? The Claude/dev container is network-isolated (private Docker
# net); only the *host* Docker daemon can publish a port reachable from the LAN
# at http://192.168.1.15:<PORT> (e.g. to test from a phone). This script drives
# a throwaway nginx container that bind-mounts the site read-only, so edits are
# live and nothing is ever baked into an image.
#
# It is intentionally easy to tear down and discoverable from ANY session:
#   - the container is labelled  managed-by=claude-preview
#   - list every stray preview:  docker ps  --filter label=managed-by=claude-preview
#   - nuke every stray preview:   docker rm -f $(docker ps -aq --filter label=managed-by=claude-preview)
#   - restart policy is "no", so it also dies on the next host reboot.
#
# Usage: ./deploy.sh up | down | status | logs | refresh
# ---------------------------------------------------------------------------
set -eu

NAME="chess-and-friends"
PORT="8099"
HOST_IP="192.168.1.15"
LABEL="managed-by=claude-preview"
# Host path of this repo (/projects == /home/christian/Projects on the host).
HOST_SRC="/home/christian/Projects/chess-and-friends"

url="http://$HOST_IP:$PORT"

case "${1:-}" in
  up)
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    docker run -d \
      --name "$NAME" \
      --label "$LABEL" \
      --label "preview-url=$url" \
      --restart no \
      -p "$PORT:80" \
      -v "$HOST_SRC:/usr/share/nginx/html:ro" \
      nginx:alpine >/dev/null
    echo "up    -> $url   (bind-mounted, edits are live; no rebuild needed)"
    ;;
  down)
    if docker rm -f "$NAME" >/dev/null 2>&1; then
      echo "down  -> removed $NAME"
    else
      echo "down  -> $NAME was not running"
    fi
    ;;
  refresh)
    # Bind-mounted, so files are already live; just restart nginx to be safe.
    docker restart "$NAME" >/dev/null && echo "refresh -> $url"
    ;;
  status)
    docker ps --filter "name=$NAME" \
      --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
    ;;
  logs)
    docker logs --tail 50 "$NAME"
    ;;
  *)
    echo "usage: $0 up | down | status | logs | refresh"
    exit 1
    ;;
esac
