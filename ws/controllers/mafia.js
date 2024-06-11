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
                sess = getSession(sessionID);
                pass = false;
                stream = false;
                if (sessionID === room.gameHost.sessionID) {
                    let conn = clients[room.gameHost.uid]
                    if (conn === undefined) {
                        console.log('41 GameHost',clientId)
                        clientId = room.host.uid ;

                    } else {
                        console.log('WS 51 conn: ', typeof conn)
                    }
                    pass = true;
                } else {
                    console.log('48 WARN: ',sess.uid,room.host.uid)
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

            };

            // if (!pass) {
                room.users[clientId] = {uid: clientId};
                room.size = room.users.length;
            // }
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

// async function getRoom(roomID) {
//     return new Promise((resolve, reject) => {
//         const roomFile = config.roomsFolder+'/'+roomID+'.json';
//         if (fs.existsSync(roomFile)) {
//             readFile(roomFile, 'utf8')
//                 .then(roomData => {
//                     resolve(JSON.parse(roomData));
//                 })
//                 .catch(error => {
//                     reject(error);
//                 });
//         } else {
//             reject(new Error('Room file not found '+roomFile));
//         }
//     });
// }
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

async function gameReserveSlot(ws, data) {
    let room = await getRoom(ws.roomID);
    if (!room.game.availableSlots.includes(data.slotID)) {
        ws.send(JSON.stringify({ type: 'error', message: "Slot "+data.slotID+" is not available..." }));
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
        ws.send(JSON.stringify({ type: 'error', message: "Card "+data.cardID+" is not available...", availabe: room.game.availableCards }));
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
                broadcastRoom(ws.roomID,  JSON.stringify({ type: 'game-role-taken', card: data.cardID }));
                ws.send(JSON.stringify({ type: 'game-role', role: room.slot[slot].role }));
                ws.send(JSON.stringify({ type: 'game-phase', phase: 'shuffle' }));

                break
            }
        }
    }
}

async function showRoles(ws, data) {
    let room = await getRoom(ws.roomID);
    if (ws.uid !== room.gameHost.uid) {
        console.log('Attempt to get player roles when not a host!', ws.uid, ws.roomID)
        return
    } else {
        ws.send(JSON.stringify({type: 'game-roles', players: room.slot, phase: room.game.phase }));
    }
}

async function startSitdown(ws, data) {
    let room = await getRoom(ws.roomID);


    if (ws.uid !== room.gameHost.uid) {
        console.log('Attempt to start game when not a host!', ws.uid, ws.roomID)
        return
    } else {
        const mafTeam = Object.fromEntries(
            Object.entries(room.slot)
                .filter(([key, value]) => ['B', 'D'].includes(value.role))
        );
        console.log(mafTeam)
        ws.send(JSON.stringify({type: 'sitdown-started', team: mafTeam}));
        broadcastRoom(ws.roomID,  JSON.stringify({ type: 'game-phase', phase: 'sitdown' }));
        await sleep(300);
        for (const [slot, player] of Object.entries(mafTeam)) {
            if (player.uid !== 'empty') {
                user = clients[player.uid]
                if (user !== undefined) {
                    user.send(JSON.stringify({type: 'mafia-sitdown', team: mafTeam}));
                } else {
                    ws.send(JSON.stringify({type: 'player-not-ready', slot: slot}));
                    return
                }
            }
        }
    }
}

async function startShooting(ws, data) {
    let room = await getRoom(ws.roomID);

    if (ws.uid !== room.gameHost.uid) {
        console.log('Attempt to start shooting when not a host!', ws.uid, ws.roomID)
        return
    } else {
        const mafTeam = Object.fromEntries(
            Object.entries(room.slot)
                .filter(([key, value]) => ['B', 'D'].includes(value.role) && value.status === 'alive')
        );

        const shootingTemplate = Object.keys(mafTeam).reduce((acc, key) => {
            acc[key] = 'none';
            return acc;
        }, {});
        console.log('Mafs alive to shoot:',mafTeam)
        console.log(shootingTemplate)

        room.game.days["D"+room.game.day]['shoot'] = shootingTemplate
        room = await updateRoom(ws.roomID, room)
        ws.send(JSON.stringify({type: 'shooting-started', team: mafTeam}));
        broadcastRoom(ws.roomID,  JSON.stringify({ type: 'game-phase', phase: 'shooting' }));
        await sleep(300);
        for (const [slot, player] of Object.entries(mafTeam)) {
            if (player.uid !== 'empty') {
                user = clients[player.uid]
                if (user !== undefined) {
                    user.send(JSON.stringify({type: 'mafia-shooting', team: mafTeam}));
                } else {
                    ws.send(JSON.stringify({type: 'player-not-ready', slot: slot}));
                    return
                }
            }
        }
        setTimeout(async () => {
            room = await getRoom(ws.roomID);

            room = await updateRoom(ws.roomID, room)

            ws.send(JSON.stringify({type: 'shooting-is-over'}));

        }, 3500)
    }
}

