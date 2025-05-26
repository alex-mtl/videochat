function handleOffer(offer) {
    const peerConnection = peerConnections[offer.from];
    if (peerConnection == undefined) {
        console.error('Peer  connection ', offer.from, 'undefined');
    } else {
        peerConnection.setRemoteDescription(new RTCSessionDescription(offer.description))
            .then(() => peerConnection.createAnswer())
            .then(answer => peerConnection.setLocalDescription(answer))
            .then(() => {
                sendAnswer(offer.from, peerConnection.localDescription);
            })
            .catch(error => {
                console.error('Error creating answer:', error);
            });
    }

}

// function handleAnswer(answer) {
//     const peerConnection = peerConnections[answer.from];
//     peerConnection.setRemoteDescription(new RTCSessionDescription(answer.description));
// }

async function handleAnswer(answer) {
    const peerConnection = peerConnections[answer.from];

    // Modify the SDP to prioritize codecs
    const preferredCodecs = ["video/H264", "video/VP8", "video/VP9"];
    const modifiedSDP = prioritizeCodecs(answer.description.sdp, preferredCodecs);

    // Set the modified SDP as the remote description
    const modifiedAnswer = new RTCSessionDescription({
        type: 'answer',
        sdp: modifiedSDP
    });

    if (peerConnection.signalingState === 'have-local-offer') {
        await peerConnection.setRemoteDescription(modifiedAnswer);
    } else {
        console.error("Ошибка: соединение не ожидает answer. Текущее состояние:", peerConnection.signalingState);

        if (peerConnection?.slot) {
            slotInfo(peerConnection.slot, 'State: ' + peerConnection.signalingState)
            // let slotElem = document.querySelector('div.videobox[data-slot="'+peerConnection.slot+'"] span.game-info');
            // await peerRefresh(slotElem)
        }

        // Варианты восстановления:
        // 1. Создать новый offer
        // 2. Перезапустить соединение
    }

}

function prioritizeCodecs(sdp, codecs) {
    const videoPattern = /^m=video.*$/gm;

    return sdp.replace(videoPattern, (videoLine) => {
        const parts = videoLine.split(' ');
        const mLine = parts.slice(0, 3); // "m=video 9 UDP/TLS/RTP/SAVPF"
        const payloadTypes = parts.slice(3);

        const prioritizedPayloadTypes = codecs
            .map(codec => {
                const match = sdp.match(new RegExp(`a=rtpmap:(\\d+) ${codec}\\/`, 'i'));
                return match ? match[1] : null;
            })
            .filter(pt => pt !== null);

        const remainingPayloadTypes = payloadTypes.filter(pt => !prioritizedPayloadTypes.includes(pt));

        return [...mLine, ...prioritizedPayloadTypes, ...remainingPayloadTypes].join(' ');
    });
}

async function checkCodecInUse(peerConnection) {
    const stats = await peerConnection.getStats();
    let codecInfo = null;

    stats.forEach(report => {
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
            // Get the codecId for the incoming video stream
            const codecId = report.codecId;

            // Find the codec details using the codecId
            stats.forEach(innerReport => {
                if (innerReport.id === codecId) {
                    codecInfo = innerReport;
                }
            });
        } else if (report.kind === 'video') {
            // console.log('Report type:', report.type)
        }
    });

    if (codecInfo) {
        console.log(`Codec in use: ${codecInfo.mimeType}, Payload Type: ${codecInfo.payloadType}`, peerConnection?.slot);
    } else {
        if (peerConnection?.slot) {
            slotInfo(peerConnection.slot, 'No codec information')

            // let slotElem = document.querySelector('div.videobox[data-slot="'+peerConnection.slot+'"] span.game-info');
            // await peerRefresh(slotElem)
        }
        peerConnection.iceConnectionState
        // console.log('ICE connection state:', peerConnection.iceConnectionState);
        // console.log('No codec information found for the incoming video stream. Slot:', peerConnection?.slot);
        // console.log(stats);
    }
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
        offerToReceiveVideo: 1,
        voiceActivityDetection: true,
        iceRestart: true
    };
    const offer = await peerConnection.createOffer(offerOptions);
    // const vp9Sdp = forceVP9(offer.sdp);
    // console.log(offer.sdp)
    // await peerConnection.setLocalDescription({offer, sdp: vp9Sdp});
    await peerConnection.setLocalDescription(offer);
    // peerConnection.onicecandidate = event => {
    //     console.log(254, 'Candidate:', event.candidate)
    //     if (event.candidate) {
    //         sendIceCandidate(from, to, event.candidate);
    //     }
    // };
    ws.send(JSON.stringify({type: 'offer', from, to, offer}));
}

function sendAnswer(to, description) {
    ws.send(JSON.stringify({type: 'answer', to, from: sessionID, description}));
}

function sendIceCandidate(from, to, candidate) {
    ws.send(JSON.stringify({type: 'ice-candidate', from, to, candidate}));
}