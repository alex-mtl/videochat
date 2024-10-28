const express = require('express');
const https = require('https');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const sessionStore = require('session-file-store')(session); // Requires 'session-file-store' package
const config = require('./config');
require('dotenv').config();
const app = express();
app.use(cookieParser());


app.use(session({
    store: new sessionStore({
        path: process.env.SESSIONS_DIR, // Directory to store session files
        ttl: 86400, // Session expiration time (in seconds)
    }),
    secret: config.secret,
    resave: false,
    saveUninitialized: true,
}));

// Load SSL certificate and private key
// const privateKey = fs.readFileSync('video-key.pem', 'utf8');
// const certificate = fs.readFileSync('video-cert.pem', 'utf8');
const privateKey = fs.readFileSync(config.ssl_key, 'utf8');
const certificate = fs.readFileSync(config.ssl_cert, 'utf8');
const credentials = { key: privateKey, cert: certificate };

const server = https.createServer(credentials, app);

const handle = require('./ws/controllers/handle');
const mafia = require('./ws/controllers/mafia');

const WebSocket = require('ws');
const sessionParser = session({
    store: new sessionStore({
        path: process.env.SESSIONS_DIR, // Directory to store session files
        ttl: 86400, // Session expiration time (in seconds)
    }),
    secret: config.secret,
    resave: true,
    saveUninitialized: true,
    cookie: {httpOnly: true}
});

// const wss = new WebSocket.Server({ server });
const wss = new WebSocket.Server({ noServer: true });
// Handle HTTP upgrade to WebSocket
server.on('upgrade', (request, socket, head) => {
    sessionParser(request, {}, () => {

        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    });
});
wss.on('connection', (ws, req) => {
    console.log('Session ID:', req.sessionID); // Should log the correct session ID
    console.log('Session data:', req.session);
    ws.req = req
    ws.on('message', message => {
        const data = JSON.parse(message);
        const handler = handle.getHandler(data.type);

        console.log('ws.req data:', data); // Should log the correct session ID
        console.log('ws.req Session ID:', ws.req.sessionID); // Should log the correct session ID
        console.log('ws.req Session data:', ws.req.session);

        if (typeof handle[handler] === 'function') {
            handle[handler](ws, data);
        } else if (typeof mafia[handler] === 'function') {
            mafia[handler](ws, data);
        } else {
            ws.send(JSON.stringify({type: 'error', message: 'Unknown message type:' + data.type}));
            console.error('Unknown message type:', data.type);
        }
    });
    ws.on('close', () => {
        handle.removeClient(ws);
    });

});


const port = process.env.PORT || config.ws_port;
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});