async function donWatch(ws, data) {
    let room = await getRoom(ws.roomID);
    if (ws.uid !== room.gameHost.uid) {
        console.log('Attempt to start game when not a host!', ws.uid, ws.roomID)
        return
    } else {
        const mafTeam = Object.fromEntries(
            Object.entries(room.slot)
                .filter(([key, value]) => ['B', 'D'].includes(value.role))
        );
        broadcastRoom(ws.roomID,  JSON.stringify({ type: 'game-phase', phase: 'don-watch' }));
        await sleep(300);
        for (const [slot, player] of Object.entries(mafTeam)) {
            if (player.uid !== 'empty' && player.role === 'D') {
                user = clients[player.uid]
                if (user !== undefined) {
                    user.send(JSON.stringify({type: 'don-watch', team: mafTeam}));
                } else {
                    ws.send(JSON.stringify({type: 'player-not-ready', slot: slot}));
                    return
                }
            }
        }
    }
}

async function startDonCheck(ws, data) {
    let room = await getRoom(ws.roomID);
    if (ws.uid !== room.gameHost.uid) {
        console.log('Attempt to start don check when not a host!', ws.uid, ws.roomID)
        return
    } else {
        const donTeam = Object.fromEntries(
            Object.entries(room.slot)
                .filter(([key, value]) => (value.role === 'D'))
        );
        let donSlot = 0
        for (const [slot, player] of Object.entries(room.slot)) {
            if ((player.status === 'alive')
                && (player.role === 'D')
            ) {
                donSlot = slot
                break
            }
        }
        broadcastRoom(ws.roomID,  JSON.stringify({ type: 'game-phase', phase: 'don-check' }));
        await sleep(300);
        console.log(364, donSlot)
        if (donSlot>0) {
            player = room.slot[donSlot]

            if (player.uid !== 'empty') {
                user = clients[player.uid]
                if (user !== undefined) {
                    console.log(370, donSlot, donTeam)
                    user.send(JSON.stringify({type: 'don-check', team: donTeam}));
                } else {
                    ws.send(JSON.stringify({type: 'don-not-ready', slot: slot}));
                    return
                }
            }

        }

    }
}
async function startSheriffCheck(ws, data) {
    let room = await getRoom(ws.roomID);
    if (ws.uid !== room.gameHost.uid) {
        console.log('Attempt to start sheriff check when not a host!', ws.uid, ws.roomID)
        return
    } else {

        broadcastRoom(ws.roomID,  JSON.stringify({ type: 'game-phase', phase: 'sheriff-check' }));
        await sleep(300);
        for (const [slot, player] of Object.entries(room.slot)) {
            if ((player.status === 'alive')
                && (player.role === 'S')
            ) {
                if (player.uid !== 'empty') {
                    user = clients[player.uid]
                    if (user !== undefined) {
                        sheriffTeam = { [slot]: player };
                        user.send(JSON.stringify({type: 'sheriff-check', team: sheriffTeam }));
                    } else {
                        ws.send(JSON.stringify({type: 'sheriff-not-ready', slot: slot}));
                        return
                    }
                    break
                }
            }
        }
    }
}

async function sheriffWatch(ws, data) {
    let room = await getRoom(ws.roomID);
    if (ws.uid !== room.gameHost.uid) {
        console.log('Attempt to start game when not a host!', ws.uid, ws.roomID)
        return
    } else {
        const sheriff = Object.fromEntries(
            Object.entries(room.slot)
                .filter(([key, value]) => ['S'].includes(value.role))
        );
        broadcastRoom(ws.roomID,  JSON.stringify({ type: 'game-phase', phase: 'sheriff-watch' }));
        await sleep(300);
        for (const [slot, player] of Object.entries(sheriff)) {
            if (player.uid !== 'empty' && player.role === 'S') {
                user = clients[player.uid]
                if (user !== undefined) {
                    user.send(JSON.stringify({type: 'sheriff-watch', team: sheriff}));
                } else {
                    ws.send(JSON.stringify({type: 'sheriff-not-ready', slot: slot}));
                    return
                }
            }
        }
    }
}

