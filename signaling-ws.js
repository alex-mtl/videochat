const WebSocket = require('ws');
const express = require('express');
const https = require('https');
const fs = require('fs');
const XRegExp = require('xregexp');
const sqlite3 = require('sqlite3').verbose();
const cookieParser = require('cookie-parser');
const session = require('express-session');

const chatHost = "https://video.ttl10.net/";

let db = new sqlite3.Database('video.db');

db.serialize(() => {
    db.prepare(`CREATE TABLE IF NOT EXISTS rooms (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, room TEXT NOT NULL )`).run().finalize();
    var n = 0;
    db.all(`SELECT * FROM rooms`, (err, rows) => {

        rows.forEach(function (row) {
            n++;
            console.log(row)
        });
        if (n===0) {
            db.run('INSERT INTO rooms(name, room) VALUES(?, ?)', ['test-room1','{}'], (err) => {
                if(err) {
                    return console.log(err.message);
                }
                console.log("Row was added to the table: ", db.lastID);
            })
        }
    })

    db.close();
});


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
const wss = new WebSocket.Server({ server });

const clients = {};
const sessions = {};
const rooms = {};

function validateString(str) {
    const re = XRegExp("^[\\pL\\-_0-9]+$");
    if(!re.test(str)) {
        return false;
    }
    return str;
}

wss.on('connection', ws => {
    ws.on('message', message => {
        const data = JSON.parse(message);

        switch (data.type) {
            case 'join':
                handleJoin(ws, data);
                break;
            case 'share-screen':
                handleShareScreen(ws, data);
                break;
            case 'offer':
                handleOffer(ws, data);
                break;
            case 'answer':
                handleAnswer(ws, data);
                break;
            case 'ice-candidate':
                handleIceCandidate(ws, data);
                break;
            case 'create-room':
                handleCreateRoom(ws, data);
                break;
            case 'send-chat-message':
                handleSendChatMessage(ws, data);
                break;
            default:
                console.error('Unknown message type:', data.type);
        }
    });

    ws.on('close', () => {
        removeClient(ws);
    });
});

function handleJoin(ws, data) {
    let clientId = generateClientId();
    const roomID = data.roomId;
    const sessionID = data.sessionID;
    var roomFile = 'rooms/'+roomID+'.json';
    let sess;
    (async () => {
        sess = await getSession(sessionID, clientId, clientId, roomID);
        console.log('Session:', sess);
    })();

    console.log('107 : ',sess);
    var obj = {};
    fs.readFile(roomFile, 'utf8', function (err, roomData) {
        if (err) {
            obj['host'] = { uid: clientId };
            obj['size'] = 1;
        } else {
            obj = JSON.parse(roomData);
            console.log('114 : ',sess, data.roomId);
            if (sess.hasOwnProperty('newRoom')  && (sess.newRoom === data.roomId)) {
                clientId = sess.uid;
                obj['size'] = 1;
                delete sess['newRoom'];
                updateSession(sessionID, sess);
            } else {

                obj['u'+obj.size] = { uid: clientId };
                obj.size = obj.size + 1;
            }
        }

        clients[clientId] = ws;
        ws.uid = clientId;
        ws.roomID = roomID;

        // Send the new client their ID
        ws.send(JSON.stringify({ type: 'id', id: clientId, room: obj }));
        console.log('wsid: ',ws.uid,clientId, 'obj :',  JSON.stringify(obj));

        fs.writeFileSync(roomFile, JSON.stringify(obj) , 'utf-8');


        // Notify other clients about the new participant
        broadcast(JSON.stringify({ type: 'participant-joined', id: clientId }));
    });

}

function handleShareScreen(ws, data) {
    const screenID = generateClientId();
    roomId = data.roomId;
    var roomFile = 'rooms/'+roomId+'.json';
    var obj = {};
    fs.readFile(roomFile, 'utf8', function (err, data) {
        room = JSON.parse(data);
        if (room.host.uid === ws.uid) {
            room.host.screenID = screenID;
        } else {
            for (let i= 1; i <= 10; i++) {
                if (room.hasOwnProperty('u'+i)) {

                    if (room['u'+i].uid ===  ws.uid) {
                        room['u'+i].screenID = screenID;
                        break;
                    }
                }
            }
        }

        // Send the new client their ID
        ws.send(JSON.stringify({ type: 'screen-id', screenID: screenID, room: room }));
        console.log('wsid: ',ws.uid, 'screen-id', screenID, 'obj :',  JSON.stringify(room));

        fs.writeFileSync(roomFile, JSON.stringify(room) , 'utf-8');

        if (room.host.uid !== ws.uid) {
            hostConn = clients[room.host.uid];
            if (hostConn !== undefined) {
                hostConn.send(JSON.stringify({ type: 'screen-shared', screenID: screenID, uid: ws.uid }));
            } else {
                console.log("Can't connect to ", room.host.uid)
            }

        }
        for (let i= 1; i <= 10; i++) {
            if (room.hasOwnProperty('u'+i)) {
                if (room['u'+i].uid !==  ws.uid) {
                    userConn = clients[room['u'+i].uid ];
                    if (userConn !== undefined) {
                        userConn.send(JSON.stringify({ type: 'screen-shared', screenID: screenID, uid: ws.uid }));
                    } else {
                        console.log("Can't connect to ",room['u'+i].uid)
                    }
                }
            }
        }

    });

}

function handleOffer(sender, data) {
    const recipient = clients[data.to];
    console.log('Offer from : ',sender.uid, ' to: ',data.to);
    if (recipient) {
        recipient.send(JSON.stringify({ type: 'participant-offer', from: data.from, description: data.offer }));
    }

}

