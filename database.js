const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'vibespace.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to connect to SQLite database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
    initializeTables();
  }
});

function initializeTables() {
  db.serialize(() => {
    // Create Tasks table with client_id
    db.run(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id TEXT NOT NULL DEFAULT 'global',
        title TEXT NOT NULL,
        status TEXT DEFAULT 'up_next', -- 'focusing', 'up_next', 'done'
        priority INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Focus Sessions table with client_id
    db.run(`
      CREATE TABLE IF NOT EXISTS focus_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id TEXT NOT NULL DEFAULT 'global',
        duration INTEGER NOT NULL, -- in minutes
        type TEXT NOT NULL, -- 'work', 'break'
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Run migrations to add columns if they do not exist
    db.run(`ALTER TABLE tasks ADD COLUMN client_id TEXT NOT NULL DEFAULT 'global'`, () => {});
    db.run(`ALTER TABLE focus_sessions ADD COLUMN client_id TEXT NOT NULL DEFAULT 'global'`, () => {});

    // For preferences, check if we need to migrate/recreate it for composite key (client_id, key)
    db.all("PRAGMA table_info(preferences)", (err, rows) => {
      const hasClientId = rows && rows.some(r => r.name === 'client_id');
      if (err || !hasClientId) {
        db.run(`DROP TABLE IF EXISTS preferences`, () => {
          db.run(`
            CREATE TABLE preferences (
              client_id TEXT NOT NULL DEFAULT 'global',
              key TEXT NOT NULL,
              value TEXT NOT NULL,
              PRIMARY KEY (client_id, key)
            )
          `, () => {
            seedDefaultPreferences('global');
          });
        });
      } else {
        seedDefaultPreferences('global');
      }
    });
  });
}

function seedDefaultPreferences(clientId) {
  const defaults = [
    { key: 'theme', value: 'dark' },
    { key: 'soundscape', value: 'none' },
    { key: 'pomodoro_duration', value: '25' },
    { key: 'break_duration', value: '5' },
    { key: 'volume', value: '0.5' }
  ];

  const stmt = db.prepare('INSERT OR IGNORE INTO preferences (client_id, key, value) VALUES (?, ?, ?)');
  defaults.forEach(def => {
    stmt.run(clientId, def.key, def.value);
  });
  stmt.finalize();
}

// Database helper functions
const dbHelpers = {
  // Tasks Helpers
  getTasks: (clientId = 'global') => {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM tasks WHERE client_id = ? ORDER BY priority ASC, created_at DESC', [clientId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  addTask: (title, status = 'up_next', clientId = 'global') => {
    return new Promise((resolve, reject) => {
      db.run('INSERT INTO tasks (client_id, title, status) VALUES (?, ?, ?)', [clientId, title, status], function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, title, status });
      });
    });
  },

  updateTaskStatus: (id, status, clientId = 'global') => {
    return new Promise((resolve, reject) => {
      db.run('UPDATE tasks SET status = ? WHERE id = ? AND client_id = ?', [status, id, clientId], function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
  },

  deleteTask: (id, clientId = 'global') => {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM tasks WHERE id = ? AND client_id = ?', [id, clientId], function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
  },

  // Focus Session Helpers
  logFocusSession: (duration, type, clientId = 'global') => {
    return new Promise((resolve, reject) => {
      db.run('INSERT INTO focus_sessions (client_id, duration, type) VALUES (?, ?, ?)', [clientId, duration, type], function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, duration, type });
      });
    });
  },

  getFocusSessions: (clientId = 'global') => {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM focus_sessions WHERE client_id = ? ORDER BY timestamp DESC LIMIT 100', [clientId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  // Preferences Helpers
  getPreferences: (clientId = 'global') => {
    return new Promise((resolve, reject) => {
      seedDefaultPreferences(clientId);
      db.all('SELECT * FROM preferences WHERE client_id = ?', [clientId], (err, rows) => {
        if (err) reject(err);
        else {
          const prefs = {};
          rows.forEach(row => {
            prefs[row.key] = row.value;
          });
          resolve(prefs);
        }
      });
    });
  },

  updatePreference: (key, value, clientId = 'global') => {
    return new Promise((resolve, reject) => {
      db.run('INSERT OR REPLACE INTO preferences (client_id, key, value) VALUES (?, ?, ?)', [clientId, key, value.toString()], function(err) {
        if (err) reject(err);
        else resolve({ key, value });
      });
    });
  }
};

module.exports = dbHelpers;
