
async function createConsumerTransport(peerId, producerId, hostID, participant = true, avatar = null) {
    console.log(producerId)
    const peerConnection = peerConnections[producerId] || {};
    peerConnection.uid = producerId;
    // if (!peerConnections[peerId]) {
    //     peerConnections[peerId] = {
    //         uid: peerId,
    //         consumerTransport: null,
    //         producerTransport: null,
    //         videoProducer: null,
    //         audioProducer: null,
    //         videoConsumer: null,
    //         audioConsumer: null,
    //         slot: null
    //     };
    // }
    const selfPeer = peerConnections[peerId];
    console.log('createConsumerTransport', producerId);

    // Find peer slot in DOM
    let peerSlot;
    if (participant && typeof participant === 'object') {
        peerSlotN = (participant.slot && participant.slot !== 'none') ? participant.slot : participant.idx
        peerConnection.slot = peerSlotN;
        peerSlot = document.querySelector(`div.videobox[data-slot="${peerSlotN}"]`);
        peerSlot.setAttribute('data-uid', producerId);
        console.log('Refreshed: '+peerSlotN )

    } else {
        peerSlot = document.querySelector(`div.videobox[data-uid="${producerId}"]`);
        if (peerSlot) {
            const peerSlotN = peerSlot.getAttribute('data-slot');
            if (peerSlotN) {
                peerConnection.slot = peerSlotN;
                slotInfo(peerSlotN, 'New consumer connection created');
            }
        } else {
            peerConnection.slot = null;
        }
    }


    // 1. Create consumer transport if it doesn't exist
    if (!selfPeer.consumerTransport) {
        const transportResponse = await sendRequest(ws, {
            type: 'create-consumer-transport',
            uid: peerId
        });

        if (transportResponse?.status !== "consumer-transport-created") {
            throw new Error('Consumer transport creation failed');
        }

        // 2. Initialize consumer transport
        selfPeer.consumerTransport = window.mediasoup.device.createRecvTransport({
            id: transportResponse.data.id,
            iceParameters: transportResponse.data.iceParameters,
            iceCandidates: transportResponse.data.iceCandidates,
            dtlsParameters: transportResponse.data.dtlsParameters
        });

        // 3. Set up transport handlers (ONCE)
        selfPeer.consumerTransport.on('connect', async ({ dtlsParameters }, callback) => {
            try {
                const response = await sendRequest(ws, {
                    type: 'connect-consumer-transport',
                    dtlsParameters
                });
                if (response.status === "transport-connected") {
                    callback(); // Critical for mediasoup
                } else {
                    throw new Error('DTLS handshake failed');
                }
            } catch (error) {
                console.error("Consumer DTLS connection failed:", error);
                peerConnection.consumerTransport?.close();
            }
        });
    }

    // 4. Consume the track and attach to DOM
    try {
        const consumeResponse = await sendRequest(ws, {
            type: 'consume',
            uid: peerId,
            producerId: producerId,
            kind: 'video',
            rtpCapabilities: window.mediasoup.device.rtpCapabilities
        });

        const [videoResponse, audioResponse] = await Promise.all([
            sendRequest(ws, {
                type: 'consume',
                uid: peerId,
                producerId: producerId,
                kind: 'video',
                rtpCapabilities: window.mediasoup.device.rtpCapabilities
            }),
            sendRequest(ws, {
                type: 'consume',
                uid: peerId,
                producerId: producerId,
                kind: 'audio',
                rtpCapabilities: window.mediasoup.device.rtpCapabilities
            })
        ]);

        if (videoResponse?.status === "consumer-created") {
            peerConnection.videoConsumer = await selfPeer.consumerTransport.consume({
                id: videoResponse.data.id,
                producerId: videoResponse.data.producerId,
                kind: videoResponse.data.kind,
                rtpParameters: videoResponse.data.rtpParameters
            });
        }

        if (audioResponse?.status === "consumer-created") {
            peerConnection.audioConsumer = await selfPeer.consumerTransport.consume({
                id: audioResponse.data.id,
                producerId: audioResponse.data.producerId,
                kind: audioResponse.data.kind,
                rtpParameters: audioResponse.data.rtpParameters
            });
            console.log(`Audio consumer created for producer ${producerId}`);
        }

        // Create video element if it doesn't exist
        let videoElement = peerSlot.querySelector('video');
        if (!videoElement) {
            videoElement = document.createElement('video');
            videoElement.autoplay = true;
            videoElement.playsInline = true;
            peerSlot.appendChild(videoElement);
        }

        // Attach the stream
        const stream = new MediaStream();
        if (peerConnection.videoConsumer) stream.addTrack(peerConnection.videoConsumer.track);
        if (peerConnection.audioConsumer) stream.addTrack(peerConnection.audioConsumer.track);
        videoElement.srcObject = stream;
        peerSlot.classList.remove('no-video')
        peerConnection.videoConsumer.on('producerclose', () => {
            videoElement.srcObject = null;
            handlePeerLeft(producerId)
        });



    } catch (error) {
        console.error(`Failed to consume from producer ${producerId}:`, error);
        throw error;
    }

    // Handle avatar for spectators
    if (avatar && !participant && !hostID) {
        console.log("Spectator: ", peerId);
        if (avatar) {
            addAvatar(peerId, avatar);
        }
    }

    peerConnections[producerId] = peerConnection;
    return peerConnection;
}
async function createProducerTransport(peerId, hostID, participant = true, avatar = null) {
    let peerConnection = {}
    peerConnection.uid = peerId
    console.log('createProducerTransport', peerId)

    peerSlot = document.querySelector('div.videobox[data-uid="' + peerId+'"]')
    if (peerSlot) {
        peerSlotN = peerSlot.getAttribute('data-slot')
        if (peerSlotN) {
            peerConnection.slot = peerSlotN
            slotInfo(peerSlotN, 'New peer connection created')
        }

    } else {
        console.log('Peer slot not found')
    }
    if (peerConnections[peerId]) {
        // peerConnections[peerId].close()
        // delete(peerConnections[peerId])
        removePeerConnection(peerId)
    }

    // 1. Create transport ONCE (outside track loop)
    if (!peerConnection.producerTransport) {
        const transportResponse = await sendRequest(ws, {
            type: 'create-producer-transport',
            uid: peerId
        });

        if (transportResponse?.status !== "producer-transport-created") {
            throw new Error('Transport creation failed');
        }

        // 2. Initialize transport
        peerConnection.producerTransport = window.mediasoup.device.createSendTransport({
            id: transportResponse.data.id,
            iceParameters: transportResponse.data.iceParameters,
            iceCandidates: transportResponse.data.iceCandidates,
            dtlsParameters: transportResponse.data.dtlsParameters
        });

        // 3. Set up transport handlers (ONCE)
        peerConnection.producerTransport.on('connect', async ({ dtlsParameters }, callback) => {
            try {
                const response = await sendRequest(ws, {
                    type: 'connect-producer-transport',
                    dtlsParameters
                });
                if (response.status === "transport-connected") {
                    callback(); // Critical for mediasoup
                } else {
                    throw new Error('DTLS handshake failed');
                }
            } catch (error) {
                console.error("DTLS connection failed:", error);
                peerConnection.producerTransport.close();
            }
        });

        peerConnection.producerTransport.on('produce', async ({ kind, rtpParameters }, callback) => {
            const response = await sendRequest(ws, {
                type: 'create-producer',
                kind,
                rtpParameters
            });
            callback({ id: response.data.producerId });
        });
    }

// 4. Produce tracks using the SAME transport
    resizedStream.getTracks().forEach(async track => {
        if (participant ) {
            try {
                const producerOptions = {
                    track,
                    mid: peerId
                };
                if (track.kind === 'video') {
                    producerOptions.encodings = [{
                        scalabilityMode: 'L1T1',
                    }];
                    producerOptions.codecOptions = {
                        videoGoogleStartBitrate: 50,
                        videoGoogleMaxBitrate: 120,
                        videoGoogleMinBitrate: 50
                    };
                }
                const producer = await peerConnection.producerTransport.produce( producerOptions );
                if (track.kind === 'audio') {
                    peerConnection.audioProducer = producer
                    // await peerConnection.audioProducer.pause();
                } else{

                    peerConnection.videoProducer = producer
                }
                console.log(`${track.kind} producer created:`, producer.id);
            } catch (error) {
                console.error(`Failed to produce ${track.kind}:`, error);
            }
        }
    });

    if (participant) {
        peerSlot.querySelector('video').muted = true
    }

    if (avatar && !participant && !hostID) {
        console.log("Spectator: ", peerId)
        if (avatar) {
            addAvatar(peerId, avatar)
        }
    }

    peerConnections[peerId] = peerConnection;
    return peerConnection;
}

