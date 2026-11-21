/**
 * Database setup for the Quality area (Customer Incidents and CAPA), kept here so the exact statements
 * that were applied are in the repository and can be checked by a test. Every statement is idempotent.
 */

export const QUALITY_TABLES_SQL: string[] = [
  `CREATE TABLE IF NOT EXISTS quality_counters (
  kind         TEXT NOT NULL,
  year         INTEGER NOT NULL,
  "lastNumber" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, year)
)`,
  `CREATE TABLE IF NOT EXISTS quality_incidents (
  id                  TEXT PRIMARY KEY,
  reference           TEXT NOT NULL,
  facility            TEXT,
  "dateReceived"      DATE NOT NULL,
  channel             TEXT NOT NULL,
  customer            TEXT NOT NULL DEFAULT '',
  "productId"         TEXT,
  "productName"       TEXT NOT NULL DEFAULT '',
  "lotCode"           TEXT NOT NULL DEFAULT '',
  "bestByDate"        DATE,
  description         TEXT NOT NULL DEFAULT '',
  category            TEXT,
  "foodSafetyConcern" BOOLEAN NOT NULL DEFAULT false,
  "immediateAction"   TEXT NOT NULL DEFAULT '',
  "responseDate"      DATE,
  "responseChannel"   TEXT,
  "responseSummary"   TEXT NOT NULL DEFAULT '',
  "capaRequired"      BOOLEAN,
  "noCapaReason"      TEXT NOT NULL DEFAULT '',
  status              TEXT NOT NULL DEFAULT 'open',
  "closedDate"        DATE,
  "closedById"        TEXT,
  "voidedAt"          TIMESTAMP(3),
  "voidedById"        TEXT,
  "voidReason"        TEXT,
  "createdById"       TEXT,
  "updatedById"       TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT quality_incidents_product_fkey FOREIGN KEY ("productId")   REFERENCES products(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT quality_incidents_closed_fkey  FOREIGN KEY ("closedById")  REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT quality_incidents_voided_fkey  FOREIGN KEY ("voidedById")  REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT quality_incidents_created_fkey FOREIGN KEY ("createdById") REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT quality_incidents_updated_fkey FOREIGN KEY ("updatedById") REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS quality_incidents_reference_key ON quality_incidents (reference)`,
  `CREATE INDEX IF NOT EXISTS quality_incidents_status_idx ON quality_incidents (status, "dateReceived")`,
  `CREATE TABLE IF NOT EXISTS quality_capas (
  id                    TEXT PRIMARY KEY,
  reference             TEXT NOT NULL,
  facility              TEXT,
  source                TEXT NOT NULL,
  problem               TEXT NOT NULL DEFAULT '',
  "rootCause"           TEXT NOT NULL DEFAULT '',
  "correctiveAction"    TEXT NOT NULL DEFAULT '',
  "preventiveAction"    TEXT NOT NULL DEFAULT '',
  "ownerId"             TEXT,
  "dueDate"             DATE,
  "effectivenessDate"   DATE,
  "effectivenessResult" TEXT NOT NULL DEFAULT '',
  status                TEXT NOT NULL DEFAULT 'open',
  "closedDate"          DATE,
  "closedById"          TEXT,
  "closedByName"        TEXT,
  "taskInstanceId"      TEXT,
  "voidedAt"            TIMESTAMP(3),
  "voidedById"          TEXT,
  "voidReason"          TEXT,
  "createdById"         TEXT,
  "updatedById"         TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT quality_capas_owner_fkey   FOREIGN KEY ("ownerId")     REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT quality_capas_closed_fkey  FOREIGN KEY ("closedById")  REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT quality_capas_voided_fkey  FOREIGN KEY ("voidedById")  REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT quality_capas_created_fkey FOREIGN KEY ("createdById") REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT quality_capas_updated_fkey FOREIGN KEY ("updatedById") REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS quality_capas_reference_key ON quality_capas (reference)`,
  `CREATE INDEX IF NOT EXISTS quality_capas_status_idx ON quality_capas (status, "dueDate")`,
  `CREATE TABLE IF NOT EXISTS quality_incident_capas (
  "incidentId" TEXT NOT NULL,
  "capaId"     TEXT NOT NULL,
  "linkedById" TEXT,
  "linkedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("incidentId", "capaId"),
  CONSTRAINT quality_incident_capas_incident_fkey FOREIGN KEY ("incidentId") REFERENCES quality_incidents(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT quality_incident_capas_capa_fkey     FOREIGN KEY ("capaId")     REFERENCES quality_capas(id)     ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT quality_incident_capas_linked_fkey   FOREIGN KEY ("linkedById") REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS quality_incident_capas_incident_key ON quality_incident_capas ("incidentId")`,
  `CREATE TABLE IF NOT EXISTS quality_attachments (
  id             TEXT PRIMARY KEY,
  "recordType"   TEXT NOT NULL,
  "recordId"     TEXT NOT NULL,
  kind           TEXT NOT NULL DEFAULT 'evidence',
  "fileName"     TEXT NOT NULL,
  "fileUrl"      TEXT NOT NULL,
  "fileSize"     INTEGER,
  "mimeType"     TEXT,
  description    TEXT NOT NULL DEFAULT '',
  "uploadedById" TEXT,
  "uploadedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removedAt"    TIMESTAMP(3),
  "removedById"  TEXT,
  "removeReason" TEXT,
  CONSTRAINT quality_attachments_uploaded_fkey FOREIGN KEY ("uploadedById") REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT quality_attachments_removed_fkey  FOREIGN KEY ("removedById")  REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
)`,
  `CREATE INDEX IF NOT EXISTS quality_attachments_record_idx ON quality_attachments ("recordType", "recordId")`,
  `CREATE TABLE IF NOT EXISTS quality_events (
  id           TEXT PRIMARY KEY,
  "recordType" TEXT NOT NULL,
  "recordId"   TEXT NOT NULL,
  reference    TEXT NOT NULL DEFAULT '',
  action       TEXT NOT NULL,
  "userId"     TEXT,
  "userName"   TEXT NOT NULL DEFAULT '',
  changes      JSONB NOT NULL DEFAULT '[]',
  note         TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT quality_events_user_fkey FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
)`,
  `CREATE INDEX IF NOT EXISTS quality_events_record_idx ON quality_events ("recordType", "recordId", "createdAt")`,
  `CREATE TABLE IF NOT EXISTS quality_reviews (
  id                 TEXT PRIMARY KEY,
  facility           TEXT,
  period             TEXT NOT NULL,
  "reviewDate"       DATE NOT NULL,
  "reviewedById"     TEXT,
  "reviewedByName"   TEXT NOT NULL DEFAULT '',
  "whatWasReviewed"  TEXT NOT NULL DEFAULT '',
  notes              TEXT NOT NULL DEFAULT '',
  counts             JSONB NOT NULL DEFAULT '{}',
  "linkedInstanceId" TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT quality_reviews_reviewed_fkey FOREIGN KEY ("reviewedById") REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS quality_reviews_period_key ON quality_reviews (period)`,
];

