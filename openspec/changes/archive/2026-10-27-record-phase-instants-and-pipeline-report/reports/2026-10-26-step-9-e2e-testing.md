# Step 9 Report - E2E Testing (JOS-228)

Vite dev server (`VITE_API_BASE` pointing at the Step 8 backend) driven through the browser; the Administrator password was a test value created for this run.

- `/admin` locked, then unlocked with the test password: the Reports section shows Provider usage and, under it, **Pipeline time** (Phase, Sessions, Median time, 95th-percentile time, Timed out, Finished late, Superseded) and **Pipeline time per session**.
- Scenes row: counts read "not recorded". The failed session shows "—" for decomposition, scenes and assembly; the completed session shows seconds for all four phases.
- Observation: the stub phases last under a second, so values read "0.1 s" and "0 s" (one decimal); real phases will read in seconds.

## Outcome
- Step 9 status: PASS
