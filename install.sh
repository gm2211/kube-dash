#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${KUBE_DASH_REPO_URL:-https://github.com/gm2211/kube-dash.git}"
INSTALL_DIR="${KUBE_DASH_HOME:-$HOME/.kube-dash}"
BIN_DIR="${KUBE_DASH_BIN_DIR:-$HOME/.local/bin}"
BIN_NAME="${KUBE_DASH_BIN_NAME:-kd}"
ASSUME_YES="${KUBE_DASH_YES:-0}"
# Tracks whether the user explicitly chose a name (flag or env). When unset
# and a prior install is detected, we reuse the existing symlink name.
BIN_NAME_EXPLICIT=0
if [ -n "${KUBE_DASH_BIN_NAME:-}" ]; then
  BIN_NAME_EXPLICIT=1
fi

usage() {
  cat <<'USAGE'
Usage: install.sh [option]

Options:
  --update             Update an existing install to the latest main branch.
  --name <name>        Command name to install. Default: kd
  --yes                Non-interactive mode. Skip prompts; fail on conflicts.
  --help               Show this help.

Environment:
  KUBE_DASH_HOME       Install directory. Default: ~/.kube-dash
  KUBE_DASH_BIN_DIR    Directory for the symlink. Default: ~/.local/bin
  KUBE_DASH_BIN_NAME   Command name. Default: kd
  KUBE_DASH_REPO_URL   Git repository URL.
  KUBE_DASH_YES=1      Non-interactive mode.

Notes:
  Many shells preload the alias 'kd=kubectl describe'. The installer detects
  this and offers to pick a different command name (e.g. kdash, kubedash).
USAGE
}

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'kube-dash: %s is required.\n' "$1" >&2
    exit 1
  fi
}

valid_name() {
  # letters, digits, dash, underscore. must start with letter or underscore.
  [[ "$1" =~ ^[A-Za-z_][A-Za-z0-9_-]*$ ]]
}

# Scan common shell rc files for `alias <name>=...`. Prints matching files.
scan_rc_aliases() {
  local name="$1"
  local rc
  local files=(
    "$HOME/.bashrc"
    "$HOME/.bash_profile"
    "$HOME/.bash_aliases"
    "$HOME/.zshrc"
    "$HOME/.zprofile"
    "$HOME/.zsh_aliases"
    "$HOME/.profile"
    "$HOME/.aliases"
    "$HOME/.config/fish/config.fish"
  )
  for rc in "${files[@]}"; do
    [ -f "$rc" ] || continue
    # Bash/Zsh: alias kd=...   |   Fish: alias kd ... or alias kd=...
    if grep -E -q "^[[:space:]]*alias[[:space:]]+${name}([[:space:]]|=)" "$rc" 2>/dev/null; then
      printf '%s\n' "$rc"
    fi
  done
}

# Ask the user's login shell what `name` resolves to with rc files loaded.
# Prints non-empty output if shell sees a function/alias for the name.
scan_live_shell() {
  local name="$1"
  local shell_bin="${SHELL:-}"
  [ -n "$shell_bin" ] || return 0
  command -v "$shell_bin" >/dev/null 2>&1 || return 0

  case "$(basename "$shell_bin")" in
    bash|zsh)
      # -i loads interactive rc files; -c runs the command. Suppress stderr.
      "$shell_bin" -ic "alias $name 2>/dev/null; type -t $name 2>/dev/null" 2>/dev/null \
        | grep -E -v '^(file|builtin|keyword|)$' \
        | head -n 5
      ;;
    fish)
      "$shell_bin" -i -c "functions -q $name && functions $name | head -n 1; alias $name 2>/dev/null" 2>/dev/null \
        | head -n 5
      ;;
    *)
      ;;
  esac
}

read_tty() {
  # Read a line from the controlling tty so it works under `curl | bash`.
  if [ -r /dev/tty ]; then
    IFS= read -r "$1" </dev/tty || return 1
  else
    return 1
  fi
}

prompt_for_name() {
  local current="$1"
  local choice
  local alt
  local suggestions=(kdash kubedash k8dash kdsh)

  # Filter suggestions: drop any equal to current and any with rc-file conflict.
  local filtered=()
  for alt in "${suggestions[@]}"; do
    [ "$alt" = "$current" ] && continue
    if [ -z "$(scan_rc_aliases "$alt")" ]; then
      filtered+=("$alt")
    fi
  done
  # Always keep at least one fallback.
  if [ "${#filtered[@]}" -eq 0 ]; then
    filtered=(kdash)
  fi

  printf '\n' >&2
  printf 'Pick an option:\n' >&2
  local i=1
  for alt in "${filtered[@]}"; do
    printf '  %d) install as %s\n' "$i" "$alt" >&2
    i=$((i + 1))
  done
  printf '  c) custom name\n' >&2
  printf '  k) keep %s anyway (shell alias will shadow it interactively; use \\%s or full path)\n' "$current" "$current" >&2
  printf '  q) abort\n' >&2
  printf 'Choice [1]: ' >&2

  if ! read_tty choice; then
    printf '\nkube-dash: no tty available; cannot prompt. Re-run with --name <name> or KUBE_DASH_BIN_NAME=<name>.\n' >&2
    exit 1
  fi
  choice="${choice:-1}"

  case "$choice" in
    q|Q) printf 'aborted.\n' >&2; exit 1 ;;
    k|K) printf '%s' "$current" ;;
    c|C)
      printf 'Custom name: ' >&2
      if ! read_tty alt; then
        printf 'kube-dash: read failed.\n' >&2; exit 1
      fi
      if ! valid_name "$alt"; then
        printf 'kube-dash: invalid name: %s\n' "$alt" >&2
        exit 1
      fi
      printf '%s' "$alt"
      ;;
    *)
      if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le "${#filtered[@]}" ]; then
        printf '%s' "${filtered[$((choice - 1))]}"
      else
        printf 'kube-dash: invalid choice: %s\n' "$choice" >&2
        exit 1
      fi
      ;;
  esac
}

