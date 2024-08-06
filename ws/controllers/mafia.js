const fs = require('fs');
// const util = require('util');
const XRegExp = require('xregexp');
const crypto = require('crypto');
const data = require('../data');
const config = require("../../config");

global['clients'] = data.clients
global['sessions'] = data.sessions
global['rooms'] = data.rooms



const common = require('./common')

common.globalContext(global)

const hostModule = require('./host');
const {
    getRoom,
    broadcastRoom,
    sleep,
    onlyHost,
    host,
    slotSend,
    onlyPlayer,
    onlyMafTeam,
    onlySheriff, updateRoom
} = require("./common");

function validateString(str) {
    const re = XRegExp("^[\\pL\\-_0-9]+$");
    if(!re.test(str)) {
        return false;
    }
    return str;
}

function joinGame(ws, data) {
    let clientId = generateClientId();
    roomID = data.roomId;
    sessionID = (data.chatSessionID === undefined) ? data.sessionID : data.chatSessionID;
    var roomFile = config.roomsFolder+'/'+roomID+'.json';
    var room = {};
    fs.readFile(roomFile, 'utf8', async function (err, data) {
        if (err) {
            await ws.send(JSON.stringify({type: 'error', message: 'There is no game ' + roomID}));
            return;
        } else {
            room = JSON.parse(data);
            if (room.type !== 'mafia') {
                await ws.send(JSON.stringify({type: 'error', message: 'There is no game in "' + roomID + '" room.'}));
                return;
            }
            if (room.type === 'mafia') {
                sess = getSession(sessionID);
                pass = false;
                stream = false;
                if (sessionID === room.gameHost.sessionID) {
                    let conn = clients[room.gameHost.uid]
                    if (conn === undefined) {
                        console.log('41 GameHost', clientId)
                        clientId = room.host.uid;

                    } else {
                        console.log('WS 51 conn: ', typeof conn)
                    }
                    pass = true;
                } else {
                    console.log('48 WARN: ', sess.uid, room.host.uid)
                }

            } else {
                return;
            }

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
                if (room.game.phase === 'lobby') {
                    if ((player.uid === 'empty') && emptySlot) {
                        if (clientId !== room.gameHost.uid) {
                            player.uid = clientId;
                            player.sessionID = sessionID;
                            emptySlot = false;
                            break;
                        }
                    }
                }

            }
            ;

            // if (!pass) {
            room.users[clientId] = {uid: clientId};
            room.size = room.users.length;
            // }
        }
        console.log("WS order 117", clientId)
        clients[clientId] = ws;
        ws.uid = clientId;
        ws.roomID = roomID;
        rooms[roomID] = room;

        // Send the new client their ID
        await ws.send(JSON.stringify({type: 'id', id: clientId, room: room}));
        // console.log('wsid: ', ws.uid, clientId, 'room :', JSON.stringify(room));

        fs.writeFileSync(roomFile, JSON.stringify(room), 'utf-8');

        await broadcastRoom(roomID, JSON.stringify({type: 'participant-joined', id: clientId, room: room}), ws);
    });

}

async function gamePlayerStatus(ws, data) {
    room = await getRoom(ws.roomID);
    valid = false
    let slotRes = 0
    if (ws.uid === room.gameHost.uid) {
        if (data.status === 'reset') {
            // console.log(116)
            player = room.slot[data.slot]
            slotRes = data.slot
            userWS = clients[player.uid]
            if (userWS !== undefined) {
                await userws.send(JSON.stringify({ type: 'reset' }));
                checkUserConnection(userWS, player)
            }
            delete room.users[player.uid]
            player = { uid : 'empty', name: "unknown", sessionID: 'none', status: "unknown", mic: "off", warn: false}
            // console.log(player)
            room.slot[data.slot] = player
            // console.log('roomPlayer',room.slot[data.slot])
            room = await updateRoom(ws.roomID, room)

            await broadcastRoom(ws.roomID,  JSON.stringify({ type: 'set-player-name', slot: data.slot, name: 'unknown' }));
        } else {
            // console.log(131)
            room.gameHost.status = data.status
        }

        valid = true
    } else {
        for (const [slot, player] of Object.entries(room.slot)) {
            if (player.uid === ws.uid) {
                slotRes = slot
                player.status = data.status
                valid = true
                break
            }
        }
    }
    if (valid) {
        await updateRoom(ws.roomID, room)
        await broadcastRoom(ws.roomID,  JSON.stringify({ type: 'game-player-status', uid: ws.uid, status: data.status, slot: slotRes }));
    } else {
        await ws.send(JSON.stringify({ type: 'error', message: "Something went wrong. Can't change your status..." }));
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
            if (
                (player.uid === ws.uid)
                && ((room.game.phase === 'lobby') || (data.mode !== 'self'))
            ) {
                player.mic = data.mic
                valid = true
                break
            }
        }
        ;
    }
    if (valid) {
        await updateRoom(ws.roomID, room)
        await broadcastRoom(ws.roomID,  JSON.stringify({ type: 'game-player-mic', uid: ws.uid, mic: data.mic }));
    } else {
        await ws.send(JSON.stringify({ type: 'error', message: "Can't change your microphone status..." }));
    }
}

