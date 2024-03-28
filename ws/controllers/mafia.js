const fs = require('fs');
const util = require('util');
const XRegExp = require('xregexp');
const crypto = require('crypto');
const { clients, sessions, rooms } = require('../data');
const config = require("../../config");

const readFile = util.promisify(fs.readFile);
function validateString(str) {
    const re = XRegExp("^[\\pL\\-_0-9]+$");
    if(!re.test(str)) {
        return false;
    }
    return str;
}

async function sleep(millis) {
    return new Promise(resolve => setTimeout(resolve, millis));
}

function joinGame(ws, data) {
    let clientId = generateClientId();
    roomID = data.roomId;
    sessionID = (data.chatSessionID === undefined) ? data.sessionID : data.chatSessionID;
    var roomFile = config.roomsFolder+'/'+roomID+'.json';
    var room = {};
    fs.readFile(roomFile, 'utf8', function (err, data) {
        if (err) {
            ws.send(JSON.stringify({ type: 'error', message: 'There is no game '+roomID }));
            return;
        } else {
            room = JSON.parse(data);
            if (room.type !== 'mafia') {
                ws.send(JSON.stringify({type: 'error', message: 'There is no game in "' + roomID + '" room.'}));
                return;
            }
            if (room.type === 'mafia') {
                console.log("WS order 34",clientId, sessionID,room.gameHost.sessionID )
                sess = getSession(sessionID);
                pass = false;
                stream = false;
                if (//(sess.newRoom === room.name)
                    // && (sess.uid === room.host.uid)

                (sessionID === room.gameHost.sessionID)
                ) {
                    conn = clients[room.gameHost.uid]
                    if (conn === undefined) {
                        console.log('41 GameHost',clientId)
                        clientId = room.host.uid ;
                        // sess.uid = '';

                        //updateSession(sessionID,sess)
                    } else {
                        console.log('WS 51 conn: ', typeof conn)
                    }
                    pass = true;
                } else {
                    console.log('48 WARN: ',sess.uid,room.host.uid)
                    // console.log(clients)
                }
            } else if (room.game.type === 'private') {
                sess = getSession(sessionID);
                pass = false;
                if ((sess !== undefined) && (sess.hasOwnProperty('room-'+roomID))) {
                    if (room.password === sess['room-'+roomID].password
                        && (sess['room-'+roomID].ttl >= new Date().getTime())
                    ) {
                        pass = true;
                    } else {
                        ws.send(JSON.stringify({ type: 'error', message: "Failed to join room: "+roomID+" Password is wrong..." }));
                        return;
                    }
                }
                if (!pass) {
                    ws.send(JSON.stringify({ type: 'error', message: "Failed to join game: "+roomID+" Password is wrong or session expired" }));
                    return;
                }
            } else if (room.type === 'master') {
                sess = getSession(sessionID);
                pass = false;
                if (sess.newRoom === room.name) {
                    pass = true;
                    room.host.uid = ws.uid = clientId;
                } else if ((sess.hasOwnProperty('room-'+roomID))) {
                    if (sessionID === room.host.sessionID || (room.hasOwnProperty('allowed') && room.allowed.includes(sessionID))) {
                        pass = true;
                    } else if (room.password === sess['room-'+roomID].password
                        && (sess['room-'+roomID].ttl >= new Date().getTime())
                    ) {
                        pass = true;
                    } else {
                        ws.send(JSON.stringify({ type: 'error', message: "Failed to join game: "+roomID+" Password is wrong..." }));
                        return;
                    }
                }
                if (!pass) {
                    ws.send(JSON.stringify({ type: 'error', message: "Failed to join game: "+roomID+" Password is wrong or not allowed" }));
                    return;
                }
            }
            console.log("WS order 91",clientId)
            let emptySlot = true;
            for (const [slot, player] of Object.entries(room.slot)) {
                if (player.sessionID === sessionID) {
                    checkWS = clients[player.uid];
                    if (checkWS === undefined) {
                        player.uid = clientId
                        emptySlot = false
                        break
                    }
                }
                if ((player.uid === 'empty') && emptySlot) {
                    if (clientId !== room.gameHost.uid) {
                        player.uid = clientId;
                        player.sessionID = sessionID;
                        emptySlot = false;
                        break;
                    }
                }
            };

            if (!pass) {
                room.users[clientId] = {uid: clientId};
                room.size = room.users.length;
            }
        }
        console.log("WS order 117",clientId)
        clients[clientId] = ws;
        ws.uid = clientId;
        ws.roomID = roomID;
        rooms[roomID] = room;

        // Send the new client their ID
        ws.send(JSON.stringify({ type: 'id', id: clientId, room: room }));
        console.log('wsid: ',ws.uid,clientId, 'room :',  JSON.stringify(room));

        fs.writeFileSync(roomFile, JSON.stringify(room) , 'utf-8');

        broadcastRoom(roomID, JSON.stringify({ type: 'participant-joined', id: clientId, room: room }), ws);
    });

}

