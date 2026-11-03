## MODIFIED Requirements

### Requirement: Provider usage metrics
When `providerUsage` is on, every finished provider call SHALL be recorded exactly once. The application records provider calls in two places, and both SHALL feed the same metrics:
- stage-attempt completion (`completeStageAttempt`), for voice-over, narration timestamps, decomposition and assembly;
- provider-request recording (`insertProviderRequest`), for the image and clip stages.

The metrics SHALL be:
- an attempt counter labelled by `stage`, `provider` and `outcome`, where `outcome` is normalised to `success`, `transient`, `unresponsive`, `not-retryable` or `other`;
- a latency histogram in milliseconds;
- billed-unit counters, counted on success only, where the unit is known: clip seconds requested, images generated and voice characters sent.

`unresponsive` SHALL be used for a call that got no answer from the provider: a stage attempt that ended `timed-out`, a request that exceeded its call time limit, or a request that could not reach the provider (DNS, connection refused or reset). A provider that answered, with any HTTP status, SHALL NOT be `unresponsive`: a retryable answer stays `transient`. Reporting a call as `unresponsive` SHALL NOT change how the application retries it.

#### Scenario: Completed attempt is counted once
- **WHEN** `providerUsage` is on and a voice-over attempt is completed with outcome `success`
- **THEN** the attempt counter increases by one for `voice-over`, its provider and `success`, its latency is recorded, and the voice-character counter increases by the script length

#### Scenario: Image and clip calls are counted
- **WHEN** `providerUsage` is on and a clip request is recorded as `success` for a scene that requested 6 seconds
- **THEN** the attempt counter increases by one for `video` with the scene's video provider, and the clip-seconds counter increases by 6

#### Scenario: Repeated completion is not double-counted
- **WHEN** the store refuses a second completion of an attempt that is already complete
- **THEN** no metric is recorded for the refused completion

#### Scenario: Timed-out attempt is unresponsive
- **WHEN** `providerUsage` is on and a voice-over attempt ends `timed-out`
- **THEN** the attempt counter increases by one for `voice-over`, its provider and `unresponsive`

#### Scenario: Request that hits its call time limit is unresponsive
- **WHEN** `providerUsage` is on and an image request is aborted because the provider did not answer within the call time limit
- **THEN** the attempt counter increases by one for `image`, `Fal.ai` and `unresponsive`, and the request is retried exactly as before

#### Scenario: Provider that cannot be reached is unresponsive
- **WHEN** `providerUsage` is on and a clip request fails because the connection to the provider is refused
- **THEN** the attempt counter increases by one for `video`, `RunningHub` and `unresponsive`

#### Scenario: Retryable HTTP answer stays transient
- **WHEN** `providerUsage` is on and the provider answers a request with HTTP 503
- **THEN** the attempt counter increases by one for that stage, provider and `transient`, not `unresponsive`
