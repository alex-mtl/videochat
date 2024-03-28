const configuration = {iceServers: [{urls: 'stun:stun.l.google.com:19302'}]};
const constraints = {
    video: {
        width: { max: 800 },
        height: { ideal: 120, max: 120 },
        frameRate: { ideal: 20, max: 25 }
    },
    audio: true
};
let localVideo = document.getElementById('localVideo')
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
function createPeerConnection(peerId, hostID, participant = true) {
    const peerConnection = new RTCPeerConnection(configuration);
    console.log('attempt to create peer:',peerId,' host => ', hostID)
    localStream.getTracks().forEach(track => {
        if (participant) {
            peerConnection.addTrack(track, localStream);
        }
    });

    peerConnection.ontrack = event => {
        if (document.getElementById('video-' + peerId) === null) {
            slot = document.querySelector('[data-uid="' + peerId+'"]')
            if ( slot === null) {
                for (const [slotN, player] of Object.entries(roomEnv.slot)) {
                    if (player.uid === peerId) {
                        slot = document.querySelector('div.videobox[data-slot="' + slotN+'"]');
                        break
                    }
                }
            }
            if ( slot === null) {
                if (participant && (peerId === hostID)) {
                    bindHostVideo(peerId, event.streams[0], document.getElementById('game-host'));
                } else {
                    remoteVideoFrame = createRemoteVideo(peerId, event.streams[0], hostID);
                    remoteVideosContainer.appendChild(remoteVideoFrame);
                }

            } else {
                bindRemoteVideo(peerId, event.streams[0], slot);
            }
        }
    };
    peerConnections[peerId] = peerConnection;
    return peerConnection;
}

function toggleAudio(elem) {
    if (elem.parentElement.classList.contains('self-view')) {
        const audioTracks =  elem.parentElement.querySelector('video').srcObject.getAudioTracks();
        let txt = '';
        audioTracks.forEach(track => {
            txt = track.enabled ? 'volume_up' : 'volume_off' ;
            track.enabled = !track.enabled;
            micOn = track.enabled ? 'on' : 'off'
        });
        elem.parentElement.querySelector('video').classList.toggle('muted')
        elem.textContent = txt ;
        txt = (micOn === 'off') ? 'Unmute' : 'Mute' ;
        elem.setAttribute('alt', txt);
        elem.setAttribute('tooltip', txt);
        ws.send(JSON.stringify({type: 'game-player-mic', 'from': sessionID, mic: micOn}));

    } else {
        elem.parentElement.querySelector('video').muted = !elem.parentElement.querySelector('video').muted;
        elem.textContent = elem.parentElement.querySelector('video').muted ? 'volume_up' : 'volume_off' ;
        txt = elem.parentElement.querySelector('video').muted ? 'Unmute' : 'Mute' ;
        elem.setAttribute('alt', txt);
        elem.setAttribute('tooltip', txt);
        elem.parentElement.querySelector('video').classList.toggle('muted')
    }

}

function muteMic(data) {

    button = document.querySelector('div.videobox.self-view button');
    toggleAudio(button)

}

function toggleVideo(elem) {
    video = elem.parentElement.querySelector('video');
    txt = video.classList.contains('play') ? 'videocam' : 'videocam_off';
    stream = video.srcObject;
    tracks = stream.getTracks();

    tracks.forEach((track) => {
        if (track.kind === 'video') track.enabled = !track.enabled; //stop();
    });
    elem.textContent = txt;
    elem.setAttribute('alt', txt);
    elem.setAttribute('tooltip', txt);
    elem.parentElement.querySelector('video').classList.toggle('play');
}

