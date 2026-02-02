#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/deploy/hetzner/docker-compose.yml"
ENV_FILE="$REPO_ROOT/deploy/hetzner/.env"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Missing compose file: $COMPOSE_FILE" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  echo "Copy deploy/hetzner/.env.example to deploy/hetzner/.env on the VPS." >&2
  exit 1
fi

echo "==> Repo: $REPO_ROOT"

echo "==> Pulling latest code"
git -C "$REPO_ROOT" pull

echo "==> Building + starting services"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build --remove-orphans

echo "==> Done"

echo

echo "Useful commands:"

echo "  docker compose -f $COMPOSE_FILE --env-file $ENV_FILE ps"

echo "  docker compose -f $COMPOSE_FILE --env-file $ENV_FILE logs -f --tail=200"
