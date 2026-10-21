# Step 6.20 — Windows x64 run (JOS-203 B3)

- Date: 2026-10-20
- Build: the JOS-194 packaging proof of concept (`poc/local`), cross-built on macOS arm64 with Node 26.4.0: the official Windows `node.exe` of the same version with the single-executable blob injected by `postject`; `ffmpeg.exe` (ffmpeg-static 5.2.0) and `ffprobe.exe` (ffprobe-static 3.1.0, win32/x64) beside it. Unsigned. Delivered as a zip with a README.
- Tester: the product owner, on a Windows laptop.

## Confirmed
- The executable starts on Windows and serves the interface; a script could be submitted from the page.
- With the credentials file in place (`%APPDATA%\Vid4You\.secrets.json`), a real session started generating a video on Windows.

## What differed from macOS
- The first submission was refused with "The content check is temporarily unavailable. Submit the script again in a moment." The product maps four causes (no credential, unreadable credentials file, network failure, HTTP error from OpenAI) to that one message and shows none of them. The tester fixed it on the laptop; the cause was not reported back, but a missing or unreadable `.secrets.json` is the likely one (on Windows a text editor can save it as `.secrets.json.txt` or with a byte-order mark). Improving the message is deferred by the product owner.
- SmartScreen is expected for an unsigned executable; not reported either way.

## Outcome
The product owner confirmed that the video completed successfully on Windows.

## Not reported
`/health` and a second launch opening the running instance were not reported separately.
