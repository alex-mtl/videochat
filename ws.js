const express = require('express');
const https = require('https');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const config = require('./config');

const app = express();
app.use(cookieParser());
app.use(session({
    secret: 'mGpFoUnYpRylxBNziSzK2tVx',
    resave: false,
    saveUninitialized: true
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

const wss = new WebSocket.Server({ server });

wss.on('connection', ws => {
    ws.on('message', message => {
        const data = JSON.parse(message);
        const handler = handle.getHandler(data.type);

        if (typeof handle[handler] === 'function') {
            handle[handler](ws, data);
        } else if (typeof mafia[handler] === 'function') {
            mafia[handler](ws, data);
        } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type:' + data.type }));
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



