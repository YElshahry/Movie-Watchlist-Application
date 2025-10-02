const express = require('express')
const path = require('path')
const session = require('express-session')
const app = express()

const exphbs = require('express-handlebars')

// Setup Handlebars with helpers
const hbs = exphbs.create({
  extname: '.hbs',
  helpers: {
    eqAdmin: (role) => role === 'admin',
    eq: (a, b) => a === b,
    ifEquals: function (arg1, arg2, options) {
      return arg1 === arg2 ? options.fn(this) : options.inverse(this)
    },
    formatRating: function (rating) {
      if (!rating || isNaN(rating)) return 'N/A'
      const rounded = Math.round(parseFloat(rating) * 10) / 10
      return (rounded % 1 === 0 ? `${Math.floor(rounded)}` : `${rounded.toFixed(1)}`) + '/10'
    },
    encode: function (str) {
      return encodeURIComponent(str)
    }
  }
})


app.engine('hbs', hbs.engine)
app.set('view engine', 'hbs')
app.set('views', path.join(__dirname, 'views'))

app.use(express.static(path.join(__dirname, 'public')))
app.use(express.urlencoded({ extended: true }))

app.use(session({
  secret: 'watchlistSecretKey',
  resave: false,
  saveUninitialized: true
}))

app.use((req, res, next) => {
  res.locals.session = req.session
  next()
})

const routes = require('./routes/index')
app.use('/', routes)

app.listen(3000, () => {
  console.log('Server listening on port: 3000 CNTL:-C to stop')
  console.log('To Test:')
  console.log('http://localhost:3000')
})
