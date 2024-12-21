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
    // const re = XRegExp("^[\\pL\\-_0-9\\. ]+$");
    const re = /^[\p{L}\-_0-9\. ]+$/u;
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
                // sess = getSession(sessionID);
                pass = false;
                stream = false;
                console.log('59 cuurent vs host', sessionID, room.gameHost.sessionID)
                if (sessionID === room.gameHost.sessionID) {
                    let conn = clients[room.gameHost.uid]
                    if (conn === undefined) {
                        console.log('41 GameHost', clientId)
                        // clientId = room.host.uid;
                        room.gameHost.uid = clientId
                        room.host.uid = clientId

                    } else {
                        console.log('WS 51 conn: ', typeof conn)
                    }
                    pass = true;
                } else {
                    if (room.game?.settings?.password) {
                        sess = ws.req.session
                        // console.log(ws.req.sessionId, sess)
                        // console.log(room.game.settings.password)
                        if (room.game.settings.password !== sess?.pwds?.[roomID] ) {
                            // await ws.send(JSON.stringify({type: 'error', message: 'There is no game ' + roomID}));
                            await ws.send(JSON.stringify({ type: 'error', message: "Room does not exist or you have no permission to join" }));
                            await ws.send(JSON.stringify({ type: 'redirect', uri: '/mafia' }));
                            return
                        } else {
                            // await ws.send(JSON.stringify({ type: 'error', message: "Setting pwd "+room.game.settings.password+" user pwd"+sess?.pwds?.roomID }));
                        }
                    }
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
                        if (ws.req.session.user) {
                            player.name = ws.req.session.user.nickname || ws.req.session.user.username
                            player.avatar = ws.req.session.user.avatar_url
                        }
                        emptySlot = false
                        break
                    }
                }
                if (room.game.phase === 'lobby') {
                    if ((player.uid === 'empty') && emptySlot) {
                        if (clientId !== room.gameHost.uid) {
                            player.uid = clientId;
                            player.name = ws.req.session?.user?.nickname || ws.req.session?.user?.username || 'unknown'
                            player.avatar = ws.req.session?.user?.avatar_url || '/static/img/avatar/d450356dc7cb3609.png';
                            player.sessionID = sessionID;
                            emptySlot = false;
                            break;
                        }
                    }
                }

            }
            ;
            if (emptySlot) {
                let spectator = {
                    clientId,
                    name: ws.req.session?.user?.nickname || ws.req.session?.user?.username || 'unknown',
                    avatar: ws.req.session?.user?.avatar_url || '/static/img/avatar/d450356dc7cb3609.png'
                }
                room.spectators[clientId] = spectator
            }
            // if (!pass) {
            room.users[clientId] = {uid: clientId};
            room.size = room.users.length;
            // }
        }
        console.log("WS order 117", clientId)
        clients[clientId] = ws;
        ws.uid = clientId;
        console.log(ws.req.session)
        ws.avatar = ws.req.session?.user?.avatar_url || '/static/img/avatar/d450356dc7cb3609.png';

        ws.roomID = roomID;
        rooms[roomID] = room;

        // Send the new client their ID
        await ws.send(JSON.stringify({type: 'id', id: clientId, room: room}));
        // console.log('wsid: ', ws.uid, clientId, 'room :', JSON.stringify(room));

        fs.writeFileSync(roomFile, JSON.stringify(room), 'utf-8');

        await broadcastRoom(roomID, JSON.stringify({type: 'participant-joined', id: clientId, avatar: ws.avatar, room: room}), ws);
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
                await userWS.send(JSON.stringify({ type: 'reset' }));
                checkUserConnection(userWS, player)
            }
            delete room.users[player.uid]
            player = {
                uid : 'empty',
                name: "unknown",
                sessionID: 'none',
                status: "unknown",
                mic: "off",
                role: 'none',
                warn: false
            }
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
            console.log(380, room.slot)
            await ws.send(JSON.stringify({type: 'unmute-mic', mode: 'shout-out'}));
            await broadcastRoom(ws.roomID, JSON.stringify({type: 'shout-out', slot: data.slot}));
            setTimeout(async () => {
                room = await getRoom(ROOM_ID)
                player = room.slot[PLAYER.slot]
                so = player.so[0]
                if (
                    so.end <= Date.now() &&
                    (room.game.days["D"+room.game.day].currentSpeaker !== data.slot)
                ) {
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
                if (
                    so.end <= now &&
                    (room.game.days["D"+room.game.day].currentSpeaker !== data.slot)
                ) {
                // if (so.end <= now) {
                    await slotSend(ROOM_ID, data.slot, {type: 'mute-mic', mode: 'shout-out'});
                }
                // await slotSend(ROOM_ID, data.slot, {type: 'mute-mic', mode: 'shout-out'});
            }, 5000);
        }
    }
})

