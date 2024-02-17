const express = require('express')
var path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const fs = require('fs');

const config = require('./config');

const app = express();

app.use(cookieParser());
app.use(session({
    secret: config.secret,
    resave: false,
    saveUninitialized: true
}));
app.engine('pug', require('pug').__express)
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
app.locals.pretty = true;
//app.set('view options', { pretty: true });

app.use('/static', express.static('public'));
app.use('/favicon.ico', express.static('favicon.ico'));

const home = require('./videochat/controllers/home');
const roomList = require('./videochat/controllers/roomList');
const publicRoom = require('./videochat/controllers/publicRoom');


app.get('/', home.homePage);

app.get('/rooms', roomList.page )

app.get('/r/:room', (req, res) => {
    console.log('Room ID ', req.params.room);
    roomFile = 'rooms/'+req.params.room+'.json';
    if (!fs.existsSync(roomFile)) {
        req.session.error = 'Incorrect username or password';
        res.redirect('/rooms');
        // res.render('rooms', {
        //     sessionID: req.sessionID,
        //     wssURL : config.wssURL,
        //     error: "Room "+req.params.room+" does not exist!
        // })
    } else {
        res.render('room', {chatSessionID: req.sessionID, wssURL : config.wssURL, roomID: req.params.room })
    }
})
app.get('/p/:room', publicRoom.room)

app.listen(config.port, () => {
    console.log(`Example app listening on port ${config.port}`)
})