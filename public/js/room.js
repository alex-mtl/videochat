const configuration = {iceServers: [{urls: 'stun:stun.l.google.com:19302'}]};
const constraints = {video: true, audio: true};

const localVideo = document.getElementById('localVideo');
const localScreen = document.getElementById('localScreen');

const remoteVideosContainer = document.getElementById('remoteVideos');
var sessionID = null;
var roomEnv = null;
let localStream;
let mediaStream = null;
const peerConnections = {};
var ws = null;

function escapeHtml(unsafe)
{
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
navigator.mediaDevices.getUserMedia(constraints)
    .then(stream => {
        localStream = stream;
        localVideo.srcObject = stream;
        startSignaling();
    })
    .catch(error => {
        console.error('Error accessing media devices:', error);
    });

function shareScreen() {
    navigator.mediaDevices.getDisplayMedia({
        video: {
            cursor: "always"
        },
        audio: false
    })
        .then(stream => {
            mediaStream = stream;
            localScreen.srcObject = stream;
            ws.send(JSON.stringify({type: 'share-screen', roomId: roomId, userID: sessionID}));
        })
        .catch(error => {
            console.error('Error accessing media devices:', error);
        });
}

function createPeerConnection(peerId, mode = null) {
    const peerConnection = new RTCPeerConnection(configuration);

    if (mode === null) {
        localStream.getTracks().forEach(track => {
            console.log('peerId', peerId, 'track', track);
            peerConnection.addTrack(track, localStream);
        });
    } else if (mode === "screen") {
        mediaStream.getTracks().forEach(track => {
            console.log('peerId', peerId+mode, 'track', track);
            peerConnection.addTrack(track, mediaStream);
        });
    }

    peerConnection.ontrack = event => {
        if (
            (document.getElementById('video-' + peerId) === null)
            &&
            (mode === null)
        ) {
            const remoteVideoFrame = document.createElement('div');
            const remoteVideo = document.createElement('video');
            remoteVideo.srcObject = event.streams[0];
            remoteVideo.autoplay = true;
            remoteVideo.classList.add('play');
            remoteVideo.muted = false;
            remoteVideoFrame.id = 'video-' + peerId;
            remoteVideoFrame.setAttribute('alt', peerId);
            remoteVideoFrame.style="display:inline-block;float:left;";
            // remoteVideo.style = "";
            remoteVideoFrame.appendChild(remoteVideo);

            if (parentID === null) {
                muteAudio = document.createElement('button');
                muteAudio.textContent = '🔇Mute' ;
                muteAudio.onclick = function () {
                    this.parentElement.querySelector('video').muted = !this.parentElement.querySelector('video').muted;
                    this.textContent = this.parentElement.querySelector('video').muted ? '🔈Unmute' : '🔇Mute' ;
                    txt = this.parentElement.querySelector('video').muted ? 'Unmute' : 'Mute' ;
                    this.setAttribute('alt', txt);
                    this.setAttribute('tooltip', txt);
                    this.parentElement.querySelector('video').classList.toggle('muted')
                };
                remoteVideoFrame.appendChild(muteAudio);
            }

            muteVideo = document.createElement('button');
            muteVideo.textContent = 'Stop' ;
            muteVideo.onclick = function () {
                video = this.parentElement.querySelector('video');
                if (video.classList.contains('play')) {
                    txt = 'Play'; // : 'Stop' ;
                    stream = video.srcObject;
                    tracks = stream.getTracks();

                    tracks.forEach((track) => {
                        if (track.kind === 'video') track.enabled = false; //stop();
                    });
                } else {
                    txt = 'Stop' ;
                    stream = video.srcObject;
                    tracks = stream.getTracks();

                    tracks.forEach((track) => {
                        if (track.kind === 'video') track.enabled = true; //stop();
                    });
                }
                this.textContent = txt;
                this.setAttribute('alt', txt);
                this.setAttribute('tooltip', txt);
                this.parentElement.querySelector('video').classList.toggle('play');

            };
            remoteVideoFrame.appendChild(muteVideo);

            remoteVideosContainer.appendChild(remoteVideoFrame);
        }
    };

    peerConnections[peerId+mode] = peerConnection;
    return peerConnection;
}


function sendMessage(elem) {
    let message = document.getElementById('chat-input').value;

    ws.send(JSON.stringify({type: 'send-chat-message', 'from': sessionID, to: 'all', message: message}));

}

function removePeerConnection(id) {
    delete peerConnections[id];
    video = document.getElementById('video-'+id);
    if (video !== null) {
        video.remove();
    }
}

function startSignaling() {
            // Create WebSocket connection using the retrieved URL
    ws = new WebSocket(websocketUrl);
    ws.onopen = () => {
        ws.send(JSON.stringify({type: 'join', roomId: roomId, sessionID: chatSessionID }));
    };

    ws.onmessage = event => {
        const data = JSON.parse(event.data);
        if (data.type === 'id') {
            // Assign the unique ID received from the server
            const clientId = data.id;
            sessionID = clientId;
            roomEnv = data.room;

            console.log('You are joined as:', clientId);

            if(sessionID !== (data.room.host.uid ?? false)) {
                peerConnection = createPeerConnection(data.room.host.uid);
                peerConnection.onicecandidate = event => {
                    if (event.candidate) {
                        sendIceCandidate(sessionID, data.room.host.uid, event.candidate);
                    }
                };
                sendOffer(ws, clientId, data.room.host.uid, peerConnection);
                for(i = 2; i <= data.room.size; i++) {
                    user = data.room['u'+(i-1)];
                    if (user.uid !== sessionID) {
                        peerConnection = createPeerConnection(user.uid);
                        peerConnection.onicecandidate = event => {
                            if (event.candidate) {
                                sendIceCandidate(sessionID, user.uid, event.candidate);
                            }
                        };
                        sendOffer(ws, clientId, user.uid, peerConnection);
                    }
                }
            }

        } else if (data.type === 'participant-joined') {
            // Handle new participant joined
            const clientId = data.id;
            if (sessionID != clientId) {
                peerConnection = createPeerConnection(clientId);
                peerConnection.onicecandidate = event => {
                    if (event.candidate) {
                        sendIceCandidate(sessionID, clientId, event.candidate);
                    }
                };
                console.log('Participant joined:', clientId);
            }
        } else if (data.type === 'screen-id') {
            screenID = data.screenID;
            roomEnv = data.room;

            console.log('Your screen shared as:', screenID);

            if(data.room.host.uid !== data.userID) {
                peerConnection = createPeerConnection(data.room.host.uid, "screen");
                peerConnection.onicecandidate = event => {
                    if (event.candidate) {
                        sendIceCandidate(sessionID, data.room.host.uid, event.candidate);
                    }
                };
            }
            sendOffer(ws, clientId, data.room.host.uid, peerConnection);
            for (i = 2; i <= data.room.size; i++) {
                user = data.room['u' + (i - 1)];
                if (user.uid !== sessionID) {
                    peerConnection = createPeerConnection(user.uid);
                    peerConnection.onicecandidate = event => {
                        if (event.candidate) {
                            sendIceCandidate(sessionID, user.uid, event.candidate);
                        }
                    };
                    sendOffer(ws, clientId, user.uid, peerConnection);
                }
            }

        } else if (data.type === 'screen-shared') {
            // Handle new participant joined
            const clientId = data.screenID;
            if (sessionID != data.uid) {
                peerConnection = createPeerConnection(clientId, data.uid);
                peerConnection.onicecandidate = event => {
                    if (event.candidate) {
                        sendIceCandidate(sessionID, clientId, event.candidate);
                    }
                };
                console.log('Screen joined:', clientId);
            }

        } else if (data.type === 'participant-left') {
            // Handle participant left
            console.log('Participant left:', data.id);
            roomEnv = data.room;
            removePeerConnection(data.id);
        } else if (data.type === 'offer') {
            console.log('Offer:', data.id, data.description);
            handleOffer(data);
        } else if (data.type === 'participant-offer') {
            const clientId = data.from;
            if (sessionID != clientId) {
                console.log('Offer:', data.from, data.description);
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
        }
    };


    function handleOffer(offer) {
        const peerConnection = peerConnections[offer.from];
        if (peerConnection == undefined) {
            console.error('Peer  connection ', offer.from, 'undefined');
        } else {
            peerConnection.setRemoteDescription(new RTCSessionDescription(offer.description));
            peerConnection.createAnswer()
                .then(answer => peerConnection.setLocalDescription(answer))
                .then(() => {
                    sendAnswer(offer.from, peerConnection.localDescription);
                })
                .catch(error => {
                    console.error('Error creating answer:', error);
                });
        }

    }

    function handleAnswer(answer) {
        const peerConnection = peerConnections[answer.from];

        peerConnection.setRemoteDescription(new RTCSessionDescription(answer.description));
    }

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

    function handleChatMessage(data) {
        table = document.getElementById('chat-messages');

        var row = document.createElement('tr');

        row.innerHTML = `<td class="chat-time">`+data.time+`</td>`;
        row.innerHTML += `<td class="chat-from">`+data.from+`</td>`;
        row.innerHTML += `<td class="chat-to">`+''+`</td>`;
        row.innerHTML += `<td class="chat-message">`+escapeHtml(data.message)+`</td>`;

        if (data.from === sessionID) {
            row.classList.add('self-message');
        } else if (data.from === roomEnv.host.uid) {
            row.classList.add('host-message');
        }

        table.appendChild(row);

    }

    function handleIceCandidate(candidate) {
        const peerConnection = peerConnections[candidate.from];
        if (peerConnection !== undefined) {
            peerConnection.addIceCandidate(new RTCIceCandidate(candidate.candidate));
        } else {
            console.log('Peer connection not found: ', candidate.from);
        }

    }

    async function sendOffer(ws, from, to, peerConnection) {
        const offerOptions = {
            offerToReceiveAudio: 1,
            offerToReceiveVideo: 1
        };
        const offer = await peerConnection.createOffer(offerOptions);
        await peerConnection.setLocalDescription(offer);
        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                sendIceCandidate(from, to, event.candidate);
            }
        };
        console.log('Peer connection created:', from, to, peerConnection, offer);
        console.log('sessionID :', sessionID);
        ws.send(JSON.stringify({type: 'offer', from, to, offer}));
    }

    function sendAnswer(to, description) {
        console.log('answer sessionID :', sessionID);
        ws.send(JSON.stringify({type: 'answer', to, from: sessionID, description}));
    }

    function sendIceCandidate(from, to, candidate) {
        ws.send(JSON.stringify({type: 'ice-candidate', from, to, candidate}));
    }
}
