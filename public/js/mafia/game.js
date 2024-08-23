var hostId = null;
let selfID = null;
let sfx = {
    shuffle : new Howl({
        src: '/static/sfx/airport-tone.mp3',
        loop: false,
        volume: 0.1
    }),

    sitdown : new Howl({
        src: '/static/sfx/sitdown.mp3',
        loop: false,
        volume: 0.01
    }),

    police : new Howl({
        src: '/static/sfx/police-siren.mp3',
        loop: false,
        volume: 0.01
    }),

    godfather : new Howl({
        src: '/static/sfx/godfather.mp3',
        loop: false,
        volume: 0.01
    }),

    sheriff : new Howl({
        src: '/static/sfx/sherlock.mp3',
        loop: false,
        volume: 0.01
    }),
    notify : new Howl({
        src: '/static/sfx/notify.mp3',
        loop: false,
        volume: 0.1
    }),
    warn : new Howl({
        src: '/static/sfx/warn.mp3',
        loop: false,
        volume: 0.05
    }),
    nominate : new Howl({
        src: '/static/sfx/nominate.mp3',
        loop: false,
        volume: 0.05
    }),
    shot : new Howl({
        src: '/static/sfx/shot.mp3',
        loop: false,
        volume: 0.01
    }),
    dog : new Howl({
        src: '/static/sfx/dog.mp3',
        loop: false,
        volume: 0.01
    }),
    gameOver : new Howl({
        src: '/static/sfx/game-over.mp3',
        loop: false,
        volume: 0.01
    }),
    knock : new Howl({
        src: '/static/sfx/knock.mp3',
        loop: false,
        volume: 0.05
    }),
}

function playTimes(sound, times) {
    let count = 0;

    sound.on('end', function() {
        count++;
        if (count < times) {
            sound.play();
        }
    });

    sound.play();
}


// Retrieve stored sources from localStorage
const videoSource = localStorage.getItem('selectedVideoSource');
const audioSource = localStorage.getItem('selectedAudioSource');

// Adjust the constraints with the stored sources
if (videoSource !== null) {
    constraints.video = {
        ...constraints.video,
        deviceId: videoSource ? { exact: videoSource } : undefined
    };
}

if (audioSource !== null) {
    constraints.audio = {
        ...constraints.audio,
        deviceId: audioSource ? {exact: audioSource} : undefined
    };
}

navigator.mediaDevices.getUserMedia(constraints)
    .then(stream => {
        stream.getAudioTracks().forEach(track => {
            track.enabled = false; // Mute audio track
        });
        localStream = stream;
        localVideo.srcObject = stream;
        localVideo.play().catch(error => {
            console.error('Error attempting to play the video:', error);
            // You might want to inform the user that they need to manually start the video
        });
        startSignaling();
    })
    .catch(error => {
        document.querySelector('settings-popup').classList.add('show')
        console.error('Error accessing media devices:', error);
    });

function muteAllSfx() {
    for (const [name, sound] of Object.entries(sfx)) {
        sound.stop()
    }
}
function selfSlotDetection(selfID) {
    let participant = false;
    if (roomEnv.gameHost.uid !== selfID) {
        slot = 0;
        for (const [slotN, player] of Object.entries(roomEnv.slot)) {
            if (player.uid === selfID) {
                localVideo.classList.add('play', 'self-view')

                if (player.mic === 'on') {
                    localVideo.classList.remove('muted')
                    localVideo.srcObject.getAudioTracks().forEach(track => {
                        track.enabled = true; // Mute audio track
                    });
                }
                slot = document.querySelector('div.videobox[data-slot="' + slotN+'"]');
                slot.classList.remove('no-video')
                slot.classList.add('self-view')
                slot.querySelectorAll('video').forEach(video => video.remove());
                slot.insertBefore(localVideo, slot.firstChild);

                slot.setAttribute('data-uid', selfID)
                slot.setAttribute('data-name', player.name || 'unknown')
                if(['killed', 'disqualified', 'locked'].includes(slot.getAttribute('data-player-status'))) {
                    localVideo.origSrcObject = localVideo.srcObject
                    localVideo.srcObject = null
                }
                userName = slot.querySelector('span.game-user');
                userName.textContent = player.name || selfID;
                inputUserName = slot.querySelector('input.game-user');
                inputUserName.value = player.name || 'unknown';
                // userName.textContent = selfID
                // userName.childNodes.forEach(node => {
                //     // Check if the child node is a text node
                //     if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim() === 'unknown') {
                //         // Replace the text content with selfID
                //         node.textContent = player.name || selfID;
                //     }
                // });
                participant = true
                break
            }
        }
    } else {
        participant = true
    }
    if (!participant) {
        localVideo.srcObject.getTracks()
    }
    return participant
}

