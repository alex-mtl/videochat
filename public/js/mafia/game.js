let wsConnRetry = 0;
var hostId = null;
let selfID = null;
let sfx = {
    shuffle: new Howl({
        src: '/static/sfx/airport-tone.mp3',
        loop: false,
        volume: 0.1
    }),

    sitdown: new Howl({
        src: '/static/sfx/sitdown.mp3',
        loop: false,
        volume: 0.01
    }),

    police: new Howl({
        src: '/static/sfx/police-siren.mp3',
        loop: false,
        volume: 0.01
    }),

    godfather: new Howl({
        src: '/static/sfx/godfather.mp3',
        loop: false,
        volume: 0.01
    }),

    sheriff: new Howl({
        src: '/static/sfx/sherlock.mp3',
        loop: false,
        volume: 0.01
    }),
    notify: new Howl({
        src: '/static/sfx/notify.mp3',
        loop: false,
        volume: 0.1
    }),
    tictac: new Howl({
        src: '/static/sfx/tic-tac-3s.mp3',
        loop: false,
        volume: 0.1
    }),
    warn: new Howl({
        src: '/static/sfx/warn.mp3',
        loop: false,
        volume: 0.05
    }),
    nominate: new Howl({
        src: '/static/sfx/nominate.mp3',
        loop: false,
        volume: 0.05
    }),
    shot: new Howl({
        src: '/static/sfx/shot.mp3',
        loop: false,
        volume: 0.01
    }),
    dog: new Howl({
        src: '/static/sfx/dog.mp3',
        loop: false,
        volume: 0.01
    }),
    gameOver: new Howl({
        src: '/static/sfx/game-over.mp3',
        loop: false,
        volume: 0.01
    }),
    knock: new Howl({
        src: '/static/sfx/knock.mp3',
        loop: false,
        volume: 0.05
    }),
    donCheckSheriff: new Howl({
        src: '/static/sfx/sheriff.mp3',
        loop: false,
        volume: 0.2
    }),
    donCheckNotSheriff: new Howl({
        src: '/static/sfx/not-a-sheriff.mp3',
        loop: false,
        volume: 0.2
    }),
    sheriffCheckMafia: new Howl({
        src: '/static/sfx/mafia.mp3',
        loop: false,
        volume: 0.2
    }),
    sheriffCheckCitizen: new Howl({
        src: '/static/sfx/citizen.mp3',
        loop: false,
        volume: 0.2
    }),
    tweet: new Howl({
        src: '/static/sfx/tweet.mp3',
        loop: false,
        volume: 0.2
    }),
}

function playTimes(sound, times) {
    let count = 0;

    sound.on('end', function () {
        count++;
        if (count < times) {
            sound.play();
        }
    });

    sound.play();
}


let lastScrollTop = 0;
const header = document.querySelector('.header');
const scrollThreshold = 5;

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset || document.documentElement.scrollTop;

    if (currentScroll > lastScrollTop ) {
        // User is scrolling down
        header.classList.add('hidden');
    } else if (currentScroll < lastScrollTop - scrollThreshold) {
        // User is scrolling up and exceeds the threshold
        header.classList.remove('hidden');
    }

    lastScrollTop = currentScroll <= 0 ? 0 : currentScroll; // Prevent negative scroll values
});


// Retrieve stored sources from localStorage
const videoSource = localStorage.getItem('selectedVideoSource');
const audioSource = localStorage.getItem('selectedAudioSource');

// Adjust the constraints with the stored sources
if (videoSource !== null) {
    constraints.video = {
        ...constraints.video,
        deviceId: videoSource ? {exact: videoSource} : undefined
    };
}

if (audioSource !== null) {
    constraints.audio = {
        ...constraints.audio,
        deviceId: audioSource ? {exact: audioSource} : undefined
    };
}

