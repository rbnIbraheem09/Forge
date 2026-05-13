CREATE TABLE IF NOT EXISTS models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  file_path TEXT,
  description TEXT,
  notes TEXT,
  status TEXT DEFAULT 'online',
  recommended_cfg REAL,
  recommended_steps INTEGER,
  family TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS loras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  file_path TEXT,
  description TEXT,
  notes TEXT,
  default_weight REAL DEFAULT 1.0,
  status TEXT DEFAULT 'online',
  trigger_words TEXT,
  recommended_strength REAL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS main_gens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  hero_image_path TEXT,
  hero_color TEXT,
  pinned INTEGER DEFAULT 0,
  notes TEXT,
  tags TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS iterations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  main_gen_id INTEGER NOT NULL REFERENCES main_gens(id) ON DELETE CASCADE,
  iteration_number INTEGER NOT NULL,
  title TEXT,
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
  starred INTEGER DEFAULT 0,
  starred_at TEXT,
  notes TEXT,
  tags TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS iteration_loras (
  iteration_id INTEGER REFERENCES iterations(id) ON DELETE CASCADE,
  lora_id INTEGER REFERENCES loras(id),
  weight REAL DEFAULT 1.0,
  PRIMARY KEY (iteration_id, lora_id)
);

CREATE TABLE IF NOT EXISTS iteration_custom_fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  iteration_id INTEGER NOT NULL REFERENCES iterations(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  field_value TEXT
);

CREATE TABLE IF NOT EXISTS global_field_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  field_key TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inbox_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image_path TEXT NOT NULL UNIQUE,
  extracted_metadata TEXT,
  file_mtime TEXT,
  detected_at TEXT DEFAULT (datetime('now'))
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

CREATE TABLE IF NOT EXISTS lora_example_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lora_id INTEGER NOT NULL REFERENCES loras(id) ON DELETE CASCADE,
  image_path TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('paste','file','gallery')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS model_example_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id INTEGER NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  image_path TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('paste','file','gallery')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS danbooru_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  category INTEGER NOT NULL DEFAULT 0,
  post_count INTEGER NOT NULL DEFAULT 0,
  aliases TEXT,
  embedding BLOB
);

CREATE INDEX IF NOT EXISTS idx_danbooru_tags_post_count ON danbooru_tags(post_count DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS danbooru_tags_fts USING fts5(
  name, aliases,
  content='danbooru_tags', content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS danbooru_tags_ai AFTER INSERT ON danbooru_tags BEGIN
  INSERT INTO danbooru_tags_fts(rowid, name, aliases) VALUES (new.id, new.name, new.aliases);
END;
CREATE TRIGGER IF NOT EXISTS danbooru_tags_ad AFTER DELETE ON danbooru_tags BEGIN
  INSERT INTO danbooru_tags_fts(danbooru_tags_fts, rowid, name, aliases) VALUES('delete', old.id, old.name, old.aliases);
END;
CREATE TRIGGER IF NOT EXISTS danbooru_tags_au AFTER UPDATE ON danbooru_tags BEGIN
  INSERT INTO danbooru_tags_fts(danbooru_tags_fts, rowid, name, aliases) VALUES('delete', old.id, old.name, old.aliases);
  INSERT INTO danbooru_tags_fts(rowid, name, aliases) VALUES (new.id, new.name, new.aliases);
END;
