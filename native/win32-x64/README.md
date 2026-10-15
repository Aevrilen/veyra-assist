# League Akari Native Win32 x64

Internal Windows-only native bindings for League Akari.

`tools.getGameClientWindowSnapshot(processId)` reads the current eligible top-level window for
the caller's known game PID. It returns its HWND, exact owner PID, physical-pixel client-area
bounds, and foreground/visible/minimized flags. It does not read window titles, inspect other
processes' window contents, open the game process, or change a window. The PID must be a positive
integer within the Win32 DWORD range; invalid numbers, missing/ambiguous windows, and failed reads
return `null`. Non-number arguments throw `TypeError`.

After `tools.load()`, call `tools.supportsGameClientWindowSnapshot()` before enabling a window
stability gate. `false` means the loaded binary is older and must be reported as unsupported;
the snapshot wrapper also returns `null` for that binary. A `null` result with capability present
means no usable snapshot, not that a window is stable. A hidden or minimized snapshot is likewise
not evidence of readiness. This is a fresh, best-effort OS query; the caller must compare observations
over time, including owner PID, HWND and bounds, and require visible, non-minimized, foreground state.

Windows native integration verification uses only invisible, standalone Win32 fixtures. Build the
addon and TypeScript output first, then run from the repository root:

```powershell
$env:AKARI_GAME_WINDOW_NATIVE_TEST = '1'
node node_modules/vitest/vitest.mjs run native/win32-x64/tools-game-window-snapshot.test.ts
```
