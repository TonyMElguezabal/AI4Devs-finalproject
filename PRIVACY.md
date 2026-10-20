# Vid4You privacy policy

Vid4You runs on your computer. **Nothing leaves it for telemetry unless you turn a signal on** in the Privacy dialog (first launch, then the **Privacy** button at the top of the page). Every signal is off by default, and you can change each one at any time; the change applies immediately.

## The three signals

| Signal | What it sends when on |
|---|---|
| **Send error reports** | The error's code, message and stack trace, with file paths and your user name replaced by `[path]` and `[user]`. Sent for uncaught errors, unhandled promise rejections, and AI-provider calls that failed in a way that cannot be retried (with the stage and provider name). |
| **Send provider usage and cost counts** | For each call to an AI provider: the stage (voice-over, image, video, …), the provider's name, the outcome (success, transient failure, not retryable, other), how long it took, and the billed units (images, clip seconds, voice characters). |
| **Send anonymous usage counts** | How many times the app starts, how many sessions begin, and how many final videos are made. |

Every signal also carries: the app version and channel (production or UAT), your operating system type and CPU architecture, and a random identifier for this installation. The identifier is generated once by the app; it is not derived from you or your computer and cannot be traced back to you.

## What is never sent

Your title, script, narration, prompts, images, clips, file or folder names, your user name, your provider keys, and anything else that identifies you. The app only sends the attributes listed above, and the relay described below drops any other attribute before it forwards anything.

## Where the data goes

The app sends it over HTTPS to a relay run by the Vid4You project (`otel.vid4you.download`), which filters it again and forwards it to Grafana Cloud, where the project reads it on dashboards. The data is kept for as long as Grafana Cloud's free tier allows.

## What stays on your computer regardless

The app writes a rotating log file (`logs/vid4you.log` in its data folder, up to five files of 10 MB). It is never sent anywhere by the app. It is yours to read or delete.

## Update notice

On production and UAT builds the app asks GitHub once at launch whether a newer release exists, and shows a banner with a link if so. That request is the same as opening the releases page: it sends no telemetry and does not depend on the signals above.

## Turning things off

Open **Privacy**, untick the signal, press **Save**. Closing the dialog with **Not now** or Escape the very first time keeps everything off.