async function startDayOne(ws, data) {
    let room = await getRoom(ws.roomID);
    if (ws.uid !== room.gameHost.uid) {
        console.log('Attempt to start game when not a host!', ws.uid, ws.roomID)
        return
    } else {
        room.game.phase = 'day'
        room.game.lastSlot = 0
        room.game.day = 1
        room.game.days = {}
        room.game.days["D1"] = { nominees: [], rounds: [] }
        room.game.speakers = []
        for (const [slot, player] of Object.entries(room.slot)) {
            player.status = 'alive'
        }
        room = await updateRoom(ws.roomID, room)
        broadcastRoom(ws.roomID,  JSON.stringify({ type: 'game-phase', phase: room.game.phase, day: room.game.day }));
    }
}

async function startDay(ws, data) {
    let room = await getRoom(ws.roomID);
    if (ws.uid !== room.gameHost.uid) {
        console.log('Attempt to start game when not a host!', ws.uid, ws.roomID)
        return
    } else {
        room.game.phase = 'day'
        slotReady = false
        // if (room.game.lastSlot === 10) {
        //     room.game.lastSlot = room.game.day
        // }
        // for (const [slot, player] of Object.entries(room.slot)) {
        //     if ((player.status === 'alive')
        //         && (slot > room.game.day)
        //     ){
        //         room.game.lastSlot = (slot - 1)
        //         break;
        //     }
        // }
        room.game.lastSlot = 0
        room.game.day = (room.game.day + 1)
        room.game.days["D"+room.game.day] = { nominees: [], rounds: [] }
        room.game.speakers = []

        room = await updateRoom(ws.roomID, room)
        broadcastRoom(ws.roomID,  JSON.stringify({ type: 'game-phase', phase: room.game.phase, day: room.game.day }));
    }
}

async function startNight(ws, data) {
    let room = await getRoom(ws.roomID);
    if (ws.uid !== room.gameHost.uid) {
        console.log('Attempt to start night when not a host!', ws.uid, ws.roomID)
        return
    } else {
        room.game.phase = 'night'
        room = await updateRoom(ws.roomID, room)
        broadcastRoom(ws.roomID,  JSON.stringify({ type: 'game-phase', phase: room.game.phase, night: room.game.day }));
    }
}

// nex voting round preparation
async function startVoting(ws, data) {
    let room = await getRoom(ws.roomID);
    if (ws.uid !== room.gameHost.uid) {
        console.log('Attempt to start game when not a host!', ws.uid, ws.roomID)
        return
    } else {
        let curDay = "D"+room.game.day
        let curRound = room.game.days[curDay].rounds.length
        let nominees =  room.game.days[curDay].nominees
        if ((nominees.length === 0)
            || (nominees.length === 1 && curDay==="D1")
        ) {
            ws.send(JSON.stringify({ type: 'ready-to-night' }));
        } else {
            let round = {
                nominees: nominees,
                next: 0,
                voted: []
            }
            room.game.days[curDay].rounds.push(round)
            roomState = await updateRoom(ws.roomID, room)
            console.log("WS 354", roomState.game.days[curDay].rounds)
            nominees =  roomState.game.days[curDay].rounds[curRound].nominees
            broadcastRoom(ws.roomID, JSON.stringify({ type: 'start-voting', nominees: nominees }));
            ws.send(JSON.stringify({ type: 'voting-round-ready', round: 0, candidate: nominees[0] }));
        }

    }
}

