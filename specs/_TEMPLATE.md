# F#: <Feature name>

**Status:** draft <!-- draft | approved | built | verified — only Ryan sets "approved" -->
**Milestone:** M#
**Branch:** `f#-<name>`

## Goal (one sentence)

## User story

As a <collector | admin>, I want … so that …

## Screens

1. <Screen> — what is on it, big buttons, English plus the chosen language where it applies.

## Data written

| Where (Dexie table / Supabase table / R2 bucket) | Fields | When |
| --- | --- | --- |

No names outside `consents`. No email anywhere. No unblurred face.

## Acceptance criteria (testable)

- [ ] …

## Security requirements

- Inputs validated on the phone / in the Worker / by database checks:
- Access checked server-side (Worker + RLS):
- Secrets: none in code.
- Logs: no names, signatures, photos or phone numbers.
- Deny cases that must be tested:

## Tests to write

| Test | Tool | Allow or deny |
| --- | --- | --- |

## Phone test script

1. …

## Open questions for Ryan

1. …
