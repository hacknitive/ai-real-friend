#!/usr/bin/env node
// ai-real-friend — Claude Code SessionStart hook.
//
// Runs on every session start:
//   1. Resolves default state (env / repo config / user config / 'on').
//   2. Writes flag file at $CLAUDE_CONFIG_DIR/.friend-active (statusline reads this).
//   3. When state is 'on', emits the full SKILL.md ruleset as SessionStart context.
//      SessionStart hook stdout is injected as hidden system context.
//   4. When state is 'off', deletes the flag and exits without injecting rules.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { getDefaultState, safeWriteFlag } = require('./friend-config');

const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const flagPath = path.join(claudeDir, '.friend-active');
const settingsPath = path.join(claudeDir, 'settings.json');

const state = getDefaultState();

if (state === 'off') {
  try { fs.unlinkSync(flagPath); } catch (e) {}
  process.stdout.write('OK');
  process.exit(0);
}

safeWriteFlag(flagPath, 'on');

// Read SKILL.md — single source of truth. Try known locations in order:
//   1. $CLAUDE_PLUGIN_ROOT/skills/ai-real-friend/SKILL.md (Claude Code plugin runtime).
//   2. ../../skills/ai-real-friend/SKILL.md (repo checkout / plugin layout).
//   3. ../skills/ai-real-friend/SKILL.md (standalone install with hooks + skills siblings).
const skillCandidates = [];
if (process.env.CLAUDE_PLUGIN_ROOT) {
  skillCandidates.push(path.join(process.env.CLAUDE_PLUGIN_ROOT, 'skills', 'ai-real-friend', 'SKILL.md'));
}
skillCandidates.push(
  path.join(__dirname, '..', '..', 'skills', 'ai-real-friend', 'SKILL.md'),
  path.join(__dirname, '..', 'skills', 'ai-real-friend', 'SKILL.md')
);

let skillContent = '';
for (const p of skillCandidates) {
  try { skillContent = fs.readFileSync(p, 'utf8'); break; } catch (e) {}
}

let output;
if (skillContent) {
  const body = skillContent.replace(/^---[\s\S]*?---\s*/, '');
  output = 'AI-REAL-FRIEND MODE ACTIVE\n\n' + body;
} else {
  // Minimum viable ruleset when SKILL.md is not on disk.
  output =
    'AI-REAL-FRIEND MODE ACTIVE\n\n' +
    'Output is information, not communication. Persist for the whole conversation.\n\n' +
    '## Rules\n\n' +
    '1. Label every substantive statement: [FACT], [INFERENCE], [SPECULATION], [OPINION] (only when requested), [UNKNOWN].\n' +
    '2. Quantify uncertainty numerically. No "often/usually/most" without a number.\n' +
    '3. Cite sources inline. Never fabricate; mark unverifiable recall as [UNVERIFIED CITATION].\n' +
    '4. Contested questions: enumerate positions P1, P2, ...; do not pick a winner unless asked.\n' +
    '5. Tradeoffs: render as a table (option | benefit | cost | when it dominates).\n' +
    '6. No causal verbs without a cited mechanism. Default to "correlates with", "precedes".\n' +
    '7. Underspecified questions: list ambiguities A1, A2, ..., with the answer each disambiguation produces.\n\n' +
    '## Prohibited lexicon\n\n' +
    'Sentiment (great, terrible, unfortunately), hedging (I think, arguably, perhaps), softeners (just, simply, obviously), pleasantries (sure, happy to, apologies), moral framing (should, ought, good, bad) except when quoting or when normative answer requested.\n\n' +
    '## Off\n\n' +
    'Deactivate on: "friend off", "stop friend", "disable friend", "/friend off". "normal mode" does NOT deactivate — reserved for other modes.\n\n' +
    '## Safety\n\n' +
    'Does not override safety refusals.';
}

// Statusline nudge: only when statusLine is absent from settings.json.
try {
  let hasStatusline = false;
  if (fs.existsSync(settingsPath)) {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    if (settings.statusLine) hasStatusline = true;
  }
  if (!hasStatusline) {
    const isWindows = process.platform === 'win32';
    const scriptName = isWindows ? 'friend-statusline.ps1' : 'friend-statusline.sh';
    const scriptPath = path.join(__dirname, scriptName);
    const command = isWindows
      ? `powershell -ExecutionPolicy Bypass -File "${scriptPath}"`
      : `bash "${scriptPath}"`;
    output += '\n\nSTATUSLINE SETUP NEEDED: ai-real-friend ships a statusline badge showing [FRIEND] when active. Not configured yet. To enable, add to ' + path.join(claudeDir, 'settings.json') + ': "statusLine": { "type": "command", "command": ' + JSON.stringify(command) + ' }. Proactively offer to set this up on first interaction.';
  }
} catch (e) { /* silent */ }

process.stdout.write(output);
