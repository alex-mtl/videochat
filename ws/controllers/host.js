const { storeGameResult } = require('../services/gameStorage');
const { timeoutManager } = require('../services/timeoutManager');

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
    onlyPlayer, mafiaHome
} = require("./common");


const showRoles = onlyHost(async (ws, data, ROOM_ID, room) => {
    await host(ROOM_ID, {type: 'game-roles', players: room.slot, phase: room.game.phase });
})

const teamWins = onlyHost(async (ws, data, ROOM_ID, room) => {
    room.game.phase = 'game-over'
    room.game.result = {team: data.team}
    room = await updateRoom(ROOM_ID, room)
    await broadcastRoom(ROOM_ID, JSON.stringify({type: 'game-over', players: room.slot, team: data.team }));
    const rID = ws.uid+'-'+crypto.randomBytes(4).toString('hex');
    await storeGameResult(rID, 'mafia', room);
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
    if(room.game.settings.autohost !== true) {
        await host(ROOM_ID, {type: 'sitdown-started', team: mafTeam});
    }
    await broadcastRoom(ws.roomID,  JSON.stringify({ type: 'game-phase', phase: 'sitdown' }));
    await sleep(300);
    for (const [slot, player] of Object.entries(mafTeam)) {
        if (player.uid !== 'empty') {
            user = clients[player.uid]
            if (user !== undefined) {
                await user.send(JSON.stringify({type: 'mafia-sitdown', team: mafTeam}));
            } else {
                if(room.game.settings.autohost !== true) {
                    await host(ROOM_ID, {type: 'player-not-ready', slot: slot});
                    return
                }
            }
        }
    }
    // console.log('Sitdown 57', data)
    if(room.game.settings.autohost === true) {
        setTimeout(async () => {
            data.type = 'don-watch'
            ws.tHost = true
                // console.log('Sitdown 62', data)
            donWatch(ws, data, ROOM_ID, room)
        }
        , 62000 ) //62 sec
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
    console.log('Mafs alive to shoot:',JSON.stringify(mafTeam, null, 2))
    console.log(JSON.stringify(shootingTemplate, null, 2))

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
    const day = "D"+room.game.day
    setTimeout(async () => {
        room = await getRoom(ws.roomID);
        let curDay = room.game.days[day]
        let victim = 'none'
        let missed= 'none'
        let shots = 0
        for (const [maf, shootVictim] of Object.entries(curDay.shoot)) {
            shots++
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
        if (missed !== true && shots === Object.keys(mafTeam).length) {
            room.game.days[day].victim = victim
        }
        room.game.stage = "shooting-is-over"
        room = await updateRoom(ws.roomID, room)

        if(room.game.settings.autohost === true) {
            setTimeout(async () => {
                    data.type = 'start-don-check'
                    ws.tHost = true
                    await startDonCheck(ws, data, ROOM_ID, room)
                }
                , 500 ) //5 sec
        } else {
            await host(ROOM_ID, {type: 'shooting-is-over'});
        }


    }, 3500)
})

const donWatch = onlyHost(async (ws, data, ROOM_ID, room) => {
    console.log(data)
        room.game.phase = 'don-watch';
        room.game.stage = ""
        room = await updateRoom(ROOM_ID, room)
        const mafTeam = Object.fromEntries(
            Object.entries(room.slot)
                .filter(([key, value]) => ['B', 'D'].includes(value.role))
        );
        await broadcastRoom(ws.roomID,  JSON.stringify({ type: 'game-phase', phase: 'don-watch', duration: 5 }));
        for (const [slot, player] of Object.entries(mafTeam)) {
            if (player.uid !== 'empty' && player.role === 'D') {
                user = clients[player.uid]
                if (user !== undefined) {
                    await user.send(JSON.stringify({type: 'don-watch', team: mafTeam, duration: 5 }));
                } else {
                    if(room.game.settings.autohost !== true) {
                        await host(ROOM_ID, {type: 'player-not-ready', slot: slot});
                        return
                    }
                }
            }
        }
    // console.log(data)
        console.log('Don watch 160')
        if(room.game.settings.autohost === true) {
            setTimeout(async () => {
                    console.log(data)
                    data.type = 'sheriff-watch'
                    ws.tHost = true
                    sheriffWatch(ws, data, ROOM_ID, room)
                }
                , 5000 ) //5 sec
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

    const donChecks = Object.values(room.game.days).reduce((acc, day) => {
        if (Object.keys(day.donCheck).length > 0) {
            Object.assign(acc, day.donCheck);
        }
        return acc;
    }, {});
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

    console.log(364, donSlot)
    if (donSlot>0) {
        player = room.slot[donSlot]

        if (player.uid !== 'empty') {
            user = clients[player.uid]
            if (user !== undefined) {
                console.log(370, donSlot, donTeam)
                await user.send(JSON.stringify({type: 'don-check', team: donTeam, donChecks}));
            } else {
                await host(ROOM_ID, {type: 'don-not-ready', slot: slot});
                return
            }
        }

    }
    if(room.game.settings.autohost === true) {
        setTimeout(async () => {
                console.log(data)
                data.type = 'sheriff-check'
                ws.tHost = true
                startSheriffCheck(ws, data, ROOM_ID, room)
            }
            , 11000 )
    }
})

const startSheriffCheck = onlyHost(async (ws, data, ROOM_ID, room) => {
    room.game.phase = 'sheriff-check';
    room.game.stage = ""
    room = await updateRoom(ROOM_ID, room)
    await broadcastRoom(ws.roomID,  JSON.stringify({ type: 'game-phase', phase: 'sheriff-check' }));
    // await sleep(300);
    const sheriffChecks = Object.values(room.game.days).reduce((acc, day) => {
        if (Object.keys(day.sheriffCheck).length > 0) {
            Object.assign(acc, day.sheriffCheck);
        }
        return acc;
    }, {});

    for (const [slot, player] of Object.entries(room.slot)) {
        if ((player.status === 'alive')
            && (player.role === 'S')
        ) {
            if (player.uid !== 'empty') {
                user = clients[player.uid]
                if (user !== undefined) {
                    sheriffTeam = { [slot]: player };
                    await user.send(JSON.stringify({type: 'sheriff-check', team: sheriffTeam, sheriffChecks }));
                    // setTimeout(async () => {
                    //     room = await getRoom(ROOM_ID);
                    //     if (room.game.phase === 'sheriff-check') {
                    //
                    //         await startDay(ws, {type: 'start-day'});
                    //     }
                    // }, 7000)
                } else {
                    if(room.game.settings.autohost !== true) {
                        await host(ROOM_ID, {type: 'sheriff-not-ready', slot: slot});
                        return
                    }
                }
                break
            }
        }
    }
    if(room.game.settings.autohost === true) {
        setTimeout(async () => {
                data.type = 'start-day'
                ws.tHost = true
                await startDay(ws, data, ROOM_ID, room)

            }
            , 11000 ) //5 sec
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
                if(room.game.settings.autohost !== true) {
                    await host(ROOM_ID, {type: 'sheriff-not-ready', slot: slot});
                    return
                }
            }
        }
    }
    if(room.game.settings.autohost === true) {
        setTimeout(async () => {
                data.type = 'sheriff-watch'
                ws.tHost = true
                startDayOne(ws, data, ROOM_ID, room)
            }
            , 5000 ) //5 sec
    }
})

const startDayOne = onlyHost(async (ws, data, ROOM_ID, room) => {

    room.game.phase = 'day'
    room.game.lastSlot = 0
    room.game.day = 1
    room.game.days = {}
    room.game.days["D1"] = { nominees: [], rounds: [], shooters: [], victims: [], accusers: {}, donCheck: {}, sheriffCheck: {} }
    room.game.speakers = []
    for (const [slot, player] of Object.entries(room.slot)) {
        player.status = 'alive'
        await broadcastRoom(ROOM_ID,  JSON.stringify({ type: 'player-alive', slot: slot, status: 'alive' }));
        await mafiaHome(JSON.stringify({ type: 'game-player-status', roomID: ROOM_ID, slot: slot, status: 'alive' }));
    }
    room = await updateRoom(ROOM_ID, room)
    await broadcastRoom(ROOM_ID,  JSON.stringify({ type: 'game-phase', phase: room.game.phase, day: room.game.day }));
    console.log('Start Day One',timeoutManager.getAll())
    timeoutManager.clearAll()

    if(room.game.settings.autohost === true) {

        setTimeout(async () => {
            data.type = 'next-speaker'
            ws.tHost = true
                console.log('host 349 >> next speaker`')
            nextSpeaker(ws, data, ROOM_ID, room)
        }
        , 500 )
    }
})

const startDay = onlyHost(async (ws, data, ROOM_ID, room) => {
    let victim = room.game.days["D"+room.game.day].victim

    room.game.phase = 'day'
    slotReady = false

    room.game.lastSlot = 0
    room.game.day = (room.game.day + 1)
    room.game.days["D"+room.game.day] = { nominees: [], rounds: [], shooters: [], victims: [], accusers: {}, donCheck: {}, sheriffCheck: {} }
    room.game.speakers = []

    room = await updateRoom(ROOM_ID, room)

    await broadcastRoom(ROOM_ID,  JSON.stringify({ type: 'game-phase', phase: room.game.phase, day: room.game.day, debug: '366' }));

    if(room.game.settings.autohost === true) {
        setTimeout(async () => {
            if (victim && (victim !== undefined) && (victim !== 'none')) {
                data.type = 'last-speech'
                data.candidate = victim
                data.action = 'killed'
                ws.tHost = true
                await broadcastRoom(ROOM_ID,  JSON.stringify({ type: 'debug', data: 'startDay 375' }));
                await lastSpeech(ws, data, ROOM_ID, room)
            } else {
                data.type = 'next-speaker'
                ws.tHost = true
                console.log('host 383 >> next speaker`')
                await nextSpeaker(ws, data, ROOM_ID, room)
            }
        }, 500 )
    } else {
        if (victim && (victim !== undefined) && (victim !== 'none')) {
            await host(ROOM_ID, { type: 'last-speech-killed', victim: victim, action: 'killed' });
        }
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
    if(room.game.settings.autohost === true && room.game.day > 0) {
        setTimeout(async () => {
                data.type = 'start-shooting'
                ws.tHost = true
                await startShooting(ws, data, ROOM_ID, room)
            }
            , 500 )
    }

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
        if(room.game.settings.autohost === true) {

            setTimeout(async () => {
                    data.type = 'start-night'
                    ws.tHost = true
                    startNight(ws, data, ROOM_ID, room)
                }
                , 500 )
        } else {
            await host(ROOM_ID, {type: 'ready-to-night'});
        }

    } else {
        let round = {
            nominees: nominees,
            next: 0,
            voted: []
        }
        room.game.days[curDay].rounds.push(round)
        room.game.stage = "voting"
        room = await updateRoom(ROOM_ID, room)
        // console.log("WS 354", roomState.game.days[curDay].rounds)
        nominees =  room.game.days[curDay].rounds[curRound].nominees
        await broadcastRoom(ROOM_ID, JSON.stringify({ type: 'start-voting', nominees: nominees }));
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
        if(room.game.settings.autohost === true) {

            setTimeout(async () => {
                    data.type = 'start-voting-round'
                    ws.tHost = true
                    startVotingRound(ws, data, ROOM_ID, room)
                }
                , 3000 )
        } else {
            await host(ROOM_ID, { type: 'voting-round-ready', round: 0, candidate: nominees[0] });
        }

    }
})

const startVotingRound = onlyHost(async (ws, data, ROOM_ID, room) => {
// async function startVotingRound(ws, data) {

    let curDay = "D" + room.game.day
    let rounds = room.game.days[curDay].rounds
    let roundN = Object.keys(rounds).length - 1
    let curRound = rounds[roundN]
    let candidateSlot = curRound.nominees[curRound.next]

    let remainingVoters = Object.entries(room.slot).filter(([slot, player]) =>
        (!curRound.voted.includes(slot)) && (player.status === 'alive')
    );

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
        curRound['V' + curRound.next] = {
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
        }
        ;
        room.game.days[curDay].rounds[roundN] = curRound
        room = await updateRoom(ROOM_ID, room)
        curRound = room.game.days[curDay].rounds[roundN]
        if (curRound.winners.length === 1) {
            // one player has been voted out
            if(room.game.settings.autohost === true) {

                setTimeout(async () => {
                    data.type = 'last-speech'
                    data.candidate = curRound.winners[0]
                    data.action = 'voted'

                    ws.tHost = true
                    lastSpeech(ws, data, ROOM_ID, room)
                }
                , 500 )
            } else {
                await host(ROOM_ID, {type: 'last-speech-voted', candidate: curRound.winners[0], action: 'voted'});
            }

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
                if(room.game.settings.autohost === true) {
                    if (curRound.winners.length > curRound.split.length) {
                        setTimeout(async () => {
                            data.type = 'defense-speech'
                            data.candidate = curRound.winners[curRound.split.length]
                            ws.tHost = true
                            defenseSpeech(ws, data, ROOM_ID, room)
                        }
                        , 500 )
                    } else {
                        setTimeout(async () => {
                            data.type = 'start-voting'
                            ws.tHost = true
                            startVoting(ws, data, ROOM_ID, room)
                        }
                        , 500 )

                    }

                } else {
                    await host(ROOM_ID, {type: 'split-speech', winners: curRound.winners, split: curRound.split});
                }
            } else {
                if(room.game.settings.autohost === true) {
                    setTimeout(async () => {
                        data.type = 'lock-winners'
                        data.winners = curRound.winners
                        ws.tHost = true
                        lockWinners(ws, data, ROOM_ID, room)
                    }
                    , 500 )
                } else {
                    await host(ROOM_ID, {type: 'lock-all-winners', winners: curRound.winners, split: curRound.split});
                }

            }
        }
    } else if (remainingVoters.length === 0) {
        curRound['V' + curRound.next] = {
            state: 'END',
            slot: candidateSlot,
            votes: []
        }
        room.game.days[curDay].rounds[roundN].next++
        room = await updateRoom(ROOM_ID, room)

        await broadcastRoom(ws.roomID, JSON.stringify({
            type: 'voting-round-result',
            round: (roundN + 1),
            candidate: candidateSlot,
            votes: []
        }));
        nextCandidate = room.game.days[curDay].rounds[roundN].nominees[room.game.days[curDay].rounds[roundN].next]
        if (nextCandidate !== undefined) {
            if(room.game.settings.autohost === true) {
                setTimeout(async () => {
                        data.type = 'start-voting-round'
                        ws.tHost = true
                        startVotingRound(ws, data, ROOM_ID, room)
                    }
                    , 500 )
            } else {
                await host(ROOM_ID, {
                    type: 'voting-round-ready',
                    round: roundN,
                    candidate: nextCandidate,
                    skip: true,
                });
            }

        } else {
            if(room.game.settings.autohost === true) {
                setTimeout(async () => {
                        await broadcastRoom(ROOM_ID,  JSON.stringify({ type: 'error', message: 'Next candidate to vote not found!' }));
                    }
                    , 100 )
            } else {
                await host(ROOM_ID, {
                    type: 'error',
                    message: 'Next candidate to vote not found!',
                    data: room.game.days
                });
            }
            console.log('Next candidate to vote not found!')
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
                        if(room.game.settings.autohost === true) {

                            setTimeout(async () => {
                                    data.type = 'start-voting-round'
                                    ws.tHost = true
                                    await startVotingRound(ws, data, ROOM_ID, room)
                                }
                                , 500 )
                        } else {
                            await host(ROOM_ID, {
                                type: 'voting-round-ready',
                                round: roundN,
                                candidate: nextCandidate
                            });
                        }

                    }
                } else {
                    await broadcastRoom(ws.roomID, JSON.stringify({
                        type: 'voting-round-result',
                        round: (roundN + 1),
                        candidate: candidateSlot,
                        votes: room.game.days[curDay].rounds[roundN]['V' + (curRound.next)].votes
                    }));
                }

            }, 3000)
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
                    // TODO - implement autohost logic
                    await host(ROOM_ID, { type: 'last-speech-voted', candidate: curRound.winners[0], action: 'voted' });

                } else {
                    if(room.game.settings.autohost === true) {

                        setTimeout(async () => {
                                data.type = 'start-night'
                                ws.tHost = true
                                startNight(ws, data, ROOM_ID, room)
                            }
                            , 500 )
                    } else {
                        await host(ROOM_ID, {type: 'ready-to-night'});
                    }

                }

            }, 5000)
})
const passTracker = {};