function updateStatuses() {
    for (const [slotN, player] of Object.entries(roomEnv.slot)) {
        barSlot = document.querySelector('div.e-bar[data-slot="'+slotN+'"]')
        barSlot.setAttribute('data-status', player.status)
    }
}
function startSignaling() {
            // Create WebSocket connection using the retrieved URL
    ws = new WebSocket(websocketUrl);
    ws.onopen = () => {
        ws.send(JSON.stringify({type: 'join-game', roomId: roomId, sessionID: chatSessionID }));
    };

    ws.onmessage = event => {
        const data = JSON.parse(event.data);
        if (data.type === 'id') {
            // Assign the unique ID received from the server
            const clientId = data.id;
            selfID = data.id;
            sessionID = clientId;
            roomEnv = data.room;
            updateStatuses()
            participant = selfSlotDetection(clientId);
            hostID = data.room.gameHost.uid;
            var script = document.createElement('script');
            if(sessionID !== hostID) {

                gamePanel = document.querySelector('div.game-panel')
                gamePanel.setAttribute('data-mode',"player")

                let gameMode = document.querySelector('div.game.videos')
                gameMode.setAttribute('data-mode',"player")

                hostPanel = document.querySelector('div.host-panel')
                hostPanel.remove()
            } else {
                hostVideo = document.getElementById('hostVideo')
                hostVideo.srcObject = localVideo.srcObject;
                hostVideo.classList.add('muted')
                hostVideo.parentElement.classList.add('self-view')
                hostVideo.parentElement.classList.remove('no-video')

                localVideo.classList.remove('muted')
                localVideo.srcObject = null;
                localVideo.remove();
                gamePanel = document.querySelector('div.game-panel')
                gamePanel.setAttribute('data-mode',"host")

                let gameMode = document.querySelector('div.game.videos')
                gameMode.setAttribute('data-mode',"host")

                playerPanel = document.querySelector('div.player-panel')
                playerPanel.remove()

                // Set the source attribute to your player.js file
                // script.src = '/static/js/mafia/host.js';
                // document.head.appendChild(script);
                // script.onload = () => {
                    detectGameState()
                    // handleGamePhase(roomEnv.game)
                // };

            }
            const peersPromises = [];
            for (const uid in data.room.users) {
                if (uid !== sessionID) {
                    const promise = (async () => {
                        peerConnection = createPeerConnection(uid, hostID, participant);
                        peerConnection.onicecandidate = event => {
                            if (event.candidate) {
                                sendIceCandidate(sessionID, uid, event.candidate);
                            }
                        };
                        await  sendOffer(ws, clientId, uid, peerConnection);
                    })();
                    peersPromises.push(promise);
                }
            }
            handleGamePhase(roomEnv.game, 'reload')

        } else if (data.type === 'participant-joined') {
            // Handle new participant joined
            const clientId = data.id;
            roomEnv = data.room;
            if (sessionID != clientId) {
                peerConnection = createPeerConnection(clientId);
                peerConnection.onicecandidate = event => {
                    if (event.candidate) {
                        sendIceCandidate(sessionID, clientId, event.candidate);
                    }
                };
            }

        } else if (data.type === 'request-response') {
            if (pendingRequests.hasOwnProperty(data.requestId)) {
                pendingRequests[data.requestId].resolve(data);
                // Remove the entry from the dictionary
                delete pendingRequests[data.requestId];
            } else {
                handleError({ message: 'Undefined request:'+data.requestId }, 'error');
            }

        } else if (data.type === 'participant-left') {
            roomEnv = data.room;
            removePeerConnection(data.id);
        } else if (data.type === 'offer') {
            handleOffer(data);
        } else if (data.type === 'participant-offer') {
            const clientId = data.from;
            if (sessionID != clientId) {
                handleOffer(data);
            }
        } else if (data.type === 'answer') {
            handleAnswer(data);
        } else if (data.type === 'ice-candidate') {
            handleIceCandidate(data);
        } else if (data.type === 'room-list') {
            handleRoomList(data);
        } else if (data.type === 'chat-message') {
            handleChatMessage(data);
        } else if (data.type === 'request-join') {
            handleRequestJoin(data);
        } else if (data.type === 'error') {
            handleError(data, 'error');
        } else if (data.type === 'reset') {
            handleReset(data);
        } else if (data.type === 'game-player-status') {
            handleGamePlayerStatus(data);
        } else if (data.type === 'game-player-mic') {
            handleGamePlayerMic(data);
        } else if (data.type === 'mute-mic') {
            muteMic(data);
        } else if (data.type === 'unmute-mic') {
            unmuteMic(data);
        } else if (data.type === 'game-start') {
            handleGameStart(data);
        } else if (data.type === 'game-phase') {
            handleGamePhase(data);
        } else if (data.type === 'select-slot') {
            handleSelectSlot(data);
        } else if (data.type === 'game-phase-slot') {
            handleGamePhaseSlot(data);
        } else if (data.type === 'game-order') {
            handleGameOrder(data);
        } else if (data.type === 'shuffle-roles-ready') {
            handleShuffleRolesReady(data);
        } else if (data.type === 'roles-ready') {
            hostRolesReady(data);
        } else if (data.type === 'game-phase-role') {
            handleGamePhaseRole(data);
        } else if (data.type === 'select-role') {
            handleSelectRole(data);
        } else if (data.type === 'game-role-taken') {
            handleGameRoleTaken(data);
        } else if (data.type === 'game-role') {
            handleGameRole(data);
        } else if (data.type === 'shuffle-roles') {
            handleShuffleRoles(data);
        } else if (data.type === 'game-roles') {
            handleGameRoles(data);
        } else if (data.type === 'mafia-sitdown') {
            handleMafiaSitdown(data);
        } else if (data.type === 'don-watch') {
            handleDonWatch(data);
        } else if (data.type === 'sheriff-watch') {
            handleSheriffWatch(data);
        } else if (data.type === 'active-speaker') {
            handleActiveSpeaker(data);
        } else if (data.type === 'shout-out') {
            handleShoutOut(data);
        } else if (data.type === 'player-comm') {
            handlePlayerComm(data);
        } else if (data.type === 'set-player-name') {
            handleSetPlayerName(data);
        } else if (data.type === 'set-host-name') {
            handleSetHostName(data);
        } else if (data.type === 'player-warn') {
            handlePlayerWarn(data);
        } else if (data.type === 'nominees') {
            handleNominate(data);
        } else if (data.type === 'ready-to-vote') {
            handleReadyToVote(data);
        } else if (data.type === 'start-voting') {
            handleStartVoting(data);
        } else if (data.type === 'voting-round-ready') {
            handleVotingRoundReady(data);
        } else if (data.type === 'voting-round') {
            handleVotingRound(data);
        } else if (data.type === 'lock-winners-vote') {
            handleLockWinnersVote(data);
        } else if (data.type === 'player-vote') {
            handlePlayerVote(data);
        } else if (data.type === 'lock-winners-player-vote') {
            handleLockWinnersPlayerVote(data);
        } else if (data.type === 'lock-all-winners') {
            handleLockAllWinners(data);
        } else if (data.type === 'voting-round-result') {
            handleVotingRoundResult(data);
        } else if (data.type === 'split-speech') {
            handleSplitSpeech(data);
        } else if (data.type === 'ready-to-night') {
            handleReadyToNight(data);
        } else if (data.type === 'mafia-shooting') {
            handleMafiaShooting(data);
        } else if (data.type === 'player-shoot') {
            handlePlayerShoot(data);
        } else if (data.type === 'mafia-shoot') {
            handleMafiaShoot(data);
        } else if (data.type === 'game-ready') {
            handleGameReady(data);
        } else if (data.type === 'don-check') {
            handleDonCheck(data);
        } else if (data.type === 'sheriff-check') {
            handleSheriffCheck(data);
        } else if ((data.type === 'player-kill')
        || (data.type === 'player-lock')
        || (data.type === 'player-alive')
        ) {
            handlePlayerStatus(data);
        } else if (data.type === 'last-speech-voted') {
            handleLastSpeechVoted(data);
        } else if (data.type === 'last-speech-killed') {
            handleLastSpeechKilled(data);
        } else if (data.type === 'team-wins') {
            handleTeamWins(data);
        } else if (data.type === 'game-over') {
            handleGameOver(data);
        // } else if (data.type === 'sitdown-ready') {
        //     handleSitdownReady(data);
        }
    };



    function handleRoomList(data) {
        select = document.getElementById('roomList');
        select.innerHTML = '';
        roomlist = data.room - list;
        roomlist.forEach(room => {
            var opt = document.createElement('option');
            opt.innerHTML = room.name;
            opt.value = room.host;
            select.appendChild(opt);
        })

    }

    function handleRequestJoin(data) {
        table = document.getElementById('chat-messages');

        var row = document.createElement('tr');

        var d = new Date(); // for now
        var now = ''+d.getHours()+'h '+d.getMinutes()+'m';

        row.innerHTML = `<td class="chat-time">`+now+`</td>`;
        row.innerHTML += `<td class="chat-from">`+data['client-id']+`</td>`;
        row.innerHTML += `<td class="chat-to">`+''+`</td>`;
        row.innerHTML += `<td class="chat-message">`+escapeHtml(data.message)+
        `<button style="float:right;" class="btn btn-danger" id="deny_`+data['client-id']+`">Deny Request</button>
        <button style="float:right;" class="btn btn-success" id="accept_`+data['client-id']+`">Accept Request</button></td>`;

        if (data.from === sessionID) {
            row.classList.add('self-message');
        } else if (data.from === roomEnv.host.uid) {
            row.classList.add('host-message');
        }

        table.appendChild(row);

        var acceptGuest = document.getElementById("accept_"+data['client-id'])
        acceptGuest.onclick = function () {
            ws.send(JSON.stringify({type: 'grant-access', from: hostId, to: data['client-id'], 'client-session': data["client-session"], roomId: roomId, access: true}));
        };
        var denyGuest = document.getElementById("deny_"+data['client-id'])
        denyGuest.onclick = function () {
            ws.send(JSON.stringify({type: 'grant-access', from: hostId, to: data['client-id'], 'client-session': data["client-session"], roomId: roomId, access: false}));
        }
    }

}

function selectSlot(slotID) {
    ws.send(JSON.stringify({type: 'game-reserve-slot', slotID: slotID}));
    handleGamePhase({phase: 'shuffle'});

}

function selectRole(card) {
    // console.log(card)
    deck = document.querySelector('div.deck-container')
    if (!deck.classList.contains('locked')) {
        cardID = card.getAttribute('data-card');
        ws.send(JSON.stringify({type: 'game-reserve-role', cardID: cardID}));

        deck = document.querySelector('div.deck-container')
        deck.classList.add('locked')
    }
}
