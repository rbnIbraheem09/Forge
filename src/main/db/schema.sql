CREATE TABLE IF NOT EXISTS generations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  image_path TEXT NOT NULL,
  prompt TEXT,
  negative_prompt TEXT,
  seed TEXT,
  steps INTEGER,
  cfg REAL,
  sampler TEXT,
  scheduler TEXT,
  width INTEGER,
  height INTEGER,
  checkpoint_id INTEGER REFERENCES models(id),
  what_worked TEXT,
  what_didnt TEXT,
  takeaways TEXT,
  starred INTEGER DEFAULT 0,
  tags TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  file_path TEXT,
  description TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS loras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  file_path TEXT,
  description TEXT,
  notes TEXT,
  default_weight REAL DEFAULT 1.0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS generation_loras (
  generation_id INTEGER REFERENCES generations(id) ON DELETE CASCADE,
  lora_id INTEGER REFERENCES loras(id),
  weight REAL DEFAULT 1.0,
  PRIMARY KEY (generation_id, lora_id)
);

CREATE TABLE IF NOT EXISTS extras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT,
  tags TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
