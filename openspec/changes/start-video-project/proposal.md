# Start a video project from a title, a script, and its language

Linear-Issue: JOS-134

## Why

Everything the project has produced so far is a decision. This is the first story that ships behaviour: without it there is no way to create a session, and every other MVP story operates on a session that nothing can bring into existence. §5 step 1 makes it the entry point of the whole flow, and §8.1 makes `submitted` the state everything else proceeds from.

It is also where the product's central constraint takes effect. §4.2 and D10 lock the script the moment the project starts — from `submitted` onward it cannot be changed, and the narration must correspond to it exactly. Whatever this story stores is what the rest of the pipeline is obliged to reproduce, so storing it faithfully is not an implementation detail but the requirement the later acceptance criteria are checked against.

## What Changes

- Register a session from a title, a script and a selected language, with a system-generated identifier, in state `submitted` (§3, §8.1, AC01).
- Accept a plain script: no identifiers, tags, delimiters or visual instructions required from the user (§4.1, AC02).
- Reject an empty title or an empty script without starting a session (AC03).
- Impose **no product word limit**, and where an infrastructure limit prevents accepting a script, report the cause rather than truncating or summarising it (§4.1, AC04).
- Offer only languages from the hardcoded supported list, and start no session — and call no provider — without one (§4.1, AC05, D09).
- Read the supported language list from the constants established by `define-provider-configuration` (JOS-165) rather than restating it.
- Store the title, script and language as **write-once** fields, so the lock §4.2 describes is a property of the record and not a rule later stories must remember.
- Record the session's creation time at the precision the project-folder name depends on (§12.2), so the folder US-30 later creates is named from when the session started rather than from when the folder was made.
- Add the first endpoint and the first screen the product has, and with them the first entries in an API contract that currently describes a different application.
- Leave the session at `submitted`; starting the voice-over (§5 step 2) belongs to the next story.

## Capabilities

### New Capabilities

- `session-creation`: bringing a session into existence — what a valid start requires, what is rejected, what the record holds, and the point from which the title, script and language can no longer change.

### Modified Capabilities

None. `openspec/specs/` is still empty. The foundation capabilities introduced by the six spike changes are not yet archived, so they are not existing specs this change can modify; this change consumes their outcomes.

## Impact

- **Blocked on four spikes, none of which has been applied.** `define-backend-stack` (JOS-179), `define-frontend-stack` (JOS-180) and `define-persistence` (JOS-181) are all In Progress, and this story needs a framework to serve the endpoint, a framework to render the form and a store to register the session. `define-provider-configuration` (JOS-165) owns the supported language list AC05 depends on. Nothing here can be implemented before those land; the artifacts exist so that work can start the moment they do.
- **Not blocked on** `define-live-updates` (JOS-183) or `define-media-assembly` (JOS-182): no progress is pushed and no media is produced at `submitted`.
- **Repository**: the first application code outside `packages/specboot`, unless a spike's skeleton was kept as the project seed — in which case this story extends it rather than starting a second tree.
- **API contract**: `docs/api-spec.yml` describes an unrelated inherited domain end to end. This is the first story with an endpoint to document, so it is the first that cannot simply append to that file. The contract has to describe this product before it describes this endpoint.
- **Data model**: `docs/data-model.md` is inherited in the same way, and `define-persistence` owns rewriting it. The session record this story defines is the first real entry in it.
- **Makes a recorded product gap concrete**: `define-frontend-stack` recorded that the PRD never says how a user finds their sessions — §12.3 only describes reaching one by identifier, and no project-list screen exists anywhere in the PRD or the backlog. This story is where a user first receives an identifier, so if nothing lists sessions, an identifier not kept at this moment makes the session unreachable. The gap stops being theoretical here.
- **Downstream**: every MVP story depends on this one, since none of them can run without a session.
- **No provider is called and no credential is exercised.** The first provider call belongs to the voice-over story.
