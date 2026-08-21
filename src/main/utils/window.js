// 当前激活窗口采集。Windows 用 PowerShell + user32（无额外原生依赖）。
// 失败时静默返回 null，绝不影响主流程。契约：永远返回 Promise。
const { execFile } = require('child_process')

const PS_SCRIPT = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinFore {
  [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder t, int c);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
  [DllImport("kernel32.dll")] public static extern uint GetTickCount();
  public static uint IdleSeconds() {
    LASTINPUTINFO lii = new LASTINPUTINFO();
    lii.cbSize = (uint)System.Runtime.InteropServices.Marshal.SizeOf(typeof(LASTINPUTINFO));
    if (!GetLastInputInfo(ref lii)) return 0;
    return (GetTickCount() - lii.dwTime) / 1000;
  }
}
"@
$h = [WinFore]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 512
[WinFore]::GetWindowText($h, $sb, 512) | Out-Null
$pid2 = 0
[WinFore]::GetWindowThreadProcessId($h, [ref]$pid2) | Out-Null
$name = (Get-Process -Id $pid2 -ErrorAction SilentlyContinue).ProcessName
$idle = [WinFore]::IdleSeconds()
if ($sb.ToString()) { Write-Output ("{0}|{1}|{2}" -f $sb.ToString(), $name, $idle) }
`

let cachedPromise = null
let lastAt = 0
const CACHE_MS = 5000

function getActiveWindow(force = false) {
  const now = Date.now()
  if (!force && cachedPromise && now - lastAt < CACHE_MS) return cachedPromise

  const p = new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS_SCRIPT], {
      timeout: 4000,
      windowsHide: true,
      encoding: 'utf8'
    }, (err, stdout) => {
      if (err || !stdout) {
        resolve(null)
        return
      }
      const line = stdout.trim().split(/\r?\n/)[0]
      const [title, processName, idleSec] = line.split('|')
      resolve({ title: title || null, processName: processName || null, idleSec: Number(idleSec) || 0, at: Date.now() })
    })
  })

  cachedPromise = p
  lastAt = now
  return p
}

module.exports = { getActiveWindow }
