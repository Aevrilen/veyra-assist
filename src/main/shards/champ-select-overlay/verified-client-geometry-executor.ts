import { execFile } from 'node:child_process'
import { win32 } from 'node:path'

import type { Bounds } from './window-surface-capture-executor'

export interface VerifiedClientGeometry {
  ownerProcessId: number
  windowHandle: string
  client: Bounds
  window: Bounds
  extended: Bounds
  isForeground: boolean
  isVisible: boolean
  isMinimized: boolean
}
/** Trusted main-process inputs only. Read-only Win32 query; does not move/focus/capture windows. */
export const GEOMETRY_PROBE = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class VeyraGeometry {
 [StructLayout(LayoutKind.Sequential)] public struct RECT { public int left,top,right,bottom; }
 [StructLayout(LayoutKind.Sequential)] public struct POINT { public int x,y; }
 [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h,ref POINT p);
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h,uint flags);
 [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h,int a,out RECT r,int size);
}
'@
function Bounds($r) { @{x=$r.left;y=$r.top;width=($r.right-$r.left);height=($r.bottom-$r.top)} }
$h = [IntPtr]::new([long]::Parse('__HWND__'))
$expected = [uint32]::Parse('__PID__')
if (![VeyraGeometry]::IsWindow($h)) { throw 'invalid-window' }
[uint32]$owner = 0
if ([VeyraGeometry]::GetWindowThreadProcessId($h,[ref]$owner) -eq 0 -or $owner -ne $expected) { throw 'owner-mismatch' }
$previous = [VeyraGeometry]::SetThreadDpiAwarenessContext([IntPtr]::new(-4))
if ($previous -eq [IntPtr]::Zero) { throw 'dpi-context-failed' }
try {
 $client = New-Object VeyraGeometry+RECT
 $outer = New-Object VeyraGeometry+RECT
 $extended = New-Object VeyraGeometry+RECT
 if (![VeyraGeometry]::GetClientRect($h,[ref]$client) -or ![VeyraGeometry]::GetWindowRect($h,[ref]$outer)) { throw 'rect-failed' }
 if ([VeyraGeometry]::DwmGetWindowAttribute($h,9,[ref]$extended,16) -ne 0) { throw 'dwm-rect-failed' }
 $tl = New-Object VeyraGeometry+POINT; $tl.x=$client.left; $tl.y=$client.top
 $br = New-Object VeyraGeometry+POINT; $br.x=$client.right; $br.y=$client.bottom
 if (![VeyraGeometry]::ClientToScreen($h,[ref]$tl) -or ![VeyraGeometry]::ClientToScreen($h,[ref]$br)) { throw 'translation-failed' }
 $client.left=$tl.x; $client.top=$tl.y; $client.right=$br.x; $client.bottom=$br.y
 [uint32]$ownerAfter=0
 if ([VeyraGeometry]::GetWindowThreadProcessId($h,[ref]$ownerAfter) -eq 0 -or $ownerAfter -ne $expected) { throw 'owner-changed' }
 @{ownerProcessId=$owner;windowHandle=$h.ToInt64().ToString();client=(Bounds $client);window=(Bounds $outer);extended=(Bounds $extended);isForeground=([VeyraGeometry]::GetAncestor([VeyraGeometry]::GetForegroundWindow(),2) -eq $h);isVisible=[VeyraGeometry]::IsWindowVisible($h);isMinimized=[VeyraGeometry]::IsIconic($h)} | ConvertTo-Json -Compress
} finally { $null=[VeyraGeometry]::SetThreadDpiAwarenessContext($previous) }
`
function same(a: Bounds, b: Bounds) {
  return (
    !!a &&
    !!b &&
    (['x', 'y', 'width', 'height'] as const).every(
      (k) => Number.isInteger(a[k]) && a[k] === b[k]
    ) &&
    a.width > 0 &&
    a.height > 0
  )
}
export function isVerifiedBorderlessClient(
  g: VerifiedClientGeometry,
  hwnd: string,
  pid: number,
  expectedClient: Bounds
): boolean {
  return (
    !!g &&
    g.windowHandle === hwnd &&
    g.ownerProcessId === pid &&
    g.isForeground === true &&
    g.isVisible === true &&
    g.isMinimized === false &&
    same(g.client, expectedClient) &&
    same(g.client, g.window) &&
    same(g.client, g.extended)
  )
}
export function probeClientGeometry(
  hwnd: string,
  pid: number,
  timeout = 4000
): Promise<VerifiedClientGeometry> {
  if (process.platform !== 'win32') return Promise.reject(new Error('windows-required'))
  if (
    !/^[1-9]\d*$/.test(hwnd) ||
    BigInt(hwnd) > 0x7fffffffffffffffn ||
    !Number.isInteger(pid) ||
    pid < 1 ||
    pid > 0xffffffff
  )
    return Promise.reject(new Error('invalid-target'))
  const systemRoot = process.env.SystemRoot
  if (!systemRoot || !win32.isAbsolute(systemRoot))
    return Promise.reject(new Error('system-root-unavailable'))
  const powershell = win32.join(
    systemRoot,
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe'
  )
  const script = GEOMETRY_PROBE.replace('__HWND__', hwnd).replace('__PID__', String(pid))
  return new Promise((resolve, reject) =>
    execFile(
      powershell,
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        Buffer.from(script, 'utf16le').toString('base64')
      ],
      { windowsHide: true, timeout, maxBuffer: 32768, encoding: 'utf8' },
      (error, stdout) => {
        if (error) return reject(new Error('geometry-probe-failed'))
        try {
          resolve(JSON.parse(stdout.trim()))
        } catch {
          reject(new Error('geometry-probe-invalid-json'))
        }
      }
    )
  )
}
