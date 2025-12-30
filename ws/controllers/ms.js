const fs = require('fs');
const XRegExp = require('xregexp');
const mediasoup = require('mediasoup');
const crypto = require('crypto');
const { clients, sessions, rooms } = require('../data');
const config = require("../../config");
const WebSocket = require("../../ws");
// console.log('7', config)


function join(ws, data) {
    let clientId = generateClientId();
    roomID = data.roomId;
    sessionID = (data.chatSessionID === undefined) ? data.sessionID : data.chatSessionID;
    console.log('109 session ID', sessionID);
    var roomFile = 'rooms/'+roomID+'.json';
    var obj = {};
    fs.readFile(roomFile, 'utf8', async function (err, data) {
        if (err) {
            obj['host'] = {uid: clientId};
            obj['size'] = 1;
            obj['name'] = roomID;
            obj['type'] = 'public';
            obj['link'] = process.env.APP_URL + 'p/' + roomID;
            obj['password'] = false;
        } else {
            obj = JSON.parse(data);
            // console.log('95 ', obj);
            stream = false;
            if (obj.type === 'private') {
                // console.log('97 ', obj.type);
                // sess = getSession(sessionID);
                sess = ws.req.session
                pass = false;
                if ((sess !== undefined) && (sess.hasOwnProperty('room-' + roomID))) {
                    if (obj.password === sess['room-' + roomID].password
                        && (sess['room-' + roomID].ttl >= new Date().getTime())
                    ) {
                        pass = true;
                    } else {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: "Failed to join room: " + roomID + " Password is wrong..."
                        }));
                        return;
                    }
                }
                if (!pass) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: "Failed to join room: " + roomID + " Password is wrong or session expired"
                    }));
                    return;
                }
            } else if (obj.type === 'master') {
                // console.log('115 ', obj.type);
                // sess = getSession(sessionID);
                sess = ws.req.session
                pass = false;
                // console.log('142 ', sess.hasOwnProperty('room-'+roomID), sess);
                if (sess.newRoom === obj.name) {
                    pass = true;
                    obj.host.uid = ws.uid = clientId;
                } else if ((sess.hasOwnProperty('room-' + roomID))) {
                    console.log('143 ', sessionID, obj.host.sessionID);
                    // TODO tut po idee mojno budet proveryat esli allowed to pass in
                    if (sessionID === obj.host.sessionID || (obj.hasOwnProperty('allowed') && obj.allowed.includes(sessionID))) {
                        pass = true;
                    } else if (obj.password === sess['room-' + roomID].password
                        && (sess['room-' + roomID].ttl >= new Date().getTime())
                    ) {
                        pass = true;
                    } else {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: "Failed to join room: " + roomID + " Password is wrong..."
                        }));
                        return;
                    }
                }
                if (!pass) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: "Failed to join room: " + roomID + " Password is wrong or session expired"
                    }));
                    return;
                }
            } else if (obj.type === 'stream') {
                console.log('140 ', obj.type);
                // sess = getSession(sessionID);
                sess = ws.req.session
                pass = false;
                stream = false;
                if ((sess.newRoom === obj.name)
                    && (sess.uid === obj.host.uid)
                ) {
                    clientId = obj.host.uid;
                    pass = true;
                    stream = true;
                } else if ((sess.hasOwnProperty('room-' + roomID))) {
                    console.log('143 ', sessionID, obj.host.sessionID);
                    if (sessionID === obj.host.sessionID) {
                        pass = true;
                    } else if (obj.password === sess['room-' + roomID].password
                        && (sess['room-' + roomID].ttl >= new Date().getTime())
                    ) {
                        pass = true;
                    } else {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: "Failed to join room: " + roomID + " Password is wrong..."
                        }));
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
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: "Failed to join room: " + roomID + " Password is wrong or session expired"
                    }));
                    return;
                }
            }
            if (!stream) {
                obj['u' + obj.size] = {uid: clientId};
                obj.size = obj.size + 1;
            }

        }

        clients[clientId] = ws;
        ws.uid = clientId;
        ws.roomID = roomID;
        rooms[roomID] = obj;

        // Send the new client their ID
        await ws.send(JSON.stringify({type: 'id', id: clientId, room: obj}));
        // console.log('wsid: ', ws.uid, clientId, 'obj :', JSON.stringify(obj));

        fs.writeFileSync(roomFile, JSON.stringify(obj), 'utf-8');

        await broadcastRoom(roomID, JSON.stringify({type: 'participant-joined', id: clientId, room: obj}), ws);
    });

}

async function broadcastRoom(roomID, message, ws = null) {
    room = rooms[roomID];
    if (room !== undefined) {
        if (ws === null || room.host.uid !== ws.uid) {
            hostConn = clients[room.host.uid];
            if (hostConn !== undefined) {
                await hostConn.send((message));
            }
        }
        if (room.type === 'mafia') {
            for (const uid in room.users) {
                if (ws === null || uid !==  ws.uid) {
                    userConn = clients[ uid ];
                    if (userConn !== undefined) {
                        await userConn.send(message);
                    } else {
                        console.log("Can't connect to ", uid)
                    }
                }
            }
        } else {
            for (let i= 1; i <= 10; i++) {
                if (room.hasOwnProperty('u'+i)) {
                    if (ws === null || room['u'+i].uid !==  ws.uid) {
                        userConn = clients[room['u'+i].uid ];
                        if (userConn !== undefined) {
                            await userConn.send(message);
                        } else {
                            console.log("Can't connect to ",room['u'+i].uid);
                        }
                    }
                }
            }
        }
    }
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
    } else {
        sender.send(JSON.stringify({ type: 'error', message: "Failed to send offer! Recipient: `"+data.to+"` not found..." }));
    }
}

function getRtpCapabilities(ws, data) {
    return ws.send(JSON.stringify({ action: 'rtpCapabilities', data: app.locals.router.rtpCapabilities }));
}

function wireTransport(ws, transport, type) {
    transport.on('dtlsstatechange', state => {
        if (state === 'closed') transport.close();
    });
}

function transportParams(transport) {
    return {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters
    };
}

async function createTransport() {
    return router.createWebRtcTransport({
        listenIps: [{ ip: '0.0.0.0', announcedIp: null }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true
    });
}

async function createSendTransport(ws, data) {
    const transport = await createTransport();
    peer.sendTransport = transport;
    wireTransport(ws, transport, 'sendTransport');
    ws.send(JSON.stringify({
        action: 'sendTransportCreated',
        data: transportParams(transport)
    }));
}



function getHandler(str) {
    return str.replace(/(-\w)/g, function (match) {
        return match[1].toUpperCase();
    });
}

module.exports = {
    getHandler,
    getRtpCapabilities,
    createSendTransport
};