async function gameReserveSlot(ws, data) {
    let room = await getRoom(ws.roomID);
    if (!room.game.availableSlots.includes(data.slotID)) {
        await ws.send(JSON.stringify({ type: 'error', message: "Slot "+data.slotID+" is not available..." }));
        return
    }

    for (const [slot, player] of Object.entries(room.slot)) {
        if (player.uid === ws.uid) {
            if (player.slot === 'none') {
                room.slot[slot].slot = data.slotID
                room.game.availableSlots = room.game.availableSlots.filter(slotID => slotID !== data.slotID);
                room = await updateRoom(ws.roomID, room)
                break
            }
        }
    }
}

async function gameReserveRole(ws, data) {
    let room = await getRoom(ws.roomID);
    if (!room.game.availableCards.includes(parseInt(data.cardID))) {
        console.log('242 ',room.game.availableCards)
        await ws.send(JSON.stringify({ type: 'error', message: "Card "+data.cardID+" is not available...", availabe: room.game.availableCards }));
        return
    }
    for (const [slot, player] of Object.entries(room.slot)) {

        if (player.uid === ws.uid) {
            if (player.role === 'none') {
                let idx = room.game.availableCards.indexOf(parseInt(data.cardID))
                room.slot[slot].role = room.game.availableRoles[idx]
                delete room.game.availableRoles[idx]
                room.game.availableRoles =  room.game.availableRoles.filter(role => role !== null);
                room.game.availableCards = room.game.availableCards.filter(cardID => cardID !== data.cardID);
                room = await updateRoom(ws.roomID, room)
                await broadcastRoom(ws.roomID,  JSON.stringify({ type: 'game-role-taken', card: data.cardID }));
                await ws.send(JSON.stringify({ type: 'game-role', role: room.slot[slot].role }));
                await ws.send(JSON.stringify({ type: 'game-phase', phase: 'shuffle' }));

                break
            }
        }
    }
}

async function playerVote(ws, data) {
    let room = await getRoom(ws.roomID);
    if (ws.uid === room.gameHost.uid) {
        console.log('Attempt to vote when a host!', ws.uid, ws.roomID)
        return
    } else {
        let playerSlot = 0
        for (const [slot, player] of Object.entries(room.slot)) {
            if ((player.uid === ws.uid)
                && (player.status === 'alive')
            ) {
                playerSlot = slot
                break
            }
        }
        if (playerSlot === 0) {
            // player not alive, so can't vote
            console.log('Player slot not found!', ws.uid, room.game.slot)
            return
        } else {
            let curDay = "D"+room.game.day
            let rounds =  room.game.days[curDay].rounds
            let roundN = Object.keys(rounds).length - 1
            let curRound = rounds[roundN]
            if (curRound.voted.includes(playerSlot)) {
                //
                console.log('Player already voted this round!', playerSlot, curRound)
                return
            }
            let candidateSlot = curRound.nominees[curRound.next]
            if (candidateSlot !== data.slot) {
                // vote phase missed
                console.log('vote phase missed!', playerSlot, candidateSlot, curRound)
                return
            }
            if (curRound['V'+curRound.next].state === 'START') {
                curRound['V'+curRound.next].votes.push(playerSlot)
                curRound.voted.push(playerSlot)
                room.game.days[curDay].rounds[roundN] = curRound
                room = await updateRoom(ws.roomID, room)
                await broadcastRoom(ws.roomID, JSON.stringify({
                    type: 'player-vote',
                    player: playerSlot,
                    candidate: candidateSlot
                }));
            } else {
                console.log('Something is wrong when voted!', playerSlot, candidateSlot, curRound)
            }
        }
    }
}

