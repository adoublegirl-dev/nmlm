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
