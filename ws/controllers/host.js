const crypto = require('crypto');
const {getRoom,
    updateRoom,
    // createSession,
    getSession,
    //updateSession,
    broadcastRoom,
    // host,
    checkUserConnection,
    sleep,
    onlyHost,
    onlyPlayer
} = require("./common");


const showRoles = onlyHost(async (ws, data, ROOM_ID, room) => {
    await host(ROOM_ID, {type: 'game-roles', players: room.slot, phase: room.game.phase });
})

const teamWins = onlyHost(async (ws, data, ROOM_ID, room) => {
    room.game.phase = 'game-over'
    room = await updateRoom(ROOM_ID, room)
    await broadcastRoom(ROOM_ID, JSON.stringify({type: 'game-over', players: room.slot, team: data.team }));
})

const startSitdown = onlyHost(async (ws, data, ROOM_ID, room) => {
    const mafTeam = Object.fromEntries(
        Object.entries(room.slot)
            .filter(([key, value]) => ['B', 'D'].includes(value.role))
    );
    console.log(mafTeam)
    room.game.phase = 'sitdown';
    room.game.stage = ""
    await updateRoom(ROOM_ID, room)
    await host(ROOM_ID, {type: 'sitdown-started', team: mafTeam});
    await broadcastRoom(ws.roomID,  JSON.stringify({ type: 'game-phase', phase: 'sitdown' }));
    await sleep(300);
    for (const [slot, player] of Object.entries(mafTeam)) {
        if (player.uid !== 'empty') {
            user = clients[player.uid]
            if (user !== undefined) {
                await user.send(JSON.stringify({type: 'mafia-sitdown', team: mafTeam}));
            } else {
                await host(ROOM_ID, {type: 'player-not-ready', slot: slot});
                return
            }
        }
    }
})

const startShooting = onlyHost(async (ws, data, ROOM_ID, room) => {

    room.game.phase = 'shooting';
    room.game.stage = ""
    room = await updateRoom(ROOM_ID, room)
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
    room.game.stage = "shooting-started"
    room = await updateRoom(ws.roomID, room)
    await host(ROOM_ID, {type: 'shooting-started', team: mafTeam});
    await broadcastRoom(ws.roomID,  JSON.stringify({ type: 'game-phase', phase: 'shooting' }));
    await sleep(300);
    for (const [slot, player] of Object.entries(mafTeam)) {
        if (player.uid !== 'empty') {
            user = clients[player.uid]
            if (user !== undefined) {
                await user.send(JSON.stringify({type: 'mafia-shooting', team: mafTeam}));
            } else {
                await host(ROOM_ID, {type: 'player-not-ready', slot: slot});
                return
            }
        }
    }
    setTimeout(async () => {
        room = await getRoom(ws.roomID);
        let curDay = room.game.days["D"+room.game.day]
        let victim = 'none'
        let missed= 'none'
        for (const [maf, shootVictim] of Object.entries(curDay.shoot)) {
            if (shootVictim !== 'none') {
                if (missed === 'none') {
                    victim = shootVictim
                    missed = false
                } else if (victim !== shootVictim) {
                    missed = true
                }
            } else {
                missed = true
                await broadcastRoom(ws.roomID, JSON.stringify({
                    type: 'player-shoot'
                }));
                await host(ROOM_ID, { type: 'mafia-shoot', mafia: maf, victim: 0 });

                await sleep(100);
            }
        }
        if (missed !== true) {
            curDay.victim = victim
        }
        room.game.stage = "shooting-is-over"
        room = await updateRoom(ws.roomID, room)

        await host(ROOM_ID, {type: 'shooting-is-over'});

    }, 3500)
})

const donWatch = onlyHost(async (ws, data, ROOM_ID, room) => {

        room.game.phase = 'don-watch';
        room.game.stage = ""
        room = await updateRoom(ROOM_ID, room)
        const mafTeam = Object.fromEntries(
            Object.entries(room.slot)
                .filter(([key, value]) => ['B', 'D'].includes(value.role))
        );
        await broadcastRoom(ws.roomID,  JSON.stringify({ type: 'game-phase', phase: 'don-watch' }));
        for (const [slot, player] of Object.entries(mafTeam)) {
            if (player.uid !== 'empty' && player.role === 'D') {
                user = clients[player.uid]
                if (user !== undefined) {
                    await user.send(JSON.stringify({type: 'don-watch', team: mafTeam}));
                } else {
                    await host(ROOM_ID, {type: 'player-not-ready', slot: slot});
                    return
                }
            }
        }

})