async function voteLockWinners(ws, data) {
    let room = await getRoom(ws.roomID);
    if (ws.uid === room.gameHost.uid) {
        console.log('Attempt to vote when a host!', ws.uid, ws.roomID)
        return
    } else {
        let playerSlot = 0

        for (const [slot, player] of Object.entries(room.slot)) {
            if ((player.uid === ws.uid)
                && (player.status === 'alive')
            ) {
                playerSlot = slot
                break
            }
        }
        if (playerSlot === 0) {
            // player not alive, so can't vote
            console.log('Player slot not found!', ws.uid, room.game.slot)
            return
        } else {
            let curDay = "D"+room.game.day
            let rounds =  room.game.days[curDay].rounds
            let roundN = Object.keys(rounds).length - 1
            let curRound = rounds[roundN]
            if (curRound['lock-winners'].votes.includes(playerSlot)) {
                //
                console.log('Player already voted this round!', playerSlot, curRound)
                return
            }

            if (curRound['lock-winners'].state === 'START') {
                curRound['lock-winners'].votes.push(playerSlot)
                room.game.days[curDay].rounds[roundN] = curRound
                room = await updateRoom(ws.roomID, room)
                let votes = room.game.days[curDay].rounds[roundN]['lock-winners']['votes']
                await broadcastRoom(ws.roomID, JSON.stringify({
                    type: 'lock-winners-player-vote',
                    player: votes[votes.length-1]
                }));
            } else {
                console.log('Something is wrong when voted!', playerSlot, candidateSlot, curRound)
            }
        }
    }
}

const shoot = onlyMafTeam(async (ws, data, ROOM_ID, room, PLAYER, TEAM) => {
    let playerSlot = PLAYER.slot
    // await broadcastRoom(ROOM_ID, JSON.stringify({
    //     type: 'player-shoot'
    // }));

    let curDay = room.game.days["D"+room.game.day]

    if (curDay.shooters.includes(playerSlot)) {
        //
        console.log('Player already shoot this night!', playerSlot, curRound)
        return
    } else {
        curDay.shooters.push(playerSlot)
        curDay.victims[playerSlot] = data.slot
        curDay.shoot[playerSlot] = data.slot
        room = await updateRoom(ws.roomID, room)
        await host(ROOM_ID, { type: 'mafia-shoot', mafia: playerSlot, victim: data.slot })
        await broadcastRoom(ws.roomID, JSON.stringify({
            type: 'player-shoot'
        }));
    }
})


const shoutOut = onlyPlayer(async (ws, data, ROOM_ID, room, PLAYER) => {
    if ((ws.uid !== data.uid)
        || (ws.uid !== room.slot[data.slot].uid)) {
        console.log('Attempt to shout out with incorrect uid!', ws.uid, data.uid, room.slot[data.slot].uid)
        return
    } else {
        if (PLAYER.mic === 'off') {
            let soId = randStr()
            let ts = Date.now()
            PLAYER.so = []
            PLAYER.so.push({ id:soId, start: ts, end: (ts+5000)})
            room.slot[PLAYER.slot] = PLAYER
            room = await updateRoom(ROOM_ID, room)
            await ws.send(JSON.stringify({type: 'unmute-mic', mode: 'shout-out'}));
            await broadcastRoom(ws.roomID, JSON.stringify({type: 'shout-out', slot: data.slot}));
            setTimeout(async () => {
                room = await getRoom(ROOM_ID)
                player = room.slot[PLAYER.slot]
                so = player.so[0]
                if (so.end <= Date.now()) {
                    await slotSend(ROOM_ID, data.slot, {type: 'mute-mic', mode: 'shout-out'});
                }
            }, 5000);
        } else {
            room = await getRoom(ROOM_ID)

            let player = room.slot[PLAYER.slot]
            console.log('393', player.so[0])
            player.so[0].end = Date.now() + 4900
            room = await updateRoom(ROOM_ID, room)
            console.log('395', room.slot[PLAYER.slot].so[0])
            await broadcastRoom(ws.roomID, JSON.stringify({type: 'shout-out', slot: data.slot}));
            setTimeout(async () => {
                let now = Date.now()
                room = await getRoom(ROOM_ID)
                console.log('400', room.slot[PLAYER.slot].so[0], now)
                let player = room.slot[PLAYER.slot]
                let so = player.so[0]
                console.log('404', so, now)
                if (so.end <= now) {
                    await slotSend(ROOM_ID, data.slot, {type: 'mute-mic', mode: 'shout-out'});
                }
                // await slotSend(ROOM_ID, data.slot, {type: 'mute-mic', mode: 'shout-out'});
            }, 5000);
        }
    }
})

