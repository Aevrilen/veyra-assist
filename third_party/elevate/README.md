# Elevate helper source

Copyright Johannes Passing. Official source: https://github.com/jpassing/elevate/tree/d5cfc93d1ce06844a39d1a334a7a8081d26b6204/Elevate

`main.c` and `stdafx.h` are the unchanged official source, with original copyright and LGPL-2.1-or-later headers preserved. Veyra distributes its separately executable helper under that explicit grant. `COPYING.LESSER` contains LGPL 2.1 and `COPYING` contains GPL 2; license texts were retrieved from the GNU C Library's official Git mirror (`bminor/glibc`, `COPYING.LIB` and `COPYINGv2`). The upstream repository's MIT document is also preserved as `UPSTREAM-MIT-LICENSE.md`; no permission is inferred from its placeholder copyright line.

Veyra's change is a new `build.cmd` only: build unmodified C source with an x64 Visual Studio C++ Developer Command Prompt and current Windows SDK, `/O2 /MT /DUNICODE /D_UNICODE`, linking the Windows system Shell32 library. Example:

```cmd
third_party\elevate\build.cmd C:\build-output\elevate.exe
```

No upstream binary or resource is used in this helper rebuild. The original command line supports program/arguments, `-wait`, `-k` and `-?`. The helper remains an independent executable at `resources/elevate.exe`, can be replaced with a compatible user-built version, and communicates through the existing command line. Veyra's MIT application code is not linked with this helper.

Each program ZIP includes this complete helper source and build instructions in `app/resources/third-party-sources/elevate/`, alongside the matching executable and notices. Rebuilding may produce different compiler/runtime bytes; Veyra records the shipped SHA-256 in its build metadata. The old opaque Akari-bundled helper is not used in this revised package.
