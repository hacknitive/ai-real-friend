# ai-neutral

Neutral-analyst response mode for [Claude Code](https://claude.com/claude-code). Auto-activated at session start, deactivated only when you ask.

Turns every substantive claim into a labeled statement (`[FACT]`, `[INFERENCE]`, `[SPECULATION]`, `[OPINION]`, `[UNKNOWN]`), cites sources inline, forbids sentiment/hedging/pleasantries/moral framing, and refuses to pick a winner on contested questions unless you explicitly ask.

Built for people who want the model to answer like an analyst instead of a cheerleader.

---

## Before / after

**Default Claude:**
> Great question! Rust is generally considered to be safer than C++ because of its ownership model and borrow checker, which help prevent common memory-related bugs. I hope this helps!

**ai-neutral:**
> [FACT] Rust's borrow checker enforces single-writer-or-multiple-readers on references at compile time [rust-lang.org, Ownership chapter]. C++ has no equivalent compile-time check.
>
> [INFERENCE] Certain memory-safety bug classes (use-after-free, data races on references) are unrepresentable in safe Rust; C++ requires runtime tools (ASan, TSan) or manual review to catch them.
>
> [UNKNOWN] Comparative rates of exploitable memory-safety bugs in equivalent Rust vs C++ codebases — no controlled study I can cite. Google Android and Microsoft internal data suggest large deltas in favor of Rust but is proprietary; check [Google Android Security 2022 report] for the closest public figure.

---

## Install

### Claude Code plugin (recommended)

```bash
claude plugin install github:hacknitive/ai-neutral
```

Restart Claude Code. `[NEUTRAL]` badge appears in the statusline on the next session.

### Standalone (no plugin loader)

```bash
git clone https://github.com/hacknitive/ai-neutral
cd ai-neutral
./install.sh                    # installs into $CLAUDE_CONFIG_DIR (or ~/.claude)
./install.sh --all-accounts     # installs into every ~/.claude-* config dir
./install.sh --dry-run          # preview only
./install.sh --uninstall        # remove hooks + skill + settings entries
```

Windows:

```powershell
.\install.ps1
```

Requires Node.js 18+.

---

## How it works

Two Claude Code hooks + one skill + one statusline script.

- **SessionStart hook** — reads config (env / repo / user / default), writes flag to `$CLAUDE_CONFIG_DIR/.neutral-active`, and injects the full skill body into the session as hidden system context. Same session start, mode is already active — nothing for you to type.
- **UserPromptSubmit hook** — watches every prompt for `neutral on` / `neutral off` / `/ai-neutral` / natural-language triggers ("no bias", "just facts", "analyst mode"). Writes the flag. Emits a short per-turn reinforcement reminder so labeling doesn't drift after other plugins inject competing style instructions mid-conversation.
- **Skill** (`skills/ai-neutral/SKILL.md`) — the single source of truth for the mode's behavior: labeling rules, prohibited lexicon, answer shape, self-check.
- **Statusline** — shows `[NEUTRAL]` in the Claude Code statusline whenever the mode is active.

---

## Turning it on/off

| Phrase | Effect |
|--------|--------|
| `neutral on` / `/ai-neutral` / `/neutral` | activate |
| `analyst mode` / `no bias` / `just facts` | activate (natural language) |
| `neutral off` / `/ai-neutral off` / `stop neutral` / `disable neutral` | deactivate |

**`normal mode` is intentionally NOT a deactivation phrase** — other always-on modes (e.g. [caveman](https://github.com/JuliusBrussee/caveman)) claim that phrase for themselves, and ai-neutral is designed to compose independently. If you want both off, say each off phrase.

---

## Configuration

Default state is `on`. Override with any of these, in this priority order:

1. Environment: `NEUTRAL_DEFAULT=off`
2. Repo-local (checked in, walks up from `cwd`): `./.neutral/config.json` or `./.neutral.json`
3. User config: `~/.config/ai-neutral/config.json` (Linux/macOS) / `%APPDATA%\ai-neutral\config.json` (Windows)

Config file shape:

```json
{ "default": "on" }
```

Valid values: `"on"` | `"off"`.

---

## What ships

```
ai-neutral/
├── skills/ai-neutral/SKILL.md    # single source of truth (behavior)
├── src/hooks/
│   ├── neutral-config.js         # shared: defaultState, safeWriteFlag, readFlag
│   ├── neutral-activate.js       # SessionStart — injects skill, writes flag
│   ├── neutral-mode-tracker.js   # UserPromptSubmit — triggers + reinforcement
│   ├── neutral-statusline.sh     # [NEUTRAL] badge (bash)
│   └── neutral-statusline.ps1    # [NEUTRAL] badge (PowerShell)
├── bin/
│   ├── install.js                # standalone installer (merges settings.json)
│   └── lib/settings.js           # JSONC-tolerant reader/writer
├── commands/ai-neutral-init.md   # /ai-neutral-init slash command
├── .claude-plugin/plugin.json    # Claude Code plugin manifest
├── install.sh / install.ps1      # thin shims to bin/install.js
├── package.json / LICENSE / README.md / CLAUDE.md
```

---

## Known limits

- Bias is not eliminable. Training data carry priors on which facts get surfaced, which sources counted authoritative, which framings default. This mode reduces surface tone and enforces labeling — not underlying selection bias.
- For high-stakes questions (medical, legal, financial, safety-critical), cross-check against primary sources and adversarial sources.
- Does not override safety refusals.

---

## Compatibility

- Claude Code v1 (only supported surface for now).
- Composable with [caveman](https://github.com/JuliusBrussee/caveman) and other always-on style modes. `normal mode` is reserved for those; `neutral off` / `stop neutral` deactivates only ai-neutral.

---

## License

MIT. See `LICENSE`.