async function startVotingRound(ws, data) {
    let room = await getRoom(ws.roomID);
    if (ws.uid !== room.gameHost.uid) {
        console.log('Attempt to start voting round when not a host!', ws.uid, ws.roomID)
        return
    } else {
        let curDay = "D"+room.game.day
        let rounds =  room.game.days[curDay].rounds
        let roundN = Object.keys(rounds).length - 1
        let curRound = rounds[roundN]
        let candidateSlot = curRound.nominees[curRound.next]
        curRound['V'+curRound.next] = {
            state: 'START',
            slot: candidateSlot,
            votes: []
        }

        room.game.days[curDay].rounds[roundN] = curRound


        room = await updateRoom(ws.roomID, room)
        broadcastRoom(ws.roomID, JSON.stringify({
            type: 'voting-round',
            round: (roundN+1),
            candidate: candidateSlot
        }));
        setTimeout(async () => {
            room = await getRoom(ws.roomID);
            room.game.days[curDay].rounds[roundN]['V'+curRound.next].state = 'END'
            room.game.days[curDay].rounds[roundN].next++
            room = await updateRoom(ws.roomID, room)
            // console.log('WS 398', curRound, ' | ', room.game.days[curDay].rounds)
            nextCandidate = room.game.days[curDay].rounds[roundN].nominees[room.game.days[curDay].rounds[roundN].next]
            if (nextCandidate !== undefined) {
                broadcastRoom(ws.roomID, JSON.stringify({
                    type: 'voting-round-result',
                    round: (roundN + 1),
                    candidate: candidateSlot,
                    votes: room.game.days[curDay].rounds[roundN]['V' + (curRound.next)].votes
                }));
                // nextCandidate = room.game.days[curDay].rounds[roundN].nominees[room.game.days[curDay].rounds[roundN].next]
                if (nextCandidate !== undefined) {
                    ws.send(JSON.stringify({
                        type: 'voting-round-ready',
                        round: roundN,
                        candidate: nextCandidate
                    }));
                }
            } else {
                broadcastRoom(ws.roomID, JSON.stringify({
                    type: 'voting-round-result',
                    round: (roundN + 1),
                    candidate: candidateSlot,
                    votes: room.game.days[curDay].rounds[roundN]['V' + (curRound.next)].votes
                }));
            }

        }, 3000)
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
                broadcastRoom(ws.roomID, JSON.stringify({
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

async function shoot(ws, data) {
    let room = await getRoom(ws.roomID);
    if (ws.uid === room.gameHost.uid) {
        console.log('Attempt to shoot when a host!', ws.uid, ws.roomID)
        return
    } else {
        let playerSlot = 0
        for (const [slot, player] of Object.entries(room.slot)) {
            if ((player.uid === ws.uid)
                && (player.status === 'alive')
                && ((player.role === 'D') || (player.role === 'B'))
            ) {
                playerSlot = slot
                broadcastRoom(ws.roomID, JSON.stringify({
                    type: 'player-shoot'
                }));
                break
            }
        }
        if (playerSlot === 0) {
            // player not alive, so can't vote
            console.log('Not alive mafia attempt to shoot!', ws.uid, room.game.slot)
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
            broadcastRoom(ws.roomID, JSON.stringify({
                type: 'player-shoot'
            }));
            // let candidateSlot = curRound.nominees[curRound.next]
            // if (candidateSlot !== data.slot) {
            //     // vote phase missed
            //     console.log('vote phase missed!', playerSlot, candidateSlot, curRound)
            //     broadcastRoom(ws.roomID, JSON.stringify({
            //         type: 'player-shoot'
            //     }));
            //     return
            // }
            // if (curRound['V'+curRound.next].state === 'START') {
            //     curRound['V'+curRound.next].votes.push(playerSlot)
            //     curRound.voted.push(playerSlot)
            //     room.game.days[curDay].rounds[roundN] = curRound
            //     room = await updateRoom(ws.roomID, room)
            //     broadcastRoom(ws.roomID, JSON.stringify({
            //         type: 'player-vote',
            //         player: playerSlot,
            //         candidate: candidateSlot
            //     }));
            // } else {
            //     console.log('Something is wrong when voted!', playerSlot, candidateSlot, curRound)
            // }
        }
    }
}


async function shoutOut(ws, data) {
    let room = await getRoom(ws.roomID);
    if ((ws.uid !== data.uid)
        || (ws.uid !== room.slot[data.slot].uid)) {
        console.log('Attempt to shout out with incorrect uid!', ws.uid, data.uid, room.slot[data.slot].uid)
        return
    } else {
        let player = room.slot[data.slot]

        if ((player.mic === 'off')) {
            ws.send(JSON.stringify({ type: 'unmute-mic' }));
            broadcastRoom(ws.roomID,  JSON.stringify({ type: 'shout-out', slot: data.slot }));
            setTimeout(() => {
                ws.send(JSON.stringify({ type: 'mute-mic' }));
            }, 3000);
        }
    }
}

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
            broadcastRoom(ws.roomID,  JSON.stringify({ type: 'set-host-name', slot: data.slot, name: room.gameHost.name }));
        }
    } else {
        if ( (ws.uid !== room.slot[data.slot].uid)) {
            console.log('Attempt to set player name with incorrect uid!', ws.uid, data.uid, room.slot[data.slot].uid)
            return
        } else {
            ws.name = data.name
            room.slot[data.slot].name = data.name
            room = await updateRoom(ws.roomID, room);
            broadcastRoom(ws.roomID,  JSON.stringify({ type: 'set-player-name', slot: data.slot, name: room.slot[data.slot].name }));

        }
    }

}

async function nextSpeaker(ws, data) {
    let room = await getRoom(ws.roomID);
    if (ws.uid !== room.gameHost.uid) {
        console.log('Attempt to act as host ('+room.gameHost.uid+') when not a host!', ws.uid, ws.roomID)
        return
    } else {
        let activeSpeaker = 0;
        let lastAlive = 0;
        let curDay = "D"+room.game.day
        if (room.game.phase === 'day') {
            for (const [slot, player] of Object.entries(room.slot)) {
                // if (room.game.day > 1) {
                //     console.log('activeSpeaker', activeSpeaker, 'slot', slot, 'player.status', player.status, 'room.game.day', room.game.day, 'room.game.lastSlot', room.game.lastSlot, 'room.game.speakers', room.game.speakers)
                //
                // }
                // if (slot === '10') {
                //     console.log('1', (activeSpeaker === 0),
                //         '2', (player.status === 'alive'),
                //         '3', (Number(slot) >= room.game.day),
                //         '4', (Number(slot) >= Number(room.game.lastSlot)),
                //         '5', (!room.game.speakers.includes(slot)))
                // }
                if ((activeSpeaker === 0)
                    && (player.status === 'alive')
                    && (Number(slot) >= Number(room.game.day))
                    && (Number(slot) >= Number(room.game.lastSlot))
                    && (!room.game.speakers.includes(slot))
                ) {
                    activeSpeaker = slot
                    if (room.game.speakers.length === 0) {
                        room.game.lastSlot = slot
                    }
                    room.game.speakers.push(slot)

                    if ((player.mic === 'off') &&  (player.uid !== 'empty')) {
                        let user = clients[player.uid]
                        if (user !== undefined) {
                            user.send(JSON.stringify({ type: 'unmute-mic' }));
                        }
                    }
                    // console.log('slot', slot, 'player.status', player.status, 'room.game.day', room.game.day, 'room.game.lastSlot', room.game.lastSlot, 'room.game.speakers', room.game.speakers)

                } else {
                    // if (slot === '10') {
                    //     console.log('785:', room.game.day, slot, player.status, player.uid, room.game.speakers)
                    // }
                    if (player.mic === 'on') {
                        console.log('789:', slot)
                    }

                    if ((player.mic === 'on') &&  (player.uid !== 'empty')) {
                        let user = clients[player.uid]
                        if (user !== undefined) {
                            user.send(JSON.stringify({ type: 'mute-mic' }));
                        }
                    }
                }
                if (player.status === 'alive') {
                    lastAlive = slot
                }
            }
            if (room.game.day > 1) {
                console.log('808', 'activeSpeaker', activeSpeaker)
            }
            if (activeSpeaker === 0) {
                for (const [slot, player] of Object.entries(room.slot)) {
                    // console.log('799:', room.game.day, slot, player.status, room.game.speakers)
                    if ((activeSpeaker === 0)
                        &&(player.status === 'alive')
                        && (room.game.day > 1)
                        && (!room.game.speakers.includes(slot))
                    ) {
                        activeSpeaker = slot
                        room.game.lastSlot = slot

                        room.game.speakers.push(slot)

                        if ((player.mic === 'off') &&  (player.uid !== 'empty')) {
                            let user = clients[player.uid]
                            if (user !== undefined) {
                                user.send(JSON.stringify({ type: 'unmute-mic' }));
                            }
                        }


                    } else {
                        if (player.status === 'alive') {
                            if ((player.mic === 'on') &&  (player.uid !== 'empty')) {
                                let user = clients[player.uid]
                                if (user !== undefined) {
                                    user.send(JSON.stringify({ type: 'mute-mic' }));
                                }
                            }
                            if (!room.game.speakers.includes(slot)) {
                                lastAlive = slot
                            }
                        }
                        //console.log('821:', room.game.day, slot, player.status, player.mic, (room.game.day > 1), room.game.speakers.includes(slot))
                    }
                }
            }

        }

        if (activeSpeaker > 0) {
            room.game.days[curDay].currentSpeaker = activeSpeaker
            room = await updateRoom(ws.roomID, room)
            broadcastRoom(ws.roomID,  JSON.stringify({ type: 'active-speaker', slot: room.game.days[curDay].currentSpeaker, duration: 60, "last-alive": lastAlive }));
        } else {
            let nominees =  room.game.days[curDay].nominees
            ws.send(JSON.stringify({ type: 'ready-to-vote', nominees: nominees }));
        }

    }
}

async function warnAdd(ws, data) {
    let room = await getRoom(ws.roomID);
    if (ws.uid !== room.gameHost.uid) {
        console.log('Attempt to act as host ('+room.gameHost.uid+') when not a host!', ws.uid, ws.roomID)
        return
    } else {
        let player = room.slot[data.slot]
        let warn = player.warn
        if (player.status === 'alive') {
            if ((player.warn === undefined) || (player.warn === null) || (player.warn === false) || (player.warn === 0)) {
                warn = player.warn = 1
            } else if (player.warn < 4) {
                warn = player.warn = player.warn + 1
            }
            if ((player.warn > 3) && (player.status === 'alive')) {
                player.status = 'disqualified'
            }
            room = await updateRoom(ws.roomID, room)
            warn = room.slot[data.slot].warn
            broadcastRoom(ws.roomID,  JSON.stringify({ type: 'player-warn', slot: data.slot, warn: warn, status: player.status }));
        }
    }
}

async function playerKill(ws, data) {
    let room = await getRoom(ws.roomID);
    if (ws.uid !== room.gameHost.uid) {
        console.log('Attempt to act as host ('+room.gameHost.uid+') when not a host!', ws.uid, ws.roomID)
        return
    } else {
        let player = room.slot[data.slot]
        if (player.status === 'alive') {
            player.status = 'killed'
            room = await updateRoom(ws.roomID, room)
            player = room.slot[data.slot]
            broadcastRoom(ws.roomID,  JSON.stringify({ type: 'player-kill', slot: data.slot, status: player.status }));
        }
    }
}

async function playerLock(ws, data) {
    let room = await getRoom(ws.roomID);
    if (ws.uid !== room.gameHost.uid) {
        console.log('Attempt to act as host ('+room.gameHost.uid+') when not a host!', ws.uid, ws.roomID)
        return
    } else {
        let player = room.slot[data.slot]
        if (player.status === 'alive') {
            player.status = 'locked'
            room = await updateRoom(ws.roomID, room)
            player = room.slot[data.slot]
            broadcastRoom(ws.roomID,  JSON.stringify({ type: 'player-lock', slot: data.slot, status: player.status }));
        }
    }
}

async function playerRestore(ws, data) {
    let room = await getRoom(ws.roomID);
    if (ws.uid !== room.gameHost.uid) {
        console.log('Attempt to act as host ('+room.gameHost.uid+') when not a host!', ws.uid, ws.roomID)
        return
    } else {
        let player = room.slot[data.slot]
        if ((player.status === 'killed') || (player.status === 'locked')) {
            player.status = 'alive'
            room = await updateRoom(ws.roomID, room)
            player = room.slot[data.slot]
            broadcastRoom(ws.roomID,  JSON.stringify({ type: 'player-alive', slot: data.slot, status: player.status }));
        }
    }
}

async function warnRemove(ws, data) {
    let room = await getRoom(ws.roomID);
    if (ws.uid !== room.gameHost.uid) {
        console.log('Attempt to act as host ('+room.gameHost.uid+') when not a host!', ws.uid, ws.roomID)
        return
    } else {
        let player = room.slot[data.slot]
        let warn = player.warn
        if ((player.status === 'alive') || (player.status === 'disqualified')) {
            if ((player.warn === undefined) || (player.warn === null) || (player.warn === false)) {
                warn = player.warn = 0
            } else if (player.warn > 0) {
                warn = player.warn = player.warn -1
            }
            if ((player.warn < 4) && (player.status === 'disqualified')) {
                player.status = 'alive'
            }
            room = await updateRoom(ws.roomID, room)
            warn = room.slot[data.slot].warn
            broadcastRoom(ws.roomID,  JSON.stringify({ type: 'player-warn', slot: data.slot, warn: warn, status: player.status }));
        }
    }
}

async function nominate(ws, data) {
    let room = await getRoom(ws.roomID);
    if (ws.uid !== room.gameHost.uid) {
        console.log('Attempt to act as host ('+room.gameHost.uid+') when not a host!', ws.uid, ws.roomID)
        return
    } else {
        let player = room.slot[data.slot]
        let curDay = "D"+room.game.day
        console.log(curDay, room.game)
        let nominees =  room.game.days[curDay].nominees
        console.log(typeof nominees);
        if (player.status === 'alive') {
            if (nominees.includes(data.slot)) {
                nominees = nominees.filter(slot => slot !== data.slot);
            } else {
                nominees.push(data.slot)
            }
            room.game.days[curDay].nominees = nominees
            room = await updateRoom(ws.roomID, room)
            nominees = room.game.days[curDay].nominees
            broadcastRoom(ws.roomID,  JSON.stringify({ type: 'nominees', nominees: nominees }));
        }
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
            room.slot[slot].role = 'none';
            room.slot[slot].warn = false;
            if ((player.uid !== 'empty') && (player.status !== 'ready')) {
                userConn = clients[ player.uid ];
                if (userConn === undefined) {
                    player.uid = 'empty'
                } else {
                    console.log('slot is not ready: ', slot)
                    ready = false;
                }
                //break;
            }
            if ((player.mic === 'on') &&  (room.slot[slot].uid !== 'empty')) {
                user = clients[player.uid]
                if (user !== undefined) {
                    user.send(JSON.stringify({ type: 'mute-mic' }));
                } else {
                    player.mic === 'off'
                    room.slot[slot].uid = 'empty';
                    console.log('Note ready (mic): ',slot,player)
                    ready = false
                }
            }
        }

        room = await updateRoom(ws.roomID, room)
        if (!ready) {
            ws.send(JSON.stringify({ type: 'error', message: "Some users are not ready yet..." }));
            return;
        }

        broadcastRoom(ws.roomID,  JSON.stringify({ type: 'game-start' }));
        room.game.phase = 'shuffle';
        room.game.availableSlots = [1,2,3,4,5,6,7,8,9,10]
        room = await updateRoom(ws.roomID, room);

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
            sleepTime = 300; // skip empty slots
            if ((roomState.game.phase === 'shuffle')
                && (curPlayer.slot === 'none')) {
                user = clients[curPlayer.uid]
                if (user !== undefined) {
                    sleepTime = 3000
                    user.send(JSON.stringify({ type: 'select-slot', slots: roomState.game.availableSlots }));

                }

            }
            broadcastRoom(ws.roomID,  JSON.stringify({ type: 'game-phase-slot', slot: i }));
            await sleep(sleepTime);
        }
        //await sleep(3000);
        roomState = await getRoom(ws.roomID)
        if (roomState.game.availableSlots.length > 0) {
            roomState.game.availableSlots = shuffleArray(roomState.game.availableSlots);
            // console.log('310', roomState.game.availableSlots)
            correctOrder = {}
            for (const [slot, player] of Object.entries(roomState.slot)) {
                if ((player.slot === 'any') || (player.slot === 'none')) {
                    roomState.slot[slot].slot = roomState.game.availableSlots[0]
                    roomState.game.availableSlots = roomState.game.availableSlots.filter(slotID => slotID !== roomState.slot[slot].slot);
                }
                correctOrder[roomState.slot[slot].slot] = { ...roomState.slot[slot], initialSlot: slot }
            }
            console.log(correctOrder)
            roomState.slot = correctOrder;
        }
        roomState = await updateRoom(ws.roomID, roomState)
        broadcastRoom(ws.roomID,JSON.stringify({ type: 'game-order', slots: roomState.slot }));
        ws.send(JSON.stringify({ type: 'shuffle-roles-ready' }));

    }
}