const startDonCheck = onlyHost(async (ws, data, ROOM_ID, room) => {
    room.game.phase = 'don-check';
    room.game.stage = ""
    room = await updateRoom(ROOM_ID, room)
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
    await broadcastRoom(ws.roomID,  JSON.stringify({ type: 'game-phase', phase: 'don-check' }));
    await sleep(300);
    console.log(364, donSlot)
    if (donSlot>0) {
        player = room.slot[donSlot]

        if (player.uid !== 'empty') {
            user = clients[player.uid]
            if (user !== undefined) {
                console.log(370, donSlot, donTeam)
                await user.send(JSON.stringify({type: 'don-check', team: donTeam}));
            } else {
                await host(ROOM_ID, {type: 'don-not-ready', slot: slot});
                return
            }
        }

    }
})

const startSheriffCheck = onlyHost(async (ws, data, ROOM_ID, room) => {
    room.game.phase = 'sheriff-check';
    room.game.stage = ""
    room = await updateRoom(ROOM_ID, room)
    await broadcastRoom(ws.roomID,  JSON.stringify({ type: 'game-phase', phase: 'sheriff-check' }));
    await sleep(300);
    for (const [slot, player] of Object.entries(room.slot)) {
        if ((player.status === 'alive')
            && (player.role === 'S')
        ) {
            if (player.uid !== 'empty') {
                user = clients[player.uid]
                if (user !== undefined) {
                    sheriffTeam = { [slot]: player };
                    await user.send(JSON.stringify({type: 'sheriff-check', team: sheriffTeam }));
                } else {
                    await host(ROOM_ID, {type: 'sheriff-not-ready', slot: slot});
                    return
                }
                break
            }
        }
    }
})

const sheriffWatch = onlyHost(async (ws, data, ROOM_ID, room) => {

    room.game.phase = 'sheriff-watch';
    room.game.stage = ""
    room = await updateRoom(ROOM_ID, room)
    const sheriff = Object.fromEntries(
        Object.entries(room.slot)
            .filter(([key, value]) => ['S'].includes(value.role))
    );
    await broadcastRoom(ROOM_ID,  JSON.stringify({ type: 'game-phase', phase: 'sheriff-watch' }));
    await sleep(300);
    for (const [slot, player] of Object.entries(sheriff)) {
        if (player.uid !== 'empty' && player.role === 'S') {
            user = clients[player.uid]
            if (user !== undefined) {
                await user.send(JSON.stringify({type: 'sheriff-watch', team: sheriff}));
            } else {
                await host(ROOM_ID, {type: 'sheriff-not-ready', slot: slot});
                return
            }
        }
    }
})

const startDayOne = onlyHost(async (ws, data, ROOM_ID, room) => {

    room.game.phase = 'day'
    room.game.lastSlot = 0
    room.game.day = 1
    room.game.days = {}
    room.game.days["D1"] = { nominees: [], rounds: [], shooters: [], victims: [] }
    room.game.speakers = []
    for (const [slot, player] of Object.entries(room.slot)) {
        player.status = 'alive'
        await broadcastRoom(ROOM_ID,  JSON.stringify({ type: 'player-alive', slot: slot, status: 'alive' }));
    }
    room = await updateRoom(ROOM_ID, room)
    await broadcastRoom(ROOM_ID,  JSON.stringify({ type: 'game-phase', phase: room.game.phase, day: room.game.day }));

})

const startDay = onlyHost(async (ws, data, ROOM_ID, room) => {
    let victim = room.game.days["D"+room.game.day].victim

    room.game.phase = 'day'
    slotReady = false

    room.game.lastSlot = 0
    room.game.day = (room.game.day + 1)
    room.game.days["D"+room.game.day] = { nominees: [], rounds: [], shooters: [], victims: []  }
    room.game.speakers = []

    room = await updateRoom(ROOM_ID, room)
    room = await broadcastRoom(ROOM_ID,  JSON.stringify({ type: 'game-phase', phase: room.game.phase, day: room.game.day }));
    if ((victim !== undefined) && (victim !== 'none')) {
        await host(ROOM_ID, { type: 'last-speech-killed', victim: victim, action: 'killed' });
    }
})

const startNight = onlyHost(async (ws, data, ROOM_ID, room) => {
    room.game.phase = 'night'
    room.game.stage = ""
    for (const [slot, player] of Object.entries(room.slot)) {
        if ((player.mic === 'on') &&  (player.uid !== 'empty')) {
            let user = clients[player.uid]
            if (user !== undefined) {
                await user.send(JSON.stringify({ type: 'mute-mic' }));
            }
        }
        // await sleep(300)
    }
    room = await updateRoom(ROOM_ID, room)
    await broadcastRoom(ROOM_ID,  JSON.stringify({ type: 'game-phase', phase: room.game.phase, night: room.game.day }));

})


