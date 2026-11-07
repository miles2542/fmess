# Can a person click into a field in fMess and type there? (Windows)
#
#   pwsh tests/app/field-check.ps1 [-Exe <fmess.exe>] [-Out <dir>] [-NoInject]
#
# Runs a debug build (npx tauri build --debug --no-bundle) with
# tests/app/field-check.js as a probe, which lays test fields over the page as
# Messenger has them. This clicks each field with the real mouse and types
# with the real keyboard: letters as keys ("fm") and a Vietnamese letter the
# way Unikey and EVKey send it (a Unicode character, "ê"). Every field must
# end up with both. -NoInject runs the page without fMess's script, to compare.
param(
  [string]$Exe = "src-tauri/target/debug/fmess.exe",
  [string]$Out = "field-check-out",
  [switch]$NoInject
)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$log = Join-Path $Out ($(if ($NoInject) { "app-noinject.log" } else { "app.log" }))

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Input {
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] public struct UNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public UNION u; }
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hwnd, ref POINT point);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint SendInput(uint count, INPUT[] inputs, int size);
  static void Send(INPUT input) { SendInput(1, new[] { input }, Marshal.SizeOf(typeof(INPUT))); }
  public static void Click() {
    foreach (uint flags in new uint[] { 0x0002, 0x0004 }) { var i = new INPUT { type = 0 }; i.u.mi.dwFlags = flags; Send(i); }
  }
  public static void Key(ushort vk) {
    foreach (uint flags in new uint[] { 0, 0x0002 }) { var i = new INPUT { type = 1 }; i.u.ki.wVk = vk; i.u.ki.dwFlags = flags; Send(i); }
  }
  // KEYEVENTF_UNICODE: what Unikey and EVKey send for a Vietnamese letter.
  public static void Unicode(char c) {
    foreach (uint flags in new uint[] { 0x0004, 0x0004 | 0x0002 }) { var i = new INPUT { type = 1 }; i.u.ki.wScan = c; i.u.ki.dwFlags = flags; Send(i); }
  }
}
"@
[Input]::SetProcessDPIAware() | Out-Null

Get-Process fmess -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep 1
$env:FMESS_PROBE = (Resolve-Path "tests/app/field-check.js").Path
$env:FMESS_PROBE_DELAY = "20"
$env:FMESS_PROBE_WAIT = "200"
$env:FMESS_WINDOW_SIZE = "900x600"
if ($NoInject) { $env:FMESS_NO_INJECT = "1" } else { Remove-Item Env:FMESS_NO_INJECT -ErrorAction SilentlyContinue }
$app = Start-Process -FilePath $Exe -RedirectStandardError $log -RedirectStandardOutput "$log.out" -PassThru

$targets = [ordered]@{}
$scale = 1.0
for ($i = 0; $i -lt 120; $i++) {
  Start-Sleep 1
  if (-not (Test-Path $log)) { continue }
  $lines = Get-Content $log
  if (-not ($lines | Select-String -SimpleMatch "fieldcheck ready")) { continue }
  foreach ($line in $lines) {
    if ($line -match "fieldcheck window \S+ \S+ (\S+)") { $scale = [double]$Matches[1] }
    if ($line -match "fieldcheck target (\S+) (\d+) (\d+)") { $targets[$Matches[1]] = @([int]$Matches[2], [int]$Matches[3]) }
  }
  break
}
if (-not $targets.Count) { Write-Host "No fields from the probe; see $log"; Get-Content $log -Tail 40; exit 1 }

$hwnd = (Get-Process -Id $app.Id).MainWindowHandle
if ($hwnd -eq 0) { $hwnd = (Get-Process fmess | Where-Object MainWindowHandle -ne 0 | Select-Object -First 1).MainWindowHandle }
$origin = New-Object Input+POINT
[Input]::ClientToScreen($hwnd, [ref]$origin) | Out-Null
Write-Host "window $hwnd at $($origin.X),$($origin.Y), scale $scale, foreground $([Input]::GetForegroundWindow())"

foreach ($name in $targets.Keys) {
  $x = [int]($origin.X + $targets[$name][0] * $scale)
  $y = [int]($origin.Y + $targets[$name][1] * $scale)
  [Input]::SetCursorPos($x, $y) | Out-Null
  Start-Sleep -Milliseconds 300
  [Input]::Click()
  Start-Sleep -Milliseconds 700
  [Input]::Key(0x46) # F
  [Input]::Key(0x4D) # M
  Start-Sleep -Milliseconds 200
  [Input]::Unicode([char]0x00EA) # ê
  Start-Sleep -Milliseconds 700
  Write-Host "typed into $name at $x,$y"
}

for ($i = 0; $i -lt 200; $i++) {
  Start-Sleep 1
  $result = Get-Content $log | Where-Object { $_ -like "[probe]*" } | Select-Object -First 1
  if ($result) { break }
}
Stop-Process -Id $app.Id -Force -ErrorAction SilentlyContinue
if (-not $result) { Write-Host "No result from the probe; see $log"; Get-Content $log -Tail 40; exit 1 }
$json = $result.Substring(8) | ConvertFrom-Json
if ($json -is [string]) { $json = $json | ConvertFrom-Json }
$failed = 0
foreach ($field in $json.values.PSObject.Properties) {
  $ok = $field.Value -eq "fmê"
  if (-not $ok) { $failed++ }
  Write-Host ("{0} {1}: '{2}' (user-select {3})" -f $(if ($ok) { "PASS" } else { "FAIL" }), $field.Name, $field.Value, $json.styles.($field.Name))
}
$json.seen | Select-Object -First 120 | ForEach-Object { Write-Host "  $_" }
if ($failed) { Write-Host "FAILED ($failed)"; exit 1 } else { Write-Host "PASSED" }