const nominatePlayer = onlyPlayer(async (ws, data, ROOM_ID, room, PLAYER) => {
    let curDay = "D"+room.game.day
    let nominees =  room.game.days[curDay].nominees
    let accusers =  room.game.days[curDay].accusers
    console.log(467, PLAYER, accusers, nominees)
    if (PLAYER.status === 'alive') {
        if (nominees.includes(data.slot) && ((accusers[PLAYER.slot] ?? null) === data.slot)) {
            console.log(469)
            nominees = nominees.filter(slot => slot !== data.slot);
            delete accusers[PLAYER.slot];
        } else if (accusers[PLAYER.slot] ?? null) {
            console.log(473)
            nominees = nominees.filter(slot => slot !== accusers[PLAYER.slot]); ;
            accusers[PLAYER.slot] = data.slot
            nominees.push(data.slot)
        } else {
            console.log(478)
            if (!nominees.includes(data.slot)) {
                accusers[PLAYER.slot] = data.slot
                nominees.push(data.slot)
            }
        }
        console.log(484)
        room.game.days[curDay].nominees = nominees
        room.game.days[curDay].accusers = accusers
        room = await updateRoom(ws.roomID, room)
        nominees = room.game.days[curDay].nominees
        await broadcastRoom(ws.roomID,  JSON.stringify({ type: 'nominees', nominees: nominees }));
    }
})

const sendPlayerComm = onlyPlayer(async (ws, data, ROOM_ID, room, PLAYER) => {
    let receiver = room.slot[data.slot]
    if (receiver.status === 'alive') {
        let chance = 0
        if ((data.slot === (PLAYER.slot + 1))
            || (data.slot === (PLAYER.slot - 1))
            || ((data.slot === 10) && (PLAYER.slot === 1))
            || ((data.slot === 1) && (PLAYER.slot === 10))
        ) {

        } else {
            if (data['pad-color'] !== 'unknown') {
                chance = chance + 0.1
            }
            if (data['pad-number'] !== 0) {
                chance = chance + 0.15
            }
            randomValue = Math.random();
            leak = (randomValue <= chance);
            console.log(leak, chance, randomValue)
            randomSide =  Math.random();
            side = (randomSide <= 0.5)
            if (leak) {
                if (side) {
                    //left
                    if (data.slot === 10) {
                        randomWitness = 1
                    } else {
                        randomWitness = data.slot + 1
                    }
                } else {
                    if (data.slot === 1) {
                        randomWitness = 10
                    } else {
                        randomWitness = data.slot - 1
                    }
                }
                console.log('476', randomWitness)
                let witness = room.slot[randomWitness]
                if (witness.status === 'alive') {
                    console.log('479', randomWitness)
                    witnessWS = clients[witness.uid]
                    if (witnessWS !== undefined) {
                        console.log('482', witness.uid)
                        await witnessWS.send(JSON.stringify({ type: 'player-comm-witness', from: PLAYER.slot, to: data.slot, slot: data['pad-number'], color: data['pad-color'] }));
                    } else {
                        console.log('485', witness.uid)
                    }
                }
            }
        }
        userWS = clients[receiver.uid]
        if (userWS !== undefined) {
            await userWS.send(JSON.stringify({ type: 'player-comm', from: PLAYER.slot, slot: data['pad-number'], color: data['pad-color'] }));
        }
    }
})


