const fs = require('fs');
const config = require("../../config");
const {
    sessions,
    clients,
    rooms,
    transports,
    producers,
    producerTransports,
    consumerTransports,
} = require("../data");

async function sleep(millis) {
    return new Promise(resolve => setTimeout(resolve, millis));
}




async function getRoom(roomID) {
    roomFile = process.env.ROOMS_DIR+'/'+roomID+'.json';
    if (fs.existsSync(roomFile)) {
        let content = await fs.readFileSync(roomFile, 'utf8')
        room = JSON.parse(content);
        return room;
    }
    return false;
}

async function updateRoom(roomID, room) {
    roomFile = process.env.ROOMS_DIR+'/'+roomID+'.json';
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

// async function createSession(sessionID, clientID = null, userName = null, roomID = null) {
//     return new Promise((resolve, reject) => {
//         sessionFile = config.sessionsFolder + Buffer.from(sessionID).toString('base64') + '.json';
//         sess = {
//             chatSessionID: sessionID,
//             uid: clientID,
//             userName: userName,
//             newRoom: roomID
//         };
//         sessions[sessionID] = sess;
//         fs.writeFileSync(sessionFile, JSON.stringify(sess), 'utf-8');
//         resolve(sess);
//     })
// }


// async function getSession(sessionID, clientID = null, userName = null, roomID = null) {
//     return new Promise((resolve, reject) => {
//         const sessionFile = config.sessionsFolder + Buffer.from(sessionID).toString('base64') + '.json';
//         console.log('329', sessionFile);
//         let sess = sessions[sessionID];
//
//         if (sess === undefined) {
//             try {
//                 const data = fs.promises.readFile(sessionFile, 'utf8');
//
//                 resolve(JSON.parse(data));
//
//             } catch (err) {
//                 console.log('410 Session not found in file', sessionID);
//                 sess = createSession(sessionID, clientID, userName);
//                 resolve(sess);
//                 console.log('New session created', sess);
//             }
//         } else {
//             resolve(sess);
//         }
//     })
// }

// function updateSession(sessionID, sess) {
//     // sessionFile = 'sessions/'+sessionID.toString('base64')+'.json';
//     const sessionFile = config.sessionsFolder + Buffer.from(sessionID).toString('base64') + '.json';
//     sessions[sessionID] = sess;
//     fs.writeFileSync(sessionFile, JSON.stringify(sess) , 'utf-8');
//     return sess;
// }


async function broadcastRoom(roomID, message, ws = null) {
    let room = await getRoom(roomID);
    if (room !== undefined) {
        const sendPromises = [];
        for (const uid in room.users) {
            if (ws === null || uid !==  ws.uid) {
                userConn = clients[ uid ];
                if (userConn !== undefined) {
                    sendPromises.push(await userConn.send(message));
                } else {
                    //console.log("Can't connect to ", uid)
                }
            }
        }
        await Promise.all(sendPromises);
    }
    // return room
};

async function mafiaHome(message, ws = null) {
    const sendPromises = [];
    // for (const userConn in clients) {
    for (const [connKey, conn] of Object.entries(clients)) {
        if (conn !== undefined && conn?.subscribe === 'mafia-home') {
            sendPromises.push(await conn.send(message));
        }
    }
    await Promise.all(sendPromises);

};

async function host(roomID, message, log = true) {
    let room = await getRoom(roomID);
    if (room.gameHost.uid !== undefined) {
        hostWS = clients[ room.gameHost.uid ];
        if (hostWS !== undefined) {
            if (log) {
                // temporary disable room log
                // room.log.push(message)
                room = await updateRoom(roomID, room);
            }
            await hostWS.send(JSON.stringify(message));
        }
    }
    return room
};

async function slotSend(roomID, slot, message) {
    let room = await getRoom(roomID);
    slotWS = clients[ room.slot[slot].uid ];
    if (slotWS !== undefined) {
        await slotWS.send(JSON.stringify(message));
    }
    return room
};

function onlyHost(handler) {
    return async (ws, data) => {
        try {
            const ROOM_ID = ws.roomID;
            const room = await getRoom(ROOM_ID);
            if (((room.game.settings.autohost === true) && (ws?.tHost !== true))
                || (room.game.settings.autohost !== true)) {
                if ((ws.uid !== room.gameHost.uid) && (data?.host !== room.gameHost.uid)) {
                    console.log(((room.game.settings.autohost === true) && (ws?.tHost !== true)), room.game.settings.autohost, ws?.tHost, ws.uid, room.gameHost.uid);
                    console.log('Attempt to execute action when not a host!', ws.uid, ROOM_ID);
                    throw new Error('Not a host');
                }
            }
            if(ws.tHost === true) {
                ws.tHost = false
            }
            await handler(ws, data, ROOM_ID, room);
        } catch (error) {
            // Handle the error (e.g., notify the user or log the attempt)
            console.error(error.message);
        }
    };
}
function onlyPlayer(handler) {
    return async (ws, data) => {
        try {
            const ROOM_ID = ws.roomID;
            const room = await getRoom(ROOM_ID);
            let PLAYER = {}
            valid = false
            for (const [slot, player] of Object.entries(room.slot)) {
                if (player.uid !== 'empty' && (player.uid === ws.uid) && (player.status === 'alive')) {
                    valid = true
                    PLAYER = player
                    break
                }
            }
            if (!valid) {
                console.log('Attempt to execute action when not a player!', ws.uid, ROOM_ID);
                throw new Error('Not a player');
            }
            await handler(ws, data, ROOM_ID, room, PLAYER);
        } catch (error) {
            // Handle the error (e.g., notify the user or log the attempt)
            console.error(error.message);
        }
    };
}

function onlyMafTeam(handler) {
    return async (ws, data) => {
        try {
            const ROOM_ID = ws.roomID;
            const room = await getRoom(ROOM_ID);
            let PLAYER = {}
            const TEAM = Object.fromEntries(
                Object.entries(room.slot)
                    .filter(([key, value]) => ['B', 'D'].includes(value.role))
            );
            valid = false
            for (const [slot, player] of Object.entries(TEAM)) {
                if ((player.uid !== 'empty')
                    && (player.uid === ws.uid)
                    && (player.status === 'alive')
                ) {
                    valid = true
                    PLAYER = player
                    break
                }
            }
            if (!valid) {
                console.log('Attempt to execute action when not a black!', ws.uid, ROOM_ID);
                throw new Error('Not a mafia player');
            }
            await handler(ws, data, ROOM_ID, room, PLAYER, TEAM);
        } catch (error) {
            // Handle the error (e.g., notify the user or log the attempt)
            console.error(error.message);
        }
    };
}

function onlySheriff(handler) {
    return async (ws, data) => {
        try {
            const ROOM_ID = ws.roomID;
            const room = await getRoom(ROOM_ID);
            let PLAYER = {}
            const TEAM = Object.fromEntries(
                Object.entries(room.slot)
                    .filter(([key, value]) => ['S'].includes(value.role))
            );
            valid = false
            for (const [slot, player] of Object.entries(TEAM)) {
                if (player.uid !== 'empty' && (player.uid === ws.uid) && (player.status === 'alive')) {
                    valid = true
                    PLAYER = player
                    break
                }
            }
            if (!valid) {
                console.log('Attempt to execute action when not a sheriff!', ws.uid, ROOM_ID);
                throw new Error('Not a sheriff');
            }
            await handler(ws, data, ROOM_ID, room, PLAYER, TEAM);
        } catch (error) {
            // Handle the error (e.g., notify the user or log the attempt)
            console.error(error.message);
        }
    };
}

function onlyDon(handler) {
    return async (ws, data) => {
        try {
            const ROOM_ID = ws.roomID;
            const room = await getRoom(ROOM_ID);
            let PLAYER = {}
            const TEAM = Object.fromEntries(
                Object.entries(room.slot)
                    .filter(([key, value]) => ['D'].includes(value.role))
            );
            valid = false
            for (const [slot, player] of Object.entries(TEAM)) {
                if (player.uid !== 'empty' && (player.uid === ws.uid) && (player.status === 'alive')) {
                    valid = true
                    PLAYER = player
                    break
                }
            }
            if (!valid) {
                console.log('Attempt to execute action when not a don!', ws.uid, ROOM_ID);
                throw new Error('Not a sheriff');
            }
            await handler(ws, data, ROOM_ID, room, PLAYER, TEAM);
        } catch (error) {
            // Handle the error (e.g., notify the user or log the attempt)
            console.error(error.message);
        }
    };
}

async function checkUserConnection(ws, data) {
    let room = await getRoom(ws.roomID);

    if (room.users.hasOwnProperty(data.uid)) {
        userConn = clients[ data.uid ];
        if (userConn === undefined) {
            delete room.users[data.uid]
            delete room.spectators[data.uid]
            room = await updateRoom(ws.roomID, room)
            console.log("Fresh user list: ", room.users)
        } else {
            console.log("Seems connection still available: ", data.uid)
        }
    } else {
        console.log("Failed to check user: ", data.uid, room.users, room.users.hasOwnProperty(data.uid))
    }
}

async function cleanUsers(room) {
    for (const uid in room.users) {
        if (!clients[uid]) {  // If connection doesn't exist
            delete room.users[uid];
            delete room.spectators[uid];  // Also remove from spectators if present
        }
    }
    return room;
}

const checkWsActive = async (ws, data) => {
    let room = await getRoom(ws.roomID);
    let status = false
    if (room.users.hasOwnProperty(data.uid)) {
        userConn = clients[ data.uid ];
        if (userConn === undefined) {
            delete room.users[data.uid]
            delete room.spectators[data.uid]
            room = await updateRoom(ws.roomID, room)
            console.log("Fresh user list: ", room.users)

        } else {
            status = true
            console.log("Seems connection still available: ", data.uid)
        }
    } else {
        console.log("Failed to check user: ", data.uid, room.users, room.users.hasOwnProperty(data.uid))
    }
    let response = {type: 'request-response', requestId: data.requestId, status: status}
    await ws.send(JSON.stringify(response));
};

const createProducerTransport = async (ws, data) => {
    let room = await getRoom(ws.roomID);
    if (room) {
        const transport = await ws.router.createWebRtcTransport({
            listenIps: [{ ip: '0.0.0.0', announcedIp: process.env.PUBLIC_IP }],
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
        });
        let response = {
            type: 'request-response',
            requestId: data.requestId,
            status: "producer-transport-created",
            data: {
                id: transport.id,
                iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates,
                dtlsParameters: transport.dtlsParameters,
            },
        }
        await ws.send(JSON.stringify(response));
        producerTransports.set(ws.uid, transport);
        ws.producerTransport = transport
    } else {
        await ws.send(JSON.stringify({
            type: 'request-response',
            requestId: data.requestId,
            status: false,
            error: "Room not found",
        }));
    }
};

const createConsumerTransport = async (ws, data) => {
    let room = await getRoom(ws.roomID);
    if (room) {
        let transport
        // Same transport creation as producer
        if (ws.consumerTransport) {
            transport = await ws.consumerTransport
        } else {
            transport = await ws.router.createWebRtcTransport({
                listenIps: [{ ip: '0.0.0.0', announcedIp: process.env.PUBLIC_IP }],
                enableUdp: true,
                enableTcp: true,
                preferUdp: true,
                // Consumer-specific addition (optional):
                enableSctp: false // SCTP not needed for consumers
            });
            consumerTransports.set(ws.uid, transport);
            ws.consumerTransport = transport;
        }


        let response = {
            type: 'request-response',
            requestId: data.requestId,
            status: "consumer-transport-created",
            data: {
                id: transport.id,
                iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates,
                dtlsParameters: transport.dtlsParameters
            }
        };

        await ws.send(JSON.stringify(response));
    } else {
        await ws.send(JSON.stringify({
            type: 'request-response',
            requestId: data.requestId,
            status: false,
            error: "Room not found"
        }));
    }
};
const createProducer = async (ws, data) => {
    try {
        const room = await getRoom(ws.roomID);
        if (!room) {
            throw new Error('Room not found');
        }

        const transport = producerTransports.get(ws.uid);
        if (!transport) {
            throw new Error('Transport not found');
        }

        // Create producer
        const producer = await transport.produce({
            kind: data.kind,
            rtpParameters: data.rtpParameters
        });

        // Store by type (critical for later access)
        if (data.kind === 'video') {
            ws.videoProducer = producer;

            if (ws.uid === room.host.uid) {
                if (room.host.cam === 'off') {
                    ws.videoProducer.pause();
                }
            } else {
                const userSlot = Object.values(room.slot).find(slot => slot.uid === ws.uid);
                console.log(userSlot)
                if (userSlot && userSlot.cam === 'off') {
                    ws.videoProducer.pause();
                    console.log(`Video producer paused for ${ws.uid}`);
                } else {
                    console.log((userSlot.cam === 'off'));
                }
            }
            console.log(`Video producer created for ${ws.uid}`);
            // Выполняем отложенные запросы
            if (ws.pendingConsumeRequests) {
                const remainingRequests = [];
                ws.pendingConsumeRequests.forEach(async ({pendingWS, args}) => {
                    try {
                        if (producer && args.kind === 'video') {
                            await createConsumer(pendingWS, args, producer);
                        } else {
                            remainingRequests.push({pendingWS, args});
                        }
                    } catch (error) {
                        console.error(`Failed to process pending consume for ${pendingWS.uid}:`, error);
                        remainingRequests.push({pendingWS, args});
                    }
                });
                ws.pendingConsumeRequests = remainingRequests;
            }
        } else {
            ws.audioProducer = producer;

            if (ws.uid === room.host.uid) {
                if (room.host.mic === 'off') {
                    ws.audioProducer.pause();
                }
            } else {
                const userSlot = Object.values(room.slot).find(slot => slot.uid === ws.uid);

                if (userSlot && userSlot.mic === 'off') {
                    ws.audioProducer.pause();
                }
            }


            if (ws.pendingConsumeRequests) {
                const remainingRequests = [];
                ws.pendingConsumeRequests.forEach(async ({pendingWS, args}) => {
                    try {
                        if (producer && args.kind === 'audio') {
                            await createConsumer(pendingWS, args, producer);
                        } else {
                            remainingRequests.push({pendingWS, args});
                        }
                    } catch (error) {
                        console.error(`Failed to process pending consume for ${pendingWS.uid}:`, error);
                        remainingRequests.push({pendingWS, args});
                    }
                });
                ws.pendingConsumeRequests = remainingRequests;
            }
            console.log(`Audio producer created for ${ws.uid}`, ws.uid, room.host.uid, room.host.mic);
        }

        // Response
        await ws.send(JSON.stringify({
            type: 'request-response',
            requestId: data.requestId,
            status: "producer-created",
            data: {
                transportId: transport.id,
                producerId: producer.id,
                kind: data.kind
            }
        }));

    } catch (error) {
        console.error('Producer creation failed:', error.message);
        await ws.send(JSON.stringify({
            type: 'request-response',
            requestId: data.requestId,
            status: "error",
            error: error.message
        }));
    }
};

const connectProducerTransport = async (ws, data) => {
    let room = await getRoom(ws.roomID);
    if (room) {
        if (ws.producerTransport) {
            const transport = ws.producerTransport
            await transport.connect({ dtlsParameters: data.dtlsParameters });

            let response = {
                type: 'request-response',
                requestId: data.requestId,
                status: "transport-connected",
                data: {
                    transportId: transport.id,
                    dtlsState: transport.dtlsState
                },
            }
            await ws.send(JSON.stringify(response));
        } else {
            await ws.send(JSON.stringify({
                type: 'request-response',
                requestId: data.requestId,
                status: false,
                error: "You have no producer transport. Try to reload the page",
            }));
        }
    } else {
        await ws.send(JSON.stringify({
            type: 'request-response',
            requestId: data.requestId,
            status: false,
            error: "Room not found",
        }));
    }
};

const connectConsumerTransport = async (ws, data) => {
    let room = await getRoom(ws.roomID);
    if (room) {
        if (ws.consumerTransport) {
            const transport = ws.consumerTransport;

            try {
                await transport.connect({
                    dtlsParameters: data.dtlsParameters
                });

                let response = {
                    type: 'request-response',
                    requestId: data.requestId,
                    status: "transport-connected",
                    data: {
                        transportId: transport.id,
                        dtlsState: transport.dtlsState
                    },
                };
                await ws.send(JSON.stringify(response));

            } catch (error) {
                console.error("Consumer transport connect failed:", error);
                await ws.send(JSON.stringify({
                    type: 'request-response',
                    requestId: data.requestId,
                    status: false,
                    error: `DTLS handshake failed: ${error.message}`
                }));
            }

        } else {
            await ws.send(JSON.stringify({
                type: 'request-response',
                requestId: data.requestId,
                status: false,
                error: "You have no consumer transport. Try to reload the page",
            }));
        }
    } else {
        await ws.send(JSON.stringify({
            type: 'request-response',
            requestId: data.requestId,
            status: false,
            error: "Room not found",
        }));
    }
};

// Первая часть - проверка доступности продюсера
const consume = async (ws, data) => {
    const room = await getRoom(ws.roomID);
    if (!room) {
        await ws.send(JSON.stringify({
            type: 'request-response',
            requestId: data.requestId,
            status: false,
            error: "Room not found",
        }));
        return;
    }

    const client = clients[data.producerId];
    if (!client) {
        throw new Error(`Client ${data.producerId} not found`);
    }

    const producer = data.kind === 'video'
        ? client.videoProducer
        : client.audioProducer;

    if (!producer) {
        console.log(`No ${data.kind} producer for client: ${data.producerId}`);

        // Если продюсер еще не готов, сохраняем запрос для отложенного выполнения
        if (!client.pendingConsumeRequests) {
            client.pendingConsumeRequests = [];
        }

        // Сохраняем все данные для повторного вызова
        client.pendingConsumeRequests.push({
            pendingWS:ws,
            args: data,
            requestTime: Date.now()
        });

        // Можно добавить таймаут для таких запросов
        return;
    } else {
        await createConsumer(ws, data, producer);
    }
};

const micState = async (ws, data) => {
    const room = await getRoom(ws.roomID);
    if (!room) {
        await ws.send(JSON.stringify({
            type: 'request-response',
            requestId: data.requestId,
            status: false,
            error: "Room not found",
        }));
        return;
    }

    if (ws.audioProducer) {
        const state = ws.audioProducer.paused;
        await ws.send(JSON.stringify({
            type: 'request-response',
            requestId: data.requestId,
            status: true,
            muted: state
        }));
    } else {
        await ws.send(JSON.stringify({
            type: 'request-response',
            requestId: data.requestId,
            status: false,
            error: "You have no audio producer. Try to reload the page",
        }));
    }

};

// Вторая часть - создание потребителя
const createConsumer = async (ws, data, producer) => {
    // 2. Verify client can consume this producer
    if (!ws.router.canConsume({
        producerId: producer.id,
        rtpCapabilities: data.rtpCapabilities
    })) {
        await ws.send(JSON.stringify({
            type: 'request-response',
            requestId: data.requestId,
            status: false,
            error: "Router says you can't consume this producer",
        }));

        console.log('--- CAN_CONSUME DEBUG ---');
        console.log('Producer ID '+data.producerId+ ' :', producer.id);
        console.log('Producer RTP Parameters:', producer.rtpParameters);
        console.log('Consumer RTP Capabilities:', data.rtpCapabilities);
        console.log('Router Supported RTP Capabilities:', ws.router.rtpCapabilities);
        return;
    }

    // 3. Create consumer
    const consumer = await ws.consumerTransport.consume({
        producerId: producer.id,
        rtpCapabilities: data.rtpCapabilities,
        paused: false // Start immediately
    });

    // 4. Respond with consumer params
    ws.send(JSON.stringify({
        type: 'request-response',
        requestId: data.requestId,
        status: "consumer-created",
        data: {
            id: consumer.id,
            producerId: producer.id,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters
        }
    }));

    // Track consumer
    ws.consumers = ws.consumers || new Map();
    ws.consumers.set(`${data.producerId}-${data.kind}`, consumer);
};

const getSlotUid = async (ws, data) => {
    let room = await getRoom(ws.roomID);
    let slotUID = false
    if (room?.slot[data.slot]?.uid &&
        room?.slot[data.slot]?.uid !== 'empty') {

        userConn = clients[ data.uid ];
        if (userConn === undefined) {
            delete room.users[data.uid]
            delete room.spectators[data.uid]
            room = await updateRoom(ws.roomID, room)
        } else {
            slotUID = room.slot[data.slot].uid
        }
    } else {
        console.log("Failed to find uid for slot : ", data.slot)
    }
    let response = {type: 'request-response', requestId: data.requestId, uid: slotUID}
    await ws.send(JSON.stringify(response));
};

function addExports(exports) {
    exp = {
        checkUserConnection,
        checkWsActive,
        getSlotUid,
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
    // createSession,
    // getSession,
    // updateSession,
    broadcastRoom,
    mafiaHome,
    host,
    slotSend,
    onlyHost,
    onlyPlayer,
    onlyMafTeam,
    onlySheriff,
    onlyDon,
    checkUserConnection,
    checkWsActive,
    sleep,
    globalContext,
    createProducerTransport,
    createProducer,
    connectProducerTransport,
    consume,
    createConsumerTransport,
    connectConsumerTransport,
    micState,
    addExports,
    cleanUsers
}