async function getRoom(roomID) {
    return new Promise((resolve, reject) => {
        const roomFile = config.roomsFolder+'/'+roomID+'.json';
        if (fs.existsSync(roomFile)) {
            readFile(roomFile, 'utf8')
                .then(roomData => {
                    resolve(JSON.parse(roomData));
                })
                .catch(error => {
                    reject(error);
                });
        } else {
            reject(new Error('Room file not found '+roomFile));
        }
    });
}

async function updateRoom(roomID, room) {
    roomFile = config.roomsFolder+'/'+roomID+'.json';
    if (fs.existsSync(roomFile)) {
        await fs.writeFileSync(roomFile, JSON.stringify(room) , 'utf-8');
    }
    return await getRoom(roomID)
}
async function gamePlayerStatus(ws, data) {
    room = await getRoom(ws.roomID);
    valid = false
    if (ws.uid === room.gameHost.uid) {
        room.gameHost.status = data.status
        valid = true
    } else {
        for (const [slot, player] of Object.entries(room.slot)) {
            if (player.uid === ws.uid) {
                player.status = data.status
                valid = true
                break
            }
        }
    }
    if (valid) {
        await updateRoom(ws.roomID, room)
        broadcastRoom(ws.roomID,  JSON.stringify({ type: 'game-player-status', uid: ws.uid, status: data.status }));
    } else {
        ws.send(JSON.stringify({ type: 'error', message: "Something went wrong. Can't change your status..." }));
    }
}

async function gamePlayerMic(ws, data) {
    room = await getRoom(ws.roomID);
    data.mic = (data.mic === 'on') ? 'on' : 'off'
    valid = false
    if (ws.uid === room.gameHost.uid) {
        room.gameHost.mic = data.mic
        valid = true
    } else {
        for (const [slot, player] of Object.entries(room.slot)) {
            if (player.uid === ws.uid) {
                player.mic = data.mic
                valid = true
                break
            }
        }
        ;
    }
    if (valid) {
        await updateRoom(ws.roomID, room)
        broadcastRoom(ws.roomID,  JSON.stringify({ type: 'game-player-mic', uid: ws.uid, mic: data.mic }));
    } else {
        ws.send(JSON.stringify({ type: 'error', message: "Can't change your microphone status..." }));
    }
}

async function gameStart(ws, data) {
    let room = await getRoom(ws.roomID);
    if (ws.uid !== room.gameHost.uid) {
        console.log('Attempt to start game when not a host!', ws.uid, ws.roomID)
        return
    } else {
        ready = true;
        for (const [slot, player] of Object.entries(room.slot)) {
            room.slot[slot].slot = 'none';
            if ((player.uid !== 'empty') && (player.status !== 'ready')) {
                console.log('slot is not ready: ', slot)
                ready = false;
                //break;
            }
            if (player.mic === 'on') {
                user = clients[player.uid]
                if (user !== undefined) {
                    user.send(JSON.stringify({ type: 'mute-mic' }));
                } else {
                    room.slot[slot].uid = 'empty';
                    ready = false
                }
            }
        }
        console.log('241', room.slot[1])
        room = await updateRoom(ws.roomID, room)
        if (!ready) {

            ws.send(JSON.stringify({ type: 'error', message: "Some users are not ready yet..." }));
            return;
        }

        broadcastRoom(ws.roomID,  JSON.stringify({ type: 'game-start' }));
        room.game.phase = 'shuffle';
        room.game.availableSlots = [1,2,3,4,5,6,7,8,9,10]
        room = await updateRoom(ws.roomID, room);
        console.log('245', room.slot[1])
        broadcastRoom(ws.roomID,  JSON.stringify({ type: 'game-phase', phase: 'shuffle' }));


        for (let i= 1; i<=10; i++) {
            roomState = await getRoom(ws.roomID)
            if (i>1) {
                prevPlayer = roomState.slot[i-1]
                if (prevPlayer.slot === 'none') {
                    prevPlayer.slot = 'any'
                    roomState.slot[i-1] = prevPlayer;
                    roomState = await updateRoom(ws.roomID, roomState)
                    let prevUser = clients[prevPlayer.uid]
                    if (prevUser !== undefined) {
                        prevUser.send(JSON.stringify({ type: 'game-phase', phase: 'shuffle' }));
                    }
                }
            }

            curPlayer = roomState.slot[i]

            if ((roomState.game.phase === 'shuffle')
                && (curPlayer.slot === 'none')) {
                user = clients[curPlayer.uid]
                if (user !== undefined) {
                    user.send(JSON.stringify({ type: 'select-slot', slots: roomState.game.availableSlots }));
                }

            }
            await sleep(3000);
        }
        // for (const [slot, player] of Object.entries(room.slot)) {
        //
        //     if (player.slot === 'none') {
        //         user = clients[player.uid]
        //         user.send(JSON.stringify({ type: 'select-slot' }));
        //     }
        // }
    }

}