// nex voting round preparation
const startVoting = onlyHost(async (ws, data, ROOM_ID, room) => {
// async function startVoting(ws, data) {

    let curDay = "D"+room.game.day
    let curRound = room.game.days[curDay].rounds.length
    let nominees = []
    if (curRound === 0 ) {
        nominees =  room.game.days[curDay].nominees
    } else {
        nominees =  room.game.days[curDay].rounds[curRound-1].winners
    }

    if ((nominees.length === 0)
        || (nominees.length === 1 && curDay==="D1")
    ) {
        await host(ROOM_ID, { type: 'ready-to-night' });
    } else {
        let round = {
            nominees: nominees,
            next: 0,
            voted: []
        }
        room.game.days[curDay].rounds.push(round)
        room.game.stage = "voting"
        roomState = await updateRoom(ROOM_ID, room)
        console.log("WS 354", roomState.game.days[curDay].rounds)
        nominees =  roomState.game.days[curDay].rounds[curRound].nominees
        await broadcastRoom(ROOM_ID, JSON.stringify({ type: 'start-voting', nominees: nominees }));
        await host(ROOM_ID, { type: 'voting-round-ready', round: 0, candidate: nominees[0] });
    }
})

const startVotingRound = onlyHost(async (ws, data, ROOM_ID, room) => {
// async function startVotingRound(ws, data) {

        let curDay = "D"+room.game.day
        let rounds =  room.game.days[curDay].rounds
        let roundN = Object.keys(rounds).length - 1
        let curRound = rounds[roundN]
        let candidateSlot = curRound.nominees[curRound.next]

        if (candidateSlot === curRound.nominees.at(-1)) {
            // The last candidate receives all the votes from players who have not yet voted
            let votes = []
            for (const [slot, player] of Object.entries(room.slot)) {
                if ((!curRound.voted.includes(slot))
                    && (player.status === 'alive')
                ) {
                    votes.push(slot)
                    curRound.voted.push(slot)
                    await broadcastRoom(ROOM_ID, JSON.stringify({
                        type: 'player-vote',
                        player: slot,
                        candidate: candidateSlot
                    }));
                }
            }
            curRound['V'+curRound.next] = {
                state: 'END',
                slot: candidateSlot,
                votes: votes
            }
            room = await updateRoom(ROOM_ID, room)

            await broadcastRoom(ws.roomID, JSON.stringify({
                type: 'voting-round-result',
                round: (roundN + 1),
                candidate: candidateSlot,
                votes: room.game.days[curDay].rounds[roundN]['V' + (curRound.next)].votes
            }));
            // Let's find out who gets the most votes
            let maxVotes = 0
            // Object.keys(curRound).forEach(([key, value]) => {
            for (const [key, value] of Object.entries(curRound)) {
                // console.log('574', key)
                if (key.startsWith('V')) {
                    // console.log('576', key)
                    if ((value.votes.length > 0)
                        && (value.votes.length >= maxVotes)) {
                        if (value.votes.length === maxVotes) {
                            curRound.winners.push(value.slot)
                        } else {
                            curRound.winners = [value.slot]
                            maxVotes = value.votes.length
                        }
                    }
                    // console.log(value)
                }
            };
            room.game.days[curDay].rounds[roundN] = curRound
            room = await updateRoom(ROOM_ID, room)
            curRound = room.game.days[curDay].rounds[roundN]
            if (curRound.winners.length === 1) {
                // one player has been voted out
                await host(ROOM_ID, { type: 'last-speech-voted', candidate: curRound.winners[0], action: 'voted' });
            } else {
                if (
                    (roundN === 0) ||
                    ((roundN > 0) &&
                    (curRound.winners.length < room.game.days[curDay].rounds[roundN - 1].winners.length))
                ) {
                    curRound.split = []
                    room.game.days[curDay].rounds[roundN] = curRound
                    room = await updateRoom(ROOM_ID, room)
                    curRound = room.game.days[curDay].rounds[roundN]
                    await host(ROOM_ID, { type: 'split-speech', winners: curRound.winners, split: curRound.split });
                } else {
                    await host(ROOM_ID, { type: 'lock-all-winners', winners: curRound.winners, split: curRound.split });
                }
            }
        } else {
            curRound['V'+curRound.next] = {
                state: 'START',
                slot: candidateSlot,
                votes: []
            }

            room.game.days[curDay].rounds[roundN] = curRound


            room = await updateRoom(ws.roomID, room)
            await broadcastRoom(ws.roomID, JSON.stringify({
                type: 'voting-round',
                round: (roundN+1),
                candidate: candidateSlot,
                voted: curRound.voted
            }));
            setTimeout(async () => {
                room = await getRoom(ws.roomID);
                room.game.days[curDay].rounds[roundN]['V'+curRound.next].state = 'END'
                room.game.days[curDay].rounds[roundN].next++
                room = await updateRoom(ws.roomID, room)
                // console.log('WS 398', curRound, ' | ', room.game.days[curDay].rounds)
                nextCandidate = room.game.days[curDay].rounds[roundN].nominees[room.game.days[curDay].rounds[roundN].next]
                if (nextCandidate !== undefined) {
                    await broadcastRoom(ws.roomID, JSON.stringify({
                        type: 'voting-round-result',
                        round: (roundN + 1),
                        candidate: candidateSlot,
                        votes: room.game.days[curDay].rounds[roundN]['V' + (curRound.next)].votes
                    }));
                    nextCandidate = room.game.days[curDay].rounds[roundN].nominees[room.game.days[curDay].rounds[roundN].next]
                    if (nextCandidate !== undefined) {
                        await host(ROOM_ID, {
                            type: 'voting-round-ready',
                            round: roundN,
                            candidate: nextCandidate
                        });
                    }
                } else {
                    await broadcastRoom(ws.roomID, JSON.stringify({
                        type: 'voting-round-result',
                        round: (roundN + 1),
                        candidate: candidateSlot,
                        votes: room.game.days[curDay].rounds[roundN]['V' + (curRound.next)].votes
                    }));
                }

            }, 5000)
        }



})

