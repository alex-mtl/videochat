const configuration = {iceServers: [{urls: 'stun:stun.l.google.com:19302'}]};
const constraints = {video: false, audio: true};
const localVideo = document.getElementById('localVideo');
const streamVideo = document.getElementById('streamVideo');
const remoteVideosContainer = document.querySelector('div.local-stream');
var sessionID = null;
var roomEnv = null;
let localStream;
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
function createPeerConnection(peerId, streamer = false) {
    const peerConnection = new RTCPeerConnection(configuration);

    localStream.getTracks().forEach(track => {
        console.log('peerId', peerId, 'track', track);
        peerConnection.addTrack(track, localStream);
    });

    console.log('streamer: ', peerId, ' = ', streamer);
    peerConnection.ontrack = event => {
        if (streamer) {
            streamVideo.srcObject = event.streams[0];
            // viStream = event.streams[0].getVideoTracks()[0];
            // if (viStream && !viStream.enabled) {
            //     streamVideo
            // } else {
            //     streamVideo.srcObject = event.streams[0];
            // }

        } else {
            console.log('Not a streamer: ', peerId, ' = ', streamer);
            if (document.getElementById('video-' + peerId) === null) {
                remoteVideoFrame = createRemoteVideo(peerId, event.streams[0]);
                remoteVideosContainer.appendChild(remoteVideoFrame);
            }
        }

    };
    peerConnections[peerId] = peerConnection;
    return peerConnection;
}

function createRemoteVideo(videoID, srcObject) {
    const remoteVideoFrame = document.createElement('div');
    const remoteVideo = document.createElement('video');
    remoteVideo.srcObject = srcObject;
    remoteVideo.autoplay = true;
    remoteVideo.classList.add('play');
    remoteVideo.muted = false;
    remoteVideoFrame.id = 'video-' + videoID;
    remoteVideoFrame.setAttribute('alt', videoID);
    remoteVideoFrame.appendChild(remoteVideo);
    remoteVideoFrame.classList.add("videobox");
    return remoteVideoFrame;
}

function sendMessage(elem) {
    let message = document.getElementById('chat-input').value;

    ws.send(JSON.stringify({type: 'send-chat-message', 'from': sessionID, to: 'all', message: message}));

}

function removePeerConnection(id) {
    delete peerConnections[id];
}

function adjustVolume(video, volume) {
    video.volume = volume;
}

function streamVideoToggle() {
    stream = streamVideo.srcObject;
    tracks = stream.getVideoTracks();

    tracks.forEach((track) => {
        txt = track.enabled ? 'videocam' : 'videocam_off' ;
        track.enabled = !track.enabled; //stop();
    });

    btn = document.getElementById('hostVideoToggle');
    btn.textContent = txt;
    btn.setAttribute('alt', txt);
    btn.setAttribute('tooltip', txt);
}

function streamAudioToggle() {
    streamVideo.muted = !streamVideo.muted;
    const audioTracks = streamVideo.srcObject.getAudioTracks();
    let txt = '';
    audioTracks.forEach(track => {
        txt = track.enabled ? 'volume_up' : 'volume_off' ;
        track.enabled = !track.enabled;
    });
    btn = document.getElementById('hostAudioToggle');
    btn.textContent = txt;
    btn.setAttribute('alt', txt);
    btn.setAttribute('tooltip', txt);
}
function toggleFullScreen() {
    const videobox = document.getElementById('streamVideo');
    if (!document.fullscreenElement) {
        videobox.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
}

// Add event listener for fullscreen change
document.addEventListener('fullscreenchange', () => {
    const videobox = document.getElementById('streamVideo');
    if (document.fullscreenElement) {
        // Set videobox size to 100% width and height
        videobox.style.width = '100%';
        videobox.style.height = '100%';
        videobox.style.objectFit = 'contain'; // Adjust video to fit within the container
    } else {
        // Restore original size
        videobox.style.width = '';
        videobox.style.height = '';
        videobox.style.objectFit = '';
    }
});