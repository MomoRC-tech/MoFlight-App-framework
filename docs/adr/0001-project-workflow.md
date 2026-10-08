# ADR 0001: Repository and direct commit workflow

- Date: 2026-10-08
- Status: Accepted — explicit project instructions and user decision
- Decision owner: Manuel Singer

## Context
Two products share a reusable platform. Chats alone are not a durable technical project record.

## Decision
MomoRC-tech/MoFlight-App-framework is the authoritative versioned repository. README.md is the central documentation and links supporting evidence and ADRs. Issues track tasks and open decisions.

Changes go directly to main in traceable commits. Manuel explicitly waived PRs; this supersedes the earlier branch/PR recommendation.

The target is a monorepo; directories appear only when needed. This decision does not approve any mobile/backend technology.

## Consequences
Update code and documentation together. Apply appropriate checks and avoid overwriting other work. Secrets and personal flight data remain outside version control. Manuel retains product and architecture approval.
