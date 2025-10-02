const express = require('express')
const sqlite3 = require('sqlite3').verbose()
const path = require('path')
const fetch = require('node-fetch')

const router = express.Router()
const db = new sqlite3.Database(path.join(__dirname, '../db/watchlist.db'))

// Middleware to protect admin routes
function isAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.redirect('/login')
  }
  next()
}

// Home redirect
router.get('/', (req, res) => {
  res.redirect('/dashboard')
})

// Login page
router.get('/login', (req, res) => {
  const { redirect, movieId, title, poster, overview } = req.query
  res.render('login', {
    redirect,
    movieId,
    title,
    poster,
    overview
  })
})

// Login form submit
router.post('/login', (req, res) => {
  const { username, password } = req.body

  db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, user) => {
    if (err) {
      console.error(err)
      return res.render('login', { error: 'Something went wrong.' })
    }

    if (!user) {
      return res.render('login', { error: 'Invalid username or password.' })
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      role: user.role
    }

    const redirect = req.body.redirect
    if (redirect === '/add-after-login') {
      const { movieId, title, poster, overview } = req.body
      const url = `/add-after-login?movieId=${encodeURIComponent(movieId)}&title=${encodeURIComponent(title)}&poster=${encodeURIComponent(poster)}&overview=${encodeURIComponent(overview)}`
      return res.redirect(url)
    }

    res.redirect(user.role === 'admin' ? '/admin' : '/dashboard')

  })
})

router.get('/add-after-login', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login')
  }

  const { movieId, title, poster, overview } = req.query
  const user_id = req.session.user.id

  db.get('SELECT * FROM watchlist WHERE user_id = ? AND movie_id = ?', [user_id, movieId], (err, row) => {
    if (err) {
      console.error(err)
      return res.redirect('/dashboard')
    }

    if (row) {
      return res.redirect('/movie/' + movieId)
    }

    db.run(
      `INSERT INTO watchlist (user_id, movie_id, movie_title, poster_path, overview) VALUES (?, ?, ?, ?, ?)`,
      [user_id, movieId, title, poster, overview],
      (err) => {
        if (err) {
          console.error(err)
        }
        res.redirect('/movie/' + movieId)
      }
    )
  })
})

// Register page
router.get('/register', (req, res) => {
  res.render('register')
})

// Handle registration
router.post('/register', (req, res) => {
  const { username, password } = req.body

  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) {
      console.error(err)
      return res.render('register', { error: 'Something went wrong.' })
    }

    if (user) {
      return res.render('register', { error: 'Username already exists.' })
    }

    db.run(
      `INSERT INTO users (username, password, role) VALUES (?, ?, 'guest')`,
      [username, password],
      function (err) {
        if (err) {
          console.error(err)
          return res.render('register', { error: 'Could not create account.' })
        }

        req.session.user = {
          id: this.lastID,
          username: username,
          role: 'guest'
        }

        res.redirect('/dashboard')
      }
    )
  })
})

// Dashboard
router.get('/dashboard', async (req, res) => {
  const user_id = req.session.user?.id || null
  const apiKey = '17c036f7d9c920973b54bd8e8d89bed1'
  const page = parseInt(req.query.page) || 1
  const browseUrl = `https://api.themoviedb.org/3/movie/popular?api_key=${apiKey}&page=${page}`

  const sortParam = req.query.sort || ''
  try {
    const browseResponse = await fetch(browseUrl)
    const browseData = await browseResponse.json()
    const browse = browseData.results || []
    let sortedBrowse = [...browse]

    if (sortParam === 'title') {
      sortedBrowse.sort((a, b) => a.title.localeCompare(b.title))
    } else if (sortParam === 'rating') {
      sortedBrowse.sort((a, b) => b.vote_average - a.vote_average)
    } else if (sortParam === 'year') {
      sortedBrowse.sort((a, b) => (b.release_date || '').localeCompare(a.release_date || ''))
    }

    if (user_id) {
      db.all(`SELECT * FROM watchlist WHERE user_id = ?`, [user_id], async (err, rows) => {
        if (err) {
          console.error(err)
          return res.render('dashboard', {
            error: 'Could not load watchlist',
            watchlist: [],
            browse: sortedBrowse,
            nextPage: page + 1,
            sort: sortParam
          })
        }

        const watchlistWithRatings = await Promise.all(rows.map(async (movie) => {
          try {
            const ratingRes = await fetch(`https://api.themoviedb.org/3/movie/${movie.movie_id}?api_key=${apiKey}`)
            const ratingData = await ratingRes.json()
            return { ...movie, vote_average: ratingData.vote_average || 'N/A' }
          } catch {
            return { ...movie, vote_average: 'N/A' }
          }
        }))

        res.render('dashboard', {
          watchlist: watchlistWithRatings,
          browse: sortedBrowse,
          nextPage: page + 1,
          sort: sortParam
        })
      })
    } else {
      res.render('dashboard', {
        watchlist: [],
        browse: sortedBrowse,
        nextPage: page + 1,
        sort: sortParam
      })
    }
  } catch (err) {
    console.error(err)
    res.render('dashboard', {
      watchlist: [],
      browse: [],
      error: 'Could not load content.',
      nextPage: page + 1,
      sort: sortParam
    })
  }
})

