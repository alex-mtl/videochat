const express = require('express');
const https = require('https');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const session = require('express-session');

const app = express();
app.use(cookieParser());
app.use(session({
    secret: 'mGpFoUnYpRylxBNziSzK2tVx',
    resave: false,
    saveUninitialized: true
}));

// Load SSL certificate and private key
const privateKey = fs.readFileSync('video-key.pem', 'utf8');
const certificate = fs.readFileSync('video-cert.pem', 'utf8');
const credentials = { key: privateKey, cert: certificate };

const server = https.createServer(credentials, app);

const handle = require('./ws/controllers/handle');

const WebSocket = require('ws');

const wss = new WebSocket.Server({ server });

wss.on('connection', ws => {
    ws.on('message', message => {
        const data = JSON.parse(message);
        const handler = handle.getHandler(data.type);

        if (typeof handle[handler] === 'function') {
            handle[handler](ws, data);
        } else {
            console.error('Unknown message type:', data.type);
        }
    });
    ws.on('close', () => {
        console.log('40',handle)
        handle.removeClient(ws);
    });
});


const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});



