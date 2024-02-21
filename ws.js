const WebSocket = require('ws');
const express = require('express');
const https = require('https');
const fs = require('fs');
const XRegExp = require('xregexp');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const cookieParser = require('cookie-parser');
const session = require('express-session');

const config = require('./config');

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
             case 'join-room':
                handleJoinRoom(ws, data);
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
    const clientId = generateClientId();
    roomID = data.roomId;
    sessionID = (data.chatSessionID === undefined) ? data.sessionID : data.chatSessionID;
    console.log('109 session ID', sessionID);
    var roomFile = 'rooms/'+roomID+'.json';
    var obj = {};
    fs.readFile(roomFile, 'utf8', function (err, data) {
        if (err) {
            obj['host'] = { uid: clientId };
            obj['size'] = 1;
            obj['name'] = roomID;
            obj['type'] = 'public';
            obj['link'] = config.chatHost+'p/'+roomID;
            obj['password'] = false;
        } else {
            obj = JSON.parse(data);
            if (obj.type === 'private') {
                sess = getSession(sessionID);
                pass = false;
                if ((sess !== undefined) && (sess.hasOwnProperty('room-'+roomID))) {
                    if (obj.password === sess['room-'+roomID].password
                      && (sess['room-'+roomID].ttl >= new Date().getTime())
                    ) {
                        pass = true;
                    } else {
                        ws.send(JSON.stringify({ type: 'error', message: "Failed to join room: "+roomID+" Password is wrong..." }));
                        return;
                    }
                }
                if (!pass) {
                    ws.send(JSON.stringify({ type: 'error', message: "Failed to join room: "+roomID+" Password is wrong or session expired" }));
                    return;
                }
            }
            obj['u'+obj.size] = { uid: clientId };
            obj.size = obj.size + 1;

        }

        clients[clientId] = ws;
        ws.uid = clientId;
        ws.roomID = roomID;
        rooms[roomID] = obj;

        // Send the new client their ID
        ws.send(JSON.stringify({ type: 'id', id: clientId, room: obj, test: "test : " }));
        console.log('wsid: ',ws.uid,clientId, 'obj :',  JSON.stringify(obj));

        fs.writeFileSync(roomFile, JSON.stringify(obj) , 'utf-8');

        broadcastRoom(roomID, JSON.stringify({ type: 'participant-joined', id: clientId }), ws);
    });

}

function broadcastRoom(roomID, message, ws = null) {
    room = rooms[roomID];
    if (room !== undefined) {
        if (ws === null || room.host.uid !== ws.uid) {
            hostConn = clients[room.host.uid];
            if (hostConn !== undefined) {
                hostConn.send((message));
            }
        }
        for (let i= 1; i <= 10; i++) {
            if (room.hasOwnProperty('u'+i)) {
                if (ws === null || room['u'+i].uid !==  ws.uid) {
                    userConn = clients[room['u'+i].uid ];
                    if (userConn !== undefined) {
                        userConn.send(message);
                    } else {
                        console.log("Can't connect to ",room['u'+i].uid);
                        //delete(room['u'+i]);
                        //room.size = room.size - 1;

                    }
                }
            }
        }
    }
    //rooms[roomID] = room;
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
        room.link = config.chatHost+'p/'+room.name;
        room.size = 1;

        if (room.password.trim() === '' && room.valid ==='Off') {
            room.type = 'public';
        } else {
            room.type = 'private';
            room.password = crypto.createHash('md5').update(room.password).digest('hex');
        }

        delete room['chatSessionID'];
        sender.chatSessionID = room.chatSessionID;
        sender.newRoom = room.name;

        fs.writeFileSync(roomFile, JSON.stringify(room) , 'utf-8');
                console.log('Room file written ',roomFile);
        // console.log('Session ID ', req.sessionID);
        sender.send(JSON.stringify({ type: 'room-ready', room: room, info: '1:'+(room.name !== '')+'2:'+(room.host !== '') }));

    }

}

function handleJoinRoom(sender, data) {
    roomID = data.roomID;
    sessionID = data.chatSessionID;
    if (data.hasOwnProperty('password')){
        //p = data.password.toString();
        password = crypto.createHash('md5').update(data.password.toString()).digest('hex');
    } else {
        password = false;
    }

    valid = false;
    if (
        roomID !== ''
        && roomID != ''
        && validateString(roomID)
    ) {
        valid = true;
    } else {
        sender.send(JSON.stringify({ type: 'error', message: "Room ID failed for "+roomID }));
        return;
    }
    roomFile = 'rooms/'+roomID+'.json';
    if (fs.existsSync(roomFile)) {
        fs.readFile(roomFile, 'utf8', function (err, roomData) {
            room = JSON.parse(roomData);
            if (room.type === 'public') {
                sender.send(JSON.stringify({type: 'room-ready', room: room }));
            } else if (room.type === 'private') {
                sess = getSession(sessionID);
                if (room.password === password) {
                    ttl = new Date().getTime() + 600000; // now  + 10 min
                    sess['room-'+roomID] = { ttl, password };
                    sender.send(JSON.stringify({type: 'room-ready', room: room }));
                } else {
                    sess['room-'+roomID] = '';
                    sender.send(JSON.stringify({ type: 'error', message: "Password is wrong..." }));
                }
                updateSession(sessionID, sess);
            }

        });
    } else {
        sender.send(JSON.stringify({ type: 'error', message: "Room '"+room.name+"' does not exist" }));
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
    const sessionFile = 'sessions/' + Buffer.from(sessionID).toString('base64') + '.json';
    console.log('329',sessionFile);
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
    sessionFile = 'sessions/'+sessionID.toString('base64')+'.json';
    sessions[sessionID] = sess;
    fs.writeFileSync(sessionFile, JSON.stringify(sess) , 'utf-8');
    return sess;
}

function handleSendChatMessage(sender, data) {
    ts = new Date();
    time = ts.toLocaleTimeString('it-IT');
    broadcastRoom(sender.roomID, JSON.stringify({ type: 'chat-message', time: time, from: data.from, message: data.message }));

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
