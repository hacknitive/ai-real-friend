#!/usr/bin/env node
// ai-neutral — UserPromptSubmit hook.
//
// Responsibilities each turn:
//   1. Parse the user prompt for activation/deactivation triggers
//      (slash commands + natural language).
//   2. Write the flag file accordingly.
//   3. When the flag reads 'on', emit a short reinforcement reminder as
//      hookSpecificOutput additionalContext so the labeling rules stay
//      anchored after other plugins inject competing style instructions.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { getDefaultState, safeWriteFlag, readFlag } = require('./neutral-config');

const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const flagPath = path.join(claudeDir, '.neutral-active');

let input = '';
process.stdin.on('data', chunk => { input += chunk; });
// Broken-pipe / parent-crash guard: emit nothing rather than throwing.
process.stdin.on('error', () => process.exit(0));
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const prompt = (data.prompt || '').trim().toLowerCase().replace(/\s+/g, ' ');

    // Deactivation intent — computed FIRST so "turn neutral off" never falls
    // through to activation. `normal mode` intentionally excluded: it belongs
    // to other modes (e.g., caveman) and must not deactivate ai-neutral.
    const wantsOff =
      /\b(stop|disable|deactivate|quit|exit|kill|end)\s+(the\s+)?(ai[-\s]?)?neutral(\s+(mode|analyst))?\b/.test(prompt) ||
      /\b(ai[-\s]?)?neutral(\s+(mode|analyst))?\s+(off|stop|disabled?)\b/.test(prompt) ||
      /\bturn\s+off\s+(the\s+)?(ai[-\s]?)?neutral\b/.test(prompt) ||
      /\bstop\s+analyst(\s+mode)?\b/.test(prompt);

    // Questions about neutral mode are not activation commands.
    const isQuestion =
      /^(what|whats|what's|how|why|when|where|who|does|do|did|is|are|can|could|would|should|tell me|explain)\b/.test(prompt);

    // Natural-language activation. Kept conservative so ordinary uses of the
    // word "neutral" (e.g. "neutral color", "network neutrality") do not flip
    // the mode. Requires either an explicit verb, "neutral mode/analyst",
    // a bare `neutral on`, or a "no bias / no emotion / just facts" request.
    if (!wantsOff && !isQuestion) {
      if (/\b(activate|enable|start|turn on|use|switch to|want|give me|go)\b[^.]{0,40}\b(ai[-\s]?)?neutral\b/.test(prompt) ||
          /\banalyst\s+mode\s+(on|please|now|active)\b/.test(prompt) ||
          /\b(ai[-\s]?)?neutral(\s+(mode|analyst))?\s+(on|please|now|active)\b/.test(prompt) ||
          /^(ai[-\s]?)?neutral\s*[.!]*$/.test(prompt) ||
          /\b(no\s+bias|no\s+emotion|just\s+facts|answer\s+neutrally|source[-\s]labeled)\b/.test(prompt)) {
        const s = getDefaultState();
        if (s === 'on') safeWriteFlag(flagPath, 'on');
      }
    }

    // Slash commands. Accept both bare and marketplace-namespaced forms.
    // /ai-neutral, /neutral                    → on (or the configured default)
    // /ai-neutral off, /neutral off            → off
    // /ai-neutral on,  /neutral on             → on
    if (prompt.startsWith('/ai-neutral') || prompt.startsWith('/neutral') ||
        prompt.startsWith('/ai-neutral:ai-neutral')) {
      const parts = prompt.split(/\s+/);
      const arg = (parts[1] || '').toLowerCase();
      if (arg === 'off' || arg === 'stop' || arg === 'disable') {
        try { fs.unlinkSync(flagPath); } catch (e) {}
      } else if (arg === 'on' || arg === '') {
        safeWriteFlag(flagPath, 'on');
      }
      // Unknown arg → flag untouched. No silent overwrite.
    }

    // Apply the deactivation detected at the top.
    if (wantsOff) {
      try { fs.unlinkSync(flagPath); } catch (e) {}
    }

    // Per-turn reinforcement. Full ruleset comes from SessionStart; this is
    // an attention anchor to counteract mid-conversation instruction drift.
    // readFlag whitelist-validates so a symlinked / corrupted / oversized flag
    // yields null and nothing is emitted (never inject untrusted bytes).
    const active = readFlag(flagPath);
    if (active === 'on') {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext: 'AI-NEUTRAL MODE ACTIVE. ' +
            'Label every substantive statement: [FACT] / [INFERENCE] / [SPECULATION] / [OPINION, requested] / [UNKNOWN]. ' +
            'Cite sources inline; no fabricated citations. ' +
            'No sentiment/hedging/softeners/pleasantries/moral framing. ' +
            'Contested questions: enumerate positions, do not pick a winner unless asked. ' +
            'Off phrase: "neutral off" / "stop neutral". "normal mode" is NOT an off switch here.'
        }
      }));
    }
  } catch (e) { /* silent */ }
});