// Load additional popular movies for AJAX "View More"
router.get('/browse/page/:page', (req, res) => {
  const page = parseInt(req.params.page) || 1
  const apiKey = '17c036f7d9c920973b54bd8e8d89bed1'
  const browseUrl = `https://api.themoviedb.org/3/movie/popular?api_key=${apiKey}&page=${page}`

  fetch(browseUrl)
    .then(response => response.json())
    .then(data => {
      res.json(data.results || [])
    })
    .catch(err => {
      console.error(err)
      res.status(500).json({ error: 'Failed to load additional movies' })
    })
})

// Admin panel
router.get('/admin', isAdmin, (req, res) => {
  db.all(`SELECT id, username, role FROM users`, [], (err, users) => {
    if (err) {
      console.error(err)
      return res.render('admin', { guests: [], admins: [] })
    }

    const guests = users.filter(user => user.role === 'guest')
    const admins = users.filter(user => user.role === 'admin')
    const guestsWithWatchlists = []

    const loadNext = (i) => {
      if (i >= guests.length) {
        return res.render('admin', { guests: guestsWithWatchlists, admins })
      }

      const guest = guests[i]
      db.all(`SELECT * FROM watchlist WHERE user_id = ?`, [guest.id], (err, watchlist) => {
        if (err) {
          console.error(err)
          watchlist = []
        }
        guestsWithWatchlists.push({ ...guest, watchlist })
        loadNext(i + 1)
      })
    }

    loadNext(0)
  })
})

// Admin create user
router.get('/admin/create', isAdmin, (req, res) => {
  res.render('create-user')
})

router.post('/admin/create', isAdmin, (req, res) => {
  const { username, password, role } = req.body

  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) return res.render('create-user', { error: 'Something went wrong.' })
    if (user) return res.render('create-user', { error: 'Username already exists.' })

    const selectedRole = role === 'admin' ? 'admin' : 'guest'

    db.run(
      `INSERT INTO users (username, password, role) VALUES (?, ?, ?)`,
      [username, password, selectedRole],
      (err) => {
        if (err) return res.render('create-user', { error: 'Could not create account.' })
        res.redirect('/admin')
      }
    )
  })
})

// Admin user settings
router.get('/admin/user-settings/:id', isAdmin, (req, res) => {
  const { id } = req.params

  db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => {
    if (err || !user) return res.send('User not found.')

    db.all('SELECT * FROM watchlist WHERE user_id = ?', [id], (err, watchlist) => {
      if (err) {
        console.error(err)
        return res.render('user-settings', { user, watchlist: [] })
      }

      res.render('user-settings', { user, watchlist })
    })
  })
})

