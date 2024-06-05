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
let countdown;
let remainingSeconds = -1;

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
        if (track.kind === 'video') track.enabled = !track.enabled;
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
        } else {
            ws.send(JSON.stringify({type: 'game-player-status', 'from': sessionID, status: 'unknown'}));
        }
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
    // remoteVideoFrame.appendChild(remoteVideo);
    // remoteVideoFrame.classList.add("videobox");

    let name = slot.querySelector('span.game-user');
    name.textContent = slot.getAttribute('data-name');
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
        videoElems = document.querySelectorAll('div.videobox[data-slot]:not([data-slot="game-host"]) .g-mask')
        videoElems.forEach( elem => {
            elem.classList.add('night')
        })

    } else if (data.phase === 'night') {
        gameMessage('Night '+data.night)
        gameMessage('', 2)
        removeActiveSpeaker()
        stopCountdown()
        if (selfID !== roomEnv.gameHost.uid) {
            hideAllRolesAndVideos()
            showPlaceholders()
        } else {
            mainButton('Shooting', startShooting)
            ws.send(JSON.stringify({type: 'show-roles'}));
        }

    } else if (data.phase === 'shooting') {
        //gameMessage('Night '+data.night)
        gameMessage('Shooting', 2)
        if (selfID !== roomEnv.gameHost.uid) {
            hideAllRolesAndVideos()
            showPlaceholders()
        } else {
            setTimeout(async () => {
                mainButton('Don check', startDonCheck)
            }, 3500)
        }

    } else if (data.phase === 'sitdown') {
        startCountdown(60)
        sfx.sitdown.play()
        if (selfID !== roomEnv.gameHost.uid) {
            // 'div.videobox[data-slot]:not(.vbox-game-host) div.select-slot button,'+
            showPlaceholders()
        } else {
            showDonWatch()
        }
        gameMessage('Mafia')
        gameMessage('cahoot sitdown', 2)

    } else if (data.phase === 'don-watch') {
        stopCountdown()
        muteAllSfx()
        startCountdown(20)
        sfx.godfather.play()
        if (selfID !== roomEnv.gameHost.uid) {
            // 'div.videobox[data-slot]:not(.vbox-game-host) div.select-slot button,'+
            hideAllRolesAndVideos()
            showPlaceholders()
        } else {
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
            showPlaceholders()
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
            } else {
                hidePlaceholders()
                hideRoles()
                mainButton('Next speaker', nextSpeakerSend)
            }
            gameMessage('Day '+data.day)
            gameMessage('', 2)

    } else if (data.phase === 'sheriff-watch') {
        stopCountdown()
        muteAllSfx()
        startCountdown(20)
        sfx.sheriff.play()
        if (selfID !== roomEnv.gameHost.uid) {
            // 'div.videobox[data-slot]:not(.vbox-game-host) div.select-slot button,'+
            hideAllRolesAndVideos()
            showPlaceholders()
        } else {
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
        card.classList.add('taken')
    }
}

function handleGameRole(data) {
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
}

function handleGameReady(data) {
    sfx.police.stop();
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
    slotStatus = document.querySelector('div.videobox[data-uid="'+data.uid+'"] span.slot-status')
    slotN = slotStatus.parentElement.getAttribute('data-slot')
    if (slotStatus) {
        slotStatus.setAttribute('data-status', data.status)
        barSlot = document.querySelector('div.e-bar[data-slot="'+slotN+'"]')
        barSlot.setAttribute('data-status', data.status)
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
    videoElems = document.querySelectorAll(
        'div.videobox[data-slot]:not(.vbox-game-host) .g-mask,' +
        'div.videobox[data-slot]:not(.vbox-game-host) .g-mask:hover'
    )
    videoElems.forEach( elem => {
        elem.classList.remove('night')
    })
    handleGamePhase({phase: 'show-roles'});
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
    }
    citizens = document.querySelectorAll('div.videobox[data-slot]:not(.vbox-game-host) span.slot-role:not([data-role="mafia"]):not([data-role="don"])')
    citizens.forEach(citizen => {
        citizen.setAttribute('data-role', 'citizen')
        citizen.parentElement.querySelector('video').classList.add('night-video')
        citizen.parentElement.querySelector('span.video-target').setAttribute('data-role', 'citizen')
    })
    hidePlaceholders()
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
    videoElems = document.querySelectorAll(
        'div.videobox[data-slot]:not(.vbox-game-host) .g-mask,' +
        'div.videobox[data-slot]:not(.vbox-game-host) .g-mask:hover'
    )
    videoElems.forEach( elem => {
        elem.classList.remove('night')
    })
    handleGamePhase({phase: 'show-roles'});
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
    videoElems = document.querySelectorAll(
        'div.videobox[data-slot]:not(.vbox-game-host) .g-mask,' +
        'div.videobox[data-slot]:not(.vbox-game-host) .g-mask:hover'
    )
    videoElems.forEach( elem => {
        elem.classList.remove('night')
    })
    handleGamePhase({phase: 'show-roles'});
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
    videoElems = document.querySelectorAll(
        'div.videobox[data-slot]:not(.vbox-game-host) .g-mask,' +
        'div.videobox[data-slot]:not(.vbox-game-host) .g-mask:hover'
    )
    videoElems.forEach( elem => {
        elem.classList.remove('night')
    })
    handleGamePhase({phase: 'show-roles'});
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
    videoElems = document.querySelectorAll(
        'div.videobox[data-slot]:not(.vbox-game-host) .g-mask,' +
        'div.videobox[data-slot]:not(.vbox-game-host) .g-mask:hover'
    )
    videoElems.forEach( elem => {
        elem.classList.remove('night')
    })
    handleGamePhase({phase: 'show-roles'});
}