const getSelfRole = onlyPlayer(async (ws, data, ROOM_ID, room, PLAYER) => {
    let response = {type: 'request-response', requestId: data.requestId, role: PLAYER.role, now: Date.now()}
    await ws.send(JSON.stringify(response));
});

const getActiveSpeakers = onlyPlayer(async (ws, data, ROOM_ID, room, PLAYER) => {
    let curDay = room.game.days["D"+room.game.day]
    let activeSpeakerEnd = 0
    let activeSpeaker = 0
    if ((room.game.phase === 'day') && ((curDay.currentSpeakerEnd || 0) > 0)) {
        activeSpeakerEnd = (curDay.currentSpeakerEnd || 0)
        activeSpeaker = (curDay.currentSpeaker || 0)
        if (activeSpeaker > 0) {
            if (room.slot[activeSpeaker].status !== 'alive') {
                activeSpeaker = 0
            }
        }
    }

    let so = Object.fromEntries(
        Object.entries(room.slot)
            .filter(([key, value]) => ((value.so.length > 0) && (value.so[0].end > Date.now())))
    );

    let response = {
        type: 'request-response',
        requestId: data.requestId,
        'active-speaker': activeSpeaker,
        'active-speaker-end': activeSpeakerEnd,
        now: Date.now(),
        so: so
    }
    await ws.send(JSON.stringify(response));
});

const getMafTeam = onlyMafTeam(async (ws, data, ROOM_ID, room, PLAYER, TEAM) => {
    let response = {type: 'request-response', requestId: data.requestId, mafTeam: TEAM}
    await ws.send(JSON.stringify(response));
});

const gameOver = onlyPlayer(async (ws, data, ROOM_ID, room, PLAYER) => {

    let redTeam = []
    let blackTeam = []
    for (const [slot, player] of Object.entries(room.slot)) {
        if (player.status === 'alive') {
            if (['B', 'D'].includes(player.role)) {
                blackTeam.push(slot)
            } else {
                redTeam.push(slot)
            }
        }
    }
    console.log('739','red:',redTeam,'black:',blackTeam)
    if ((redTeam.length > 0) && (blackTeam.length === 0)) {
        ws.send(JSON.stringify({type: 'game-over', players: room.slot, team: 'red' }));
    }
    if ((redTeam.length === blackTeam.length) && (blackTeam.length > 0)) {
        ws.send(JSON.stringify({type: 'game-over', players: room.slot, team: 'black' }));
    }

})

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


async function createGame(sender, data) {
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
        await sender.send(JSON.stringify({ type: 'error', message: "Validation failed for '"+room.name+"' or '"+ room.host + "'" }));
        return;
    }
    roomFile = config.roomsFolder+'/'+room.name+'.json';
    if (fs.existsSync(roomFile)) {
        await sender.send(JSON.stringify({ type: 'error', message: "Room '"+room.name+"' already exists" }));// ...
    } else {
        //const clientId = generateClientId();
        // sender.uid = sender.uid;
        sender.userName = room.host;

        // createSession( room.chatSessionID, clientId, room.host, room.name);
        sender.req.session.chatSessionID = room.chatSessionID
        sender.req.session.uid = clientId
        sender.req.session.userName = room.host
        sender.req.session.newRoom = room.name

        room.host = { uid: clientId, userName: room.host, sessionID: room.chatSessionID };
        room.gameHost = {uid: clientId, name: sender.userName, sessionID: room.chatSessionID, status: "unknown" }
        room.link = config.chatHost+'m/'+room.name;
        room.size = 1;
        room.type = 'mafia';
        room.game = {};
        room.game.settings = {
            "password": false,
            "registeredOnly": false,
            "sandbox": false
        }
        room.spectators = {};
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
        await sender.send(JSON.stringify({ type: 'room-ready', room: room, info: '1:'+(room.name !== '')+'2:'+(room.host !== '') }));

    }

}

