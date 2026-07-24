---
description: Install ai-real-friend hooks + skill into one or more Claude Code config dirs (mirrors caveman-init)
argument-hint: "[--dry-run] [--config-dir PATH] [--all-accounts] [--no-statusline] [--uninstall]"
---

Run the ai-real-friend installer against the requested Claude Code config dir(s). By default installs into `$CLAUDE_CONFIG_DIR` (falls back to `~/.claude`). Pass `--all-accounts` to install into every `~/.claude-*` directory that looks like a config dir (multi-account setups).

Order of resolution — pick the first that applies:

1. If you are inside a checked-out clone of this repo (`bin/install.js` exists at the repo root), run:
   `node bin/install.js $ARGUMENTS`
2. Otherwise clone the repo and run the installer:
   `git clone https://github.com/hacknitive/ai-real-friend /tmp/ai-real-friend && node /tmp/ai-real-friend/bin/install.js $ARGUMENTS`

Always run once with `--dry-run` first when the user did not pass `--force`-style flags, so you never silently overwrite an existing `settings.json` merge without showing the plan.
