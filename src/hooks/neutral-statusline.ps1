# ai-neutral — statusline badge for Claude Code (PowerShell).
# Prints [NEUTRAL] when the flag file exists and reads "on".

$flagDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME '.claude' }
$flagPath = Join-Path $flagDir '.neutral-active'

if (-not (Test-Path -LiteralPath $flagPath -PathType Leaf)) { exit 0 }

# Refuse reparse points (Windows symlinks / junctions).
$item = Get-Item -LiteralPath $flagPath -Force
if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { exit 0 }

try {
  $raw = [System.IO.File]::ReadAllText($flagPath)
} catch { exit 0 }

$state = ($raw -replace '[^a-zA-Z]', '').Trim().ToLower()
if ($state.Length -gt 8) { exit 0 }

if ($state -eq 'on') {
  $esc = [char]27
  Write-Host -NoNewline "$esc[38;5;33m[NEUTRAL]$esc[0m"
}
