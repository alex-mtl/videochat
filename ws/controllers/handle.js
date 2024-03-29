const fs = require('fs');
const XRegExp = require('xregexp');
const crypto = require('crypto');
const { clients, sessions, rooms } = require('../data');
const config = require("../../config");
const WebSocket = require("../../ws");
console.log('7', config)
function validateString(str) {
    const re = XRegExp("^[\\pL\\-_0-9]+$");
    if(!re.test(str)) {
        return false;
    }
    return str;
}

function join(ws, data) {
    let clientId = generateClientId();
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
            console.log('95 ', obj);
            stream = false;
            if (obj.type === 'private') {
                console.log('97 ', obj.type);
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
            } else if (obj.type === 'master') {
                console.log('115 ', obj.type);
                sess = getSession(sessionID);
                pass = false;
                // console.log('142 ', sess.hasOwnProperty('room-'+roomID), sess);
                if (sess.newRoom === obj.name) {
                    pass = true;
                    obj.host.uid = ws.uid = clientId;
                } else if ((sess.hasOwnProperty('room-'+roomID))) {
                    console.log('143 ', sessionID, obj.host.sessionID);
                    // TODO tut po idee mojno budet proveryat esli allowed to pass in
                    if (sessionID === obj.host.sessionID || (obj.hasOwnProperty('allowed') && obj.allowed.includes(sessionID))) {
                        pass = true;
                    } else if (obj.password === sess['room-'+roomID].password
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
            } else if (obj.type === 'stream') {
                console.log('140 ', obj.type);
                sess = getSession(sessionID);
                pass = false;
                stream = false;
                if ((sess.newRoom === obj.name)
                    && (sess.uid === obj.host.uid)
                ) {
                    clientId = obj.host.uid ;
                    pass = true;
                    stream = true;
                } else if ((sess.hasOwnProperty('room-'+roomID))) {
                    console.log('143 ', sessionID, obj.host.sessionID);
                    if (sessionID === obj.host.sessionID) {
                        pass = true;
                    } else if (obj.password === sess['room-'+roomID].password
                        && (sess['room-'+roomID].ttl >= new Date().getTime())
                    ) {
                        pass = true;
                    } else {
                        ws.send(JSON.stringify({ type: 'error', message: "Failed to join room: "+roomID+" Password is wrong..." }));
                        return;
                    }
                } else {
                    if ((obj.host.uid === 'DISCONNECTED')
                        && (obj.host.sessionID === sessionID)
                    ) {
                        obj.host.uid = clientId;
                        obj.size = obj.size + 1;
                        stream = true;
                    }
                    pass = true;
                }
                if (!pass) {
                    ws.send(JSON.stringify({ type: 'error', message: "Failed to join room: "+roomID+" Password is wrong or session expired" }));
                    return;
                }
            }
            if (!stream) {
                obj['u'+obj.size] = { uid: clientId };
                obj.size = obj.size + 1;
            }

        }

        clients[clientId] = ws;
        ws.uid = clientId;
        ws.roomID = roomID;
        rooms[roomID] = obj;

        // Send the new client their ID
        ws.send(JSON.stringify({ type: 'id', id: clientId, room: obj }));
        console.log('wsid: ',ws.uid,clientId, 'obj :',  JSON.stringify(obj));

        fs.writeFileSync(roomFile, JSON.stringify(obj) , 'utf-8');

        broadcastRoom(roomID, JSON.stringify({ type: 'participant-joined', id: clientId, room: obj }), ws);
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

function shareScreen(ws, data) {
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

function offer(sender, data) {
    const recipient = clients[data.to];
    console.log('Offer from : ',sender.uid, ' to: ',data.to);
    if (recipient) {
        recipient.send(JSON.stringify({ type: 'participant-offer', from: data.from, description: data.offer }));
    }
}

function grantAccess(sender, data) {
    console.log("Access from "+sender.uid+" to "+data.to);
    const recipient = clients[data.to];
    if (recipient) {
        recipient.send(JSON.stringify({ type: 'access-grant', from: sender.uid, to: data.to, roomId: data.roomId, grantAccess: data.access }));
    }

    var name = './rooms/'+data.roomId+'.json';
    var m = JSON.parse(fs.readFileSync(name).toString());
    m.allowed.push(data['client-session']);
    fs.writeFileSync(name, JSON.stringify(m));

}

function connect(sender, data) {
    clientID = generateClientId();
    sender.uid = clientID;
    clients[clientID] = sender;
    console.log('Sender : ',sender.uid, 'connected');
}
function createRoom(sender, data) {
    //rooms.push({ name: data.name, host: data.host})
    clientId = sender.uid;
    console.log('285 sender.uid', clientId);
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
        sender.send(JSON.stringify({ type: 'error', message: "Validation failed for '"+room.name+"' or '"+ room.host + "'" }));
        return;
    }
    roomFile = config.roomsFolder+'/'+room.name+'.json';
    if (fs.existsSync(roomFile)) {
        sender.send(JSON.stringify({ type: 'error', message: "Room '"+room.name+"' already exists" }));// ...
    } else {
        //const clientId = generateClientId();
        // sender.uid = sender.uid;
        sender.userName = room.host;
        console.log("Session to create ", room.chatSessionID, typeof room.chatSessionID);
        // createSession( room.chatSessionID, clientId, room.host, room.name);
        createSession( room.chatSessionID, clientId, room.host, room.name);
        room.host = { uid: clientId, userName: room.host, sessionID: room.chatSessionID };
        room.link = config.chatHost+'p/'+room.name;
        room.size = 1;
        console.log('302',room);
        if (room.stream === 'On') {
            console.log('304', room.stream);

            room.type = 'stream';
            room.link = config.chatHost+'s/'+room.name;
        } else if (room.password.trim() === '' && room.valid ==='Off') {
            console.log('304', room.stream);
            room.type = 'public';
        } else if (room.valid !=='On') {
            room.type = 'private';
            room.password = crypto.createHash('md5').update(room.password).digest('hex');
        } else if (room.valid ==='On') {
            room.type = 'master';
            room.password = crypto.createHash('md5').update('master').digest('hex');
            // console.log(clientId);
            room.allowed = [room.chatSessionID];
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

function joinRoom(sender, data) {
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
    roomFile = config.roomsFolder+'/'+roomID+'.json';
    if (fs.existsSync(roomFile)) {
        fs.readFile(roomFile, 'utf8', function (err, roomData) {
            room = JSON.parse(roomData);
            if (room.type === 'public') {
                sender.send(JSON.stringify({type: 'room-ready', room: room }));
            } else if (room.type === 'stream') {
                if (sender.uid !== room.host.uid) {
                    room.link = room.link.replace('/s/'+room.name, '/w/'+room.name)
                }
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
            } else if (room.type === 'master') {
                sess = getSession(sessionID);

                hostConn = clients[room.host.uid]; // dostaet polzovatlya
                if (room.allowed.includes(sessionID)){
                    sender.send(JSON.stringify({type: 'room-ready', room: room }));
                    return
                }


                if (hostConn !== undefined) {
                    // if (room.allowed)
                    // TODO: tut poslanie ot requestor to host
                    hostConn.send(JSON.stringify({ type: 'request-join', 'room': room.name, 'client-id': sender.uid,
                        'client-session': sessionID, message: data.request}));
                    ttl = new Date().getTime() + 600000; // now  + 10 min
                    sess['room-'+roomID] = { ttl, admit: false, uid: sender.uid };
                    sender.send(JSON.stringify({type: 'info', message: 'Request sent to the room host. Please wait for admission.' }));
                    updateSession(sessionID, sess);
                } else {
                    sender.send(JSON.stringify({ type: 'error', message: "No host detected online for this room: "+room.name }));
                    return;
                }

            }

        });
    } else {
        sender.send(JSON.stringify({ type: 'error', message: "Room '"+room.name+"' does not exist" }));
    }

}

function createSession(sessionID, clientID = null, userName = null, roomID = null) {
    sessionFile = config.sessionsFolder+sessionID.toString('base64')+'.json';
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
    const sessionFile = config.sessionsFolder + Buffer.from(sessionID).toString('base64') + '.json';
    console.log('329',sessionFile);
    let sess = sessions[sessionID];


    if (sess === undefined) {
        try {
            const data = fs.promises.readFile(sessionFile, 'utf8');
            sess = JSON.parse(data);
            console.log('408 Session found in file', sess);
        } catch (err) {
            console.log('410 Session not found in file', sessionID);
            sess = createSession(sessionID, clientID, userName);
            console.log('New session created', sess);
        }
    }

    return sess;
}

function updateSession(sessionID, sess) {
    // sessionFile = 'sessions/'+sessionID.toString('base64')+'.json';
    const sessionFile = config.sessionsFolder + Buffer.from(sessionID).toString('base64') + '.json';
    sessions[sessionID] = sess;
    fs.writeFileSync(sessionFile, JSON.stringify(sess) , 'utf-8');
    return sess;
}

function sendChatMessage(sender, data) {
    ts = new Date();
    time = ts.toLocaleTimeString('it-IT');
    const now = Date.now();
    roomFile = config.roomsFolder+'/'+sender.roomID+'.json';
    console.log('473 ',sender.roomID);
    if (roomID === undefined) {
        return;
    }
    if (fs.existsSync(roomFile)) {
        fs.utimes(roomFile, now, now, (err) => {
            if (err) {
                console.error('Error updating file '+roomFile+' timestamps:', err);
            }
        });
    }
    broadcastRoom(sender.roomID, JSON.stringify({ type: 'chat-message', time: time, from: data.from, message: data.message }));

}

function answer(sender, data) {
    const recipient = clients[data.to];


    if (recipient) {
        recipient.send(JSON.stringify({ type: 'answer', from: data.from, description: data.description }));
    }
}

function iceCandidate(sender, data) {
    const recipient = clients[data.to];

    if (recipient) {
        // recipient.send(JSON.stringify({ type: 'ice-candidate', from: data.from, candidate: data.candidate }));
        recipient.send(JSON.stringify({ type: 'ice-candidate', from: data.from, candidate: data.candidate }));
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
    if (roomID === undefined) {
        return;
    }
    var roomFile = config.roomsFolder+'/'+roomID+'.json';

    if (!fs.existsSync(roomFile)) {
        console.log('Room ', roomFile, ' does not exist!');
    } else {
        fs.readFile(roomFile, 'utf8', function (err, data) {

            obj = JSON.parse(data);
            if (clientId) {
                delete clients[clientId];
                removeId = 0;
                if (obj.host.uid === clientId) {
                    if (obj.hasOwnProperty('u1')
                        && (obj.type === 'public')
                    ) {

                        obj.host = obj.u1;
                        removeId = 1;
                        obj.size = obj.size - 1;
                        console.log('183 size:', obj.size);
                    } else {
                        removeId = 1;
                        obj.host.uid = 'DISCONNECTED';
                        obj.size = obj.size - 1;
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
                broadcastRoom(ws.roomID, JSON.stringify({type: 'participant-left', id: clientId, room: obj}, ws));
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

function getHandler(str) {
    return str.replace(/(-\w)/g, function (match) {
        return match[1].toUpperCase();
    });
}

module.exports = {
    getHandler,
    removeClient,
    join,
    shareScreen,
    offer,
    answer,
    iceCandidate,
    createRoom,
    joinRoom,
    sendChatMessage,
    grantAccess,
    connect
};