if (isFirefox()) {
    // Alert user or log a message
    console.warn("This program is not supported on Firefox.");
    // alert("This program is not supported on Firefox.");
    navigator.mediaDevices.getUserMedia({audio: true, video: true})
        .then(stream => {
            // Mute audio track initially
            stream.getAudioTracks().forEach(track => track.enabled = false);

            // Get the video track and attempt to set constraints on it
            const videoTrack = stream.getVideoTracks()[0];
            localStream = stream;
            localVideo.srcObject = stream;
            localVideo.play().catch(error => {
                console.error('Error attempting to play the video:', error);
                // Optionally, prompt the user to manually start the video
            });
            if (videoTrack) {

                videoTrack.applyConstraints(constraints.video)
                    .then(() => {
                        console.log('Constraints successfully applied.');
                        // Assign the stream to the video element
                        resizedStream = localStream;
                        console.log(177);
                        startSignaling();

                    })
                    .catch(error => {
                        const settings = videoTrack.getSettings();
                        // const capabs = videoTrack.getCapabilities();
                        // console.log(capabs.aspectRatio)

                        // Log the width and height
                        console.log(`Video Track Dimensions: ${settings.width}x${settings.height}`);

                        // You can also access other settings if needed
                        console.log('Other settings:', settings);
                        console.log('error:', error.message);
                        console.log('constraints.video:', constraints.video);
                        // alert('Error applying constraints:', error.message,videoTrack.getConstraints());

                        const canvas = document.createElement("canvas");
                        const context = canvas.getContext("2d");
                        canvas.width = 180; // Desired width
                        canvas.height = 135; // Desired height

                        localVideo.addEventListener("loadedmetadata", () => {
                            // Match canvas size to video size (if needed)

                            const originalWidth = localVideo.videoWidth;
                            const originalHeight = localVideo.videoHeight;
                            const aspectRatio = originalWidth / originalHeight;

                            console.log(`Original Dimensions: ${originalWidth}x${originalHeight}`);
                            console.log(`Aspect Ratio: ${aspectRatio}`);

                            const resizeVideoFrame = () => {
                                context.drawImage(localVideo, 0, 0, canvas.width, canvas.height);
                                requestAnimationFrame(resizeVideoFrame);
                            };
                            resizeVideoFrame();
                        });

                        resizedStream = canvas.captureStream();
                        console.log(218);
                        startSignaling();
                    });


            }


            // Start any other processes like signaling here

        })
        .catch(error => {
            console.log('Error accessing media devices:', error.message);
            document.querySelector('div#mediaSourcePopup').classList.add('show');
        });

    // Optionally stop further execution by throwing an error or returning
    // throw new Error("Unsupported browser: Firefox");
} else if (isTelegramInAppBrowser()) {
    console.log("This is the Telegram in-app browser.");
    alert("This program is not supported on Telegram in-app browser. \n" +
        "Please open the link in regular browser. \n" +
        "Or go to in-app browser settings and add video.ttl10.net \n" +
        "to \" Never open in in-app browser\" list"
    );
    window.location.href = "/static/img/img.html";

} else {
    // alert('agent: '+navigator.userAgent+' | vendor: |'+ navigator.vendor+ ' | opera: '+ window.opera)
    navigator.mediaDevices.getUserMedia(constraints)
        .then(stream => {
            // Mute audio track initially
            // stream.getAudioTracks().forEach(track => track.enabled = false);

            // Get the video track and attempt to set constraints on it
            const videoTrack = stream.getVideoTracks()[0];
            localStream = stream;
            localVideo.srcObject = stream;
            localVideo.play().catch(error => {
                console.error('Error attempting to play the video:', error);
                // Optionally, prompt the user to manually start the video
            });
            if (videoTrack) {

                videoTrack.applyConstraints(constraints.video)
                    .then(() => {
                        console.log('Constraints successfully applied.');
                        // Assign the stream to the video element
                        resizedStream = localStream;
                        console.log(265);
                        startSignaling();

                    })
                    .catch(error => {
                        const settings = videoTrack.getSettings();
                        // const capabs = videoTrack.getCapabilities();
                        // console.log(capabs.aspectRatio)

                        // Log the width and height
                        console.log(`Video Track Dimensions: ${settings.width}x${settings.height}`);

                        // You can also access other settings if needed
                        console.log('Other settings:', settings);
                        console.log('error:', error.message);
                        console.log('constraints.video:', constraints.video);
                        //alert('Error applying constraints:', error.message,videoTrack.getConstraints());

                        const canvas = document.createElement("canvas");
                        const context = canvas.getContext("2d");

                        localVideo.addEventListener("loadedmetadata", () => {
                            // Match canvas size to video size (if needed)

                            const originalWidth = localVideo.videoWidth;
                            const originalHeight = localVideo.videoHeight;
                            const aspectRatio = originalWidth / originalHeight;

                            if ((aspectRatio - 1.7777) < 0.01) {
                                canvas.width = 192; // Desired width
                                canvas.height = 108; // Desired height
                            } else if ((aspectRatio - 1.3333) < 0.01) {
                                canvas.width = 180; // Desired width
                                canvas.height = 135; // Desired height
                            } else {
                                alert('Unknown video ratio:' + aspectRatio)
                            }
                            console.log(`Original Dimensions: ${originalWidth}x${originalHeight}`);
                            console.log(`Aspect Ratio: ${aspectRatio}`);

                            const resizeVideoFrame = () => {
                                context.drawImage(localVideo, 0, 0, canvas.width, canvas.height);
                                requestAnimationFrame(resizeVideoFrame);
                            };
                            resizeVideoFrame();
                        });

                        resizedStream = canvas.captureStream();
                        console.log(313);
                        startSignaling();
                    });


            }

            // Start any other processes like signaling here

        })
        .catch(error => {
            console.log('Error accessing media devices:', error.message, 'video: ',constraints.video, 'audio: ', constraints.audio);
            document.querySelector('div#mediaSourcePopup').classList.add('show');
        });
}

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
                applyMirrorMode();

                if (player.mic === 'on') {
                    localVideo.classList.remove('muted')
                    localVideo.srcObject.getAudioTracks().forEach(track => {
                        track.enabled = true; // Mute audio track
                    });
                }
                slot = document.querySelector('div.videobox[data-slot="' + slotN + '"]');
                slot.classList.remove('no-video')
                slot.classList.add('self-view')
                slot.querySelectorAll('video').forEach(video => video.remove());
                localVideo.removeAttribute('id')
                slot.insertBefore(localVideo, slot.firstChild);

                slot.setAttribute('data-uid', selfID)
                slot.setAttribute('data-name', player.name || 'unknown')
                slot.style.setProperty('--g-background-person', `url('${player.avatar}')`);

                if (['killed', 'disqualified', 'locked'].includes(slot.getAttribute('data-player-status'))) {
                    localVideo.origSrcObject = localVideo.srcObject
                    localVideo.srcObject = null
                }
                userName = slot.querySelector('span.game-user');
                userName.textContent = player.name || selfID;
                inputUserName = slot.querySelector('input.game-user');
                inputUserName.value = player.name || 'unknown';

                participant = true
                break
            }
        }
    } else {
        participant = true // host
    }
    if (!participant) {
        // localVideo.srcObject.getTracks()
    }
    return participant
}

