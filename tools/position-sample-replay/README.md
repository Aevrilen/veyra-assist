# Local PositionSample replay

This tool reads either an existing user-exported `PositionSample` JSON or an
already-cropped local PNG with explicit manual geometry JSON on the user's computer. The image stays in local memory. It runs the same
`inspectNormalizedLegacyLayout` function as the diagnostic candidate and prints
only scalar results. It does not start Veyra/Electron, load the native addon,
perform OCR, contact a network service, upload a sample, or change application
settings. It opens the sample read-only and writes only to standard output.

## Windows: use the included bundle

Requirements: an existing supported Node.js installation (22.13 or newer; cloud
verification used Node 24.19). This package does not include or install Node.
Use a local disk path, not a URL, UNC share, cloud placeholder that needs download,
or other network-backed file. Keep the original exported JSON private.

1. Copy the `dist` directory to your computer. Keep both license notices with the
   `.cjs` file. No `npm install` or original project dependencies are required.
2. Open PowerShell in that directory.
3. Run the following, replacing the sample path with the file you already exported:

```powershell
node .\veyra-position-sample-replay.cjs "C:\path\Veyra-position-sample.json"
```

To save the scalar report separately:

```powershell
node .\veyra-position-sample-replay.cjs "C:\path\Veyra-position-sample.json" |
  Set-Content -Encoding utf8 .\position-replay-report.json
```

Do not redirect output to the sample file itself: shell redirection happens
before the program runs and can overwrite it. The CLI never writes to the sample.
If you choose to send back a result, send only `position-replay-report.json`, not
the original PositionSample (which contains the image). There is no automatic
sharing in this tool. No new screenshot or game launch is required.

`--help` prints local usage without reading a sample. Exit code 0 means the replay
completed, including an ordinary detector rejection. Exit code 2 means the input
could not be safely processed. The error report uses a fixed code, without the
file name, directory, OS error, stack trace, image, note, username, or identifier.
Errors emitted by Node before this program starts, such as a missing executable
or a misspelled bundle path, are outside the program's reporting boundary.

## Existing recording fallback: local PNG + explicit manual geometry

If no PositionSample remains, the second route accepts an ordinary PNG that you
have already extracted locally from the **first champion-selection screen in an
existing recording**. This tool does not read a recording, extract a frame, find
the client, crop it, start a game, or request a new capture.

The PNG must contain exactly the actual client area with no desktop/window border
and no resizing/stretching. If the recording itself was rescaled, its pixels are
not an exact physical client crop; do not label them as one. If the crop or
historical DIP size cannot be established, stop rather than guess.

Copy `manual-geometry.template.json`, fill every null with known values, and save
as `frame-geometry.json`. The template is deliberately invalid until filled:

```json
{
  "version": 1,
  "kind": "veyra-manual-client-geometry",
  "crop": "actual-client-area",
  "physicalClientSize": { "width": null, "height": null },
  "dipClientSize": { "width": null, "height": null },
  "counts": { "candidates": null, "teammates": null }
}
```

Exact schema: all six top-level fields are required; no additional fields are
accepted. `version` is integer 1; `kind` and `crop` are the exact strings shown.
Each size has only `width` and `height`. Physical sizes are integers 1–4096 and
must match the PNG. DIP sizes are finite numbers greater than 0 and at most 4096,
from the actual client at recording time; they are never inferred from PNG size.
`counts` has only integer `candidates` and `teammates`, each 0–20. Use the actual
counts in the selected frame; the detector separately enforces supported counts.
No capture timestamp, display/window ID, or bracketed evidence is accepted here.
The metadata file is limited to 16 KiB.

```powershell
node .\veyra-position-sample-replay.cjs --png "C:\path\first-select-client.png" --geometry "C:\path\frame-geometry.json" |
  Set-Content -Encoding utf8 .\position-replay-report.json
```

Flag order is exactly `--png <local-file> --geometry <local-file>`. Both paths are
required. Do not combine this form with a positional PositionSample path.

The result identifies `source.kind: "local-png-manual-geometry"`,
`geometryEvidence: "user-supplied-unverified"`, and
`cropEvidence: "user-asserted-actual-client-area"`. Origins and current time are
explicitly synthetic zeros; no native capture evidence or duration is invented.
Only width/height/counts are used to test the image under those manual assumptions.
A match cannot prove the crop, DIP values, or the original live failure cause.

## What a report means

