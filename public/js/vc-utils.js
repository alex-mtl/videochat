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
    if (peerConnection.remoteDescription) {
        peerConnection.addIceCandidate(new RTCIceCandidate(candidate.candidate));
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
    ws.send(JSON.stringify({type: 'offer', from, to, offer}));
}

function sendAnswer(to, description) {
    ws.send(JSON.stringify({type: 'answer', to, from: sessionID, description}));
}

function sendIceCandidate(from, to, candidate) {
    ws.send(JSON.stringify({type: 'ice-candidate', from, to, candidate}));
}