async function shuffleRoles(ws, data) {
    let room = await getRoom(ws.roomID);
    if (ws.uid !== room.gameHost.uid) {
        console.log('Attempt to start game when not a host!', ws.uid, ws.roomID)
        return
    } else {
        ready = true;
        room.game.availableRoles = shuffleArray(['R','D','B','S','R','B','R','R','R','R']);
        room.game.availableCards = [1,2,3,4,5,6,7,8,9,10];
        room = await updateRoom(ws.roomID, room)
        broadcastRoom(ws.roomID,  JSON.stringify({ type: 'shuffle-roles' }));

        for (let i= 1; i<=10; i++) {
            roomState = await getRoom(ws.roomID)
            if (i>1) {
                prevPlayer = roomState.slot[i-1]
                if (prevPlayer.role === 'none') {
                    roomState.slot[i-1].role = roomState.game.availableRoles.shift()
                    roomState.game.availableCards.shift()
                    console.log('350 :', roomState.game.availableRoles)
                    roomState = await updateRoom(ws.roomID, roomState)
                    let prevUser = clients[prevPlayer.uid]
                    if (prevUser !== undefined) {
                        prevUser.send(JSON.stringify({ type: 'game-role', role: roomState.slot[i-1].role }));
                        prevUser.send(JSON.stringify({ type: 'game-phase', phase: 'shuffle' }));
                    }
                    broadcastRoom(ws.roomID,  JSON.stringify({ type: 'game-role-taken', card: 'any' }));
                }
            }

            broadcastRoom(ws.roomID,  JSON.stringify({ type: 'game-phase-role', slot: i }));
            curPlayer = roomState.slot[i]
            sleepTime = 300; // skip empty slots
            if ((roomState.game.phase === 'shuffle')
                && (curPlayer.role === 'none')) {
                user = clients[curPlayer.uid]
                if (user !== undefined) {
                    sleepTime = 3000
                    user.send(JSON.stringify({ type: 'select-role' }));
                }

            }

            await sleep(sleepTime);
        }
        //await sleep(3000);
        roomState = await getRoom(ws.roomID)
        if (roomState.game.availableRoles.length > 0) {
            for (const [slot, player] of Object.entries(roomState.slot)) {
                if (player.role === 'none') {
                    roomState.slot[slot].role = roomState.game.availableRoles.shift()

                    broadcastRoom(ws.roomID,  JSON.stringify({ type: 'game-role-taken', card: 'any' }));
                }
            }
        }
        roomState = await updateRoom(ws.roomID, roomState)
        ws.send(JSON.stringify({ type: 'roles-ready' }));
        broadcastRoom(ws.roomID,JSON.stringify({ type: 'game-ready', slots: roomState.slot }));


    }
}
function shuffleArray(array) {
    if (array.length > 1) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]]; // Swap elements
        }
    }
    return array;
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
async function gameStop(ws, data) {
    let room = await getRoom(ws.roomID);
    if (ws.uid !== room.gameHost.uid) {
        console.log('Attempt to stop game when not a host!', ws.uid, ws.roomID, )
        return
    } else {
        room.game.phase = 'lobby';
        for (const [slot, player] of Object.entries(room.slot)) {
            room.slot[slot].slot = 'none';
            room.slot[slot].role = 'none';
            room.slot[slot].status = 'unknown';
            broadcastRoom(ws.roomID,  JSON.stringify({ type: 'game-player-status', uid: player.uid, status: 'unknown' }));
        }
        room.game.lastSlot = 0
        room.game.day = 0
        room.game.days = {}
        room.game.speakers = []
        room = await updateRoom(ws.roomID, room)
        broadcastRoom(ws.roomID,  JSON.stringify({ type: 'game-phase', phase: room.game.phase }));
    }
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
        room.gameHost = {uid: clientId, name: sender.userName, sessionID: room.chatSessionID, status: "unknown" }
        room.link = config.chatHost+'m/'+room.name;
        room.size = 1;
        room.type = 'mafia';
        room.game = {};
        room.users = {}
        room.users[clientId] = {uid: clientId};
        room.slot = {};
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
    checkUserConnection,
    joinGame,
    createGame,
    joinRoomGame,
    gamePlayerStatus,
    gamePlayerMic,
    gameStart,
    shuffleRoles,
    gameStop,
    gameReserveSlot,
    gameReserveRole,
    showRoles,
    startSitdown,
    donWatch,
    sheriffWatch,
    startDayOne,
    nextSpeaker,
    shoutOut,
    warnAdd,
    warnRemove,
    nominate,
    setPlayerName,
    startVoting,
    startVotingRound,
    playerVote,
    startNight,
    startShooting,
    shoot,
    startDonCheck,
    startSheriffCheck,
    playerKill,
    playerLock,
    playerRestore,
    startDay,
    grantAccess
};