const express = require('express');
const mediasoup = require('mediasoup');
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
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
}));

// Load SSL certificate and private key
// const privateKey = fs.readFileSync('video-key.pem', 'utf8');
// const certificate = fs.readFileSync('video-cert.pem', 'utf8');
console.log(process.env.SSL_KEY, process.env.SSL_CERT);

const privateKey = fs.readFileSync(process.env.SSL_KEY, 'utf8');
const certificate = fs.readFileSync(process.env.SSL_CERT, 'utf8');
const credentials = { key: privateKey, cert: certificate };

const server = https.createServer(credentials, app);

const handle = require('./ws/controllers/handle');
const mafia = require('./ws/controllers/mafia');

const WebSocket = require('ws');
const sessionParser = session({
    store: new sessionStore({
        path: process.env.SESSIONS_DIR, // Directory to store session files
        ttl: 2592000, // Session expiration time (in seconds)
    }),
    secret: process.env.SESSION_SECRET,
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
    ws.router = app.locals.router;
    ws.on('message', message => {
        const data = JSON.parse(message);
        const handler = handle.getHandler(data.type);

        //console.log('ws.req data:', data); // Should log the correct session ID
        //console.log('ws.req Session ID:', ws.req.sessionID); // Should log the correct session ID
        //console.log('ws.req Session data:', ws.req.session);

        if (typeof handle[handler] === 'function') {
            handle[handler](ws, data);
        } else if (typeof mafia[handler] === 'function') {
            mafia[handler](ws, data);
        } else {
            ws.send(JSON.stringify({type: 'error', message: 'Unknown message type:' + data.type}));
            console.error('Unknown message type:', data.type);
        }
    });
    ws.on('close', async () => {
            // 1. Закрываем продюсеры (это вызовет 'producerclose' у других клиентов)
        if (ws.videoProducer) {
            await ws.videoProducer.close();
            console.log(' ws.videoProducer.close()')
        } else{
            console.log('ws.videoProducer is null')
        }

        if (ws.audioProducer) await ws.audioProducer.close();
;
        handle.removeClient(ws);
    });

});


const port = process.env.PORT;
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

(async () => {
    // 1. Create mediasoup worker
    const worker = await mediasoup.createWorker({
        logLevel: 'warn',  // 'debug'|'warn'|'error'
        rtcMinPort: 40000, // UDP port range
        rtcMaxPort: 49999
    });

    console.log(`Worker PID ${worker.pid} is running`);

    // 2. Create router (per room/group)
    const router = await worker.createRouter({
        mediaCodecs: [
            {
                kind: 'audio',
                mimeType: 'audio/opus',
                clockRate: 48000,
                channels: 2
            },
            {
                kind: 'video',
                mimeType: 'video/VP8',
                clockRate: 90000
            }
        ]
    });
    app.locals.worker = worker;
    app.locals.router = router;

    // 3. Basic stats logging
    setInterval(async () => {
        try {
            const stats = await worker.getResourceUsage();

            // Linux/macOS
            if (stats.ru_utime !== undefined) { // Linux-style output
                // Calculate CPU percentage (user + system time)
                const cpuPercent = (stats.ru_utime + stats.ru_stime) / 10000; // Convert to percentage

                // Convert max RSS from KB to MB
                const memoryMb = stats.ru_maxrss / 1024;

                //console.log(`CPU: ${cpuPercent.toFixed(1)}% | RAM: ${memoryMb.toFixed(1)}MB`);
            } else {
                console.log(`Worker active (PID ${worker.pid})`);
            }
        } catch (err) {
            console.error('Stats error:', err.message);
        }
    }, 10000);

    // Handle termination
    process.on('SIGTERM', () => worker.close());
})();