const lockWinners = onlyHost(async (ws, data, ROOM_ID, room) => {
// async function lockWinners(ws, data) {

        let curDay = "D"+room.game.day
        let rounds =  room.game.days[curDay].rounds
        let roundN = Object.keys(rounds).length - 1
        let curRound = rounds[roundN]


            curRound['lock-winners'] = {
                state: 'START',
                votes: []
            }
            room.game.days[curDay].rounds[roundN] = curRound
            room = await updateRoom(ROOM_ID, room)
            await broadcastRoom(ROOM_ID, JSON.stringify({
                type: 'lock-winners-vote',
                winners: curRound.winners
            }));
            setTimeout(async () => {
                room = await getRoom(ROOM_ID);
                room.game.days[curDay].rounds[roundN]['lock-winners'].state = 'END'
                room = await updateRoom(ROOM_ID, room)
                curRound = room.game.days[curDay].rounds[roundN]
                alivePlayers = 0
                for (const [slot, player] of Object.entries(room.slot)) {
                    if (player.status === 'alive') {
                        alivePlayers++
                    }
                }
                lockBoth = (curRound['lock-winners'].votes.length > (alivePlayers/2))
                if (lockBoth) {
                    await host(ROOM_ID, { type: 'last-speech-voted', candidate: curRound.winners[0], action: 'voted' });

                } else {
                    await host(ROOM_ID, { type: 'ready-to-night' });
                }

            }, 5000)
})

