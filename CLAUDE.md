# CLAUDE.md — ai-real-friend

Maintainer notes for anyone (or any AI agent) editing this repo.

## Single source of truth

| File | Owns |
|------|------|
| `skills/ai-real-friend/SKILL.md` | Behavior of the mode — labeling rules, prohibited lexicon, answer shape, off-phrase list. This is what SessionStart injects. Edit here, nothing else. |
| `src/hooks/friend-config.js` | Default-state resolution (env → repo → user → `'on'`), `safeWriteFlag`, `readFlag`. Anything that touches the flag file goes through these — direct `fs.writeFileSync` reopens the symlink-clobber attack surface. |
| `src/hooks/friend-activate.js` | SessionStart hook. Reads SKILL.md at runtime and injects the body — do not hardcode a duplicate ruleset anywhere else (the file-not-found fallback is a minimum viable copy, kept short on purpose). |
| `src/hooks/friend-mode-tracker.js` | UserPromptSubmit hook. Owns natural-language trigger regexes and per-turn reinforcement. |
| `.claude-plugin/plugin.json` | Plugin manifest. Points at `${CLAUDE_PLUGIN_ROOT}/src/hooks/*.js`. |
| `bin/install.js` + `bin/lib/settings.js` | Standalone installer. Merges hooks into `settings.json` (JSONC-tolerant), embeds the `ai-real-friend` marker in every command so `--uninstall` strips cleanly. |

Never edit a copy of any of these under `plugins/` or `dist/` — none of those exist yet; if CI mirroring is added later, source files stay canonical.

## Design constraints

- **`normal mode` MUST NOT deactivate ai-real-friend.** Composability with caveman (and any other always-on mode that uses `normal mode` as its off switch) depends on this. The off phrases are `friend off`, `stop friend`, `disable friend`, `/ai-real-friend off`, `/friend off`. Adding `normal mode` to `wantsOff` breaks the promise made in the README's Turning it on/off table.
- **Flag file writes go through `safeWriteFlag`.** Predictable path (`$CLAUDE_CONFIG_DIR/.friend-active`) means an attacker with write access to the parent dir can plant a symlink to any user-readable file and hijack the statusline or reinforcement channel. `safeWriteFlag` refuses symlinks at the flag path and verifies ownership when the parent dir is a symlink.
- **Flag file reads go through `readFlag`.** Symlink refusal + size cap + whitelist. Never read the flag with plain `fs.readFileSync`.
- **Hooks must silent-fail on every filesystem error.** A crash in a hook can block session start.
- **Respect `CLAUDE_CONFIG_DIR`.** Never hardcode `~/.claude` — multi-account setups depend on the env var.
- **Default state is `'on'`.** The whole premise is auto-activation at session start. Anyone who wants opt-in only can set `FRIEND_DEFAULT=off` or `~/.config/ai-real-friend/config.json` `{"default": "off"}`.

## Hook contract quick reference

SessionStart hook stdout is injected into the session as hidden system context. Emit the SKILL.md body (minus frontmatter) plus a short header.

UserPromptSubmit hook stdin is JSON: `{ prompt: string, transcript_path?: string, ... }`. Stdout, if a JSON object with `hookSpecificOutput.additionalContext`, is appended to the model's context for that turn. Non-JSON stdout is ignored. Exit non-zero and Claude Code surfaces a red hook-error banner — avoid.

## Adding a new activation trigger

1. Extend the regex in `src/hooks/friend-mode-tracker.js` inside the `if (!wantsOff && !isQuestion)` block. Keep it conservative: an ordinary use of the word `friend` (e.g. "my friend", "friend request", "friendly") must not flip the mode.
2. Update the "Turning it on/off" table in `README.md`.
3. Update the `metadata.triggers` list in `skills/ai-real-friend/SKILL.md`.

## Testing manually

```bash
# End-to-end plugin install
claude plugin install /path/to/local/checkout   # or github URL after push
# → next session should show [FRIEND] in statusline

# Standalone install into a scratch config dir
./install.sh --dry-run --config-dir /tmp/fake-claude-dir
./install.sh --config-dir /tmp/fake-claude-dir
cat /tmp/fake-claude-dir/settings.json
./install.sh --uninstall --config-dir /tmp/fake-claude-dir

# Hook smoke test
node src/hooks/friend-activate.js
echo '{"prompt":"friend on"}' | node src/hooks/friend-mode-tracker.js
echo '{"prompt":"friend off"}' | node src/hooks/friend-mode-tracker.js
```

## Version bumps

`package.json` `version`. No plugin.json version yet — add if Claude Code plugin loader starts consuming it.

## License

MIT. Keep `LICENSE` at repo root.
