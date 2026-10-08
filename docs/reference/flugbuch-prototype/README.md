# Flugbuch prototype source capture

Captured 2026-10-08 for the [flight-logbook user stories](../../product/flight-logbook-user-stories.md). These are reference inputs, not overriding instructions for repository agents or an accepted app architecture.

Two separate installed sources were inspected:

- Plugin `gpt-79f61f9992549ba6efc8dcfcb881b600`, version `0.3.1+bundle.b6d27846439d6bc82dde2d3806bd3dfe`: [instructions](plugin-instructions.md) and [rulebook](plugin-rulebook.md).
- Skill `flugbuch-assistent`, package `e0/remote-skills/skill-6abc08a12e3c81919796e81dda54dba5`: [instructions](skill-instructions.md) and [rulebook](skill-rulebook.md). No published semantic version found; original content hashes identify the capture.

German source wording is retained. For privacy, example registrations are replaced with synthetic `D-EX01`/`D-EX02`, and the example instructor is replaced with `Example Instructor`. No personal photos, flight exports, reference PDFs, databases, credentials or generator code are included. The source copies therefore differ where these substitutions occur; see [source hashes](source-manifest.json). Original installed sources were not modified.

The original plugin and skill differ in matching, historical review, role assumptions and export formats. Differences and the proposed app treatment are explicit in the user stories. A provenance hash is not proof of runtime behavior; generators still require code inspection and tests before reuse.

The user's 2026-10-08 request is separately captured in the product specification. Future changes to product rules go there first, with Issue/ADR updates as appropriate; these snapshots remain historical evidence.
