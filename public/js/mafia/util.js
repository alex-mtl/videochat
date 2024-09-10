const configuration = {
    iceServers: [
        {urls: 'stun:stun.l.google.com:19302'},
        // {urls: 'stun:stun1.l.google.com:19302'},
        // {urls: 'stun:stun2.l.google.com:19302'},
        // {urls: 'stun:stun.sipnet.ru:3478'},
        // {urls: 'stun:stun.skylink.ru:3478'},
        // {urls: 'stun:stun.voys.nl:3478'},
        {urls: 'stun:mao-dao.com:3478'},
        {
            urls: "turn:194.26.138.209:3478?transport=udp",
            username: "turnuser",
            credential: "turnpassword",
        }
        ,
        {
            urls: "turn:mao-dao.com:3478?transport=udp",
            username: "maodao",
            credential: "coturn",
        }
    ]
};

const constraints = {
    video: {
        width: { ideal: 240, max: 240 },
        height: { ideal: 120, max: 120 },
        aspectRatio: { ideal: 16 / 9 },
        frameRate: { ideal: 20, max: 25 },
        facingMode: "user"
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
let countdown;
let remainingSeconds = -1;
const pendingRequests = {};

function escapeHtml(unsafe)
{
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Utility function to generate unique IDs
function generateUniqueId() {
    return Math.random().toString(36).substr(2, 9);
}

// Function to send a request and return a Promise
function sendRequest(ws, data) {
    return new Promise((resolve, reject) => {
        const requestId = generateUniqueId();
        // Store the resolve and reject functions
        pendingRequests[requestId] = { resolve, reject };
        // Send the request with the unique ID
        ws.send(JSON.stringify({ ...data, requestId }));
    });
}
function createPeerConnection(peerId, hostID, participant = true, avatar = null) {
    const peerConnection = new RTCPeerConnection(configuration);

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
                        slot.setAttribute('data-name', player.name || "unknown");
                        if (player.avatar) {
                            slot.setAttribute('style', "--g-background-person: url('" + player.avatar + "');");
                        } else {
                            slot.setAttribute('style', null);
                        }
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
                    // console.log("Spectator: ", peerId)
                    // if (avatar) {
                    //     addAvatar(peerId, avatar)
                    // }


                }

            } else {

                if (slot.classList.contains('vbox-game-host')) {
                    bindHostVideo(peerId, event.streams[0], slot);
                } else {
                    bindRemoteVideo(peerId, event.streams[0], slot);
                }

            }
        }
    };
    if (avatar && !participant && !hostID) {
        console.log("Spectator: ", peerId)
        if (avatar) {
            addAvatar(peerId, avatar)
        }
    }
    peerConnections[peerId] = peerConnection;
    return peerConnection;
}

function selfMic(micElem) {
    let game = document.querySelector('div.game[data-phase]')
    let phase = game.getAttribute('data-phase')
    if (phase === 'lobby') {
        if (micElem.parentElement.classList.contains('self-view')) {
            toggler = micElem.parentElement.querySelector('span.toggle-audio')
            toggleAudio(toggler, 'toggle')
        }
    }
}
function toggleAudio(elem, mute = 'toggle', mode = 'self' ) {
    if (elem.parentElement.classList.contains('self-view')) {
        const audioTracks =  elem.parentElement.querySelector('video').srcObject.getAudioTracks();
        audioTracks.forEach(track => {
            if(mute === 'toggle') {
                track.enabled = !track.enabled;
            } else if (mute === 'mute') {
                track.enabled = false;
            } else if (mute === 'unmute') {
                track.enabled = true;
            }
            muted = (!track.enabled)
        });

        if (muted) {
            micOn = 'off'
            elem.classList.add('muted')
            elem.parentElement.querySelector('video').classList.add('muted')
        } else {
            micOn = 'on'
            elem.classList.remove('muted')
            elem.parentElement.querySelector('video').classList.remove('muted')
        }
        ws.send(JSON.stringify({type: 'game-player-mic', 'from': sessionID, mic: micOn, mode: mode}));

    } else {
        elem.parentElement.querySelector('video').muted = !elem.parentElement.querySelector('video').muted;
        muted = elem.parentElement.querySelector('video').classList.toggle('muted')
        if (muted) {
            elem.classList.add('muted')
        } else {
            elem.classList.remove(muted)
        }
    }

}

function muteMic(data) {

    button = document.querySelector('div.videobox.self-view span.toggle-audio');
    toggleAudio(button, 'mute', (data.mode === undefined) ? 'mute' : data.mode)

}

function unmuteMic(data) {

    button = document.querySelector('div.videobox.self-view span.toggle-audio');
    toggleAudio(button, 'unmute', (data.mode === undefined) ? 'mute' : data.mode)

}

function toggleVideo(elem) {
    video = elem.parentElement.querySelector('video');
    // txt = video.classList.contains('play') ? 'videocam' : 'videocam_off';
    stream = video.srcObject;
    tracks = stream.getTracks();

    tracks.forEach((track) => {
        if (track.kind === 'video') {
            track.enabled = !track.enabled;
            muted = (!track.enabled)
        }
    });
    if (muted) {
        elem.classList.add('muted')
    } else {
        elem.classList.remove('muted')
    }
    // elem.textContent = txt;
    // elem.setAttribute('alt', txt);
    // elem.setAttribute('tooltip', txt);
    elem.parentElement.querySelector('video').classList.toggle('play');
}

function showSettings() {
    document.querySelector('div#mediaSourcePopup').classList.add('show')
}

function peerRefresh(elem) {
    slot = elem.parentElement;
    showPopupAlert(slot.getAttribute('data-uid'))

}

function changeUserStatus(elem) {
    var audioContext = new AudioContext();
    audioContext.resume()
    videoBox = elem.parentElement;

    if ((videoBox.getAttribute('data-uid') === sessionID)
        && videoBox.classList.contains('self-view')) {
        if (elem.getAttribute('data-status') === 'unknown') {
            ws.send(JSON.stringify({type: 'game-player-status', 'from': sessionID, status: 'ready'}));
        } else {
            ws.send(JSON.stringify({type: 'game-player-status', 'from': sessionID, status: 'unknown'}));
        }
    } else if (sessionID === roomEnv.gameHost.uid) {
        slot = videoBox.getAttribute('data-slot')
        ws.send(JSON.stringify({type: 'game-player-status', 'from': sessionID, status: 'reset', slot: slot}));
    }
}

function vote(elem) {
    let slot = 0
    if (typeof elem === 'object' && elem instanceof Element) {
        slot = elem.parentElement.getAttribute('data-slot')
    } else if ((typeof elem === 'number') || (typeof elem === 'string')) {
        slot = elem
    } else {
        // Handle other cases if needed
        console.log('elem is of unexpected type', typeof elem);
        return
    }
    ws.send(JSON.stringify({type: 'player-vote', slot: slot}));
}

function voteLockWinners(elem) {

    ws.send(JSON.stringify({type: 'vote-lock-winners'}));
}


async function getSelfRole() {
    const response = await sendRequest(ws, { type: 'get-self-role' });
    return response.role;
}

async function getActiveSpeakers() {
    const response = await sendRequest(ws, { type: 'get-active-speakers' });
    return response;
}