async function restartConsumer(uid, pc) {
    const selfPeer = peerConnections[sessionID];
    if (pc.videoConsumer) pc.videoConsumer.close();
    if (pc.audioConsumer) pc.audioConsumer.close();

// 2. Create new consumer with same parameters

    const [videoResponse, audioResponse] = await Promise.all([
        sendRequest(ws, {
            type: 'consume',
            uid: sessionID,
            producerId: uid,
            kind: 'video',
            rtpCapabilities: window.mediasoup.device.rtpCapabilities
        }),
        sendRequest(ws, {
            type: 'consume',
            uid: sessionID,
            producerId: uid,
            kind: 'audio',
            rtpCapabilities: window.mediasoup.device.rtpCapabilities
        })
    ]);

    if (audioResponse?.status === "consumer-created") {
        pc.audioConsumer = await selfPeer.consumerTransport.consume({
            id: audioResponse.data.id,
            producerId: audioResponse.data.producerId,
            kind: audioResponse.data.kind,
            rtpParameters: audioResponse.data.rtpParameters
        });
    }

    if (videoResponse?.status === "consumer-created") {
        pc.videoConsumer = await selfPeer.consumerTransport.consume({
            id: videoResponse.data.id,
            producerId: videoResponse.data.producerId,
            kind: videoResponse.data.kind,
            rtpParameters: videoResponse.data.rtpParameters
        });
    }

// 4. Reattach to video element
    const videoElement = document.querySelector(`div.videobox[data-uid="${uid}"] video`);
    if (videoElement) {
        const stream = new MediaStream();
        if (pc.videoConsumer) stream.addTrack(pc.videoConsumer.track);
        if (pc.audioConsumer) stream.addTrack(pc.audioConsumer.track);
        videoElement.srcObject = stream;
    }
}