/**
 * The history is append-only. Rows of quality_events can be inserted and read; UPDATE, DELETE and
 * TRUNCATE are refused by the database itself, whoever asks.
 *
 * One narrow exception keeps user administration working: when a user row is deleted, the foreign key
 * clears that user's id on their events. That single change (userId to NULL, nothing else) is let
 * through; the person's name is stored separately on the event and stays.
 */
export const QUALITY_EVENTS_TRIGGER_SQL: string[] = [
  `CREATE OR REPLACE FUNCTION quality_events_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD."userId" IS NOT NULL AND NEW."userId" IS NULL AND (to_jsonb(NEW) - 'userId') = (to_jsonb(OLD) - 'userId') THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'quality_events is append-only: % is not allowed', TG_OP USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql`,
  `DROP TRIGGER IF EXISTS quality_events_no_update_delete ON quality_events`,
  `CREATE TRIGGER quality_events_no_update_delete BEFORE UPDATE OR DELETE ON quality_events FOR EACH ROW EXECUTE FUNCTION quality_events_append_only()`,
  `DROP TRIGGER IF EXISTS quality_events_no_truncate ON quality_events`,
  `CREATE TRIGGER quality_events_no_truncate BEFORE TRUNCATE ON quality_events FOR EACH STATEMENT EXECUTE FUNCTION quality_events_append_only()`,
];

/** Hands out the next number of a kind and year. One statement, atomic under concurrency: the row lock makes a second caller wait. */
export const QUALITY_NEXT_NUMBER_SQL = `INSERT INTO quality_counters (kind, year, "lastNumber") VALUES ($1, $2, 1)
ON CONFLICT (kind, year) DO UPDATE SET "lastNumber" = quality_counters."lastNumber" + 1
RETURNING "lastNumber"`;