async function joinRoomGame(sender, data) {
    // console.log('sender.req : ', sender.req)
    console.log(683, sender.req.sessionID ?? 'none')
    roomID = data.roomID;
    sessionID = data.chatSessionID;
    if (data.hasOwnProperty('password')){
        //p = data.password.toString();
        // password = crypto.createHash('md5').update(data.password.toString()).digest('hex');
        password = crypto.createHash('md5').update(data.password.toString()).digest('hex').substring(0, 8);
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
        await sender.send(JSON.stringify({ type: 'error', message: "Room ID failed for "+roomID }));
        return;
    }
    roomFile = config.roomsFolder+'/'+roomID+'.json';
    if (fs.existsSync(roomFile)) {
        fs.readFile(roomFile, 'utf8', async function (err, roomData) {
            room = JSON.parse(roomData);
            if (room.game.type === 'public') {
                if (!room.game.settings.password) {
                    await sender.send(JSON.stringify({type: 'room-ready', room: room }));
                } else {
                    if (room.game.settings.password === password) {
                        if (!sender.req.session?.pass) {
                            console.log(713, sender.req.sessionID ?? 'none')
                            sender.req.session['pwds'] = {}
                            sender.req.session['pwds'][''+roomID] = password
                        } else {
                            console.log(717, sender.req.sessionId)
                            sender.req.session['pwds'][''+roomID] = password
                        }
                        sender.req.session.save()
                        await sender.send(JSON.stringify({type: 'room-ready', room: room }));
                    } else {
                        await sender.send(JSON.stringify({ type: 'error', message: "Room does not exist or you have no permission to join" }));
                    }
                }

            } else if (room.type === 'stream') {
                if (sender.uid !== room.host.uid) {
                    room.link = room.link.replace('/s/'+room.name, '/w/'+room.name)
                }
                await sender.send(JSON.stringify({type: 'room-ready', room: room }));
            } else if (room.type === 'private') {
                // sess = getSession(sessionID);
                if (room.password === password) {
                    ttl = new Date().getTime() + 600000; // now  + 10 min
                    sender.req.session['room-'+roomID] = { ttl, password };
                    await sender.send(JSON.stringify({type: 'room-ready', room: room }));
                } else {
                    sender.req.session['room-'+roomID] = '';
                    await sender.send(JSON.stringify({ type: 'error', message: "Password is wrong..." }));
                }
                // updateSession(sessionID, sess);
            } else if (room.type === 'master') {
                // sess = getSession(sessionID);

                hostConn = clients[room.host.uid]; // dostaet polzovatlya
                if (room.allowed.includes(sessionID)){
                    await sender.send(JSON.stringify({type: 'room-ready', room: room }));
                    return
                }


                if (hostConn !== undefined) {
                    // if (room.allowed)
                    // TODO: tut poslanie ot requestor to host
                    hostConn.send(JSON.stringify({ type: 'request-join', 'room': room.name, 'client-id': sender.uid,
                        'client-session': sessionID, message: data.request}));
                    ttl = new Date().getTime() + 600000; // now  + 10 min
                    sender.req.session['room-'+roomID] = { ttl, admit: false, uid: sender.uid };
                    await sender.send(JSON.stringify({type: 'info', message: 'Request sent to the room host. Please wait for admission.' }));
                    // updateSession(sessionID, sess);
                } else {
                    await sender.send(JSON.stringify({ type: 'error', message: "No host detected online for this room: "+room.name }));
                    return;
                }

            }

        });
    } else {
        await sender.send(JSON.stringify({ type: 'error', message: "Room '"+room.name+"' does not exist" }));
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
    nominatePlayer,
    getSelfRole,
    getActiveSpeakers,
    getMafTeam,
    getSheriff,
    shoutOut,
    sendPlayerComm,
    setPlayerName,
    playerVote,
    gameOver,
    voteLockWinners,
    shoot,
}));