#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${KUBE_DASH_REPO_URL:-https://github.com/gm2211/kube-dash.git}"
INSTALL_DIR="${KUBE_DASH_HOME:-$HOME/.kube-dash}"
BIN_DIR="${KUBE_DASH_BIN_DIR:-$HOME/.local/bin}"
BIN_PATH="$BIN_DIR/kd"

usage() {
  cat <<'USAGE'
Usage: install.sh [option]

Options:
  --update     Update an existing install to the latest main branch.
  --help       Show this help.

Environment:
  KUBE_DASH_HOME       Install directory. Default: ~/.kube-dash
  KUBE_DASH_BIN_DIR    Directory for the kd symlink. Default: ~/.local/bin
  KUBE_DASH_REPO_URL   Git repository URL.
USAGE
}

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'kube-dash: %s is required.\n' "$1" >&2
    exit 1
  fi
}

install_or_update() {
  need git
  mkdir -p "$BIN_DIR"

  if [ -d "$INSTALL_DIR/.git" ]; then
    git -C "$INSTALL_DIR" fetch --prune origin
    git -C "$INSTALL_DIR" checkout main
    git -C "$INSTALL_DIR" pull --ff-only origin main
  else
    if [ -e "$INSTALL_DIR" ]; then
      printf 'kube-dash: %s exists but is not a git checkout.\n' "$INSTALL_DIR" >&2
      exit 1
    fi
    git clone "$REPO_URL" "$INSTALL_DIR"
  fi

  chmod +x "$INSTALL_DIR/kd" "$INSTALL_DIR/kd-server.py"
  ln -sfn "$INSTALL_DIR/kd" "$BIN_PATH"

  printf 'kube-dash installed at %s\n' "$INSTALL_DIR"
  printf 'kd linked at %s\n' "$BIN_PATH"
  if command -v kd >/dev/null 2>&1; then
    printf 'Run: kd\n'
  else
    printf 'Add %s to PATH, then run: kd\n' "$BIN_DIR"
  fi
}

mode="install"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --update)
      mode="update"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      printf 'kube-dash: unknown option: %s\n\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

case "$mode" in
  install|update)
    install_or_update
    ;;
esac