async function gameStop(ws, data) {
    let room = await getRoom(ws.roomID);
    if (ws.uid !== room.gameHost.uid) {
        console.log('Attempt to stop game when not a host!', ws.uid, ws.roomID)
        return
    } else {
        room.game.phase = 'lobby';
        room = await updateRoom(ws.roomID, room)
        broadcastRoom(ws.roomID,  JSON.stringify({ type: 'game-phase', phase: 'lobby' }));
    }
}

function broadcastRoom(roomID, message, ws = null) {
    room = rooms[roomID];
    if (room !== undefined) {
        // if (ws === null || room.host.uid !== ws.uid) {
        //     hostConn = clients[room.host.uid];
        //     if (hostConn !== undefined) {
        //         hostConn.send((message));
        //     }
        // }

        for (const uid in room.users) {
            if (ws === null || uid !==  ws.uid) {
                userConn = clients[ uid ];
                if (userConn !== undefined) {
                    userConn.send(message);
                } else {
                    console.log("Can't connect to ", uid)
                }
            }
        }
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
function createGame(sender, data) {
    //rooms.push({ name: data.name, host: data.host})
    clientId = sender.uid;
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
        createSession( room.chatSessionID, clientId, room.host, room.name);
        room.host = { uid: clientId, userName: room.host, sessionID: room.chatSessionID };
        room.gameHost = {uid: clientId, name: room.host, sessionID: room.chatSessionID, status: "unknown", name: clientId }
        room.link = config.chatHost+'m/'+room.name;
        room.size = 1;
        room.type = 'mafia';
        room.game = {};
        room.users = {}
        room.users[clientId] = {uid: clientId};
        room.slot = {};
        room.game.phase = 'pre-game'

        for (let i=0; i<10; i++) {
            room.slot[i+1] = { uid : 'empty', name: "unknown", sessionID: 'none', status: "unknown", mic: "off"}
        }

        room.game.stream = (room.stream === 'On')
        if (room.password.trim() === '' && room.valid ==='Off') {
            room.game.type = 'public';
        } else if (room.valid !== 'On') {
            room.game.type = 'private';
            room.password = crypto.createHash('md5').update(room.password).digest('hex');
        } else if (room.valid ==='On') {
            room.game.type = 'master';
            room.password = crypto.createHash('md5').update('master').digest('hex');
            room.allowed = [room.chatSessionID];
        }

        delete room['chatSessionID'];
        sender.chatSessionID = room.chatSessionID;
        sender.roomID = room.name;


        fs.writeFileSync(roomFile, JSON.stringify(room) , 'utf-8');
        console.log('Room file written ',roomFile);
        // console.log('Session ID ', req.sessionID);
        sender.send(JSON.stringify({ type: 'room-ready', room: room, info: '1:'+(room.name !== '')+'2:'+(room.host !== '') }));

    }

}

function joinRoomGame(sender, data) {
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
            if (room.game.type === 'public') {
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

async function createSession(sessionID, clientID = null, userName = null, roomID = null) {
    return new Promise((resolve, reject) => {
        sessionFile = config.sessionsFolder + Buffer.from(sessionID).toString('base64') + '.json';
        sess = {
            chatSessionID: sessionID,
            uid: clientID,
            userName: userName,
            newRoom: roomID
        };
        sessions[sessionID] = sess;
        fs.writeFileSync(sessionFile, JSON.stringify(sess), 'utf-8');
        resolve(sess);
    })
}

async function getSession(sessionID, clientID = null, userName = null, roomID = null) {
    return new Promise((resolve, reject) => {
        const sessionFile = config.sessionsFolder + Buffer.from(sessionID).toString('base64') + '.json';
        console.log('329', sessionFile);
        let sess = sessions[sessionID];

        if (sess === undefined) {
            try {
                const data = fs.promises.readFile(sessionFile, 'utf8');

                resolve(JSON.parse(data));

            } catch (err) {
                console.log('410 Session not found in file', sessionID);
                sess = createSession(sessionID, clientID, userName);
                resolve(sess);
                console.log('New session created', sess);
            }
        } else {
            resolve(sess);
        }
    })
}

function updateSession(sessionID, sess) {
    // sessionFile = 'sessions/'+sessionID.toString('base64')+'.json';
    const sessionFile = config.sessionsFolder + Buffer.from(sessionID).toString('base64') + '.json';
    sessions[sessionID] = sess;
    fs.writeFileSync(sessionFile, JSON.stringify(sess) , 'utf-8');
    return sess;
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
    joinGame,
    createGame,
    joinRoomGame,
    gamePlayerStatus,
    gamePlayerMic,
    gameStart,
    gameStop,
    grantAccess
};