resolve_bin_name() {
  local name="$1"
  local rc_hits live_hits

  if ! valid_name "$name"; then
    printf 'kube-dash: invalid name: %s\n' "$name" >&2
    exit 1
  fi

  rc_hits="$(scan_rc_aliases "$name")"
  live_hits="$(scan_live_shell "$name")"

  if [ -z "$rc_hits" ] && [ -z "$live_hits" ]; then
    printf '%s' "$name"
    return 0
  fi

  {
    printf '\nkube-dash: the name "%s" is already taken in your shell.\n' "$name"
    if [ -n "$rc_hits" ]; then
      printf '  Found alias in:\n'
      printf '    %s\n' $rc_hits
    fi
    if [ -n "$live_hits" ]; then
      printf '  Live shell resolution:\n'
      printf '    %s\n' $live_hits
    fi
    printf 'A common one is `alias kd="kubectl describe"`, which would shadow the kube-dash command.\n'
  } >&2

  if [ "$ASSUME_YES" = "1" ]; then
    printf 'kube-dash: --yes set; refusing to install over a conflicting name. Pass --name <alt>.\n' >&2
    exit 1
  fi

  prompt_for_name "$name"
}

find_prior_names() {
  # Lists symlinks in BIN_DIR pointing to $INSTALL_DIR/kd. One per line.
  [ -d "$BIN_DIR" ] || return 0
  local f target
  for f in "$BIN_DIR"/*; do
    [ -L "$f" ] || continue
    target="$(readlink "$f" 2>/dev/null || true)"
    if [ "$target" = "$INSTALL_DIR/kd" ]; then
      basename "$f"
    fi
  done
}

install_or_update() {
  need git
  mkdir -p "$BIN_DIR"

  # Detect prior install: existing symlinks pointing at $INSTALL_DIR/kd.
  local prior_names=()
  while IFS= read -r line; do
    [ -n "$line" ] && prior_names+=("$line")
  done < <(find_prior_names)

  # If the user did not explicitly pick a name and a prior install exists,
  # reuse the existing name so re-running the installer is idempotent.
  if [ "$BIN_NAME_EXPLICIT" = "0" ] && [ "${#prior_names[@]}" -ge 1 ]; then
    BIN_NAME="${prior_names[0]}"
    printf 'kube-dash: detected existing install as "%s"; reusing.\n' "$BIN_NAME" >&2
  fi

  # Resolve final name (may prompt on conflict). If the chosen name already
  # matches a prior symlink, skip the conflict check — it was already resolved.
  local final_name skip_conflict=0
  for n in "${prior_names[@]}"; do
    if [ "$n" = "$BIN_NAME" ]; then
      skip_conflict=1
      break
    fi
  done

  if [ "$skip_conflict" = "1" ]; then
    final_name="$BIN_NAME"
  else
    final_name="$(resolve_bin_name "$BIN_NAME")"
  fi
  local bin_path="$BIN_DIR/$final_name"

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
  ln -sfn "$INSTALL_DIR/kd" "$bin_path"

  printf 'kube-dash installed at %s\n' "$INSTALL_DIR"
  printf '%s linked at %s\n' "$final_name" "$bin_path"

  # Surface stale symlinks from prior installs (different name).
  local stale=()
  local n
  for n in "${prior_names[@]:-}"; do
    [ -n "$n" ] || continue
    [ "$n" = "$final_name" ] && continue
    stale+=("$n")
  done
  if [ "${#stale[@]}" -gt 0 ]; then
    printf '\nFound previous symlinks from earlier installs:\n' >&2
    for n in "${stale[@]}"; do
      printf '  %s -> %s\n' "$BIN_DIR/$n" "$INSTALL_DIR/kd" >&2
    done
    if [ "$ASSUME_YES" = "1" ]; then
      printf 'Leaving them in place. Remove manually if not needed.\n' >&2
    else
      printf 'Remove them? [y/N]: ' >&2
      local ans=""
      if read_tty ans && [[ "$ans" =~ ^[yY]$ ]]; then
        for n in "${stale[@]}"; do
          rm -f "$BIN_DIR/$n"
          printf 'removed %s\n' "$BIN_DIR/$n" >&2
        done
      else
        printf 'kept.\n' >&2
      fi
    fi
  fi

  if command -v "$final_name" >/dev/null 2>&1; then
    printf 'Run: %s\n' "$final_name"
  else
    printf 'Add %s to PATH, then run: %s\n' "$BIN_DIR" "$final_name"
  fi
}

mode="install"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --update)
      mode="update"
      shift
      ;;
    --name)
      BIN_NAME="${2:-}"
      if [ -z "$BIN_NAME" ]; then
        printf 'kube-dash: --name needs a value.\n' >&2
        exit 1
      fi
      BIN_NAME_EXPLICIT=1
      shift 2
      ;;
    --name=*)
      BIN_NAME="${1#--name=}"
      BIN_NAME_EXPLICIT=1
      shift
      ;;
    --yes|-y)
      ASSUME_YES=1
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
