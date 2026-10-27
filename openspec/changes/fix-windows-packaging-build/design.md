## Context

`backend/packaging/build.ts` runs every child process through `run()` (`execFileSync` with inherited output). Four of its commands are safe on every platform: `process.execPath` (Node), `tar` (a real executable on macOS and on Windows 10+ as `tar.exe`) and `codesign` (macOS only). The frontend build, `run("npm", ["run", "build", ...])`, is not: on Windows `npm` resolves to `npm.cmd`, and Node (since the 2024 `.cmd` security change) refuses to start a `.cmd` or `.bat` file without a shell, so `execFileSync` fails with ENOENT or EINVAL. The release workflow starts the build with `npm run package:<target>`, so npm's own variable `npm_execpath` (the path of `npm-cli.js`) is set in the environment.

## Goals / Non-Goals

**Goals:**

- The frontend build step starts on Windows, macOS and Linux with no shell quoting of the arguments.
- No change to what the build produces.

**Non-Goals:**

- Signing or publishing, other build steps, or running the whole build on a Windows machine here (there is none; CI is the check).

## Decisions

### Decision 1: Run npm's script with the current Node

`npmInvocation(env)` returns `{ command: process.execPath, args: [env.npm_execpath] }` when `npm_execpath` is set and ends in `.js`, and the build appends `run build -- ...` to it. This needs no `.cmd`, no shell and no quoting of the output folder, and uses the same npm that started the build. *Alternatives not taken:* `shell: true` on Windows only (the arguments, which include a path in the user's temporary folder, are then passed unquoted to `cmd.exe`); calling `vite` directly (skips the `tsc --noEmit` step of the frontend's `build` script).

### Decision 2: Fallback when `npm_execpath` is not set

A build started as `node packaging/build.ts <target>` directly has no `npm_execpath`. Then the command is `npm`, started with a shell only on Windows (`npm` is then resolved by `cmd.exe`); elsewhere it is exactly today's call.

### Decision 3: A pure function and a test first

`npmInvocation(env, platform)` is exported and pure, so a test can pin the command for each case without a Windows host: with and without `npm_execpath`, on `win32` and `darwin`. The real check is the Release `dry-run` on CI after the merge.

## Risks / Trade-offs

- [Other Windows-only problems exist after this one (for example `tar` on a runner where GNU tar from Git comes first and reads `C:` as a remote host)] → The next dry-run shows them; each is recorded here; a small one is fixed in this change, a larger one gets its own ticket.
- [`npm_execpath` points to a file that is not `npm-cli.js` (for example a wrapper script)] → The `.js` check falls back to `npm`; the build step then fails loudly as today.
