#!/usr/bin/env node
// ai-neutral — shared configuration + safe flag file IO.
//
// Resolution order for default state:
//   1. NEUTRAL_DEFAULT environment variable
//   2. Repo-local config walked up from cwd:
//      - <dir>/.neutral/config.json
//      - <dir>/.neutral.json
//   3. User config file:
//      - $XDG_CONFIG_HOME/ai-neutral/config.json
//      - ~/.config/ai-neutral/config.json  (macOS / Linux fallback)
//      - %APPDATA%\ai-neutral\config.json  (Windows fallback)
//   4. 'on'
//
// Config file shape: { "default": "on" | "off" }

const fs = require('fs');
const path = require('path');
const os = require('os');

const VALID_STATES = ['on', 'off'];

function getUserConfigDir() {
  if (process.env.XDG_CONFIG_HOME) {
    return path.join(process.env.XDG_CONFIG_HOME, 'ai-neutral');
  }
  if (process.platform === 'win32') {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      'ai-neutral'
    );
  }
  return path.join(os.homedir(), '.config', 'ai-neutral');
}

function getUserConfigPath() {
  return path.join(getUserConfigDir(), 'config.json');
}

// Walk up from `start` looking for repo-local ai-neutral config.
// Bounded at 64 ancestors. Refuses symlinks.
function findRepoConfigPath(start) {
  try {
    let dir = path.resolve(start || process.cwd());
    const candidates = ['.neutral/config.json', '.neutral.json'];
    for (let i = 0; i < 64; i++) {
      for (const rel of candidates) {
        const p = path.join(dir, rel);
        try {
          const st = fs.lstatSync(p);
          if (st.isSymbolicLink() || !st.isFile()) continue;
          return p;
        } catch (e) { /* not present */ }
      }
      const parent = path.dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  } catch (e) { /* fs failure */ }
  return null;
}

function readStateFromConfigFile(configPath) {
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const cfg = JSON.parse(raw);
    if (cfg && cfg.default && VALID_STATES.includes(String(cfg.default).toLowerCase())) {
      return String(cfg.default).toLowerCase();
    }
  } catch (e) { /* fall through */ }
  return null;
}

function getDefaultState() {
  const envState = process.env.NEUTRAL_DEFAULT;
  if (envState && VALID_STATES.includes(envState.toLowerCase())) {
    return envState.toLowerCase();
  }
  const repoPath = findRepoConfigPath(process.cwd());
  if (repoPath) {
    const s = readStateFromConfigFile(repoPath);
    if (s) return s;
  }
  const userState = readStateFromConfigFile(getUserConfigPath());
  if (userState) return userState;
  return 'on';
}

// Symlink-safe flag write. Atomic temp + rename. 0600 perms.
// Refuses when the flag path itself is a symlink (the actual clobber vector).
// When the parent dir is a symlink, resolves and verifies ownership so
// legitimate patterns like `ln -s /opt/shared-claude ~/.claude` still work.
function safeWriteFlag(flagPath, content) {
  const debug = process.env.NEUTRAL_DEBUG === '1';
  try {
    const flagDir = path.dirname(flagPath);
    fs.mkdirSync(flagDir, { recursive: true });

    let realFlagDir;
    try {
      const lstat = fs.lstatSync(flagDir);
      if (lstat.isSymbolicLink()) {
        realFlagDir = fs.realpathSync(flagDir);
        const realStat = fs.statSync(realFlagDir);
        if (!realStat.isDirectory()) return;
        if (typeof process.getuid === 'function') {
          if (realStat.uid !== process.getuid()) {
            if (debug) process.stderr.write(`[ai-neutral] refusing symlink to uid ${realStat.uid}\n`);
            return;
          }
        } else {
          const home = path.resolve(os.homedir());
          const real = path.resolve(realFlagDir);
          if (!real.toLowerCase().startsWith(home.toLowerCase() + path.sep) &&
              real.toLowerCase() !== home.toLowerCase()) return;
        }
      } else {
        realFlagDir = flagDir;
      }
    } catch (e) { return; }

    const realFlagPath = path.join(realFlagDir, path.basename(flagPath));
    try {
      if (fs.lstatSync(realFlagPath).isSymbolicLink()) return;
    } catch (e) {
      if (e.code !== 'ENOENT') return;
    }

    const tempPath = path.join(realFlagDir, `.neutral-active.${process.pid}.${Date.now()}`);
    const O_NOFOLLOW = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
    const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | O_NOFOLLOW;
    let fd;
    try {
      fd = fs.openSync(tempPath, flags, 0o600);
      fs.writeSync(fd, String(content));
      try { fs.fchmodSync(fd, 0o600); } catch (e) { /* best-effort on Windows */ }
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
    fs.renameSync(tempPath, realFlagPath);
  } catch (e) { /* silent — flag is best-effort */ }
}

// Symlink-safe, size-capped, whitelist-validated flag read.
// Returns 'on' | 'off' | null.
const MAX_FLAG_BYTES = 8;

function readFlag(flagPath) {
  try {
    let st;
    try { st = fs.lstatSync(flagPath); } catch (e) { return null; }
    if (st.isSymbolicLink() || !st.isFile()) return null;
    if (st.size > MAX_FLAG_BYTES) return null;

    const O_NOFOLLOW = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
    const flags = fs.constants.O_RDONLY | O_NOFOLLOW;
    let fd, out;
    try {
      fd = fs.openSync(flagPath, flags);
      const buf = Buffer.alloc(MAX_FLAG_BYTES);
      const n = fs.readSync(fd, buf, 0, MAX_FLAG_BYTES, 0);
      out = buf.slice(0, n).toString('utf8');
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
    const raw = out.trim().toLowerCase();
    if (!VALID_STATES.includes(raw)) return null;
    return raw;
  } catch (e) { return null; }
}

module.exports = {
  VALID_STATES,
  getUserConfigDir,
  getUserConfigPath,
  findRepoConfigPath,
  getDefaultState,
  safeWriteFlag,
  readFlag,
};
