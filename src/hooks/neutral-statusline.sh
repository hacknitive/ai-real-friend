#!/bin/bash
# ai-neutral — statusline badge for Claude Code.
# Reads the neutral-active flag and prints a colored [NEUTRAL] badge.
#
# Usage in settings.json:
#   "statusLine": { "type": "command", "command": "bash /path/to/neutral-statusline.sh" }

FLAG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.neutral-active"

# Refuse symlinks — a local attacker could point the flag at ~/.ssh/id_rsa and
# have the statusline render its bytes to the terminal every keystroke.
[ -L "$FLAG" ] && exit 0
[ ! -f "$FLAG" ] && exit 0

# Hard-cap the read + whitelist. Blocks terminal-escape injection.
STATE=$(head -c 8 "$FLAG" 2>/dev/null | tr -d '\n\r' | tr '[:upper:]' '[:lower:]')
STATE=$(printf '%s' "$STATE" | tr -cd 'a-z')

case "$STATE" in
  on) printf '\033[38;5;33m[NEUTRAL]\033[0m' ;;
  *) exit 0 ;;
esac
