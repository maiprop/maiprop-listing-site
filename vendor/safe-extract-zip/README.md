# @maiprop/safe-extract-zip

Private hardened fork of `extract-zip@2.0.1` for MaiProp. Used via npm
`file:` override because no patched Node20-compatible upstream release exists.

- Upstream: `extract-zip@2.0.1` (`maxogden/extract-zip`), BSD-2-Clause,
  Copyright (c) 2014 Max Ogden and other contributors (see `LICENSE`).
- Local version: `2.0.1-maiprop.1`, private, main `index.cjs`, no CLI/types
  (not required by the actual `@puppeteer/browsers` consumer).
- Chain: `@lhci/cli@0.15.1` -> `lighthouse@12.6.1` ->
  `puppeteer-core@24.41.0` -> `@puppeteer/browsers@2.13.0` ->
  `extract-zip@2.0.1`.

Fixes:

- `GHSA-7pqw-9j4j-h8q3`: duplicate symlink then file with the same name
  wrote through the planted symlink outside the destination.
- `GHSA-jmr9-qjv8-65gv`: symlink targets were never validated, allowing
  absolute or `../` targets outside the destination.

Local changes from upstream `2.0.1`:

- Canonicalize the extraction root after creation and enforce
  `path.relative` containment with `isAbsolute` and `..` prefix checks.
- Reject unsafe archive names: absolute POSIX, Windows drive/UNC, colon,
  backslash, NUL, and any `..` component.
- Reject unsafe symlink strings: absolute, drive/UNC, colon, backslash,
  NUL; relative `..` is allowed only when the resolved target stays inside.
- Validate the parent with `lstat`/`readlink` before every recursive `mkdir`;
  only `ENOENT` means missing, `ENOTDIR`/`EACCES`/loops propagate. Existing
  symlinks including dangling links are expanded component by component
  (max 40), without premature `normalize`, and any lexical/canonical escape
  is rejected. Symlink targets are resolved from the canonical parent,
  allowing missing forward targets and contained chains.
- Reject `..` after a missing target component: a later forward symlink could
  change its meaning and escape the root. Plain forward/dangling targets and
  contained `..` through existing directories remain supported. Strip trailing
  entry separators before checking leaves so `link/` cannot hide a symlink.
- `lstat` the leaf before writes or directory creation and refuse any
  existing symlink, even contained or dangling; refuse symlink/file
  duplicates. Plain existing-file overwrite is preserved. New files use
  exclusive create and `O_NOFOLLOW` where supported (`win32` fallback),
  keeping stream close and error behavior. Symlink creation stays exclusive.
- Revalidate after `onEntry` before any mutation. Directory destinations are
  validated before `mkdir`.
- Reject an existing symlink destination before opening its ZIP stream, so
  rejected file-then-symlink duplicates release the archive reader.
- Preserved upstream API: callable CommonJS default export
  `await extract(zipPath, { dir })`, `onEntry(entry, zipfile)`, `yauzl`,
  `debug`, `get-stream` dependencies, and default/executable modes.

Limits: no guarantee against arbitrary hostile concurrent same-user
filesystem mutation; no decompression-bomb handling beyond upstream.
Contained, forward, and dangling links needed by browser archives remain
allowed.