const nextSpeaker = onlyHost(async (ws, data, ROOM_ID, room) => {
// async function nextSpeaker(ws, data) {

        let activeSpeaker = 0;
        let duration = 60
        let lastAlive = 0;
        let curDay = "D"+room.game.day
        if (room.game.phase === 'day') {
            for (const [slot, player] of Object.entries(room.slot)) {
                if ((activeSpeaker === 0)
                    && (player.status === 'alive')
                    && (Number(slot) >= Number(room.game.day))
                    && (Number(slot) >= Number(room.game.lastSlot))
                    && (!room.game.speakers.includes(slot))
                ) {
                    activeSpeaker = slot
                    if ((player.warn === 3) && (player.skip === undefined)) {
                        duration = 10
                        player.skip = true
                    }
                    if (room.game.speakers.length === 0) {
                        room.game.lastSlot = slot
                    }
                    room.game.speakers.push(slot)

                    if ((player.mic === 'off') &&  (player.uid !== 'empty')) {
                        let user = clients[player.uid]
                        if ((user !== undefined) && (duration===60)) {
                            await user.send(JSON.stringify({ type: 'unmute-mic' }));
                        }
                    }
                    // console.log('slot', slot, 'player.status', player.status, 'room.game.day', room.game.day, 'room.game.lastSlot', room.game.lastSlot, 'room.game.speakers', room.game.speakers)

                } else {
                    if (player.mic === 'on') {
                        console.log('789:', slot)
                    }

                    if ((player.mic === 'on')
                        &&  (player.uid !== 'empty')
                        &&  ((player.so.length === 0) || (player.so[0].end <= Date.now()))
                    ) {
                        let user = clients[player.uid]
                        if (user !== undefined) {
                            await user.send(JSON.stringify({ type: 'mute-mic' }));
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
                        if ((player.warn === 3) && (player.skip === undefined)) {
                            duration = 10
                            player.skip = true
                        }
                        room.game.lastSlot = slot

                        room.game.speakers.push(slot)

                        if ((player.mic === 'off') &&  (player.uid !== 'empty')) {
                            let user = clients[player.uid]
                            if ((user !== undefined) && (duration===60)) {
                                await user.send(JSON.stringify({ type: 'unmute-mic' }));
                            }
                        }


                    } else {
                        if (player.status === 'alive') {
                            if ((player.mic === 'on')
                                &&  (player.uid !== 'empty')
                                &&  ((player.so.length === 0) || (player.so[0].end <= Date.now()))
                            ) {
                                let user = clients[player.uid]
                                if (user !== undefined) {
                                    await user.send(JSON.stringify({ type: 'mute-mic' }));
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
            room.game.days[curDay].currentSpeakerStart = Date.now()
            room.game.days[curDay].currentSpeakerEnd = room.game.days[curDay].currentSpeakerStart + (duration * 1000)
            room = await updateRoom(ROOM_ID, room)
            await broadcastRoom(ROOM_ID,  JSON.stringify({ type: 'active-speaker', slot: room.game.days[curDay].currentSpeaker, duration: duration }));
        } else {
            for (const [slot, player] of Object.entries(room.slot)) {
                if ((player.mic === 'on')
                    &&  (player.uid !== 'empty')
                    &&  ((player.so.length === 0) || (player.so[0].end <= Date.now()))
                ) {
                    let user = clients[player.uid]
                    if (user !== undefined) {
                        await user.send(JSON.stringify({ type: 'mute-mic' }));
                    }
                }
            }
            await broadcastRoom(ROOM_ID,  JSON.stringify({ type: 'active-speaker', slot: 0, duration: 0 }));


            if (room.game.days[curDay].victims.length === 0) {
                let nominees =  room.game.days[curDay].nominees
                await host(ROOM_ID, { type: 'ready-to-vote', nominees: nominees });
            } else {
                await host(ROOM_ID, { type: 'ready-to-night' });
            }

        }
})

const lastSpeech = onlyHost(async (ws, data, ROOM_ID, room) => {

        for (const [slot, player] of Object.entries(room.slot)) {
            if (player.status === 'alive') {
                if ((player.mic === 'on')
                    &&  (player.uid !== 'empty')
                    &&  (Number(slot) !== Number(data.candidate))
                ) {
                    let user = clients[player.uid]
                    if (user !== undefined) {
                        await user.send(JSON.stringify({ type: 'mute-mic' }));
                    }
                } else if ((player.mic === 'off')
                // if ((player.mic === 'off')
                    &&  (player.uid !== 'empty')
                    &&  (Number(slot) === Number(data.candidate))
                ) {
                    let user = clients[player.uid]
                    if (user !== undefined) {
                        await user.send(JSON.stringify({type: 'unmute-mic'}));
                    }
                }

            }
        }
        await broadcastRoom(ws.roomID,  JSON.stringify({ type: 'active-speaker', slot: data.candidate, duration: 60, "action": data.action }));
})

const defenseSpeech = onlyHost(async (ws, data, ROOM_ID, room) => {

        // player = room.slot[data.candidate]
        for (const [slot, player] of Object.entries(room.slot)) {
            if (player.status === 'alive') {
                if ((player.mic === 'on')
                    &&  (player.uid !== 'empty')
                    &&  (Number(slot) !== Number(data.candidate))
                ) {
                    let user = clients[player.uid]
                    if (user !== undefined) {
                        await user.send(JSON.stringify({ type: 'mute-mic' }));
                    }
                } else if ((player.mic === 'off')
                    &&  (player.uid !== 'empty')
                    &&  (Number(slot) === Number(data.candidate))
                ) {
                    let user = clients[player.uid]
                    if (user !== undefined) {
                        await user.send(JSON.stringify({type: 'unmute-mic'}));
                    }
                }

            }
        }
        await broadcastRoom(ws.roomID,  JSON.stringify({ type: 'active-speaker', slot: data.candidate, duration: 30, "action": 'defense' }));
        let curDay = "D"+room.game.day
        let rounds =  room.game.days[curDay].rounds
        let roundN = Object.keys(rounds).length - 1
        let curRound = rounds[roundN]
        curRound.split.push(data.candidate)
        room.game.days[curDay].rounds[roundN] = curRound
        room.game.stage = "defense-speech"
        room = await updateRoom(ws.roomID, room)
        curRound = room.game.days[curDay].rounds[roundN]
        await host(ROOM_ID, { type: 'split-speech', winners: curRound.winners, split: curRound.split });
})

const warnAdd = onlyHost(async (ws, data, ROOM_ID, room) => {

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
            let curDay = "D" + room.game.day
            room.game.days[curDay].victims[data.slot] = data.slot
        }
        room = await updateRoom(ws.roomID, room)
        warn = room.slot[data.slot].warn
        await broadcastRoom(ws.roomID, JSON.stringify({
            type: 'player-warn',
            slot: data.slot,
            warn: warn,
            status: player.status
        }));
        if (player.status === 'disqualified') {
            await checkGameOver(room, ROOM_ID)
        }
    }
})

const playerKill = onlyHost(async (ws, data, ROOM_ID, room) => {

    let player = room.slot[data.slot]
    if (player.status === 'alive') {
        player.status = 'killed'
        room = await updateRoom(ws.roomID, room)
        player = room.slot[data.slot]
        await broadcastRoom(ws.roomID,  JSON.stringify({ type: 'player-kill', slot: data.slot, status: player.status }));
        await checkGameOver(room, ROOM_ID)
    }
})

async function checkGameOver(room, ROOM_ID) {

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
        host(ROOM_ID, { type: 'team-wins', team: 'red' });
    }
    if ((redTeam.length === blackTeam.length) && (blackTeam.length > 0)) {
        host(ROOM_ID, { type: 'team-wins', team: 'black' });
    }

}

const playerLock = onlyHost(async (ws, data, ROOM_ID, room) => {
    let curDay = "D"+room.game.day
    let rounds =  room.game.days[curDay].rounds
    let roundN = Object.keys(rounds).length - 1
    let curRound = rounds[roundN]

    let player = room.slot[data.slot]
    if (player.status === 'alive') {
        player.status = 'locked'

        if ((player.mic === 'on')
            &&  (player.uid !== 'empty')
        ) {
            let user = clients[player.uid]
            if (user !== undefined) {
                await user.send(JSON.stringify({ type: 'mute-mic' }));
            }
        }

        room = await updateRoom(ws.roomID, room)
        player = room.slot[data.slot]
        await broadcastRoom(ws.roomID,  JSON.stringify({ type: 'player-lock', slot: data.slot, status: player.status }));
        if ((curRound !== undefined) && curRound.hasOwnProperty('winners') && (curRound.winners !== undefined)) {
            if (Number(curRound.winners[curRound.winners.length - 1]) === Number(data.slot)) {
                await host(ROOM_ID, { type: 'ready-to-night' });
                await checkGameOver(room, ROOM_ID)
            } else {
                winner = curRound.winners.indexOf(data.slot)
                console.log(809, winner)
                if (winner >= 0) {
                    await host(ROOM_ID, { type: 'last-speech-voted', candidate: curRound.winners[winner+1], action: 'voted' });
                }
            }
        } else {
            await checkGameOver(room, ROOM_ID)
        }
    }
})

const playerRestore = onlyHost(async (ws, data, ROOM_ID, room) => {
    let player = room.slot[data.slot]
    if ((player.status === 'killed') || (player.status === 'locked')) {
        player.status = 'alive'
        room = await updateRoom(ws.roomID, room)
        player = room.slot[data.slot]
        await broadcastRoom(ws.roomID,  JSON.stringify({ type: 'player-alive', slot: data.slot, status: player.status }));
    }
})

const warnRemove = onlyHost(async (ws, data, ROOM_ID, room) => {
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
        await broadcastRoom(ws.roomID,  JSON.stringify({ type: 'player-warn', slot: data.slot, warn: warn, status: player.status }));
    }
})

const nominate = onlyHost(async (ws, data, ROOM_ID, room) => {
    let player = room.slot[data.slot]
    let curDay = "D"+room.game.day
    let nominees =  room.game.days[curDay].nominees
    if (player.status === 'alive') {
        if (nominees.includes(data.slot)) {
            nominees = nominees.filter(slot => slot !== data.slot);
        } else {
            nominees.push(data.slot)
        }
        room.game.days[curDay].nominees = nominees
        room = await updateRoom(ws.roomID, room)
        nominees = room.game.days[curDay].nominees
        await broadcastRoom(ws.roomID,  JSON.stringify({ type: 'nominees', nominees: nominees }));
    }
})

const gameSettings = onlyHost(async (ws, data, ROOM_ID, room) => {
    const settings = data.settings
    console.log('settings:', settings)
    if (!settings?.password) {
        room.game.settings.password = false
    } else if (settings.password.trim() === '') {
        room.game.settings.password = false
    } else {
        room.game.settings.password = crypto.createHash('md5').update(settings.password).digest('hex').substring(0, 8);
    }
    room.game.settings.registeredOnly = (settings?.registeredOnly === true)
    await updateRoom(ws.roomID, room)

})

const gameStart = onlyHost(async (ws, data, ROOM_ID, room) => {
    ready = true;
    for (const [slot, player] of Object.entries(room.slot)) {
        room.slot[slot].slot = 'none';
        room.slot[slot].role = 'none';
        room.slot[slot].warn = false;
        room.slot[slot].so = [];
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
                await user.send(JSON.stringify({ type: 'mute-mic' }));
            } else {
                player.mic === 'off'
                room.slot[slot].uid = 'empty';
                console.log('Note ready (mic): ',slot,player)
                ready = false
            }
        }
    }

    room = await updateRoom(ROOM_ID, room)
    if (!ready) {
        await host(ROOM_ID, { type: 'error', message: "Some users are not ready yet..." });
        await host(ROOM_ID, { type: 'mainButton', message: "game-start" });
        return;
    }

    await broadcastRoom(ROOM_ID,  JSON.stringify({ type: 'game-start' }));

    room.game.phase = 'shuffle';
    room.game.stage = "shuffle-slots"
    room.game.availableSlots = [1,2,3,4,5,6,7,8,9,10]
    room = await updateRoom(ROOM_ID, room);

    await broadcastRoom(ROOM_ID,  JSON.stringify({ type: 'game-phase', phase: 'shuffle', stage: "shuffle-slots" }));

    for (let i= 1; i<=10; i++) {
        roomState = await getRoom(ROOM_ID)
        if (i>1) {
            prevPlayer = roomState.slot[i-1]
            if (prevPlayer.slot === 'none') {
                prevPlayer.slot = 'any'
                roomState.slot[i-1] = prevPlayer;
                roomState = await updateRoom(ROOM_ID, roomState)
                let prevUser = clients[prevPlayer.uid]
                if (prevUser !== undefined) {
                    await prevUser.send(JSON.stringify({ type: 'game-phase', phase: 'shuffle', stage: "shuffle-slots" }));
                }
            }
        }

        curPlayer = roomState.slot[i]
        sleepTime = 300; // skip empty slots
        if ((roomState.game.phase === 'shuffle')
            && (curPlayer.slot === 'none')) {
            user = clients[curPlayer.uid]
            if (user !== undefined) {
                sleepTime = 5000
                await user.send(JSON.stringify({ type: 'select-slot', slots: roomState.game.availableSlots }));
            }

        }
        await broadcastRoom(ROOM_ID,  JSON.stringify({ type: 'game-phase-slot', slot: i }));
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
        console.log(968, correctOrder)
        roomState.slot = correctOrder;
    }
    roomState = await updateRoom(ws.roomID, roomState)
    await broadcastRoom(ws.roomID,JSON.stringify({ type: 'game-order', slots: roomState.slot }));
    await host(ROOM_ID, { type: 'shuffle-roles-ready' });
})

const shuffleRoles = onlyHost(async (ws, data, ROOM_ID, room) => {

        ready = true;
        room.game.availableRoles = shuffleArray(['R','D','B','S','R','B','R','R','R','R']);
        room.game.availableCards = [1,2,3,4,5,6,7,8,9,10];
        room.game.stage = "shuffle-roles"
        room = await updateRoom(ROOM_ID, room)
        await broadcastRoom(ROOM_ID,  JSON.stringify({ type: 'shuffle-roles' }));

        for (let i= 1; i<=10; i++) {
            roomState = await getRoom(ROOM_ID)
            if (i>1) {
                prevPlayer = roomState.slot[i-1]
                if (prevPlayer.role === 'none') {
                    roomState.slot[i-1].role = roomState.game.availableRoles.shift()
                    let cardId = roomState.game.availableCards.shift()
                    console.log('350 :', roomState.game.availableRoles)
                    roomState = await updateRoom(ROOM_ID, roomState)
                    let prevUser = clients[prevPlayer.uid]
                    if (prevUser !== undefined) {
                        await prevUser.send(JSON.stringify({ type: 'game-role', role: roomState.slot[i-1].role }));
                        await prevUser.send(JSON.stringify({ type: 'game-phase', phase: 'shuffle', stage: "shuffle-roles"  }));
                    }
                    await broadcastRoom(ROOM_ID,  JSON.stringify({ type: 'game-role-taken', card: cardId }));
                }
            }

            await broadcastRoom(ROOM_ID,  JSON.stringify({ type: 'game-phase-role', slot: i }));
            if (i===10) {
                curPlayer = roomState.slot[i]
                sleepTime = 300; // skip empty slots
                if ((roomState.game.phase === 'shuffle')
                    && (curPlayer.role === 'none')) {
                    // curPlayer.role = roomState.game.availableRoles.shift()
                    roomState.slot[i].role = roomState.game.availableRoles.shift()
                    let cardId = roomState.game.availableCards.shift()
                    roomState = await updateRoom(ROOM_ID, roomState)
                    curPlayer = roomState.slot[i]
                    user = clients[curPlayer.uid]
                    if (user !== undefined) {
                        await user.send(JSON.stringify({ type: 'game-role', role: roomState.slot[i].role }));
                        await user.send(JSON.stringify({ type: 'game-phase', phase: 'shuffle', stage: "shuffle-roles"  }));
                    }
                    await broadcastRoom(ROOM_ID,  JSON.stringify({ type: 'game-role-taken', card: cardId }));
                }
            } else {

                curPlayer = roomState.slot[i]
                sleepTime = 300; // skip empty slots
                if ((roomState.game.phase === 'shuffle')
                    && (curPlayer.role === 'none')) {
                    user = clients[curPlayer.uid]
                    if (user !== undefined) {
                        sleepTime = 5000
                        await user.send(JSON.stringify({ type: 'select-role' }));
                    }

                }

                await sleep(sleepTime);
            }
        }
        //await sleep(3000);
        roomState = await getRoom(ROOM_ID)
        if (roomState.game.availableRoles.length > 0) {
            for (let i= 1; i<=10; i++) {
            // for (const [slot, player] of Object.entries(roomState.slot)) {
                let player = roomState.slot[i];
                if ((player.role === 'none') && (roomState.game.availableRoles.length > 0)) {
                    roomState.slot[i].role = roomState.game.availableRoles.shift()
                    let cardId = roomState.game.availableCards.shift()
                    roomState = await updateRoom(ROOM_ID, roomState)
                    user = clients[player.uid]
                    if (user !== undefined) {
                        await user.send(JSON.stringify({ type: 'game-role', role: roomState.slot[i].role }));
                        await user.send(JSON.stringify({ type: 'game-phase', phase: 'shuffle', stage: "shuffle-roles"  }));
                    }

                    await broadcastRoom(ROOM_ID,  JSON.stringify({ type: 'game-role-taken', card: cardId }));
                }
            }
        }

        roomState = await updateRoom(ROOM_ID, roomState)
        await host(ROOM_ID, { type: 'roles-ready' });
        await broadcastRoom(ROOM_ID,JSON.stringify({ type: 'game-ready', slots: roomState.slot }));
})
function shuffleArray(array) {
    if (array.length > 1) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]]; // Swap elements
        }
    }
    return array;
}

