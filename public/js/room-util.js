const configuration = {iceServers: [{urls: 'stun:stun.l.google.com:19302'}]};
const constraints = {video: true, audio: true};
const localVideo = document.getElementById('localVideo');
const remoteVideosContainer = document.getElementById('remoteVideos');
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
     remoteVideoFrame.style="display:inline-block;float:left;";
     // remoteVideo.style = "";
     remoteVideoFrame.appendChild(remoteVideo);
     remoteVideoFrame.classList.add("videobox");
     muteAudio = document.createElement('button');
     muteAudio.textContent = 'volume_off' ;
     muteAudio.classList.add("material-symbols-outlined");
     muteAudio.style="margin-left:40px;"
     muteAudio.onclick = function () {
         this.parentElement.querySelector('video').muted = !this.parentElement.querySelector('video').muted;
         this.textContent = this.parentElement.querySelector('video').muted ? 'volume_up' : 'volume_off' ;
         txt = this.parentElement.querySelector('video').muted ? 'Unmute' : 'Mute' ;
         this.setAttribute('alt', txt);
         this.setAttribute('tooltip', txt);
         this.parentElement.querySelector('video').classList.toggle('muted')
     };
     remoteVideoFrame.appendChild(muteAudio);

     muteVideo = document.createElement('button');
     muteVideo.textContent = 'videocam_off' ;
     muteVideo.classList.add("material-symbols-outlined");
     muteVideo.onclick = function () {
         video = this.parentElement.querySelector('video');
         if (video.classList.contains('play')) {
             txt = 'videocam'; // : 'Stop' ;
             stream = video.srcObject;
             tracks = stream.getTracks();

             tracks.forEach((track) => {
                 if (track.kind === 'video') track.enabled = false; //stop();
             });
         } else {
             txt = 'videocam_off' ;
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
     return remoteVideoFrame;
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