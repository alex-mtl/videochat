const express = require('express')
var path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const sessionStore = require('session-file-store')(session); // Requires 'session-file-store' package
const fs = require('fs');

const config = require('./config');

const app = express();

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

app.get('/rooms', roomList.page )
app.get('/mafia', mafia.home )
app.get('/m/:room', mafia.game )
app.get('/p/:room', publicRoom.room)
app.get('/s/:room', publicRoom.stream)
app.get('/w/:room', publicRoom.watch)

app.listen(config.port, () => {
    console.log(`Example app listening on port ${config.port}`)
})