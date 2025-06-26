const express = require('express')
var path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const sessionStore = require('session-file-store')(session); // Requires 'session-file-store' package
const fs = require('fs');
// const bodyParser = require('body-parser')

const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
require('dotenv').config();

const config = require('./config');

const app = express();

// var urlencodedParser = bodyParser.urlencoded({ extended: false })
// var urlencodedParserExt = bodyParser.urlencoded({ extended: true })

app.use(cookieParser());

app.use(session({
    store: new sessionStore({
        path: process.env.SESSIONS_DIR, // Directory to store session files
        ttl: 2592000, // Session expiration time (in seconds)
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
}));

const jsDir = path.join(__dirname, 'public/js/mafia');
global.ver = Date.now();
fs.watch(jsDir, (eventType, filename) => {
    if (filename && filename.endsWith('.js')) {
        global.ver = Date.now();
        console.log(`${filename} был изменён. Новая версия: ${global.ver}`);
    }
});
app.use((req, res, next) => {
    if (!req.path.startsWith('/static')) {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        res.set('Surrogate-Control', 'no-store');
    }
    next();
});


app.engine('pug', require('pug').__express)
app.set('views', path.join(__dirname+'/videochat', 'views'));
app.set('view engine', 'pug');
app.locals.pretty = true;
//app.set('view options', { pretty: true });

app.use('/static', express.static('public', {
    etag: true,              // Enable ETag generation (default: true)
    lastModified: true,      // Enable Last-Modified header (default: true)
    cacheControl: true,      // Enable Cache-Control header (default: true)
    maxAge: '1w'             // Set max-age for cache expiration (optional, adjust as needed)
}));
app.use('/favicon.ico', express.static('favicon.ico'));

// Middleware to parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));
// Middleware to parse JSON bodies
app.use(express.json());

// app.use((req, res, next) => {
//     console.log('Headers:', req.headers);
//     console.log('Body:', req.body);
//     console.log('Query:', req.query);
//     next();
// });


const home = require('./videochat/controllers/home');
const roomList = require('./videochat/controllers/roomList');
const mafia = require('./videochat/controllers/mafia');
const publicRoom = require('./videochat/controllers/publicRoom');
const user = require('./videochat/controllers/user');


app.get('/', home.homePage);
app.get('/login', home.homePage);
app.get('/register', home.register);
app.get('/auth/telegram', home.tgAuth);
app.post('/auth/google', home.googleAuth);
app.get('/logout', home.logout);
app.post('/login', home.loginPost);
app.post('/register', home.registerPost);
app.get('/policy', home.privacyPolicy);
app.post('/user/avatar/upload', user.upload);
app.post('/user/edit', user.updateUser);
app.get('/user', home.userProfile);
app.get('/u/:mduid', home.userPublic )

app.get('/rooms', roomList.page )
app.get('/mafia', mafia.home )
app.get('/ajax/m/:room', mafia.roomRow )
app.get('/history', mafia.history )
app.get('/m/:room', mafia.game )
app.get('/p/:room', publicRoom.room)
app.get('/s/:room', publicRoom.stream)
app.get('/w/:room', publicRoom.watch)

const port = process.env.APP_PORT;
app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})