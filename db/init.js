const sqlite3 = require('sqlite3').verbose()
const db = new sqlite3.Database('db/watchlist.db')

db.serialize(() => {
  // Create users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT CHECK(role IN ('guest', 'admin')) NOT NULL
    )
  `)

  // Create watchlist table
  db.run(`
    CREATE TABLE IF NOT EXISTS watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      movie_id INTEGER,
      movie_title TEXT,
      poster_path TEXT,
      overview TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `)

  // Default users
  db.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)`, ['ldnel', 'secret', 'admin'])
  db.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)`, ['yousuf', 'secret', 'admin'])
  db.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)`, ['guest', 'secret', 'guest'])

  console.log('✅ Database initialized with test users.')
})

db.close()