- `provider.reason` and `provider.metrics` expose the first failing gate and its
  measured scalar values using the shared detector. Examples include
  `unsupported-width`, `unsupported-dip-width`, `teammate-count`,
  `bench-slot-edges`, and `teammate-row-edges`. `matched` means this single image
  passed the existing normalized legacy chrome checks. Edge counts are not
  calibrated probabilities or proof of real-world accuracy.
- `resolver.scope` is always `synthetic-current-context-single-frame`. We use
  synthetic identity fields, `ChampSelect`, foreground=true, enabled=true, and
  default settings with no manual calibration. Current geometry/counts are copied
  from the export, and `now` is set equal to capture completion. These are explicit
  assumptions, not recovered historical facts.
- A matching single frame normally produces `resolver.kind: "confirming"`.
  It cannot produce a valid two-frame confirmation because no prior frame is
  fabricated or replayed twice. A provider failure normally leads to the
  synthetic resolver reason `no-observation`.
- The sample does not recover the actual historical foreground/phase, session,
  process or window identity, current monitor ID/scale check, pre/post native
  geometry stability, saved manual settings, freshness at the time of the failed
  attempt, prior frame, inter-frame timing, or agreement. Those missing facts
  remain listed under `notReproduced`.
- For PNG + geometry, `now` and origins are synthetic zero and the capture
  duration field is omitted. The additional missing checks include actual crop
  boundaries and the manual DIP measurement.
- `preview.automatic` and the sample's note are not treated as diagnostic evidence.
  A single-file result cannot establish the original live rejection reason or
  validate the full automatic-position feature.

## Input boundaries

The parser accepts version 1 JSON with positive bounded preview dimensions,
finite DIP client rectangles, integer counts, and bracketed capture metadata with
physical client dimensions and ordered timestamps. Existing exports without
capture evidence return `missing-capture-evidence`; no geometry is guessed.

Maximums: 32 MiB PositionSample JSON, 16 KiB manual geometry JSON, nesting depth 32, 24 MiB decoded PNG, 4096 pixels per side,
16,777,216 pixels, and 4096 PNG chunks. A file must be a regular local file and
must not change size/mtime while read. UTF-8, base64 syntax, PNG signature/chunks,
CRC, image dimensions, capture dimensions, and exact bounded inflated scanline
size are checked before running detection.

Only non-interlaced, opaque 8-bit RGB/RGBA PNG is supported. This intentionally
matches the screenshot export path's ordinary opaque PNGs. Palette, 16-bit,
interlaced, animated, and transparent input are refused instead of silently
converting through potentially different pixel semantics. Unknown input fields
are ignored; only whitelisted scalar geometry/count/timing values are used.
PNG ancillary text is not decoded as OCR or copied to output.

Typical parser codes:

- `missing-capture-evidence`: export lacks the capture evidence this replay needs
- `image-dimensions-mismatch`: PNG dimensions differ from preview dimensions
- `physical-client-dimensions-mismatch`: PNG and captured physical client differ
- `invalid-capture-metadata`: invalid rectangle, timing, or bracket evidence
- `invalid-manual-geometry`: missing/unknown manual fields, unknown sizes/counts,
  incorrect crop assertion, or an attempted native-capture declaration
- `unsupported-png-format` / `unsupported-image-transparency`: intentionally
  outside the safe supported decode path
- `invalid-png`, `invalid-image-base64`, `invalid-json`: invalid encoded input
- `input-unreadable`: fixed generic read failure; no path or OS details disclosed

## Maintainer build and verification

The source imports only the shared pure TypeScript detector/resolver/settings
modules. It does not import Electron/controller integration files. Bundled pngjs
7.0.0 is the only added decoder dependency. Rolldown 1.2.14 is build-only; Vitest
4.1.10 is test-only. The included `.cjs` requires only Node builtins. License
notices are copied next to the executable. No source maps are generated.

Build from the minimal snapshot root with installed tool dependencies:

```sh
cd tools/position-sample-replay
npm run build
npm test
```

For a clean maintainer environment, use the exact versions in this isolated
`package.json`. Dependency acquisition requires network access and is separate
from replay. Do not run the original project install/postinstall/build scripts.
Cloud verification reused existing installed package versions and did not run a
new package install. There is no claim of a freshly locked full-project build.

Rebuild the bundle whenever the shared detector/resolver changes; the bundle is a
snapshot of those modules at build time. The tests use only generated artificial
PNG chrome and malformed-input fixtures. They test behavior and privacy/resource
boundaries, not screenshot recognition accuracy. A Windows run on the user's own
local sample is still needed to determine its single-frame detector result.
