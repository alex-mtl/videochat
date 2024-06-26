const fs = require('fs');
const config = require("../../config");
const {sessions, clients, rooms} = require("../data");

async function sleep(millis) {
    return new Promise(resolve => setTimeout(resolve, millis));
}




async function getRoom(roomID) {
    roomFile = config.roomsFolder+'/'+roomID+'.json';
    if (fs.existsSync(roomFile)) {
        let content = await fs.readFileSync(roomFile, 'utf8')
        room = JSON.parse(content);
        return room;
    }
    return false;
}

async function updateRoom(roomID, room) {
    roomFile = config.roomsFolder+'/'+roomID+'.json';
    if (fs.existsSync(roomFile)) {
        await fs.writeFileSync(roomFile, JSON.stringify(room) , 'utf-8');
    }
    return await getRoom(roomID)
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


async function broadcastRoom(roomID, message, ws = null) {
    let room = await getRoom(roomID);
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
    return room
}

async function checkUserConnection(ws, data) {
    let room = await getRoom(ws.roomID);

    if (room.users.hasOwnProperty(data.uid)) {
        userConn = clients[ data.uid ];
        if (userConn === undefined) {
            delete room.users[data.uid]
            room = await updateRoom(ws.roomID, room)
            console.log("Fresh user list: ", room.users)
        } else {
            console.log("Seems connection still available: ", data.uid)
        }
    } else {
        console.log("Failed to check user: ", data.uid, room.users, room.users.hasOwnProperty(data.uid))
    }
}

function addExports(exports) {
    exp = {
        checkUserConnection,
        grantAccess
    }
    for (const key in exp) {
        if (!exports.hasOwnProperty(key) ) {
            exports[key] = exp[key];
        }
    }
    return exports
}

function globalContext(target) {
    Object.keys(module.exports).forEach(key => {
        if ((key !== 'globalContext') && (key !== 'addExports')) {
            target[key] = module.exports[key];
        }
    });
}


module.exports = {
    getRoom,
    updateRoom,
    createSession,
    getSession,
    updateSession,
    broadcastRoom,
    checkUserConnection,
    sleep,
    globalContext,
    addExports
}