const sendPlayerComm = onlyPlayer(async (ws, data, ROOM_ID, room, PLAYER) => {
    let receiver = room.slot[data.slot]
    if (receiver.status === 'alive') {
        userWS = clients[receiver.uid]
        if (userWS !== undefined) {
            await userWS.send(JSON.stringify({ type: 'player-comm', from: PLAYER.slot, slot: data['pad-number'], color: data['pad-color'] }));
        }
    }
})


const getSelfRole = onlyPlayer(async (ws, data, ROOM_ID, room, PLAYER) => {
    let response = {type: 'request-response', requestId: data.requestId, role: PLAYER.role}
    await ws.send(JSON.stringify(response));
});


const getMafTeam = onlyMafTeam(async (ws, data, ROOM_ID, room, PLAYER, TEAM) => {
    let response = {type: 'request-response', requestId: data.requestId, mafTeam: TEAM}
    await ws.send(JSON.stringify(response));
});

const getSheriff = onlySheriff(async (ws, data, ROOM_ID, room, PLAYER, TEAM) => {
    let response = {type: 'request-response', requestId: data.requestId, team: TEAM}
    await ws.send(JSON.stringify(response));
});


async function setPlayerName(ws, data) {
    let room = await getRoom(ws.roomID);
    if (data.slot === 'game-host') {
        if ( (ws.uid !== room.gameHost.uid)) {
            console.log('Attempt to set player name with incorrect uid!', ws.uid, data.uid, room.gameHost.uid)
            return
        } else {
            ws.name = data.name
            room.gameHost.name = data.name
            room = await updateRoom(ws.roomID, room);
            await broadcastRoom(ws.roomID,  JSON.stringify({ type: 'set-host-name', slot: data.slot, name: room.gameHost.name }));
        }
    } else {
        if ( (ws.uid !== room.slot[data.slot].uid)) {
            console.log('Attempt to set player name with incorrect uid!', ws.uid, data.uid, room.slot[data.slot].uid)
            return
        } else {
            ws.name = data.name
            room.slot[data.slot].name = data.name
            room = await updateRoom(ws.roomID, room);
            await broadcastRoom(ws.roomID,  JSON.stringify({ type: 'set-player-name', slot: data.slot, name: room.slot[data.slot].name }));

        }
    }

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
        room.gameHost = {uid: clientId, name: sender.userName, sessionID: room.chatSessionID, status: "unknown" }
        room.link = config.chatHost+'m/'+room.name;
        room.size = 1;
        room.type = 'mafia';
        room.game = {};
        room.users = {}
        room.users[clientId] = {uid: clientId};
        room.slot = {};
        room.log = [];
        room.game.phase = 'lobby'

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


function randStr(l = 10) {
    return Math.random().toString(36).substr(2, l);
}

function generateClientId() {
    return Math.random().toString(36).substr(2, 9);
}

function getHandler(str) {
    return str.replace(/(-\w)/g, function (match) {
        return match[1].toUpperCase();
    });
}

module.exports = common.addExports(
    hostModule.addExports({
    getHandler,
    joinGame,
    createGame,
    joinRoomGame,
    gamePlayerStatus,
    gamePlayerMic,
    gameReserveSlot,
    gameReserveRole,
    getSelfRole,
    getMafTeam,
    getSheriff,
    shoutOut,
    sendPlayerComm,
    setPlayerName,
    playerVote,
    voteLockWinners,
    shoot,
}));