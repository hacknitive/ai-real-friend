#!/usr/bin/env node
// ai-neutral — standalone Claude Code installer.
//
// Two install modes:
//   1. Plugin install (recommended): Claude Code's plugin loader reads
//      .claude-plugin/plugin.json directly. Nothing for this script to do.
//   2. Standalone install (this script): copies hooks + skill into
//      $CLAUDE_CONFIG_DIR and merges SessionStart + UserPromptSubmit + statusLine
//      into settings.json. Use when the plugin loader is unavailable or when
//      the user wants a single-account, plugin-free wiring.
//
// Flags:
//   --dry-run       show planned changes, write nothing
//   --uninstall     strip our hook entries + delete our files
//   --config-dir P  install into P instead of $CLAUDE_CONFIG_DIR / ~/.claude
//   --all-accounts  install into every ~/.claude-* directory that looks like a
//                   Claude Code config dir. Convenience for multi-account setups.
//   --statusline / --no-statusline   force enable/skip statusline merge (default: enable)
//   --help          print usage

const fs = require('fs');
const path = require('path');
const os = require('os');
const { readSettings, writeSettings, stripOurHooks, ensureHook, MARKER } =
  require('./lib/settings');

function log(msg) { process.stdout.write(msg + '\n'); }

function usage() {
  log('Usage: node bin/install.js [--dry-run] [--uninstall] [--config-dir PATH] [--all-accounts] [--no-statusline]');
}

function parseArgs(argv) {
  const args = { dryRun: false, uninstall: false, configDir: null, allAccounts: false, statusline: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--uninstall') args.uninstall = true;
    else if (a === '--all-accounts') args.allAccounts = true;
    else if (a === '--no-statusline') args.statusline = false;
    else if (a === '--statusline') args.statusline = true;
    else if (a === '--config-dir') { args.configDir = argv[++i]; }
    else if (a === '--help' || a === '-h') { usage(); process.exit(0); }
    else { log(`unknown flag: ${a}`); usage(); process.exit(2); }
  }
  return args;
}

function resolveTargets(args) {
  if (args.configDir) return [path.resolve(args.configDir)];
  if (args.allAccounts) {
    const home = os.homedir();
    const primary = path.join(home, '.claude');
    const extras = fs.readdirSync(home)
      .filter(name => name.startsWith('.claude-'))
      .map(name => path.join(home, name))
      .filter(p => {
        try { return fs.statSync(p).isDirectory(); } catch (e) { return false; }
      });
    const all = [primary, ...extras].filter(p => fs.existsSync(p));
    return all;
  }
  return [process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')];
}

function copyTree(src, dst, dryRun) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    if (!dryRun) fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyTree(path.join(src, entry), path.join(dst, entry), dryRun);
    }
  } else {
    if (dryRun) return;
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    if (src.endsWith('.sh')) {
      try { fs.chmodSync(dst, 0o755); } catch (e) {}
    }
  }
}

function removeTree(target, dryRun) {
  if (!fs.existsSync(target)) return;
  if (dryRun) return;
  fs.rmSync(target, { recursive: true, force: true });
}

function install(target, args) {
  const repoRoot = path.resolve(__dirname, '..');
  const hooksSrc = path.join(repoRoot, 'src', 'hooks');
  const skillsSrc = path.join(repoRoot, 'skills');
  const hooksDst = path.join(target, 'hooks', 'ai-neutral');
  const skillsDst = path.join(target, 'skills');
  const settingsPath = path.join(target, 'settings.json');

  log(`[${target}] installing (dry-run=${args.dryRun})`);
  log(`  copy hooks:  ${hooksSrc} -> ${hooksDst}`);
  copyTree(hooksSrc, hooksDst, args.dryRun);
  log(`  copy skill:  ${path.join(skillsSrc, 'ai-neutral')} -> ${path.join(skillsDst, 'ai-neutral')}`);
  copyTree(path.join(skillsSrc, 'ai-neutral'), path.join(skillsDst, 'ai-neutral'), args.dryRun);

  let settings;
  try { settings = readSettings(settingsPath); }
  catch (e) { log(`  ! ${e.message}`); return; }

  // Merge SessionStart + UserPromptSubmit hook entries. Marker in every
  // command string so the uninstaller can strip cleanly.
  const nodeCmd = 'node';
  const sessionHook = {
    type: 'command',
    command: `${nodeCmd} "${path.join(hooksDst, 'neutral-activate.js')}"`,
    timeout: 5,
  };
  const promptHook = {
    type: 'command',
    command: `${nodeCmd} "${path.join(hooksDst, 'neutral-mode-tracker.js')}"`,
    timeout: 5,
  };
  ensureHook(settings, 'SessionStart', sessionHook);
  ensureHook(settings, 'UserPromptSubmit', promptHook);

  if (args.statusline && !settings.statusLine) {
    const isWindows = process.platform === 'win32';
    const scriptName = isWindows ? 'neutral-statusline.ps1' : 'neutral-statusline.sh';
    const scriptPath = path.join(hooksDst, scriptName);
    settings.statusLine = {
      type: 'command',
      command: isWindows
        ? `powershell -ExecutionPolicy Bypass -File "${scriptPath}"`
        : `bash "${scriptPath}"`,
    };
  }

  if (!args.dryRun) writeSettings(settingsPath, settings);
  log(`  merged hooks into ${settingsPath}`);
  log(`[${target}] done`);
}

function uninstall(target, args) {
  const hooksDst = path.join(target, 'hooks', 'ai-neutral');
  const skillsDst = path.join(target, 'skills', 'ai-neutral');
  const settingsPath = path.join(target, 'settings.json');

  log(`[${target}] uninstalling (dry-run=${args.dryRun})`);
  removeTree(hooksDst, args.dryRun);
  removeTree(skillsDst, args.dryRun);
  log(`  removed ${hooksDst}`);
  log(`  removed ${skillsDst}`);

  if (fs.existsSync(settingsPath)) {
    let settings;
    try { settings = readSettings(settingsPath); }
    catch (e) { log(`  ! ${e.message}`); return; }
    stripOurHooks(settings);
    if (settings.statusLine && typeof settings.statusLine.command === 'string' &&
        settings.statusLine.command.includes(MARKER)) {
      delete settings.statusLine;
    }
    if (!args.dryRun) writeSettings(settingsPath, settings);
    log(`  stripped hooks from ${settingsPath}`);
  }
  log(`[${target}] done`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const targets = resolveTargets(args);
  if (targets.length === 0) {
    log('no Claude Code config dirs found');
    process.exit(1);
  }
  for (const t of targets) {
    if (args.uninstall) uninstall(t, args);
    else install(t, args);
  }
}

main();