function checkPass(ROOM_ID, data) {
    const currentTime = Date.now();

    // Initialize tracker for this ROOM_ID if not already present
    if (!passTracker[ROOM_ID]) {
     passTracker[ROOM_ID] = { lastExecution: 0, lastHost: null };
    }

    const { lastExecution, lastHost } = passTracker[ROOM_ID];
    // If the last call was less than 3 seconds ago and the last host was not empty, skip execution
    if (lastHost && currentTime - lastExecution < 3000) {
        console.log(`Execution for ROOM_ID ${ROOM_ID} skipped - throttled.`);
        return  false;
    }

    passTracker[ROOM_ID] = {
        lastExecution: currentTime,
        lastHost: data.host || null,
    };
    return true
}
const nextSpeaker = onlyHost(async (ws, data, ROOM_ID, room) => {
    if (room.game.settings.autohost !== true) {
        if (!checkPass(ROOM_ID, data)) {
            await host(ROOM_ID, { type: 'error', message: "Looks like previous player SKIP already" });
            return;
        }
    }

        let activeSpeaker = 0;
        let duration = 60
        let lastAlive = 0;
        let curDay = "D"+room.game.day
        console.log('Duration :642: ', duration)
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
                    } else if ((player.uid === 'empty')) {
                        duration = 10
                    }
                    console.log('Duration :669: ', duration)
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
                // console.log('808', 'activeSpeaker', activeSpeaker)
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
                            console.log('888: ', user)
                            if ((user !== undefined) && (duration===60)) {
                                await user.send(JSON.stringify({ type: 'unmute-mic' }));
                            } else if ((user === undefined)) {
                                duration = 10
                            }
                        } else if((room.game.settings.autohost === true) &&(player.uid === 'empty')) {
                            duration = 10
                        }
                        console.log('Duration :719: ', duration, 'slot: ',slot, 'player.uid: ', player.uid)

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
            room.activePlayerSlot = activeSpeaker
            room = await updateRoom(ROOM_ID, room)
            console.log('Duration :749: ', duration)
            let timeoutId = 'null'
            if(room.game.settings.autohost === true) {
                timeoutId = timeoutManager.set(
                    async () => {
                        data.type = 'next-speaker'
                        ws.tHost = true
                        await nextSpeaker(ws, data, ROOM_ID, room)
                    }
                    , (duration+1)*1000
                , {slot: room.game.days[curDay].currentSpeaker, duration: duration})
                console.log({slot: room.game.days[curDay].currentSpeaker, duration: duration}, timeoutManager.hhmmss())
                timeoutManager.clearPrevious(timeoutId)
            }
            await broadcastRoom(ROOM_ID,  JSON.stringify({ type: 'active-speaker', slot: room.game.days[curDay].currentSpeaker, duration: duration, timeoutID: timeoutId }));
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
            await broadcastRoom(ROOM_ID,  JSON.stringify({ type: 'active-speaker', slot: 0, duration: 0, data: data }));


            if (room.game.days[curDay].victims.length === 0) {
                let nominees =  room.game.days[curDay].nominees;
                if(room.game.settings.autohost === true) {

                    setTimeout(async () => {
                            data.type = 'start-voting'
                            ws.tHost = true
                            startVoting(ws, data, ROOM_ID, room)
                        }
                        , 500 )
                } else {
                    await host(ROOM_ID, { type: 'ready-to-vote', nominees: nominees });
                }

            } else {
                if(room.game.settings.autohost === true) {

                    setTimeout(async () => {
                            data.type = 'start-night'
                            ws.tHost = true
                            startNight(ws, data, ROOM_ID, room)
                        }
                        , 500 )
                } else {
                    await host(ROOM_ID, {type: 'ready-to-night'});
                }
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
        room.activePlayerSlot = data.candidate
        roomUpd = await updateRoom(ROOM_ID, room)
        await broadcastRoom(ws.roomID,  JSON.stringify({ type: 'active-speaker', slot: data.candidate, duration: 60, "action": data.action }));
        console.log(timeoutManager.getAll())
        timeoutManager.clearAll()
        if (roomUpd.game.settings.autohost === true) {
            setTimeout(async () => {
                if (data.action === 'killed') {
                    data.type = 'player-kill';
                    data.slot = data.candidate
                    ws.tHost = true;
                    await broadcastRoom(ROOM_ID,  JSON.stringify({ type: 'debug', data: 'lastSpeech 1007' }));
                    await playerKill(ws, data, ROOM_ID, room);
                } else if (data.action === 'voted') {
                    data.type = 'player-lock';
                    data.slot = data.candidate
                    ws.tHost = true;
                    await playerLock(ws, data, ROOM_ID, room);
                }
            }, 60000);
        }
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
        room.activePlayerSlot = data.candidate
        room = await updateRoom(ROOM_ID, room)
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
            player.mic = "off"
            player.cam = "off"

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
        await mafiaHome(JSON.stringify({ type: 'game-player-status', roomID: ROOM_ID, slot: data.slot, status: player.status }));
        if (player.status === 'disqualified') {
            await checkGameOver(room, ROOM_ID)
        }
    }
})

