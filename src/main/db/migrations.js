// 数据库迁移脚本。顺序执行，追加新版本时在末尾加一项，禁止修改已发布的迁移。

const MIGRATIONS = [
  {
    version: 1,
    name: 'init-core',
    sql: `
      CREATE TABLE IF NOT EXISTS tags (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        name          TEXT    NOT NULL UNIQUE,
        color         TEXT    NOT NULL DEFAULT '#D4AF6A',
        shortcut_key  INTEGER,
        sort_order    INTEGER NOT NULL DEFAULT 0,
        is_break      INTEGER NOT NULL DEFAULT 0,
        created_at    INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS time_entries (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        start_time     INTEGER NOT NULL,
        end_time       INTEGER,
        duration_sec   INTEGER,
        tag_id         INTEGER REFERENCES tags(id),
        detail         TEXT,
        window_title   TEXT,
        is_fragment    INTEGER NOT NULL DEFAULT 0,
        created_at     INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_entries_start ON time_entries(start_time);
      CREATE INDEX IF NOT EXISTS idx_entries_tag ON time_entries(tag_id);

      CREATE TABLE IF NOT EXISTS screenshots (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path      TEXT    NOT NULL,
        taken_at       INTEGER NOT NULL,
        window_title   TEXT,
        process_name   TEXT,
        entry_id       INTEGER REFERENCES time_entries(id),
        pack_id        INTEGER REFERENCES evidence_packs(id),
        created_at     INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_screenshots_taken ON screenshots(taken_at);

      CREATE TABLE IF NOT EXISTS evidence_packs (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        date_start     INTEGER NOT NULL,
        date_end       INTEGER NOT NULL,
        zip_path       TEXT    NOT NULL,
        summary        TEXT,
        ntp_offset_ms  INTEGER DEFAULT 0,
        created_at     INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS activity_log (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        ts             INTEGER NOT NULL,
        window_title   TEXT,
        process_name   TEXT,
        is_idle        INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_activity_ts ON activity_log(ts);

      CREATE TABLE IF NOT EXISTS settings (
        key            TEXT PRIMARY KEY,
        value          TEXT NOT NULL
      );

      INSERT OR IGNORE INTO tags (name, color, shortcut_key, sort_order, is_break, created_at)
      VALUES ('编码', '#D4AF6A', 1, 1, 0, 0),
             ('开会', '#7FA98C', 2, 2, 0, 0),
             ('写方案', '#8AA8C8', 3, 3, 0, 0),
             ('线上排查', '#C98B6E', 4, 4, 0, 0),
             ('摸鱼', '#8F867B', 5, 5, 1, 0),
             ('其他', '#9D9D9D', 0, 6, 0, 0);
    `
  },
  {
    version: 2,
    name: 'task-player-and-todos',
    sql: `
      CREATE TABLE IF NOT EXISTS pause_points (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_id       INTEGER REFERENCES time_entries(id),
        ts             INTEGER NOT NULL,
        detail         TEXT,
        created_at     INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_pause_entry ON pause_points(entry_id);
      CREATE INDEX IF NOT EXISTS idx_pause_ts ON pause_points(ts);

      CREATE TABLE IF NOT EXISTS todos (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        title          TEXT    NOT NULL,
        detail         TEXT,
        status         TEXT    NOT NULL DEFAULT 'todo', -- todo | doing | done
        priority       TEXT    NOT NULL DEFAULT 'medium',
        due_at         INTEGER,
        source         TEXT    NOT NULL DEFAULT 'desktop', -- desktop | agent | mcp
        created_at     INTEGER NOT NULL,
        updated_at     INTEGER NOT NULL,
        closed_at      INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);
      CREATE INDEX IF NOT EXISTS idx_todos_due ON todos(due_at);
    `
  },
  {
    version: 3,
    name: 'pause-point-tagging',
    sql: `
      ALTER TABLE pause_points ADD COLUMN tag_id INTEGER REFERENCES tags(id);
      CREATE INDEX IF NOT EXISTS idx_pause_tag ON pause_points(tag_id);
    `
  },
  {
    version: 4,
    name: 'todo-reminder-state',
    sql: `
      ALTER TABLE todos ADD COLUMN reminded_at INTEGER;
      ALTER TABLE todos ADD COLUMN snooze_until INTEGER;
      CREATE INDEX IF NOT EXISTS idx_todos_snooze ON todos(snooze_until);
    `
  },
  {
    version: 5,
    name: 'ledger-revisions',
    sql: `
      CREATE TABLE IF NOT EXISTS ledger_revisions (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_id       INTEGER REFERENCES time_entries(id),
        action         TEXT NOT NULL,
        before_json    TEXT,
        after_json     TEXT,
        created_at     INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ledger_revisions_entry ON ledger_revisions(entry_id);
      CREATE INDEX IF NOT EXISTS idx_ledger_revisions_created ON ledger_revisions(created_at);
    `
  },
  {
    version: 6,
    name: 'evidence-library-core',
    sql: `
      CREATE TABLE IF NOT EXISTS evidence_items (
        id                  TEXT PRIMARY KEY,
        type                TEXT NOT NULL,
        source              TEXT NOT NULL,
        status              TEXT NOT NULL DEFAULT 'captured',
        original_path       TEXT NOT NULL,
        relative_path       TEXT NOT NULL,
        sha256              TEXT NOT NULL,
        size_bytes          INTEGER NOT NULL,
        mime_type           TEXT,
        created_at          INTEGER NOT NULL,
        imported_at         INTEGER NOT NULL,
        captured_at         INTEGER,
        device_id           TEXT,
        ledger_entry_id     INTEGER REFERENCES time_entries(id),
        tag_id              INTEGER REFERENCES tags(id),
        title               TEXT,
        user_note           TEXT,
        unsupported_reason  TEXT,
        is_deleted          INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_evidence_created ON evidence_items(created_at);
      CREATE INDEX IF NOT EXISTS idx_evidence_captured ON evidence_items(captured_at);
      CREATE INDEX IF NOT EXISTS idx_evidence_status ON evidence_items(status);
      CREATE INDEX IF NOT EXISTS idx_evidence_ledger ON evidence_items(ledger_entry_id);
      CREATE INDEX IF NOT EXISTS idx_evidence_sha ON evidence_items(sha256);

      CREATE TABLE IF NOT EXISTS evidence_metadata (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        evidence_id     TEXT NOT NULL REFERENCES evidence_items(id),
        key             TEXT NOT NULL,
        value_json      TEXT,
        source          TEXT NOT NULL DEFAULT 'system',
        created_at      INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_evidence_meta_item ON evidence_metadata(evidence_id);

      CREATE TABLE IF NOT EXISTS evidence_reviews (
        id                    TEXT PRIMARY KEY,
        evidence_id            TEXT NOT NULL REFERENCES evidence_items(id),
        review_status          TEXT NOT NULL DEFAULT 'pending',
        confirmed_title        TEXT,
        confirmed_summary      TEXT,
        confirmed_tags_json    TEXT,
        accepted_claims_json   TEXT,
        user_note              TEXT,
        created_at             INTEGER NOT NULL,
        updated_at             INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_evidence_review_item ON evidence_reviews(evidence_id);
    `
  }
]

function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)')
  const applied = db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version)
  for (const m of MIGRATIONS) {
    if (applied.includes(m.version)) continue
    const tx = db.transaction(() => {
      db.exec(m.sql)
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(m.version, Date.now())
    })
    tx()
  }
  return applied.length
}

module.exports = { MIGRATIONS, migrate }