function updateStatuses() {
    for (const [slotN, player] of Object.entries(roomEnv.slot)) {
        barSlot = document.querySelector('div.e-bar[data-slot="' + slotN + '"]')
        barSlot.setAttribute('data-status', player.status)
    }
}

async function initializeTransportsSequentially(ws, clientId, uids, participant) {
console.log('participant:', participant)
    // if (participant) {
        try {
            // Check if user is still active
            const wsActiveState = await sendRequest(ws, {
                type: 'check-ws-active',
                uid: clientId
            });

            if (!wsActiveState?.status) {
                handlePeerLeft(clientId);
                console.log(`User ${clientId} is not available anymore`);
                window.reload();
                return
            }
            let peerConnection;
            peerConnection = await createProducerTransport(clientId, hostID, participant);

            if (peerConnection.slot) {
                slotInfo(peerConnection.slot, 'Initialize producer transport');
            }

        } catch (error) {
            console.error(`Failed to initialize connection with ${clientId}:`, error);
            handlePeerLeft(clientId);
        }
    // }
    const otherUids = uids.filter(uid => uid !== clientId);

    for (const uid of otherUids) {
        try {
            // Check if user is still active
            const wsActiveState = await sendRequest(ws, {
                type: 'check-ws-active',
                uid: uid
            });

            if (!wsActiveState?.status) {
                handlePeerLeft(uid);
                console.log(`User ${uid} is not available anymore`);
                continue;
            }
            let peerConnection;

            peerConnection = await createConsumerTransport(clientId, uid, hostID, participant);


            if (peerConnection.slot) {
                slotInfo(peerConnection.slot, 'Initialize transport');
            }

        } catch (error) {
            console.error(`Failed to initialize connection with ${uid}:`, error);
            handlePeerLeft(uid);
        }
    }

    handleGamePhase(roomEnv.game, 'reload');
}
async function initializePeerConnectionsSequentially(ws, clientId, uids) {


    for (const uid of uids) {
        try {
            // Check if user is still active
            const wsActiveState = await sendRequest(ws, {
                type: 'check-ws-active',
                uid: uid
            });

            if (!wsActiveState?.status) {
                handlePeerLeft(uid);
                console.log(`User ${uid} is not available anymore`);
                continue;
            }
            const peerConnection = await createPeerConnection(uid, hostID, participant);

            if (peerConnection.slot) {
                slotInfo(peerConnection.slot, 'SEND offer');
            }

            // Send offer
            await sendOffer(ws, clientId, uid, peerConnection);

            console.log(`Successfully initialized connection with ${uid}`);
        } catch (error) {
            console.error(`Failed to initialize connection with ${uid}:`, error);
            handlePeerLeft(uid);
        }
    }
    handleGamePhase(roomEnv.game, 'reload');
}

