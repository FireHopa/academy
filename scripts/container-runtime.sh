#!/usr/bin/env bash
# Compartilhado por scripts Linux. Mantém Docker Compose como referência de produção
# e aceita Podman Compose apenas como compatibilidade de desenvolvimento (Bazzite/Fedora Atomic).
detect_container_runtime(){
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    CONTAINER_ENGINE="docker"
    COMPOSE_CMD=(docker compose)
    return 0
  fi
  if command -v podman >/dev/null 2>&1 && command -v podman-compose >/dev/null 2>&1; then
    CONTAINER_ENGINE="podman"
    COMPOSE_CMD=(podman-compose)
    return 0
  fi
  if command -v podman >/dev/null 2>&1 && podman compose version >/dev/null 2>&1; then
    CONTAINER_ENGINE="podman"
    COMPOSE_CMD=(podman compose)
    return 0
  fi
  return 1
}