function handleCreateRoom(sender, data) {
    //rooms.push({ name: data.name, host: data.host})
    room = data.room;
    valid = false;
    if (
        room.name !== ''
        && room.host != ''
        && validateString(room.name)
        && validateString(room.host)
    ) {
        valid = true;
    } else {
        sender.send(JSON.stringify({ type: 'error', message: "Validation failed for '"+room.name+"' or "+ +room.host + '1:'+(room.name)+'2:'+(room.host !== '')}));
        return;
    }
    roomFile = 'rooms/'+room.name+'.json';
    if (fs.existsSync(roomFile)) {
        sender.send(JSON.stringify({ type: 'error', message: "Room '"+room.name+"' already exists" }));// ...
    } else {
        const clientId = generateClientId();
        sender.uid = clientId;
        sender.userName = room.host;
        console.log("Session to create ", room.chatSessionID, typeof room.chatSessionID);
        createSession( room.chatSessionID, clientId, room.host, room.name);
        room.host = { uid: clientId, userName: room.host, sessionID: room.chatSessionID };
        room.link = chatHost+'p/'+room.name;
        delete room['chatSessionID'];
        sender.chatSessionID = room.chatSessionID;
        sender.newRoom = room.name;

        fs.writeFileSync(roomFile, JSON.stringify(room) , 'utf-8');
                console.log('Room file written ',roomFile);
        // console.log('Session ID ', req.sessionID);
        sender.send(JSON.stringify({ type: 'room-ready', room: room, info: '1:'+(room.name !== '')+'2:'+(room.host !== '') }));

    }

}

function createSession(sessionID, clientID = null, userName = null, roomID = null) {
    sessionFile = 'sessions/'+sessionID.toString('base64')+'.json';
    sess = {
        chatSessionID: sessionID,
        uid: clientID,
        userName: userName,
        newRoom: roomID
    };
    sessions[sessionID] = sess;
    fs.writeFileSync(sessionFile, JSON.stringify(sess) , 'utf-8');
    return sess;
}

function getSession(sessionID, clientID = null, userName = null, roomID = null) {
    //const sessionFile = 'sessions/' + Buffer.from(sessionID).toString('base64') + '.json';
    //console.log(sessionFile);
    let sess = sessions[sessionID];


    if (sess === undefined) {
        // try {
        //     const data = fs.promises.readFile(sessionFile, 'utf8');
        //     sess = JSON.parse(data);
        //     console.log('Session found', sess);
        // } catch (err) {
            console.log('Session not found', sessionID);
            sess = createSession(sessionID, clientID, userName);
            console.log('New session created', sess);
        //}
    }

    return sess;
}

function updateSession(sessionID, sess) {
    //sessionFile = 'sessions/'+sessionID.toString('base64')+'.json';
    sessions[sessionID] = sess;
    //fs.writeFileSync(sessionFile, JSON.stringify(sess) , 'utf-8');
    return sess;
}

function handleSendChatMessage(sender, data) {
    ts = new Date();
    time = ts.toLocaleTimeString('it-IT');
    broadcast(JSON.stringify({ type: 'chat-message', time: time, from: data.from, message: data.message }));

}

function handleAnswer(sender, data) {
    const recipient = clients[data.to];


    if (recipient) {
        recipient.send(JSON.stringify({ type: 'answer', from: data.from, description: data.description }));
    }
}

function handleIceCandidate(sender, data) {
    const recipient = clients[data.to];

    if (recipient) {
        // recipient.send(JSON.stringify({ type: 'ice-candidate', from: data.from, candidate: data.candidate }));
        recipient.send(JSON.stringify({ type: 'ice-candidate', from: data.from, candidate: data.candidate }));
    }
}

function sendOffer(sender, recipientId, offerDescription) {
    const recipient = clients[recipientId];

    if (recipient) {
        sender.send(JSON.stringify({ type: 'offer', to: recipientId, description: offerDescription }));
    }
}

function broadcast(message) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

function removeClient(ws) {
    const clientId = ws.uid;
    const roomID = ws.roomID;
    var roomFile = 'rooms/'+roomID+'.json';
    if (!fs.existsSync(roomFile)) {
        console.log('Room ', roomFile, ' does not exist!');
    } else {
        fs.readFile(roomFile, 'utf8', function (err, data) {

            obj = JSON.parse(data);
            if (clientId) {
                delete clients[clientId];
                removeId = 0;
                if (obj.host.uid === clientId) {
                    if (obj.hasOwnProperty('u1')) {
                        obj.host = obj.u1;
                        removeId = 1;
                        obj.size = obj.size - 1;
                        console.log('183 size:', obj.size);
                    }
                } else {
                    for (let i = 1; i <= 10; i++) {
                        if (obj.hasOwnProperty('u' + i)) {
                            if (obj['u' + i].uid === clientId) {
                                delete obj['u' + i];
                                removeId = i;
                                obj.size = obj.size - 1;
                                console.log('192 size:', obj.size);
                                break;
                            }
                        }
                    }
                }
                for (let i = removeId; i <= 10; i++) {
                    if (obj.hasOwnProperty('u' + (i + 1))) {
                        obj['u' + i] = obj['u' + (i + 1)];
                        delete obj['u' + (i + 1)];
                        console.log('202 size:', obj.size, 'remove id: ', removeId);
                        //obj.size = obj.size - 1;
                    }
                }
                fs.writeFileSync(roomFile, JSON.stringify(obj), 'utf-8');
                // Notify other clients about the departure
                broadcast(JSON.stringify({type: 'participant-left', id: clientId, room: obj}));
            }
        });
    }

}

function getClientId(ws) {
    for (const clientId in clients) {
        if (clients[clientId] === ws) {
            return clientId;
        }
    }
    return null;
}

function generateClientId() {
    return Math.random().toString(36).substr(2, 9);
}

const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
