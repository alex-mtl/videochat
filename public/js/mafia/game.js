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
        volume: 0.1
    }),
    nominate : new Howl({
        src: '/static/sfx/nominate.mp3',
        loop: false,
        volume: 0.1
    }),
}


navigator.mediaDevices.getUserMedia(constraints)
    .then(stream => {
        stream.getAudioTracks().forEach(track => {
            track.enabled = false; // Mute audio track
        });
        localStream = stream;
        localVideo.srcObject = stream;
        startSignaling();
    })
    .catch(error => {
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
                userName = slot.querySelector('.game-user');
                userName.textContent = selfID
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
                script.src = '/static/js/mafia/host.js';
                document.head.appendChild(script);
                script.onload = () => {
                    detectGameState()
                    // handleGamePhase(roomEnv.game)
                };

            }

            for (const uid in data.room.users) {
                if (uid !== sessionID) {
                    peerConnection = createPeerConnection(uid, hostID, participant);
                    peerConnection.onicecandidate = event => {
                        if (event.candidate) {
                            sendIceCandidate(sessionID, uid, event.candidate);
                        }
                    };
                    sendOffer(ws, clientId, uid, peerConnection);
                }
            }
            handleGamePhase(roomEnv.game)

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
        } else if (data.type === 'game-player-status') {
            handleGamePlayerStatus(data);
        } else if (data.type === 'game-player-mic') {
            handleGamePlayerMic(data);
        } else if (data.type === 'mute-mic') {
            muteMic(data);
        } else if (data.type === 'unmute-mic') {
            muteMic(data);
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
        } else if (data.type === 'player-warn') {
            handlePlayerWarn(data);
        } else if (data.type === 'nominees') {
            handleNominate(data);
        } else if (data.type === 'game-ready') {
            handleGameReady(data);
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
    cardID = card.getAttribute('data-card');
    ws.send(JSON.stringify({type: 'game-reserve-role', cardID: cardID}));

    deck = document.querySelector('div.deck-container')
    deck.classList.add('locked')

}