// Usage:

function startSignaling() {
    wsConnRetry++;
    // Create WebSocket connection using the retrieved URL
    ws = new WebSocket(websocketUrl);
    ws.onopen = () => {
        wsConnRetry = 0;
        ws.send(JSON.stringify({type: 'join-game', roomId: roomId, sessionID: chatSessionID}));

    };

    ws.onclose = (event) => {
        console.log('WebSocket closed. Reconnecting...');
        if (wsConnRetry < 5) {
            setTimeout(window.location.reload(), 1000); // Retry after 1 second
        }

    };

    ws.onmessage = async(event) => {
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
            if (data.rtpCapabilities ?? null) {
                await window.mediasoup.device.load({ routerRtpCapabilities: data.rtpCapabilities });

            }

            if (sessionID !== hostID) {

                gamePanel = document.querySelector('div.game-panel')
                gamePanel.setAttribute('data-mode', "player")

                let gameMode = document.querySelector('div.game.videos')
                gameMode.setAttribute('data-mode', "player")

                if (hostPanel = document.querySelector('div.host-panel')) {
                    hostPanel.remove()
                }
            } else {
                hostVideo = document.getElementById('hostVideo')
                hostVideo.parentElement.setAttribute('data-uid',hostID)
                if (!hostVideo.srcObject) {
                    hostVideo.srcObject = localVideo.srcObject;
                    hostVideo.classList.add('muted')
                    hostVideo.parentElement.classList.add('self-view')
                    hostVideo.parentElement.classList.remove('no-video')

                    localVideo.classList.remove('muted')
                    localVideo.srcObject = null;
                    localVideo.remove();
                }

                gamePanel = document.querySelector('div.game-panel')
                gamePanel.setAttribute('data-mode', "host")

                deckPanel = document.querySelector('div.deck-container')
                deckPanel.setAttribute('data-mode', "host")

                let gameMode = document.querySelector('div.game.videos')
                gameMode.setAttribute('data-mode', "host")
                if (roomEnv.game?.settings?.sandbox) {
                    document.documentElement.style.setProperty('--g-settings-sandbox', 'visible');
                } else {
                    document.documentElement.style.setProperty('--g-settings-sandbox', 'hidden');
                }

                if (playerPanel = document.querySelector('div.player-panel')) {
                    playerPanel.remove();
                }

                detectGameState()
                // handleGamePhase(roomEnv.game)
                // };

            }
            // const peersPromises = [];
            // const users = data?.room?.users || {};
            // const peerUids = Object.keys(users).filter(uid => uid !== sessionID);
            const peerUids = [
                ...Object.values(data.room.slot)
                    .map(slotItem => slotItem.uid)
                    .filter(uid => uid !== 'empty' && uid !== sessionID),
                ...(data.room.host.uid !== sessionID ? [data.room.host.uid] : [])
            ].filter(Boolean);  // This removes any undefined/null values

             // ->>>>  await initializePeerConnectionsSequentially(ws, clientId, peerUids);
            await initializeTransportsSequentially(ws, clientId, peerUids, participant);


        } else if (data.type === 'participant-joined') {
            // Handle new participant joined
            const clientId = data.id;
            // , data.avatar
            roomEnv = data.room;
            if (sessionID != clientId) {
                if (window.mediasoup.device) {

                    const peerObjects = [
                        // Process slots - preserve index via Object.entries()
                        ...Object.entries(data.room.slot)
                            .filter(([idx, slotItem]) => slotItem.uid === clientId && slotItem.uid !== sessionID)
                            .map(([idx, slotItem]) => ({
                                ...slotItem,  // Keep all original slot properties
                                idx: Number(idx)  // Add the original index
                            })),

                        // Process host (no index needed)
                        ...(data.room.host.uid === clientId ? [{
                            ...data.room.host,
                            isHost: true,  // Flag to identify host
                            slot: 'H'
                        }] : [])
                    ].filter(Boolean);

// Result will contain full objects where uid matches clientId
                    console.log("Matching objects:", peerObjects);
                    if (peerObjects.length > 0) {
                        peerConnection = await createConsumerTransport(sessionID, clientId, roomEnv.host.uid, peerObjects[0]);
                    }

                } else {
                    if (clientId === data.room.gameHost.uid) {
                        peerConnection = await createPeerConnection(clientId, clientId);
                    } else {
                        peerConnection = await createPeerConnection(clientId);
                    }
                }
            }

        } else if (data.type === 'request-response') {
            if (pendingRequests.hasOwnProperty(data.requestId)) {
                pendingRequests[data.requestId].resolve(data);
                // Remove the entry from the dictionary
                delete pendingRequests[data.requestId];
            } else {
                handleError({message: 'Undefined request:' + data.requestId}, 'error');
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
        } else if (data.type === 'redirect') {
            handleRedirect(data);
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
        } else if (data.type === 'sherif-made-check') {
            madeCheck(data);
        } else if (data.type === 'don-made-check') {
            madeCheck(data);
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
        } else if (data.type === 'player-comm-witness') {
            handlePlayerCommWitness(data);
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
        } else if (data.type === 'mainButton') {
            handleMainButton(data);
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
        var now = '' + d.getHours() + 'h ' + d.getMinutes() + 'm';

        row.innerHTML = `<td class="chat-time">` + now + `</td>`;
        row.innerHTML += `<td class="chat-from">` + data['client-id'] + `</td>`;
        row.innerHTML += `<td class="chat-to">` + '' + `</td>`;
        row.innerHTML += `<td class="chat-message">` + escapeHtml(data.message) +
            `<button style="float:right;" class="btn btn-danger" id="deny_` + data['client-id'] + `">Deny Request</button>
        <button style="float:right;" class="btn btn-success" id="accept_` + data['client-id'] + `">Accept Request</button></td>`;

        if (data.from === sessionID) {
            row.classList.add('self-message');
        } else if (data.from === roomEnv.host.uid) {
            row.classList.add('host-message');
        }

        table.appendChild(row);

        var acceptGuest = document.getElementById("accept_" + data['client-id'])
        acceptGuest.onclick = function () {
            ws.send(JSON.stringify({
                type: 'grant-access',
                from: hostId,
                to: data['client-id'],
                'client-session': data["client-session"],
                roomId: roomId,
                access: true
            }));
        };
        var denyGuest = document.getElementById("deny_" + data['client-id'])
        denyGuest.onclick = function () {
            ws.send(JSON.stringify({
                type: 'grant-access',
                from: hostId,
                to: data['client-id'],
                'client-session': data["client-session"],
                roomId: roomId,
                access: false
            }));
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

function addAvatar(peerId, avatarUrl) {
    const guestsContainer = document.querySelector('div.guests-container');
    const span = document.createElement('span');

    // Create a new img element
    const img = document.createElement('img');
    img.src = avatarUrl;
    img.alt = 'Guest Avatar';
    img.setAttribute('data-spectator-uid', peerId);

    span.appendChild(img)
    // Add the img to the container
    guestsContainer.appendChild(span);
}

function nominate(el) {
    let slot = el.parentElement.getAttribute('data-slot')
    let gameMode = document.querySelector('div.game.videos').getAttribute('data-mode')
    if (gameMode === "player") {
        ws.send(JSON.stringify({type: 'nominate-player', slot: slot}));
    } else if (gameMode === "host") {
        ws.send(JSON.stringify({type: 'nominate', slot: slot}));
    }
}

async function checkRole(el) {
    let slot = el.parentElement.getAttribute('data-slot')
    let checkBy = el.getAttribute('data-check-by')
    const response = await sendRequest(ws, {type: 'get-' + checkBy + '-check', slot});
    switch(response.role) {
        case 'S':
            sfx.donCheckSheriff.play()
            gameMessage(''+slot+' is a SHERIFF', 2)
            break;
        case 'NS':
            gameMessage(''+slot+' NOT a SHERIFF', 2)
            sfx.donCheckNotSheriff.play()
            break;
        case 'B':
            gameMessage(''+slot+' is MAFIA', 2)
            sfx.sheriffCheckMafia.play()
            break;
        case 'R':
            gameMessage(''+slot+' is CITIZEN', 2)
            sfx.sheriffCheckCitizen.play()
            break;
    }

    el.setAttribute('data-checked-role', response.role)
}