function changeUserStatus(elem) {
    videoBox = elem.parentElement;

    if ((videoBox.getAttribute('data-uid') === sessionID)
        && videoBox.classList.contains('self-view')) {
        if (elem.getAttribute('data-status') === 'unknown') {
            ws.send(JSON.stringify({type: 'game-player-status', 'from': sessionID, status: 'ready'}));
            // elem.setAttribute('data-status', 'ready')
        } else {
            ws.send(JSON.stringify({type: 'game-player-status', 'from': sessionID, status: 'unknown'}));
            // elem.setAttribute('data-status', 'unknown')
        }
    }
}
function createRemoteVideo(videoID, srcObject, hostID) {
     const remoteVideoFrame = document.createElement('div');
     const remoteVideo = document.createElement('video');
     remoteVideo.srcObject = srcObject;
     remoteVideo.autoplay = true;
     remoteVideo.classList.add('play');
     remoteVideo.muted = false;
     remoteVideoFrame.id = 'video-' + videoID;
     remoteVideoFrame.setAttribute('alt', videoID);
     //remoteVideoFrame.style="display:inline-block;float:left;";
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
         txt = video.classList.contains('play') ? 'videocam' : 'videocam_off' ;
         stream = video.srcObject;
         tracks = stream.getTracks();

         tracks.forEach((track) => {
             if (track.kind === 'video') track.enabled = !track.enabled; //stop();
         });
         this.textContent = txt;
         this.setAttribute('alt', txt);
         this.setAttribute('tooltip', txt);
         this.parentElement.querySelector('video').classList.toggle('play');

     };
     remoteVideoFrame.appendChild(muteVideo);

     playerNumber = document.createElement('div');
     playerNumber.className = "slot"
     playerNumber.setAttribute('data-slot', 1 + remoteVideosContainer.querySelectorAll('div.videobox').length);
     playerNumber.textContent = 1 + remoteVideosContainer.querySelectorAll('div.videobox').length;

     remoteVideoFrame.appendChild(playerNumber);

     host = document.createElement('div');
     host.className = "game-user"
     if (videoID === hostID) {


         host.textContent = 'HOST';

     } else {
         host.textContent = videoID;
     }
     remoteVideoFrame.appendChild(host);

     slider = document.createElement('template');
     slider.innerHTML = `<input type="range" id="volumeSlider" min="0" max="1" step="0.05" value="1" onChange="adjustVolume(this.parentElement.querySelector('video'), this.value )">`;
     remoteVideoFrame.appendChild(slider.content.cloneNode(true));

     return remoteVideoFrame;
 }

function bindRemoteVideo(videoID, srcObject, slot) {
    const remoteVideo = slot.querySelector('video');
    slot.classList.remove('no-video')
    remoteVideo.srcObject = srcObject;
    remoteVideo.autoplay = true;
    remoteVideo.classList.add('play');
    remoteVideo.muted = false;
    slot.setAttribute('data-uid', videoID)
    slot.id = 'video-' + videoID;
    slot.setAttribute('alt', videoID);
    // remoteVideoFrame.appendChild(remoteVideo);
    // remoteVideoFrame.classList.add("videobox");

    host = slot.querySelector('div.game-user');
    host.textContent = videoID;
}

function bindHostVideo(videoID, srcObject, slot) {
    const remoteVideo = slot.querySelector('video');
    slot.classList.remove('no-video')
    remoteVideo.srcObject = srcObject;
    remoteVideo.autoplay = true;
    remoteVideo.classList.add('play');
    remoteVideo.muted = false;
    slot.setAttribute('data-uid', videoID)
    slot.id = 'video-' + videoID;
    slot.setAttribute('alt', videoID);
    // remoteVideoFrame.appendChild(remoteVideo);
    // remoteVideoFrame.classList.add("videobox");

    host = slot.querySelector('div.game-user');
    host.textContent = videoID;

}

function sendMessage(elem) {
    let message = document.getElementById('chat-input').value;

    ws.send(JSON.stringify({type: 'send-chat-message', 'from': sessionID, to: 'all', message: message}));

}