const playerKill = onlyHost(async (ws, data, ROOM_ID, room) => {

    let player = room.slot[data.slot]
    if (player.status === 'alive') {
        player.status = 'killed'
        player.mic = 'off'
        player.cam = 'off'
        room = await updateRoom(ws.roomID, room)
        player = room.slot[data.slot]
        await broadcastRoom(ROOM_ID,  JSON.stringify({ type: 'debug', data: 'playerKill 1096' }));
        await broadcastRoom(ws.roomID,  JSON.stringify({ type: 'player-kill', slot: data.slot, status: player.status }));
        await mafiaHome(JSON.stringify({ type: 'game-player-status', roomID: ROOM_ID, slot: data.slot, status: player.status }));
        let gameOver = await checkGameOver(room, ROOM_ID, ws)
        if (room.game.settings.autohost === true
            && (gameOver !== true)) {
            setTimeout(async () => {
                data.type = 'next-speaker'
                ws.tHost = true
                    console.log('host 1117 >> next speaker`')
                nextSpeaker(ws, data, ROOM_ID, room)
            }
            , 500 )
        }

    }
})

async function checkGameOver(room, ROOM_ID, ws = null) {

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
    if (room.game.settings.autohost === true) {
        let res = false
        let data = {}
        if ((redTeam.length > 0) && (blackTeam.length === 0)) {
            res = true
            data.type = 'team-wins'
            data.team = 'red'
            ws.tHost = true
            await teamWins(ws, data, ROOM_ID, room)
        }
        if ((redTeam.length === blackTeam.length) && (blackTeam.length > 0)) {
            res = true
            data.type = 'team-wins'
            data.team = 'black'
            ws.tHost = true
            await teamWins(ws, data, ROOM_ID, room)
        }
        return res
    } else {
        if ((redTeam.length > 0) && (blackTeam.length === 0)) {
            host(ROOM_ID, { type: 'team-wins', team: 'red' });
        }
        if ((redTeam.length === blackTeam.length) && (blackTeam.length > 0)) {
            host(ROOM_ID, { type: 'team-wins', team: 'black' });
        }
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

        player.mic = 'off'
        player.cam = 'off'

        room = await updateRoom(ws.roomID, room)
        player = room.slot[data.slot]
        await broadcastRoom(ws.roomID,  JSON.stringify({ type: 'player-lock', slot: data.slot, status: player.status }));
        await mafiaHome(JSON.stringify({ type: 'game-player-status', roomID: ROOM_ID, slot: data.slot, status: player.status }));
        if ((curRound !== undefined) && curRound.hasOwnProperty('winners') && (curRound.winners !== undefined)) {
            if (Number(curRound.winners[curRound.winners.length - 1]) === Number(data.slot)) {
                if (room.game.settings.autohost === true) {
                    let gameOver = await checkGameOver(room, ROOM_ID, ws)
                    if (gameOver === true) {
                        return
                    } else {
                        setTimeout(async () => {
                            data.type = 'start-night';
                            ws.tHost = true;
                            await startNight(ws, data, ROOM_ID, room);
                        }, 500);
                    }
                } else {
                    await host(ROOM_ID, { type: 'ready-to-night' });
                    await checkGameOver(room, ROOM_ID)
                }

            } else {
                winner = curRound.winners.indexOf(data.slot)
                console.log(809, winner)
                if (winner >= 0) {
                    if (room.game.settings.autohost === true) {
                        setTimeout(async () => {
                            data.type = 'last-speech';
                            data.candidate = curRound.winners[winner+1]
                            data.action = 'voted';
                            ws.tHost = true;
                            await lastSpeech(ws, data, ROOM_ID, room);

                        }, 500);
                    } else {
                        await host(ROOM_ID, { type: 'last-speech-voted', candidate: curRound.winners[winner+1], action: 'voted' });
                    }

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
        await mafiaHome(JSON.stringify({ type: 'game-player-status', roomID: ROOM_ID, slot: data.slot, status: 'alive' }));
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
        await mafiaHome(JSON.stringify({ type: 'game-player-status', roomID: ROOM_ID, slot: data.slot, status: player.status }));
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
    // console.log('settings:', settings)
    if (!settings?.password) {
        room.game.settings.password = false
    } else if (settings.password.trim() === '') {
        room.game.settings.password = false
    } else {
        room.game.settings.password = crypto.createHash('md5').update(settings.password).digest('hex').substring(0, 8);
    }
    room.game.settings.registeredOnly = (settings?.registeredOnly === true)
    room.game.settings.sandbox = (settings?.sandbox === true)
    room.game.settings.autohost = (settings?.autohost === true)
    room.game.settings.skipRoleShuffle = (settings?.skipRoleShuffle === true)

    await updateRoom(ws.roomID, room)

})

async function checkPlayersReady(ROOM_ID, room) {
    let ready = true;
    room.game.size = 0;

    for (const [slot, player] of Object.entries(room.slot)) {
        // Reset player state
        room.slot[slot].slot = 'none';
        room.slot[slot].role = 'none';
        room.slot[slot].warn = false;
        room.slot[slot].so = [];

        // Check if player is ready
        if ((player.uid !== 'empty') && (player.status !== 'ready')) {
            const userConn = clients[player.uid];
            if (userConn === undefined) {
                room.slot[slot].uid = 'empty';
            } else {
                console.log('slot is not ready: ', slot);
                ready = false;
            }
        }

        // Check microphone status
        if ((player.mic === 'on') && (room.slot[slot].uid !== 'empty')) {
            const user = clients[player.uid];
            if (user !== undefined) {
                await user.send(JSON.stringify({ type: 'mute-mic' }));
                room.game.size++;
            } else {
                room.slot[slot].mic = 'off';
                room.slot[slot].uid = 'empty';
                console.log('Not ready (mic): ', slot, player);
                ready = false;
            }
        }
    }

    // Update room state
    await updateRoom(ROOM_ID, room);

    return ready;
}

const gameStart = onlyHost(async (ws, data, ROOM_ID, room) => {
    const ready = await checkPlayersReady(ROOM_ID, room);

    if (!ready && !room.game.settings.autohost) {
        await host(ROOM_ID, { type: 'error', message: "Some users are not ready yet..." });
        await host(ROOM_ID, { type: 'mainButton', message: "game-start" });
        return;
    }

    await broadcastRoom(ROOM_ID,  JSON.stringify({ type: 'game-start', autohost: room.game.settings.autohost }));

    room.game.pause = { state: "play" }
    room.game.phase = 'shuffle';
    room.game.stage = "shuffle-slots"
    room.game.availableSlots = [1,2,3,4,5,6,7,8,9,10]
    room = await updateRoom(ROOM_ID, room);

    await broadcastRoom(ROOM_ID,  JSON.stringify({ type: 'game-phase', phase: 'shuffle', stage: "shuffle-slots" }));

    if (room.game.settings.skipRoleShuffle) {
        room.game.availableSlots = shuffleArray(room.game.availableSlots);
        console.log('925', room.game.availableSlots)
        correctOrder = {}
        for (const [slot, player] of Object.entries(room.slot)) {
            if ((player.slot === 'any') || (player.slot === 'none')) {
                player.slot = room.game.availableSlots[0]
                // let player = room.slot[slot]
                console.log('931', player.slot)
                let user = clients[player.uid]
                if (user !== undefined) {
                    await user.send(JSON.stringify({ type: 'game-phase', phase: 'shuffle', stage: "player-slot", slot: player.slot}));
                }
                room.game.availableSlots = room.game.availableSlots.filter(slotID => slotID !== player.slot);
            }
            correctOrder[room.slot[slot].slot] = { ...player, initialSlot: slot }
        }
        room.slot = correctOrder;
        roomState = await updateRoom(ws.roomID, room)
        await sleep(2000);
        // await sleep(2000)
    } else {
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
    }

    await broadcastRoom(ws.roomID,JSON.stringify({ type: 'game-order', slots: roomState.slot }));

    if (roomState.game.settings.autohost) {
        data.type = 'shuffle-roles'
        ws.tHost = true
        await shuffleRoles(ws, data, ROOM_ID, room);
    } else {
        await host(ROOM_ID, { type: 'shuffle-roles-ready' });
    }


})

function stealRole(desiredRole, currentSlot, room) {
    // Find a player who currently has the desired role
    for (let j = 1; j <= 10; j++) {
        if (j !== currentSlot && room.slot[j].role === desiredRole) {
            // Check if this player has a name prefix [D], [S], [B], or [R]
            const hasPrefix = room.slot[j].name && room.slot[j].name.match(/^\[[DSBR]\]/);

            if (!hasPrefix) {
                // Found someone without a prefix - steal from them
                if (room.game.availableRoles.length > 0) {
                    const newRole = room.game.availableRoles.shift();
                    room.slot[j].role = newRole;
                    room.slot[currentSlot].role = desiredRole;
                    return j;
                }
                break;
            }
        }
    }
    return null;
}

const shuffleRoles = onlyHost(async (ws, data, ROOM_ID, room) => {

    ready = true;
    room.game.availableRoles = shuffleArray(['R','D','B','S','R','B','R','R','R','R']);
    room.game.availableCards = [1,2,3,4,5,6,7,8,9,10];
    room.game.stage = "shuffle-roles"
    room = await updateRoom(ROOM_ID, room)
    await broadcastRoom(ROOM_ID,  JSON.stringify({ type: 'shuffle-roles' }));

    if (room.game.settings.skipRoleShuffle) {
        room.game.availableRoles = shuffleArray(room.game.availableRoles);
        for (let i = 1; i <= 10; i++) {

            let player = room.slot[i];
            let cardId = null; // we do

            if ((player.role === 'none') && (room.game.availableRoles.length > 0)) {
                const match = player.name.match(/^\[([DSBR])\]/);
                if (match) {
                    const desiredRole = match[1];
                    const index = room.game.availableRoles.indexOf(desiredRole);
                    if (index !== -1) {
                        room.slot[i].role = desiredRole;
                        room.game.availableRoles.splice(index, 1);
                        cardId = index + 1;
                    } else {
                        const stolenFromSlot = stealRole(desiredRole, i, room);
                        cardId = stolenFromSlot; // cardID is completely wrong implementation - I need to fix it all logic
                    }
                // }
                // if(player.name.startsWith('[D]')) {
                //     room.slot[i].role = 'D'
                //     const index = room.game.availableRoles.indexOf('D');
                //     if (index !== -1) room.game.availableRoles.splice(index, 1);
                //     cardId = index +1
                // } else if (player.name.startsWith('[S]')) {
                //     room.slot[i].role = 'S'
                //     const index = room.game.availableRoles.indexOf('S');
                //     if (index !== -1) room.game.availableRoles.splice(index, 1);
                //     cardId = index +1
                // } else if (player.name.startsWith('[B]')) {
                //     room.slot[i].role = 'B'
                //     const index = room.game.availableRoles.indexOf('B');
                //     if (index !== -1) room.game.availableRoles.splice(index, 1);
                //     cardId = index +1
                // } else if (player.name.startsWith('[R]')) {
                //     room.slot[i].role = 'R'
                //     const index = room.game.availableRoles.indexOf('R');
                //     if (index !== -1) room.game.availableRoles.splice(index, 1);
                //     cardId = index + 1
                } else {
                    room.slot[i].role = room.game.availableRoles.shift()
                    cardId = i
                }


                roomState = await updateRoom(ROOM_ID, room)
                user = clients[player.uid]
                if (user !== undefined) {
                    await user.send(JSON.stringify({type: 'game-role', role: roomState.slot[i].role}));
                }
                await broadcastRoom(ROOM_ID, JSON.stringify({type: 'game-role-taken', card: cardId}));
            }
        }
        // roomState = await updateRoom(ROOM_ID, roomState)
    } else {
        for (let i = 1; i <= 10; i++) {
            roomState = await getRoom(ROOM_ID)
            if (i > 1) {
                prevPlayer = roomState.slot[i - 1]
                if (prevPlayer.role === 'none') {
                    roomState.slot[i - 1].role = roomState.game.availableRoles.shift()
                    let cardId = roomState.game.availableCards.shift()
                    console.log('350 :', roomState.game.availableRoles)
                    roomState = await updateRoom(ROOM_ID, roomState)
                    let prevUser = clients[prevPlayer.uid]
                    if (prevUser !== undefined) {
                        await prevUser.send(JSON.stringify({type: 'game-role', role: roomState.slot[i - 1].role}));
                        await prevUser.send(JSON.stringify({
                            type: 'game-phase',
                            phase: 'shuffle',
                            stage: "shuffle-roles"
                        }));
                    }
                    await broadcastRoom(ROOM_ID, JSON.stringify({type: 'game-role-taken', card: cardId}));
                }
            }

            await broadcastRoom(ROOM_ID, JSON.stringify({type: 'game-phase-role', slot: i}));
            if (i === 10) {
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
                        await user.send(JSON.stringify({type: 'game-role', role: roomState.slot[i].role}));
                        await user.send(JSON.stringify({type: 'game-phase', phase: 'shuffle', stage: "shuffle-roles"}));
                    }
                    await broadcastRoom(ROOM_ID, JSON.stringify({type: 'game-role-taken', card: cardId}));
                }
            } else {

                curPlayer = roomState.slot[i]
                sleepTime = 300; // skip empty slots
                if ((roomState.game.phase === 'shuffle')
                    && (curPlayer.role === 'none')) {
                    user = clients[curPlayer.uid]
                    if (user !== undefined) {
                        sleepTime = 5000
                        await user.send(JSON.stringify({type: 'select-role'}));
                    }

                }

                await sleep(sleepTime);
            }
        }
        //await sleep(3000);
        roomState = await getRoom(ROOM_ID)
        if (roomState.game.availableRoles.length > 0) {
            for (let i = 1; i <= 10; i++) {
                // for (const [slot, player] of Object.entries(roomState.slot)) {
                let player = roomState.slot[i];
                if ((player.role === 'none') && (roomState.game.availableRoles.length > 0)) {
                    roomState.slot[i].role = roomState.game.availableRoles.shift()
                    let cardId = roomState.game.availableCards.shift()
                    roomState = await updateRoom(ROOM_ID, roomState)
                    user = clients[player.uid]
                    if (user !== undefined) {
                        await user.send(JSON.stringify({type: 'game-role', role: roomState.slot[i].role}));
                        await user.send(JSON.stringify({type: 'game-phase', phase: 'shuffle', stage: "shuffle-roles"}));
                    }

                    await broadcastRoom(ROOM_ID, JSON.stringify({type: 'game-role-taken', card: cardId}));
                }
            }
        }

        roomState = await updateRoom(ROOM_ID, roomState)
    }

    if (roomState.game.settings.autohost) {
        console.log('Start sitdown 1287', data)
        data.type = 'start-sitdown'
        ws.tHost = true
        await startSitdown(ws, data, ROOM_ID, room);
    } else {
        await host(ROOM_ID, { type: 'roles-ready' });
    }
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
    console.log('Game Stop',timeoutManager.getAll())
    timeoutManager.clearAll()
    room.game.phase = 'lobby';
    room.game.stage = ""
    for (const [slot, player] of Object.entries(room.slot)) {
        player.slot = 'none';
        player.role = 'none';
        player.status = 'unknown';
        player.mic = 'off';
        player.warn = false;
        room.slot[slot] = player

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
    checkPlayersReady,
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