function startGame() {
    gStop = document.getElementById('game-stop')
    gStop.hidden = true;
    ws.send(JSON.stringify({type: 'game-start'}));
}

function stopGame() {
    muteAllSfx()
    ws.send(JSON.stringify({type: 'game-stop'}));
    hostButtons([
        {btn: 1, action: startGame, txt: 'Start', type: actionBtnTypes.SUCCESS},
        {btn: 5, action: stopGame, txt: 'Stop', type: actionBtnTypes.FAILURE}
    ])
    mainButton('Start', startGame)
    gameMessage('')
    gameMessage('', 2)
    stopCountdown()
}

const actionBtnTypes = {
    SUCCESS: 'success',
    FAILURE: 'fail',
    INFO: 'info',
    WARN: 'warn',
    HIDDEN: 'hidden'
};
function hostButtons(btns) {
    disBtn = document.querySelectorAll('button.g-panel-btn.active');
    disBtn.forEach(btn =>  {
        btn.classList.remove('active', actionBtnTypes.INFO, actionBtnTypes.SUCCESS, actionBtnTypes.WARN,actionBtnTypes.FAILURE)
    });
    btns.forEach(btn =>  {
        actionButton = document.getElementById('game-btn-'+btn.btn)
        if (actionButton) {
            actionButton.onclick = btn.action
            actionButton.textContent=btn.txt
            actionButton.classList.add('active', 'g-btn-'+btn.type)
        }
    });
}
function handleShuffleRolesReady(data) {
    hostButtons([
        {btn: 1, action: startGame, txt: 'Start', type: actionBtnTypes.SUCCESS},
        {btn: 5, action: stopGame, txt: 'Stop', type: actionBtnTypes.FAILURE}
    ])
    ws.send(JSON.stringify({type: 'shuffle-roles'}));
}

function mainButton(txt, fn) {
    gStart = document.getElementById('game-start')
    gStart.textContent = txt
    gStart.onclick = fn
    gStart.classList.add('g-show')
}

function hideMainButton() {
    gStart = document.getElementById('game-start')
    gStart.classList.remove('g-show')
}
function sitdownReady() {
    mainButton('Sitdown', startSitdown)
    hostButtons([
        {btn: 1, action: startSitdown, txt: 'Sitdown', type: actionBtnTypes.SUCCESS},
        {btn: 5, action: stopGame, txt: 'Stop', type: actionBtnTypes.FAILURE}
    ])
    ws.send(JSON.stringify({type: 'show-roles'}));
}

function hostRolesReady() {
    mainButton('Sitdown', startSitdown)
    hostButtons([
        {btn: 1, action: startSitdown, txt: 'Sitdown', type: actionBtnTypes.SUCCESS},
        {btn: 5, action: stopGame, txt: 'Stop', type: actionBtnTypes.FAILURE}
    ])
    ws.send(JSON.stringify({type: 'show-roles'}));
}
function donWatchSend() {
    stopCountdown()
    ws.send(JSON.stringify({type: 'don-watch'}));
}

function showDonWatch() {
    mainButton('Don watch', donWatchSend)
}

function sheriffWatchSend() {
    stopCountdown()
    ws.send(JSON.stringify({type: 'sheriff-watch'}));
}
function showSheriffWatch() {
    mainButton('Sheriff watch', sheriffWatchSend)
}

function nextSpeakerSend() {
    ws.send(JSON.stringify({type: 'next-speaker'}));
}
function showNextSpeaker() {
    mainButton('Next speaker', nextSpeakerSend)
}

function stopSpeakerSend() {
    ws.send(JSON.stringify({type: 'stop-speaker'}));
}
function showStopSpeaker() {
    mainButton('Stop', stopSpeakerSend)
}
function startDaySend() {
    ws.send(JSON.stringify({type: 'start-day-one'}));
}
function showStartDay1() {
    mainButton('Day 1', startDaySend)
}
function startSitdown() {
    hideMainButton()
    //handleGamePhase({phase: 'sitdown'});
    ws.send(JSON.stringify({type: 'start-sitdown'}));
}

function handleGameRoles(data) {
    let role = 'unknown'
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
        span = document.querySelector('div.videobox[data-slot="'+slotN+'"] span.slot-role')
        span.setAttribute('data-role', role)
    }
    videoElems = document.querySelectorAll(
        'div.videobox[data-slot]:not([data-slot="game-host"]) .g-mask,' +
        'div.videobox[data-slot]:not([data-slot="game-host"]) .g-mask:hover'
    )
    videoElems.forEach( elem => {
        elem.classList.remove('night')
    })
    handleGamePhase({phase: 'show-roles'});
}

function detectGameState() {
    //mainButton('Start', startGame)
    hostButtons([
        {btn: 1, action: startGame, txt: 'Start', type: actionBtnTypes.SUCCESS},
        {btn: 3, action: nextSpeakerSend, txt: 'Next', type: actionBtnTypes.INFO},
        {btn: 5, action: stopGame, txt: 'Stop', type: actionBtnTypes.FAILURE}
    ])
}

function warnAdd(el) {
    let slot = el.parentElement.getAttribute('data-slot')
    ws.send(JSON.stringify({type: 'warn-add', slot: slot}));
}

function warnRemove(el) {
    let slot = el.parentElement.getAttribute('data-slot')
    ws.send(JSON.stringify({type: 'warn-remove', slot: slot}));
}

function nominate(el) {
    let slot = el.parentElement.getAttribute('data-slot')
    ws.send(JSON.stringify({type: 'nominate', slot: slot}));
}