function removePeerConnection(id) {
    delete peerConnections[id];
    video = document.getElementById('video-'+id);
    if (video !== null) {
        video.id = 'video-'+video.getAttribute('data-slot')+'-empty'
        slot = video.getAttribute('data-slot')
        if (slot === null) {
            video.remove();
        } else {

            videoObj = video.querySelector('video');
            videoObj.srcObject = null;
            video.classList.add('no-video')
        }
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

function hostAudioToggle(off = false) {
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


function handleError(data, type) {
    alertToaster(data.message, type);
    //showPopupAlert(data.message, type);
}

let alertTemplate = `
<div id="popupModalTemplate">
  <div class="modal fade" id="popupModal" tabindex="-1" aria-labelledby="popupModalLabel" aria-hidden="true">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="popupModalLabel"><!-- ALERT TITLE --></h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body" id="popupMessage">
          <!-- Message content will be inserted here -->
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
        </div>
      </div>
    </div>
  </div>
</div>
`;

function showPopupAlert(message, title = '') {
    // Clone the modal template
    var template = document.createElement('div');

    template.innerHTML = alertTemplate
        .replace(`<!-- ALERT TITLE -->`, title)
        .replace(`<!-- Message content will be inserted here -->`, message)
    ;

    document.body.appendChild(template);


    // Trigger the modal
    var myModal = new bootstrap.Modal(document.getElementById('popupModal'));
    myModal.show();
    var modalElement = document.getElementById('popupModal');
    modalElement.addEventListener('hidden.bs.modal', function() {
        // Remove the modal element from the document
        modalElement.remove();
    });
}

function alertToaster(message, type) {
    // Create the alert element
    var alertElement = document.createElement('div');
    // alertElement.classList.add('alert', 'alert-dismissible', 'fade', 'show');
    alertElement.classList.add('alert', 'alert-dismissible', 'fade', 'show', 'position-fixed', 'top-0', 'end-0');

    // Set the alert type
    if (type === 'error') {
        alertElement.classList.add('alert-danger');
    } else if (type === 'info') {
        alertElement.classList.add('alert-info');
    } else if (type === 'success') {
        alertElement.classList.add('alert-success');
    } else {
        alertElement.classList.add('alert-primary');
    }

    // Add alert content
    alertElement.innerHTML = `
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    ${message}
  `;

    // Append the alert to the document body
    document.body.appendChild(alertElement);

    // Automatically dismiss the alert after 5 seconds
    setTimeout(function() {
        alertElement.remove();
    }, 5000);
}

function showModal(message, yesBtn, noBtn, yesFunction, noFunction) {
    // Create modal element
    var modalElement = document.createElement('div');
    modalElement.classList.add('modal', 'fade');
    modalElement.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-body">
          <p>${message}</p>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-primary" id="btnYes">${yesBtn}</button>
          <button type="button" class="btn btn-secondary" id="btnNo" data-bs-dismiss="modal">${noBtn}</button>
        </div>
      </div>
    </div>
  `;

    // Append the modal to the document body
    document.body.appendChild(modalElement);

    // Show the modal
    var modal = new bootstrap.Modal(modalElement);
    modal.show();

    // Attach functions to buttons
    var btnYes = modalElement.querySelector('#btnYes');
    var btnNo = modalElement.querySelector('#btnNo');

    btnYes.addEventListener('click', function() {
        modal.hide();
        yesFunction();
    });

    btnNo.addEventListener('click', function() {
        modal.hide();
        noFunction();
    });
}

function startSpinner(elem) {
    elem = document.querySelector('div.e-bar[data-slot="1"]')
    // const spinnerDiv = document.getElementById("spinnerDiv");
    elem.classList.add("spinner-animate");

    elem = document.querySelector('div.videobox[data-slot="1"]')
    elem.classList.add("spinner-animate");
}

function handleGameStart(data) {

    shuffle.play()
    // slotMic = document.querySelector('div.videobox[data-uid="'+data.uid+'"] span.slot-mic')
    // slotN = slotMic.parentElement.getAttribute('data-slot')
    // if (slotMic) {
    //     slotMic.setAttribute('data-mic', data.mic)
    // }
}

function handleGamePhase(data) {
    game = document.querySelector('div.game.videos')
    game.setAttribute('data-phase', data.phase)
    if (data.phase === 'shuffle') {
        selectSlotBtns = document.querySelectorAll('div.select-slot button')
        selectSlotBtns.forEach(btn =>  {
            btn.classList.remove('btn-primary')
            btn.classList.add('btn-secondary')
            btn.disabled = true
        });
    }
}

function handleSelectSlot(data) {

    data.slots.forEach(slotIdx => {
        btn = document.querySelector('div.videobox[data-slot="'+slotIdx+'"] div.select-slot button')
        btn.classList.remove('btn-secondary')
        btn.classList.add('btn-primary')
        btn.disabled = false
    });

}

function handleGamePlayerMic(data) {
    slotMic = document.querySelector('div.videobox[data-uid="'+data.uid+'"] span.slot-mic')
    slotN = slotMic.parentElement.getAttribute('data-slot')
    if (slotMic) {
        slotMic.setAttribute('data-mic', data.mic)
    }
}

function handleGamePlayerStatus(data) {
    slotStatus = document.querySelector('div.videobox[data-uid="'+data.uid+'"] span.slot-status')
    slotN = slotStatus.parentElement.getAttribute('data-slot')
    if (slotStatus) {
        slotStatus.setAttribute('data-status', data.status)
        barSlot = document.querySelector('div.e-bar[data-slot="'+slotN+'"]')
        barSlot.setAttribute('data-status', data.status)
    }
}



