const express = require('express')
var path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const fs = require('fs');


const port = 3080

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
    res.render('home', { sessionID : req.sessionID , wssURL : "wss://video.ttl10.net:3000"})
})

app.get('/rooms', (req, res) => {
    console.log('Session ID ', req.sessionID);
    res.render('rooms', { sessionID : req.sessionID, wssURL : "wss://video.ttl10.net:3000" })
})

app.get('/r/:room', (req, res) => {
    console.log('Room ID ', req.params.room);
    roomFile = 'rooms/'+req.params.room+'.json';
    if (!fs.existsSync(roomFile)) {
        res.render('rooms', {chatSessionID: req.sessionID, wssURL : "wss://video.ttl10.net:3000", error: "Room "+req.params.room+" does not exist!"})
    } else {
        res.render('room', {chatSessionID: req.sessionID, wssURL : "wss://video.ttl10.net:3000", roomID: req.params.room, wssURL : "wss://video.ttl10.net:3000"})
    }
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})