function removeActiveSpeaker() {
    let videos = document.querySelectorAll('video.active-speaker')
    videos.forEach(video => {
        video.classList.remove('active-speaker')
    })
    let eBars = document.querySelectorAll('div.e-bar')
    eBars.forEach(eBar => {
        eBar.classList.remove('active-speaker')
    })
}

function handleActiveSpeaker(data) {
    stopCountdown()
    removeActiveSpeaker()
    let speaker = document.querySelector('div.videobox[data-slot="'+data.slot+'"] video')
    speaker.classList.add('active-speaker')
    let eBar  = document.querySelector('div.e-bar[data-slot="'+data.slot+'"]')
    eBar.classList.add('active-speaker')
    startCountdown(data.duration)
    handleGamePhase({phase: 'show-roles'});
}

function handleShoutOut(data) {
    let vBox = document.querySelector('div.videobox[data-slot="'+data.slot+'"]')
    vBox.classList.add('shout-out')
    let eBar  = document.querySelector('div.e-bar[data-slot="'+data.slot+'"]')
    eBar.classList.add('shout-out')
    setTimeout(() => {
        vBox.classList.remove('shout-out')
        eBar.classList.remove('shout-out')

    }, 3000)
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

        }, 3000)
    }
}

async function sleep(millis) {
    return new Promise(resolve => setTimeout(resolve, millis));
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


function handlePlayerWarn(data) {
    sfx.warn.play()
    let vBox = document.querySelector('div.videobox[data-slot="'+data.slot+'"]')
    vBox.setAttribute('data-warn', data.warn)
    let slotWarn  = vBox.querySelector('span.slot-warn')
    slotWarn.classList.remove('warn-1', 'warn-2', 'warn-3', 'warn-4')
    if (data.warn > 0) {
        slotWarn.classList.add('warn-'+data.warn)
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
        let vBox = document.querySelector('div.videobox[data-slot="' + data.candidate + '"]')
        let slotCandidate = vBox.querySelector('span.slot-candidate')
        slotCandidate.classList.add('active')
        slotCandidate.setAttribute('tabindex', '0');
        slotCandidate.focus();

        playerButton("Vote", () => { vote(data.candidate) });


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
        }, 3000)
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
function handlePlayerVote(data) {
    let fromSlot = document.querySelector('div.videobox[data-slot="' + data.player + '"]')
    let toSlot = document.querySelector('div.videobox[data-slot="' + data.candidate + '"]')
    fromSlot.querySelector('span.slot-vote').classList.add('active')
    setTimeout(() => {
        fromSlot.querySelector('span.slot-vote').classList.remove('active')
    }, 2000);
    // fly(fromSlot, toSlot)
}

function handlePlayerShoot(data) {
    sfx.shot.play()
}

function handleVotingRoundResult(data) {
    let candidate = document.querySelector('div.videobox[data-slot="' + data.candidate + '"]')
    if (data.votes.length > 0) {
        let likes = ''
        data.votes.forEach( vote => {
            likes += '\u{1F44D}'
        })
        candidate.querySelector('span.slot-vote').classList.add('voted')
        candidate.textContent = likes
        setTimeout(() => {
            fromSlot.querySelector('span.slot-vote').classList.remove('active')
        }, 2000);
    }

    // fly(fromSlot, toSlot)
}










