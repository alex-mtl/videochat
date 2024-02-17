let roomId = 'test-room';

navigator.mediaDevices.getUserMedia(constraints)
    .then(stream => {
        localStream = stream;
        localVideo.srcObject = stream;
        startSignaling();
    })
    .catch(error => {
        console.error('Error accessing media devices:', error);
    });

function startSignaling() {
            // Create WebSocket connection using the retrieved URL
    ws = new WebSocket(websocketUrl);
    ws.onopen = () => {
        ws.send(JSON.stringify({type: 'join', roomId: roomId}));
    };

    ws.onmessage = event => {
        const data = JSON.parse(event.data);
        if (data.type === 'id') {
            // Assign the unique ID received from the server
            const clientId = data.id;
            sessionID = clientId;
            roomEnv = data.room;

            console.log('You are joined as:', clientId);

            if(sessionID !== data.room.host.uid) {
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
        peerConnection.addIceCandidate(new RTCIceCandidate(candidate.candidate));
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