async function getMafTeam() {
    const response = await sendRequest(ws, { type: 'get-maf-team' });
    return response.mafTeam;
}


async function getSheriff() {
    const response = await sendRequest(ws, { type: 'get-sheriff' });
    return response.team;
}



function shoot(elem) {
    let slot = 0
    if (typeof elem === 'object' && elem instanceof Element) {
        slot = elem.parentElement.getAttribute('data-slot')
    } else if ((typeof elem === 'number') || (typeof elem === 'string')) {
        slot = elem
    } else {
        // Handle other cases if needed
        console.log('elem is of unexpected type', typeof elem);
        return
    }
    ws.send(JSON.stringify({type: 'shoot', slot: slot}));
    mafTeam = document.querySelectorAll('div.videobox[data-slot]:not(.vbox-game-host) span.slot-role:not([data-role="citizen"])')
    mafTeam.forEach(maf => {
        videobox = maf.parentElement;
        if (!videobox.classList.contains('self-view')) {
            video = maf.parentElement.querySelector('video')

            stream = video.srcObject;
            if (stream !== null) {
                tracks = stream.getTracks();

                tracks.forEach((track) => {
                    if (track.kind === 'video') track.enabled = true;
                });
            }
        }
    })

    citizens = document.querySelectorAll('div.videobox[data-slot]:not(.vbox-game-host) span.slot-role')
    citizens.forEach(citizen => {
        citizen.setAttribute('data-role', 'none')
        citizen.parentElement.querySelector('video').classList.remove('night-video')
        citizen.parentElement.querySelector('video').classList.add('night')
        citizen.parentElement.querySelector('span.video-target').setAttribute('data-role', 'none')
    })

    showPlaceholders()
}

function setPlayerName(elem) {
    let videoBox = elem.parentElement;
    let slot =videoBox.getAttribute('data-slot')
    ws.send(JSON.stringify({type: 'set-player-name', slot: slot, name: elem.value}));
}
function createRemoteVideo(videoID, srcObject, hostID) {
     const remoteVideoFrame = document.createElement('div');
     const remoteVideo = document.createElement('video');
     remoteVideo.srcObject = srcObject;
     remoteVideo.autoplay = true;
     remoteVideo.classList.add('play');
     remoteVideo.classList.add('g-mask');

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
             if (track.kind === 'video') track.enabled = !track.enabled;
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
    // let player = roomEnv.slot[slot]
    // if (player.avatar) {
    //     slot.setAttribute('style', "--g-background-person: url('" + player.avatar + "');");
    // } else {
    //     slot.setAttribute('style', null);
    // }
    // remoteVideoFrame.appendChild(remoteVideo);
    // remoteVideoFrame.classList.add("videobox");

    let name = slot.querySelector('span.game-user');
    name.textContent = slot.getAttribute('data-name');
    if(['killed', 'disqualified', 'locked'].includes(slot.getAttribute('data-player-status'))) {
        remoteVideo.origSrcObject = remoteVideo.srcObject
        remoteVideo.srcObject = null
    }
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

    if (remoteVideo.getAttribute('host-video-trigger', 'on') === 'off'){
        stream = remoteVideo.srcObject;

        tracks = stream.getTracks();
        tracks.forEach((track) => {
            if (track.kind === 'video') {
                track.enabled = false;
            }
        });
        // remoteVideo.setAttribute('host-video-trigger', 'on')
    }
    // remoteVideoFrame.appendChild(remoteVideo);
    // remoteVideoFrame.classList.add("videobox");

    host = slot.querySelector('span.game-user');
    host.textContent = roomEnv.gameHost.name;

}

function sendMessage(elem) {
    let message = document.getElementById('chat-input').value;

    ws.send(JSON.stringify({type: 'send-chat-message', 'from': sessionID, to: 'all', message: message}));

}

function shoutOut(elem) {
    let slot = elem.parentElement.getAttribute('data-slot')
    let uid = elem.parentElement.getAttribute('data-uid')
    ws.send(JSON.stringify({type: 'shout-out', slot: slot, uid: uid}));
}


function showNumPad(elem) {
    let videobox = elem.parentElement
    if (videobox.querySelector('div.number-pad')) {
        videobox.querySelector('div.number-pad').remove()
    } else {
        let numPad = document.querySelector('div.number-pad#num-pad').cloneNode(true)
        numPad.removeAttribute('id')
        checkPad = videobox.querySelector('div.number-pad')
        if (checkPad === null) {
            videobox.insertBefore(numPad,elem)
        }
    }
}

