# Project audit probes

Synthetic, read-only-to-project audit helpers for the [2026-10-11 audit](../../docs/verification/2026-10-11-project-audit.md). Run from the repository root with its installed Node 24/TypeScript and Python 3.12 tooling:

```powershell
node --import tsx pocs/project-audit/reproduce.ts
python pocs/project-audit/check_docs.py
```

`reproduce.ts` uses separate in-memory SQLite databases and the canonical synthetic fixture. It recomputes backup checksums after changing one semantic property, invokes actual restore/history/query code, and reports acceptance/errors. The original source database must remain unchanged. Exit zero means the probes completed; inspect the reported outcomes. After a fix, unsafe backups should be rejected rather than preserving today's reported acceptance. These probes are not part of the passing acceptance suite and do not assert that vulnerabilities must remain.

`check_docs.py` inspects tracked Markdown plus new audit documents, skips fenced code and checks inline local file links and conventional heading fragments. Missing files fail the command; heading warnings need manual review. It does not check external URLs, reference-style links, code-block paths, requirements semantics, legal freshness, approval authenticity or image layout. Its reported line positions refer to prose after fenced-code removal.

Neither command accesses a provider, a device, secrets or personal data. Neither alters product code, existing databases, architecture decisions or synced project sources.
