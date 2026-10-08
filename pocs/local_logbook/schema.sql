-- Host trial schema v1. Proposal for device port, not an approved mobile driver.
BEGIN;
CREATE TABLE dataset (id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL CHECK(schema_version=1));
CREATE TABLE records (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision>0),
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  UNIQUE(kind,id,revision)
);
CREATE INDEX records_latest ON records(kind,id,revision DESC);
PRAGMA user_version=1;
COMMIT;