function numPadClick(elem) {
    let videobox = elem.closest('div.videobox');
    let padType = elem.getAttribute('data-pad-type')
    let padValue = elem.getAttribute('data-pad-value')
    if (padType === 'num') {
        videobox.querySelectorAll('span.pad.selected[data-pad-type="num"]:not([data-pad-value="'+padValue+'"])').forEach(span =>  {
            span.classList.remove('selected')
        });
        elem.classList.toggle('selected')
    } else if (padType === 'color') {
        videobox.querySelectorAll('span.pad.selected[data-pad-type="color"]:not([data-pad-value="'+padValue+'"])').forEach(span =>  {
            span.classList.remove('selected')
        });
        elem.classList.toggle('selected')
    } else {
        if (padValue === 'send') {
            let padNumber = 0
            let padColor = 'grey'
            let padNumSelected = videobox.querySelector('span.pad.selected[data-pad-type="num"]')
            if (padNumSelected) {
                padNumber = padNumSelected.getAttribute('data-pad-value')
            }
            let padColorSelected = videobox.querySelector('span.pad.selected[data-pad-type="color"]')
            if (padColorSelected) {
                padColor = padColorSelected.getAttribute('data-pad-value')
            }
            let padSlot = parseInt(videobox.getAttribute('data-slot'), 10);
            ws.send(JSON.stringify({type: 'send-player-comm', 'slot': padSlot, 'pad-number': padNumber, 'pad-color': padColor }));
        }
        videobox.querySelector('div.number-pad').remove()
    }


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
    if (data.message.startsWith("Failed to send offer!")) {
        const regex = /Recipient: `(.+?)` not found/;
        let match = regex.exec(data.message);
        let dataValue = match ? match[1] : null;
        if (dataValue) {
            ws.send(JSON.stringify({type: 'check-user-connection', 'uid': dataValue }));
        }
    }
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

function gameMessage(msg, line = 1) {

    roomMessage = document.querySelectorAll('span.gameMessage'+line)
    roomMessage.forEach(span =>  {
        span.textContent = msg
    });
}


function handleReset(data) {
    if (data.type === 'reset' ) {
        alertToaster('Host reset the slot...');
        setInterval(() => {
            window.location.href = '/mafia'
        }, 1000);

    }
}


function handleGameStart(data) {

    sfx.shuffle.play()
    gameMessage('Pick a slot')

}

function handleShuffleRoles(data) {
    sfx.police.play()
    gameMessage('Pick a role')
    deck = document.querySelector('div.deck-container')
    deck.classList.add('deck-active', 'locked')
    cards = document.querySelectorAll('div.game-card.taken[data-card]')
    cards.forEach(card =>  {
        card.classList.remove('taken')
    });
    roleSpan = document.querySelector('div.game-deck span.game-role')
    roleSpan.classList.remove('role-show')
    roleSpan.textContent = ''

}

function showPlaceholders() {
    playerPlaceholders = document.querySelectorAll(
        'div.videobox[data-slot]:not(.vbox-game-host) div.select-slot')
    playerPlaceholders.forEach( slot => {
        slot.classList.add('show');
    })
}
 function hidePlaceholders() {
     playerPlaceholders = document.querySelectorAll(
         'div.videobox[data-slot]:not(.vbox-game-host) div.select-slot.show')
     playerPlaceholders.forEach( slot => {
         slot.classList.remove('show');
     })

 }

function hideRoles() {
    spanRole = document.querySelectorAll('div.videobox[data-slot]:not(.vbox-game-host) span.slot-role')
    spanRole.forEach( span => {
        span.setAttribute('data-role', 'none')
    })
}


function startCountdown(seconds) {
    remainingSeconds = seconds - 1;
    let span = document.querySelector('span.g-countdown')
    span.style.visibility = 'visible';
    span.textContent = remainingSeconds;
    remainingSeconds--;

    // Update the countdown every second
    countdown = setInterval(() => {
        if (remainingSeconds < 0) {
            clearInterval(countdown);
            sfx.notify.play()
            return;
        }
        span.textContent = remainingSeconds;
        span.setAttribute('data-count', remainingSeconds)
        remainingSeconds--;
    }, 1000);

}
function stopCountdown() {
    let span = document.querySelector('span.g-countdown')
    if (countdown) {
        span.textContent = ''
        span.setAttribute('data-count', -1)
        remainingSeconds = -1;
        clearInterval(countdown);
    }
}

async function handleGamePhase(data, mode = 'normal') {
    game = document.querySelector('div.game.videos')
    game.setAttribute('data-phase', data.phase)
    game.setAttribute('data-stage', data.stage)
    if (data.phase === 'shuffle') {
        resetDisableButtons()
        hideHostVideo()

    } else if (data.phase === 'game-over') {
        if (mode !== 'normal') {
            ws.send(JSON.stringify({type: 'game-over', request:'show-roles'}));
        }
    } else if (data.phase === 'night') {
        gameMessage('Night '+data.night)
        gameMessage('', 2)
        removeActiveSpeaker()
        removeVotingResult()
        stopCountdown()
        if (selfID !== roomEnv.gameHost.uid) {
            hideAllRolesAndVideos()
            resetDisableButtons()
            showPlaceholders()
        } else {
            mainButton('Shooting', startShooting)
            ws.send(JSON.stringify({type: 'show-roles'}));
        }

    } else if (data.phase === 'shooting') {
        //gameMessage('Night '+data.night)
        gameMessage('Shooting', 2)
        removeVotingResult()
        if (selfID !== roomEnv.gameHost.uid) {
            hideAllRolesAndVideos()
            showPlaceholders()
        } else {
            setTimeout(async () => {
                mainButton('Don check', startDonCheck)
            }, 3500)
        }

    } else if (data.phase === 'sitdown') {
        if (mode === 'normal') {
            startCountdown(60)
        } else {
            resetDisableButtons()
        }

        sfx.sitdown.play()
        if (selfID !== roomEnv.gameHost.uid) {
            // 'div.videobox[data-slot]:not(.vbox-game-host) div.select-slot button,'+
            resetDisableButtons()
            showPlaceholders()
            hideHostVideo()
            if (mode !== 'normal') {

                let selfRole = await getSelfRole()

                if (['B','D'].includes(selfRole)) {

                    let mafTeam = await getMafTeam()
                    handleMafiaSitdown({ team: mafTeam })
                }
            }

        } else {
            if (mode !== 'normal') {
                ws.send(JSON.stringify({type: 'show-roles'}));
            }
            showDonWatch()
        }
        gameMessage('Mafia')
        gameMessage('cahoot sitdown', 2)


    } else if (data.phase === 'don-watch') {
        if (mode === 'normal') {
            stopCountdown()
            muteAllSfx()
            startCountdown(20)
        } else {
            resetDisableButtons()
        }

        sfx.godfather.play()
        if (selfID !== roomEnv.gameHost.uid) {
            // 'div.videobox[data-slot]:not(.vbox-game-host) div.select-slot button,'+
            hideAllRolesAndVideos()
            showPlaceholders()

            if (mode !== 'normal') {
                let selfRole = await getSelfRole()

                if ('D' === selfRole) {
                    let mafTeam = await getMafTeam()
                    handleDonWatch({type: 'don-watch', team: mafTeam})
                }
            }
        } else {
            if (mode !== 'normal') {
                ws.send(JSON.stringify({type: 'show-roles'}));
            }
            showSheriffWatch()
        }
        gameMessage('Don watch...')
        gameMessage('', 2)
    } else if (data.phase === 'don-check') {
        stopCountdown()
        muteAllSfx()
        startCountdown(10)
        sfx.dog.play()
        if (selfID !== roomEnv.gameHost.uid) {
            // 'div.videobox[data-slot]:not(.vbox-game-host) div.select-slot button,'+
            hideAllRolesAndVideos()
            resetDisableButtons()
            showPlaceholders()

            if (mode !== 'normal') {

                let selfRole = await getSelfRole()

                if (['B','D'].includes(selfRole)) {

                    let mafTeam = await getMafTeam()
                    handleMafiaSitdown({ team: mafTeam })
                }
            }
        } else {
            showSheriffCheck()
        }
        // gameMessage('')
        gameMessage('Don check...', 2)
    } else if (data.phase === 'day') {
            stopCountdown()
            muteAllSfx()

            if (selfID !== roomEnv.gameHost.uid) {
                hidePlaceholders()
                showDayVideos()
                showHostVideo()
            } else {
                hidePlaceholders()
                hideRoles()
                mainButton('Next speaker', nextSpeakerSend)
            }
            if (mode !== 'normal') {
                let response = await getActiveSpeakers()
                let duration = Math.floor((response['active-speaker-end'] - response.now) / 1000)
                duration = (duration > 0) ? duration : 1
                if (response['active-speaker'] >0) {
                    handleActiveSpeaker({
                        slot: response['active-speaker'],
                        duration: duration
                    })
                }
                if (response.so.length >0) {
                    response.so.forEach( (slot, so) => {
                        handleShoutOut({ slot: so.slot, duration: (so.so[0].end - response.now)})
                    })

                }

                console.log(response)
            }
            gameMessage('Day '+data.day)
            gameMessage('', 2)

    } else if (data.phase === 'sheriff-watch') {
        if (mode === 'normal') {
            stopCountdown()
            muteAllSfx()
            startCountdown(20)
        } else {
            resetDisableButtons()
        }

        sfx.sheriff.play()
        if (selfID !== roomEnv.gameHost.uid) {
            // 'div.videobox[data-slot]:not(.vbox-game-host) div.select-slot button,'+
            hideAllRolesAndVideos()
            showPlaceholders()
            if (mode !== 'normal') {
                let selfRole = await getSelfRole()

                if ('S' === selfRole) {
                    let sheriff = await getSheriff()
                    handleSheriffWatch({type: 'sheriff-watch', team: sheriff})
                }
            }

        } else {
            if (mode !== 'normal') {
                ws.send(JSON.stringify({type: 'show-roles'}));
            }
            showStartDay1()
        }
        gameMessage('Sheriff watch...')
        gameMessage('', 2)


    } else if (data.phase === 'sheriff-check') {
        stopCountdown()
        muteAllSfx()
        startCountdown(10)
        sfx.police.play()
        if (selfID !== roomEnv.gameHost.uid) {
            // 'div.videobox[data-slot]:not(.vbox-game-host) div.select-slot button,'+
            hideAllRolesAndVideos()
            showPlaceholders()
        } else {
            showStartDay()
        }
        gameMessage('Sheriff check...', 2)


    } else if (data.phase === 'lobby') {
        muteAllSfx()
        let videoElems = document.querySelectorAll('div.videobox[data-slot]:not([data-slot="game-host"]) .g-mask')
        videoElems.forEach( elem => {
            elem.classList.remove('night')
        })
        let videos = document.querySelectorAll('video.active-speaker')
        videos.forEach(video => {
            video.classList.remove('active-speaker')
            video.classList.remove('active-speaker-penalized')
        })
        let eBars = document.querySelectorAll('div.e-bar')
        eBars.forEach(eBar => {
            eBar.classList.remove('active-speaker')
        })
        let barSlots = document.querySelectorAll('div.e-bar[data-status="ready"]')
        barSlots.forEach( barSlot => {
            barSlot.setAttribute('data-status', "unknown")
        })

        // 'div.videobox[data-slot]:not(.vbox-game-host) div.select-slot.show button,'+
        hidePlaceholders()
        stopCountdown()
    }
}

function handleGamePhaseSlot(data) {
    gameMessage('Player '+data.slot, 2)

    slotBars = document.querySelectorAll('div.e-bar')
    slotBars.forEach(slotBar =>  {
        slotBar.classList.remove('blink')
    });
    slotBar = document.querySelector('div.e-bar[data-slot="'+data.slot+'"]')
    slotBar.classList.add('blink')

    vBoxAll = document.querySelectorAll('div.videobox div.select-slot')
    vBoxAll.forEach(vBox =>  {
        vBox.classList.remove('blink')
    });
    vBox = document.querySelector('div.videobox[data-slot="'+data.slot+'"] div.select-slot')
    vBox.classList.add('blink')
}

function handleGamePhaseRole(data) {
    gameMessage('Player '+data.slot, 2)
    let self = false;
    slotBars = document.querySelectorAll('div.e-bar')
    slotBars.forEach(slotBar =>  {
        slotBar.classList.remove('blink')
    });
    slotBar = document.querySelector('div.e-bar[data-slot="'+data.slot+'"]')
    slotBar.classList.add('blink')

    vBoxAll = document.querySelectorAll('div.videobox div.select-slot')
    vBoxAll.forEach(vBox =>  {
        vBox.classList.remove('blink')
    });
    vBox = document.querySelector('div.videobox[data-slot="'+data.slot+'"] div.select-slot')
    vBox.classList.add('blink')
    //
    // if (!vBox.classList.contains('self-view')) {
    //     deck = document.querySelector('div.deck-container')
    //     deck.classList.add('locked')
    // }

}

function handleGameOrder(data) {
    slotBars = document.querySelectorAll('div.e-bar')
    slotBars.forEach(slotBar =>  {
        slotBar.classList.remove('blink')
    });
    for (const [slot, player] of Object.entries(data.slots)) {

        let divPlayer = document.querySelector(`div.videobox[data-uid="${player.uid}"]`);
        if (divPlayer === null) {
            let divPlayer = document.querySelector(`div.videobox[data-uid="empty"]`);
        }
        let prevSlot = divPlayer.getAttribute('data-slot');
        let targetDiv = document.querySelector(`div.videobox[data-slot="${slot}"]`);
        let targetSlot = targetDiv.getAttribute('data-slot');
        if (prevSlot !== targetSlot) {
            // Swap the contents of the two divs
            // const temp = divPlayer.outerHTML;
            // divPlayer.outerHTML = targetDiv.outerHTML;
            // targetDiv.outerHTML = temp;
            // Swap the video elements' parent nodes instead of swapping outerHTML
            let tempParent = divPlayer.parentNode;
            let tempNextSibling = divPlayer.nextSibling;
            targetDiv.parentNode.insertBefore(divPlayer, targetDiv);
            tempParent.insertBefore(targetDiv, tempNextSibling);

            // Update the data-slot attributes to reflect the slot swap
            divPlayer.setAttribute('data-slot', targetSlot);
            divPlayer.querySelector('div.slot').textContent = targetSlot;
            divPlayer.querySelector('button.btn[data-btn="select-slot"]').textContent = targetSlot;
            divPlayer.querySelector('button.btn[data-btn="select-slot"]').onclick = function() {
                selectSlot(targetSlot);
            };

            targetDiv.setAttribute('data-slot', prevSlot);
            targetDiv.querySelector('div.slot').textContent = prevSlot;
            targetDiv.querySelector('button.btn[data-btn="select-slot"]').textContent = prevSlot;
            targetDiv.querySelector('button.btn[data-btn="select-slot"]').onclick = function() {
                selectSlot(targetSlot);
            };

        }

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

function handleSelectRole(data) {
    deck = document.querySelector('div.deck-container')
    deck.classList.remove('locked')
}

function handleGameRoleTaken(data) {
    if (data.card === 'any') {
        card = document.querySelector('div.game-card[data-card]:not(.taken)')
        card.classList.add('taken')
    } else {
        card = document.querySelector('div.game-card[data-card="'+data.card+'"]:not(.taken)')
        if(card) {
            card.classList.add('taken')
        } else {
            console.log('1108 Card not found: ', data.card)
        }
    }
}

function handleGameRole(data) {
    deck = document.querySelector('div.deck-container')
    if (!deck.classList.contains('locked')) {
        deck.classList.add('locked')
    }
    roleSpan = document.querySelector('div.game-deck span.game-role')
    roleSpan.classList.remove('role-show')

    if (data.role === 'R') {
        roleSpan.textContent = 'CITIZEN'
        roleSpan.setAttribute('data-role', 'CITIZEN')
    } else if (data.role === 'S') {
        roleSpan.textContent = 'SHERIFF'
        roleSpan.setAttribute('data-role', 'SHERIFF')
    } else if (data.role === 'D') {
        roleSpan.textContent = 'DON'
        roleSpan.setAttribute('data-role', 'DON')
    } else if (data.role === 'B') {
        roleSpan.textContent = 'MAFIA'
        roleSpan.setAttribute('data-role', 'MAFIA')
    }
    roleSpan.classList.add('role-show')
    setTimeout(() => {
        roleSpan.classList.remove('role-show')

    }, 5000);

}

function handleGameOver(data) {
    sfx.gameOver.play();
    handleGamePhase({phase: 'game-over'});
    stopCountdown()
    gameMessage('Game Over')

    roleSpan = document.querySelector('div.game-deck span.game-role')

    roleSpan.setAttribute('data-role', data.team.toUpperCase())
    if (data.team === 'red') {
        roleSpan.textContent = 'RED WINS!'
        gameMessage('RED WINS!', 2)
    } else  {
        roleSpan.textContent = 'BLACK WINS!'
        gameMessage('BLACK WINS!', 2)
    }
    roleSpan.classList.add('role-show')
    setTimeout(() => {
        roleSpan.classList.remove('role-show')
    }, 5000);

    for (const [slotN, player] of Object.entries(data.players)) {
        role = 'unknown'
        if (player.role === 'B') {
            role = 'mafia'
        } else if (player.role === 'R') {
            role = 'citizen'
        } else if (player.role === 'D') {
            role = 'don'
        } else if (player.role === 'S') {
            role = 'sheriff'
        }
        slotRole = document.querySelector('div.videobox[data-slot="'+slotN+'"] span.slot-role')
        slotRole.setAttribute('data-role', role)
        slotStatus = document.querySelector('div.videobox[data-slot="'+slotN+'"] span.slot-status')
        slotStatus.setAttribute('data-player-status', 'alive')
        slotVideo = document.querySelector('div.videobox[data-slot="'+slotN+'"] video')
        slotVideo.classList.remove('active-speaker')
        slotVideo.classList.remove('active-speaker-penalized')
        if (slotVideo.origSrcObject !== undefined) {
            slotVideo.srcObject = slotVideo.origSrcObject
        }

    }
}

function handleGameReady(data) {
    sfx.police.stop();
    let vBoxes = document.querySelectorAll('div.videobox[data-slot="'+data.slot+'"]')
    vBoxes.forEach(vBox =>  {
        vBox.setAttribute('data-player-status', 'alive')
    });

    deck = document.querySelector('div.deck-container')
    deck.classList.remove('deck-active', 'locked')
    slotBars = document.querySelectorAll('div.e-bar.blink')
    slotBars.forEach(slotBar =>  {
        slotBar.classList.remove('blink')
    });
    vBoxBlink = document.querySelectorAll('div.videobox div.select-slot.blink')
    vBoxBlink.forEach(vBox =>  {
        vBox.classList.remove('blink')
    });

    gameMessage('Sitdown')
    gameMessage('ready...',2)
    if (selfID === roomEnv.gameHost.uid) {
        sitdownReady()
    }
}


function handleGamePlayerMic(data) {
    slotMic = document.querySelector('div.videobox[data-uid="'+data.uid+'"] span.slot-mic')
    slotN = slotMic.parentElement.getAttribute('data-slot')
    if (slotMic) {
        slotMic.setAttribute('data-mic', data.mic)
    }
}

function handleGamePlayerStatus(data) {
    if (data.status === 'reset') {
        slotStatus = document.querySelector('div.videobox[data-slot="'+data.slot+'"] span.slot-status')
        videobox = slotStatus.parentElement
        uid = videobox.getAttribute('data-uid')
        removePeerConnection(uid)
        // delete peerConnections[uid];
        videobox.setAttribute('data-player-status', 'unknown')
        videobox.setAttribute('data-uid', 'empty')
        videobox.setAttribute('id', 'video-'+data.slot+'-empty')

        slotStatus.setAttribute('data-status', 'unknown')
        barSlot = document.querySelector('div.e-bar[data-slot="'+data.slot+'"]')
        barSlot.setAttribute('data-status', 'unknown')

    } else {
        slotStatus = document.querySelector('div.videobox[data-uid="'+data.uid+'"] span.slot-status')
        slotN = slotStatus.parentElement.getAttribute('data-slot')
        if (slotStatus) {
            slotStatus.setAttribute('data-status', data.status)
            barSlot = document.querySelector('div.e-bar[data-slot="'+slotN+'"]')
            barSlot.setAttribute('data-status', data.status)
        }
    }

}

function hideAllRolesAndVideos() {
    citizens = document.querySelectorAll('div.videobox[data-slot]:not(.vbox-game-host) span.slot-role')
    citizens.forEach(citizen => {
        citizen.setAttribute('data-role', 'none')
        citizen.parentElement.querySelector('video').classList.remove('night-video')
        citizen.parentElement.querySelector('span.video-lock').setAttribute('data-role', 'none')
    })
    videoElems = document.querySelectorAll(
        'div.videobox[data-slot]:not([data-slot="game-host"]) .g-mask,' +
        'div.videobox[data-slot]:not([data-slot="game-host"]) .g-mask:hover'
    )
    videoElems.forEach( elem => {
        elem.classList.add('night')
    })

    hideHostVideo()
}

function resetDisableButtons() {
    selectSlotBtns = document.querySelectorAll('div.select-slot button')
    selectSlotBtns.forEach(btn =>  {
        btn.classList.remove('btn-primary')
        btn.classList.add('btn-secondary')
        btn.disabled = true
    });
    videoElems = document.querySelectorAll('div.videobox[data-slot]:not([data-slot="game-host"]) .g-mask')
    videoElems.forEach( elem => {
        elem.classList.add('night')
    })
}

function hideHostVideo() {
    if (selfID !== roomEnv.gameHost.uid) {
        hostVideo = document.querySelector('div.videobox.vbox-game-host video')
        stream = hostVideo.srcObject;
        if (stream !== null) {
            tracks = stream.getTracks();
            tracks.forEach((track) => {
                if (track.kind === 'video') {
                    track.enabled = false;
                }
            });

        }
        hostVideo.setAttribute('host-video-trigger', 'off')


        vBox = document.querySelector('div.videobox.vbox-game-host')
        vBox.setAttribute('data-player-status', 'host-off')
    }
}

function showHostVideo() {
    hostVideo = document.querySelector('div.videobox.vbox-game-host video')
    stream = hostVideo.srcObject;
    if (stream !== null) {
        tracks = stream.getTracks();
        tracks.forEach((track) => {
            if (track.kind === 'video') {
                track.enabled = true;
            }
        });
    }


    hostVideo.setAttribute('host-video-trigger', 'on')
    vBox = document.querySelector('div.videobox.vbox-game-host')
    vBox.setAttribute('data-player-status',null)
}

function showDayVideos() {
    citizens = document.querySelectorAll('div.videobox[data-slot]:not(.vbox-game-host) span.slot-role')
    citizens.forEach(citizen => {
        citizen.setAttribute('data-role', 'none')
        citizen.parentElement.querySelector('video').classList.remove('night-video')
        citizen.parentElement.querySelector('span.video-lock').setAttribute('data-role', 'none')
    })
    videoElems = document.querySelectorAll(
        'div.videobox[data-slot]:not([data-slot="game-host"]) .g-mask,' +
        'div.videobox[data-slot]:not([data-slot="game-host"]) .g-mask:hover'
    )
    videoElems.forEach( elem => {
        elem.classList.remove('night')
    })


}
function handleMafiaSitdown(data) {
    for (const [slotN, player] of Object.entries(data.team)) {
        role = 'unknown'
        if (player.role === 'B') {
            role = 'mafia'
        } else if (player.role === 'D') {
            role = 'don'
        }
        span = document.querySelector('div.videobox[data-slot="'+slotN+'"] span.slot-role')
        span.setAttribute('data-role', role)
    }
    citizens = document.querySelectorAll('div.videobox[data-slot]:not(.vbox-game-host) span.slot-role:not([data-role="mafia"]):not([data-role="don"])')
    citizens.forEach(citizen => {
        citizen.setAttribute('data-role', 'citizen')
        citizen.parentElement.querySelector('video').classList.add('night-video')
        citizen.parentElement.querySelector('span.video-lock').setAttribute('data-role', 'citizen')
    })
    hidePlaceholders()
    showHostVideo()
    videoElems = document.querySelectorAll(
        'div.videobox[data-slot]:not(.vbox-game-host) .g-mask,' +
        'div.videobox[data-slot]:not(.vbox-game-host) .g-mask:hover'
    )
    videoElems.forEach( elem => {
        elem.classList.remove('night')
    })
    // handleGamePhase({phase: 'show-roles'});
    game.setAttribute('data-stage', 'show-roles')
}
function handleMafiaShooting(data) {
    for (const [slotN, player] of Object.entries(data.team)) {
        role = 'unknown'
        if (player.role === 'B') {
            role = 'mafia'
        } else if (player.role === 'D') {
            role = 'don'
        }
        span = document.querySelector('div.videobox[data-slot="'+slotN+'"] span.slot-role')
        span.setAttribute('data-role', role)
        span.parentElement.querySelector('span.video-target').setAttribute('data-role', role)
    }
    citizens = document.querySelectorAll('div.videobox[data-slot]:not(.vbox-game-host) span.slot-role:not([data-role="mafia"]):not([data-role="don"])')
    citizens.forEach(citizen => {
        citizen.setAttribute('data-role', 'citizen')
        citizen.parentElement.querySelector('video').classList.add('night-video')
        citizen.parentElement.querySelector('span.video-target').setAttribute('data-role', 'citizen')
    })
    hidePlaceholders()
    showHostVideo()
    videoElems = document.querySelectorAll(
        'div.videobox[data-slot]:not(.vbox-game-host) .g-mask,' +
        'div.videobox[data-slot]:not(.vbox-game-host) .g-mask:hover'
    )
    videoElems.forEach( elem => {
        elem.classList.remove('night')
    })
    for (const [slotN, player] of Object.entries(data.team)) {
        if ((player.role === 'B') || (player.role === 'D')) {
            videobox = document.querySelector('div.videobox[data-slot="'+slotN+'"]');
            if (!videobox.classList.contains('self-view')) {
                video = document.querySelector('div.videobox[data-slot="' + slotN + '"] video')
                stream = video.srcObject;
                if (stream !== null) {
                    tracks = stream.getTracks();

                    tracks.forEach((track) => {
                        if (track.kind === 'video') track.enabled = false;
                    });
                }
            }
        }
    }
    // handleGamePhase({phase: 'show-roles'});
}
function handleDonWatch(data) {
    for (const [slotN, player] of Object.entries(data.team)) {
        role = 'unknown'
        if (player.role === 'B') {
            role = 'mafia'
        } else if (player.role === 'D') {
            role = 'don'
        }
        span = document.querySelector('div.videobox[data-slot="'+slotN+'"] span.slot-role')
        span.setAttribute('data-role', role)
    }
    citizens = document.querySelectorAll('div.videobox[data-slot]:not(.vbox-game-host) span.slot-role:not([data-role="mafia"]):not([data-role="don"])')
    citizens.forEach(citizen => {
        citizen.setAttribute('data-role', 'none')
        citizen.parentElement.querySelector('video').classList.add('night-video')
        citizen.parentElement.querySelector('span.video-lock').setAttribute('data-role', 'citizen')
    })
    hidePlaceholders()
    showHostVideo()
    videoElems = document.querySelectorAll(
        'div.videobox[data-slot]:not(.vbox-game-host) .g-mask,' +
        'div.videobox[data-slot]:not(.vbox-game-host) .g-mask:hover'
    )
    videoElems.forEach( elem => {
        elem.classList.remove('night')
    })
    // handleGamePhase({phase: 'show-roles'});
    game.setAttribute('data-stage', 'show-roles')
}


function handleDonCheck(data) {
    for (const [slotN, player] of Object.entries(data.team)) {
        role = 'unknown'
        if (player.role === 'B') {
            role = 'mafia'
        } else if (player.role === 'D') {
            role = 'don'
        }
        span = document.querySelector('div.videobox[data-slot="'+slotN+'"] span.slot-role')
        span.setAttribute('data-role', role)
    }
    citizens = document.querySelectorAll('div.videobox[data-slot]:not(.vbox-game-host) span.slot-role:not([data-role="mafia"]):not([data-role="don"])')
    citizens.forEach(citizen => {
        citizen.setAttribute('data-role', 'none')
        citizen.parentElement.querySelector('video').classList.add('night-video')
        citizen.parentElement.querySelector('span.video-lock').setAttribute('data-role', 'citizen')
    })
    hidePlaceholders()
    showHostVideo()
    videoElems = document.querySelectorAll(
        'div.videobox[data-slot]:not(.vbox-game-host) .g-mask,' +
        'div.videobox[data-slot]:not(.vbox-game-host) .g-mask:hover'
    )
    videoElems.forEach( elem => {
        elem.classList.remove('night')
    })
    // handleGamePhase({phase: 'show-roles'});
    game.setAttribute('data-stage', 'show-roles')
}

function handleSheriffWatch(data) {
    for (const [slotN, player] of Object.entries(data.team)) {
        role = 'unknown'
        if (player.role === 'S') {
            role = 'sheriff'
        }
        span = document.querySelector('div.videobox[data-slot="'+slotN+'"] span.slot-role')
        span.setAttribute('data-role', role)
    }
    citizens = document.querySelectorAll('div.videobox[data-slot]:not(.vbox-game-host) span.slot-role:not([data-role="sheriff"])')
    citizens.forEach(citizen => {
        citizen.setAttribute('data-role', 'none')
        citizen.parentElement.querySelector('video').classList.add('night-video')
        citizen.parentElement.querySelector('span.video-lock').setAttribute('data-role', 'citizen')
    })
    hidePlaceholders()
    showHostVideo()
    videoElems = document.querySelectorAll(
        'div.videobox[data-slot]:not(.vbox-game-host) .g-mask,' +
        'div.videobox[data-slot]:not(.vbox-game-host) .g-mask:hover'
    )
    videoElems.forEach( elem => {
        elem.classList.remove('night')
    })
    // handleGamePhase({phase: 'show-roles'});
    game.setAttribute('data-stage', 'show-roles')
}

function handleSheriffCheck(data) {
    for (const [slotN, player] of Object.entries(data.team)) {
        role = 'unknown'
        if (player.role === 'S') {
            role = 'sheriff'
        }
        span = document.querySelector('div.videobox[data-slot="'+slotN+'"] span.slot-role')
        span.setAttribute('data-role', role)
    }
    citizens = document.querySelectorAll('div.videobox[data-slot]:not(.vbox-game-host) span.slot-role:not([data-role="sheriff"])')
    citizens.forEach(citizen => {
        citizen.setAttribute('data-role', 'none')
        citizen.parentElement.querySelector('video').classList.add('night-video')
        citizen.parentElement.querySelector('span.video-lock').setAttribute('data-role', 'citizen')
    })
    hidePlaceholders()
    showHostVideo()
    videoElems = document.querySelectorAll(
        'div.videobox[data-slot]:not(.vbox-game-host) .g-mask,' +
        'div.videobox[data-slot]:not(.vbox-game-host) .g-mask:hover'
    )
    videoElems.forEach( elem => {
        elem.classList.remove('night')
    })
    // handleGamePhase({phase: 'show-roles'});
    game.setAttribute('data-stage', 'show-roles')
}

function removeActiveSpeaker() {
    let videos = document.querySelectorAll('video.active-speaker')
    videos.forEach(video => {
        video.classList.remove('active-speaker')
        video.classList.remove('active-speaker-penalized')
    })
    let eBars = document.querySelectorAll('div.e-bar')
    eBars.forEach(eBar => {
        eBar.classList.remove('active-speaker')
    })
}
function removeVotingResult() {
    let candidates = document.querySelectorAll('div.videobox[data-slot]:not(.vbox-game-host) span.slot-vote.voted')
    candidates.forEach(candidate => {
        candidate.classList.remove('voted')
        let classes = Array.from(candidate.classList);

        classes.forEach(className => {
            if (className.startsWith('votes-')) {
                candidate.classList.remove(className);
            }
        });
    })
}

function handleActiveSpeaker(data) {
    stopCountdown()
    removeActiveSpeaker()
    removeVotingResult()
    if ((data.slot !== 0) && (data.duration > 0)) {
        let speaker = document.querySelector('div.videobox[data-slot="' + data.slot + '"] video')
        speaker.classList.add('active-speaker')
        if (data.duration === 10) {
            speaker.classList.add('active-speaker-penalized')
        }

        let eBar = document.querySelector('div.e-bar[data-slot="' + data.slot + '"]')
        eBar.classList.add('active-speaker')
        startCountdown(data.duration)
        if (selfID === roomEnv.gameHost.uid) {
            if (data.action !== undefined) {
                if (data.action === 'voted') {
                    showPlayerVoted(data.slot)
                } else if (data.action === 'killed') {
                    showPlayerKilled(data.slot)
                }
            }
        }
    }
    // handleGamePhase({phase: 'show-roles'});
}

function handleShoutOut(data) {
    let vBox = document.querySelector('div.videobox[data-slot="'+data.slot+'"]')
    vBox.classList.add('shout-out')
    vBox.setAttribute('shout-out-ttl', Date.now()+(data.duration || 4900))
    let eBar  = document.querySelector('div.e-bar[data-slot="'+data.slot+'"]')
    eBar.classList.add('shout-out')
    setTimeout(() => {
        if (vBox.getAttribute('shout-out-ttl', 0) <= Date.now()) {
            vBox.classList.remove('shout-out')
            eBar.classList.remove('shout-out')
        }
    }, 5000)
}

function handlePlayerComm(data) {
    if (data.slot > 0) {
        playTimes(sfx.knock, data.slot)
        let victimEye = document.querySelector('div.videobox[data-slot="'+data.slot+'"] span.slot-eye-role')
        victimEye.classList.add('active')
        victimEye.setAttribute('data-color', data.color)
    } else {
        sfx.knock.play();
    }
    let slotEye = document.querySelector('div.videobox[data-slot="'+data.from+'"] span.slot-eye')
    slotEye.classList.add('active')
    slotEye.setAttribute('data-color', data.color)

    setTimeout(() => {
        slotEye.classList.remove('active')
        slotEye.removeAttribute('data-color')
        if (data.slot > 0) {
            let victimEye = document.querySelector('div.videobox[data-slot="'+data.slot+'"] span.slot-eye-role')
            victimEye.classList.remove('active')
            victimEye.removeAttribute('data-color')
        }
    }, 5000)
}

function handlePlayerCommWitness(data) {
    if (data.slot > 0) {
        playTimes(sfx.knock, data.slot)
        let victimEye = document.querySelector('div.videobox[data-slot="'+data.slot+'"] span.slot-eye-role')
        victimEye.classList.add('active')
        victimEye.setAttribute('data-color', data.color)
    } else {
        sfx.knock.play();
    }
    let slotEye = document.querySelector('div.videobox[data-slot="'+data.from+'"] span.slot-eye')
    slotEye.classList.add('active')
    slotEye.setAttribute('data-color', data.color)

    setTimeout(() => {
        slotEye.classList.remove('active')
        slotEye.removeAttribute('data-color')
        if (data.slot > 0) {
            let victimEye = document.querySelector('div.videobox[data-slot="'+data.slot+'"] span.slot-eye-role')
            victimEye.classList.remove('active')
            victimEye.removeAttribute('data-color')
        }
    }, 5000)
}

function handleSetPlayerName(data) {
    let vBox = document.querySelector('div.videobox[data-slot="'+data.slot+'"]')
    let span = vBox.querySelector('span.game-user')
    span.textContent = data.name
}
function handleSetHostName(data) {
    let vBox = document.querySelector('div.videobox[data-slot="'+data.slot+'"]')
    let span = vBox.querySelector('span.game-user')
    span.textContent = data.name
}

function handleNominate(data) {
    sfx.nominate.play()
    gameMessage('Nominees: '+data.nominees.join(', '),2)
    if (data.nominees.length === 0) {
        let vBoxes = document.querySelectorAll('div.videobox[data-slot="'+data.slot+'"]')
        vBoxes.forEach( vBox => {
            vBox.classList.remove('nominated')
        })
        let eBars  = document.querySelectorAll('div.e-bar[data-slot="'+data.slot+'"]')
        eBars.forEach( eBar => {
            eBar.classList.remove('nominated')
        })
    } else {
        let slot = data.nominees[data.nominees.length - 1]
        let vBox = document.querySelector('div.videobox[data-slot="'+slot+'"]')
        vBox.classList.add('nominated')
        let eBar  = document.querySelector('div.e-bar[data-slot="'+slot+'"]')
        eBar.classList.add('nominated')
        setTimeout(() => {
            vBox.classList.remove('nominated')
            eBar.classList.remove('nominated')

        }, 5000)
    }
}

async function sleep(millis) {
    return new Promise(resolve => setTimeout(resolve, millis));
}

function handlePlayerWarn(data) {
    sfx.warn.play()
    let vBox = document.querySelector('div.videobox[data-slot="'+data.slot+'"]')
    vBox.setAttribute('data-warn', data.warn)
    vBox.setAttribute('data-player-status', data.status)
    let slotWarn  = vBox.querySelector('span.slot-warn')
    slotWarn.classList.remove('warn-1', 'warn-2', 'warn-3', 'warn-4')
    if (data.warn > 0) {
        slotWarn.classList.add('warn-'+data.warn)
    }
    if (data.warn > 3) {
        video = vBox.querySelector('video')
        video.origSrcObject = video.srcObject;
        video.srcObject = null
    } else if (data.warn < 4) {
        video = vBox.querySelector('video')
        if (video.origSrcObject !== undefined) {
            video.srcObject = video.origSrcObject
        }
    }
}

function handlePlayerStatus(data) {
    sfx.warn.play()
    let vBox = document.querySelector('div.videobox[data-slot="'+data.slot+'"]')
    vBox.setAttribute('data-player-status', data.status)

    if (data.status !== 'alive') {
        video = vBox.querySelector('video')
        video.classList.remove('active-speaker')
        video.origSrcObject = video.srcObject;
        video.srcObject = null
    } else {
        video = vBox.querySelector('video')
        video.classList.remove('active-speaker')
        if (video.origSrcObject !== undefined) {
            video.srcObject = video.origSrcObject
        }
    }
    if ((selfID === roomEnv.gameHost.uid) && (data.status === 'killed')) {
        mainButton('Next speaker', nextSpeakerSend)
    }
}


function playerButton(txt, fn) {
    gStart = document.getElementById('player-button')
    gStart.textContent = txt
    gStart.onclick = fn
    gStart.classList.add('active')
}

function playerButtonDisable() {
    gStart = document.getElementById('player-button')
    gStart.classList.remove('active')
}
function handleVotingRound(data) {
    if (selfID !== roomEnv.gameHost.uid) {
        let selfPlayer = document.querySelector('div.videobox.self-view[data-player-status="alive"]')
        if (selfPlayer !== null) {
            let selfSlot = selfPlayer.getAttribute('data-slot')
            if (!data.voted.includes(selfSlot)) {
                let vBox = document.querySelector('div.videobox[data-slot="' + data.candidate + '"]')
                let slotCandidate = vBox.querySelector('span.slot-candidate')
                slotCandidate.classList.add('active')
                slotCandidate.setAttribute('tabindex', '0');
                slotCandidate.focus();

                playerButton("Vote "+data.candidate, () => { vote(data.candidate) });

                function handleKeyDown(event) {
                    if (event.keyCode === 13 || event.keyCode === 32) {
                        event.preventDefault();

                        slotCandidate.click();
                    }
                }

                slotCandidate.addEventListener('keydown', handleKeyDown);

                setTimeout(() => {
                    slotCandidate.classList.remove('active')
                    slotCandidate.removeEventListener('keydown', handleKeyDown);
                    playerButtonDisable()
                }, 5000)
            }
        }

    }
}

function handleLockWinnersVote(data) {
    if (selfID !== roomEnv.gameHost.uid) {
        gameMessage('Lock')
        gameMessage(data.winners.join(', '),2)

        playerButton("Vote", () => { voteLockWinners(data.candidate) });

        setTimeout(() => {
            playerButtonDisable()
        }, 5000)
    }
}

function fly(boxFrom, toBox) {
    const flySpan = document.getElementById('flySpan');

    const fromRect = fromBox.getBoundingClientRect();
    const toRect = toBox.getBoundingClientRect();

    console.log("From position:", fromRect.left, fromRect.top);
    console.log("To position:", toRect.left, toRect.top);

    flySpan.style.left = `${fromRect.left + fromRect.width / 2}px`;
    flySpan.style.top = `${fromRect.top + fromRect.height / 2}px`;
    flySpan.style.display = 'block';

    // Use setTimeout to ensure the span animation starts after the position is set
    setTimeout(() => {
        flySpan.style.left = `${toRect.left + toRect.width / 2}px`;
        flySpan.style.top = `${toRect.top + toRect.height / 2}px`;
    }, 0);

    // Remove the span after the animation finishes
    setTimeout(() => {
        flySpan.style.display = 'none';
    }, 1000);
}


function handleStartVoting(data) {

    if (data.nominees.length === 0) {
        let vBoxes = document.querySelectorAll('div.videobox[data-slot="'+data.slot+'"]')
        vBoxes.forEach( vBox => {
            vBox.classList.remove('nominated')
        })
        let eBars  = document.querySelectorAll('div.e-bar[data-slot="'+data.slot+'"]')
        eBars.forEach( eBar => {
            eBar.classList.remove('nominated')
        })
    } else {
        gameMessage('Nominees:')
        gameMessage(data.nominees.join(', '),2)
        data.nominees.forEach( async (slot, idx) => {
            setTimeout(() => {
                sfx.nominate.play()
                let vBox = document.querySelector('div.videobox[data-slot="'+slot+'"]')
                vBox.classList.add('nominated')
                let eBar  = document.querySelector('div.e-bar[data-slot="'+slot+'"]')
                eBar.classList.add('nominated')
                setTimeout(() => {
                    vBox.classList.remove('nominated')
                    eBar.classList.remove('nominated')

                }, 2000)
            }, idx * 500)
        })
    }
}

function handlePlayerVote(data) {
    let fromSlot = document.querySelector('div.videobox[data-slot="' + data.player + '"]')
    let toSlot = document.querySelector('div.videobox[data-slot="' + data.candidate + '"]')
    fromSlot.querySelector('span.slot-vote').classList.add('active')
    setTimeout(() => {
        fromSlot.querySelector('span.slot-vote').classList.remove('active')
    }, 2000);
    // fly(fromSlot, toSlot)
}

function handleLockWinnersPlayerVote(data) {

    let fromSlot = document.querySelector('div.videobox[data-slot="' + data.player + '"]')
    fromSlot.querySelector('span.slot-vote').classList.add('active')
    setTimeout(() => {
        fromSlot.querySelector('span.slot-vote').classList.remove('active')
    }, 2000);
}



function handlePlayerShoot(data) {
    sfx.shot.play()
}

function handleVotingRoundResult(data) {
    let candidate = document.querySelector('div.videobox[data-slot="' + data.candidate + '"]')
    // if (data.votes.length > 0) {
        // let likes = ''
        // data.votes.forEach( vote => {
        //     likes += '\u{1F44D}'
        // })
        span = candidate.querySelector('span.slot-vote')
        span.classList.add('voted')
        span.classList.add('votes-'+data.votes.length)

    // fly(fromSlot, toSlot)
}

/* media source settings */
let videoSelect, audioSelect;

// document.getElementById('startButton').addEventListener('click', async () => {
async function saveMediaSettings() {
    const videoSource = videoSelect.value;
    const audioSource = audioSelect.value;

    localStorage.setItem('selectedVideoSource', videoSource);
    localStorage.setItem('selectedAudioSource', audioSource);

    // Get the new stream with updated video and audio sources
    const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: videoSource } },
        audio: { deviceId: { exact: audioSource } }
    });

    // Replace the tracks in the existing localStream with the new tracks
    const videoTrack = newStream.getVideoTracks()[0];
    const audioTrack = newStream.getAudioTracks()[0];

    // Get the existing video and audio tracks from the localStream
    const existingVideoTrack = localStream.getVideoTracks()[0];
    const existingAudioTrack = localStream.getAudioTracks()[0];

    videoTrack.enabled = existingVideoTrack.enabled
    audioTrack.enabled = existingAudioTrack.enabled


    // Replace the existing tracks with the new tracks
    localStream.removeTrack(existingVideoTrack);
    localStream.removeTrack(existingAudioTrack);
    localStream.addTrack(videoTrack);
    localStream.addTrack(audioTrack);

    // Update the video element with the new stream
    localVideo.srcObject = localStream;
    localVideo.play().catch(error => {
        console.error('Error attempting to play the video:', error);
        // You might want to inform the user that they need to manually start the video
    });

    // Send the new tracks to the peers
    for (const [uid, peerConnection] of Object.entries(peerConnections)) {
        const senderVideo = peerConnection.getSenders().find(s => s.track.kind === videoTrack.kind);
        const senderAudio = peerConnection.getSenders().find(s => s.track.kind === audioTrack.kind);

        senderVideo.replaceTrack(videoTrack);
        senderAudio.replaceTrack(audioTrack);
    }
    document.querySelector('div#mediaSourcePopup').classList.remove('show')
};

function closeMediaSettings() {
    document.querySelector('div#mediaSourcePopup').classList.remove('show')
}