const gameStop = onlyHost(async (ws, data, ROOM_ID, room) => {

    room.game.phase = 'lobby';
    room.game.stage = ""
    for (const [slot, player] of Object.entries(room.slot)) {
        room.slot[slot].slot = 'none';
        room.slot[slot].role = 'none';
        room.slot[slot].status = 'unknown';
        room.slot[slot].mic === 'off';

        await broadcastRoom(ws.roomID,  JSON.stringify({ type: 'game-player-status', uid: player.uid, status: 'unknown' }));
    }
    room.game.lastSlot = 0
    room.game.day = 0
    room.game.days = {}
    room.game.speakers = []
    room = await updateRoom(ws.roomID, room)
    await broadcastRoom(ws.roomID,  JSON.stringify({ type: 'game-phase', phase: room.game.phase }));

})

function addExports(exports) {
    for (const key in module.exports) {
        if (!exports.hasOwnProperty(key) && (key !== 'addExports')) {
            exports[key] = module.exports[key];
        }
    }
    return exports
}

module.exports = {
    gameStart,
    shuffleRoles,
    gameStop,
    showRoles,
    startSitdown,
    gameSettings,
    donWatch,
    sheriffWatch,
    startDayOne,
    nextSpeaker,
    warnAdd,
    warnRemove,
    nominate,
    startVoting,
    startVotingRound,
    lockWinners,
    startNight,
    startShooting,
    startDonCheck,
    startSheriffCheck,
    playerKill,
    playerLock,
    playerRestore,
    startDay,
    lastSpeech,
    defenseSpeech,
    teamWins,
    addExports
};