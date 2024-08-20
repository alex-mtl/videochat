const express = require('express')
var path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const sessionStore = require('session-file-store')(session); // Requires 'session-file-store' package
const fs = require('fs');
const bodyParser = require('body-parser')

const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
require('dotenv').config();

const config = require('./config');

const app = express();

var urlencodedParser = bodyParser.urlencoded({ extended: false })
var urlencodedParserExt = bodyParser.urlencoded({ extended: true })

app.use(cookieParser());

app.use(session({
    store: new sessionStore({
        path: './sessions/vc', // Directory to store session files
        ttl: 86400, // Session expiration time (in seconds)
    }),
    secret: config.secret,
    resave: false,
    saveUninitialized: true,
}));

app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
    next();
});


app.engine('pug', require('pug').__express)
app.set('views', path.join(__dirname+'/videochat', 'views'));
app.set('view engine', 'pug');
app.locals.pretty = true;
//app.set('view options', { pretty: true });

app.use('/static', express.static('public'));
app.use('/favicon.ico', express.static('favicon.ico'));

const home = require('./videochat/controllers/home');
const roomList = require('./videochat/controllers/roomList');
const mafia = require('./videochat/controllers/mafia');
const publicRoom = require('./videochat/controllers/publicRoom');


app.get('/', home.homePage);
app.get('/login', home.homePage);
app.get('/register', home.register);
app.get('/auth/telegram', home.tgAuth);
app.get('/logout', home.logout);
app.post('/login', urlencodedParser, home.loginPost);
app.post('/register', urlencodedParser, home.registerPost);
app.get('/user', urlencodedParser, home.userProfile);

app.get('/rooms', roomList.page )
app.get('/mafia', mafia.home )
app.get('/m/:room', mafia.game )
app.get('/p/:room', publicRoom.room)
app.get('/s/:room', publicRoom.stream)
app.get('/w/:room', publicRoom.watch)

app.listen(config.port, () => {
    console.log(`Example app listening on port ${config.port}`)
})