// Movie details
router.get('/movie/:id', (req, res) => {
  const movieId = req.params.id;
  const apiKey = '17c036f7d9c920973b54bd8e8d89bed1';
  const url = `https://api.themoviedb.org/3/movie/${movieId}?api_key=${apiKey}`;

  fetch(url)
    .then(response => response.json())
    .then(data => {
      const isInWatchlist = req.session.user ? new Promise((resolve, reject) => {
        db.get(`SELECT * FROM watchlist WHERE user_id = ? AND movie_id = ?`,
          [req.session.user.id, movieId],
          (err, row) => {
            if (err) reject(err);
            resolve(!!row);
          });
      }) : Promise.resolve(false);

      isInWatchlist.then((alreadyAdded) => {
        res.render('movie-details', {
          movie: data,
          alreadyAdded
        });
      }).catch(err => {
        console.error(err);
        res.render('movie-details', {
          movie: data,
          alreadyAdded: false,
          error: 'Error checking watchlist status.'
        });
      });
    })
    .catch(err => {
      console.error(err);
      res.send('Movie details could not be loaded.');
    });
})

// Update user settings
router.post('/admin/user-settings/:id', isAdmin, (req, res) => {
  const { id } = req.params
  const { username, password } = req.body

  db.get('SELECT * FROM users WHERE username = ? AND id != ?', [username, id], (err, existingUser) => {
    if (err) return res.send('Error checking username.')
    if (existingUser) {
      return res.render('user-settings', {
        user: { id, username, password },
        error: 'Username already in use.'
      })
    }

    db.run('UPDATE users SET username = ?, password = ? WHERE id = ?', [username, password, id], (err) => {
      if (err) return res.send('Error updating user.')
      res.redirect('/admin')
    })
  })
})

// Remove user
router.post('/admin/remove-user', isAdmin, (req, res) => {
  const { id } = req.body

  db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => {
    if (err) return res.send('Error checking user.')
    if (!user || user.role === 'admin') return res.send('Cannot remove admin accounts.')

    db.run(`DELETE FROM users WHERE id = ?`, [id], (err) => {
      if (err) return res.send('Error deleting user.')

      db.run(`DELETE FROM watchlist WHERE user_id = ?`, [id], (err) => {
        if (err) return res.send('Error cleaning up watchlist.')
        res.redirect('/admin')
      })
    })
  })
})

// Promote user
router.post('/admin/promote', isAdmin, (req, res) => {
  const { id } = req.body
  db.run(`UPDATE users SET role = 'admin' WHERE id = ?`, [id], (err) => {
    if (err) return res.send('Failed to promote user.')
    res.redirect('/admin')
  })
})

// Movie search using TMDb API
router.post('/search', (req, res) => {
  const query = req.body.query
  const apiKey = '17c036f7d9c920973b54bd8e8d89bed1'
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}`

  fetch(url)
    .then(res => res.json())
    .then(data => {
      res.render('dashboard', { movies: data.results })
    })
    .catch(err => {
      console.error(err)
      res.render('dashboard', { error: 'Something went wrong' })
    })
})

// Add movie to watchlist
router.post('/add', (req, res) => {
  if (!req.session.user) return res.redirect('/login')

  const { id, title, poster, overview } = req.body
  const user_id = req.session.user.id

  db.get(`SELECT * FROM watchlist WHERE user_id = ? AND movie_id = ?`, [user_id, id], (err, row) => {
    if (err) return res.render('dashboard', { error: 'Something went wrong.' })
    if (row) {
      db.all(`SELECT * FROM watchlist WHERE user_id = ?`, [user_id], (err, rows) => {
        if (err) return res.render('dashboard', { error: 'Something went wrong.' })
        return res.render('dashboard', {
          watchlist: rows,
          error: 'This movie is already in your watchlist.'
        })
      })
      return
    }

    db.run(
      `INSERT INTO watchlist (user_id, movie_id, movie_title, poster_path, overview)
       VALUES (?, ?, ?, ?, ?)`,
      [user_id, id, title, poster, overview],
      (err) => {
        if (err) return res.send('Error adding to watchlist.')
        res.redirect('/dashboard')
      }
    )
  })
})

// Remove movie from watchlist
router.post('/remove', (req, res) => {
  if (!req.session.user) return res.redirect('/login')

  const watchlistId = req.body.id
  db.run(`DELETE FROM watchlist WHERE id = ?`, [watchlistId], (err) => {
    if (err) return res.send('Error removing movie.')
    res.redirect('/dashboard')
  })
})

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/dashboard')
  })
})

module.exports = router
