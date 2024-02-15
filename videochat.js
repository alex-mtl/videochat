const express = require('express')
var path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const fs = require('fs');


const port = 3080;
const wssURL = "wss://video.ttl10.net:3000";

process.env.APP_HOST


const app = express();

app.use(cookieParser());
app.use(session({
    secret: 'mGpFoUnYpRylxBNziSzK2tVx',
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
app.get('/', (req, res) => {
    console.log('Session ID ', req.sessionID);
    res.render('home', { sessionID : req.sessionID , wssURL : wssURL})
})

app.get('/rooms', (req, res) => {
    console.log('Session ID ', req.sessionID);
    res.render('rooms', { sessionID : req.sessionID, wssURL : wssURL })
})

app.get('/r/:room', (req, res) => {
    console.log('Room ID ', req.params.room);
    roomFile = 'rooms/'+req.params.room+'.json';
    if (!fs.existsSync(roomFile)) {
        res.render('rooms', {
            sessionID: req.sessionID,
            wssURL : wssURL,
            error: "Room "+req.params.room+" does not exist!"
        })
    } else {
        res.render('room', {chatSessionID: req.sessionID, wssURL : wssURL, roomID: req.params.room })
    }
})
app.get('/p/:room', (req, res) => {
    console.log('Room ID ', req.params.room);
    console.log('/p/:room sessionID ', req.sessionID);

    roomFile = 'rooms/'+req.params.room+'.json';
    if (!fs.existsSync(roomFile)) {
        res.render('rooms', {
            sessionID: req.sessionID,
            wssURL : wssURL,
            error: "Room "+req.params.room+" does not exist!"
        })
    } else {
        res.render('p-room', {
            sessionID: req.sessionID,
            wssURL : wssURL,
            roomID : req.params.room,
            roomID: req.params.room
        })
    }
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})