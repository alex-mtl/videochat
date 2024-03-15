const configuration = {iceServers: [{urls: 'stun:stun.l.google.com:19302'}]};
const constraints = {video: true, audio: true};
const localVideo = document.getElementById('streamVideo');
const remoteVideosContainer = document.querySelector('div.peers');
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
function createPeerConnection(peerId) {
    const peerConnection = new RTCPeerConnection(configuration);

    localStream.getTracks().forEach(track => {
        console.log('peerId', peerId, 'track', track);
        peerConnection.addTrack(track, localStream);
    });

    peerConnection.ontrack = event => {
        if (document.getElementById('video-' + peerId) === null) {
            remoteVideoFrame = createRemoteVideo(peerId, event.streams[0]);
            remoteVideosContainer.appendChild(remoteVideoFrame);
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
    let row = document.querySelector('tr[data-id="'+id+'"]');
    if (row) {
        // Update the second <td> text content to "LEFT"
        let td = row.querySelector('td:nth-child(2)');
        if (td) {
            td.textContent = "LEFT";
        }

        // Remove the table row after 2 seconds
        setTimeout(() => {
            row.remove();
        }, 2000);
    }
    video = document.getElementById('video-'+id);
    if (video !== null) {
        video.remove();
    }
}

function adjustVolume(video, volume) {
    video.volume = volume;
}

function hostVideoToggle() {
    const videoTracks = localVideo.srcObject.getVideoTracks();
    let txt = '';
    videoTracks.forEach(track => {
        txt = track.enabled ? 'videocam' : 'videocam_off' ;
        track.enabled = !track.enabled;
    });
    btn = document.getElementById('hostVideoToggle');
    btn.textContent = txt;
    btn.setAttribute('alt', txt);
    btn.setAttribute('tooltip', txt);
}

function hostAudioToggle() {
    const audioTracks = localVideo.srcObject.getAudioTracks();
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

