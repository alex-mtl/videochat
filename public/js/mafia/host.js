function startGame() {
    ws.send(JSON.stringify({type: 'game-start'}));
}

function stopGame() {
    shuffle.stop();
    police.stop();
    ws.send(JSON.stringify({type: 'game-stop'}));
    hostButtons([
        {btn: 1, action: startGame, txt: 'Start', type: actionBtnTypes.SUCCESS},
        {btn: 5, action: stopGame, txt: 'Stop', type: actionBtnTypes.FAILURE}
    ])
    gStart = document.getElementById('game-start')
    gStart.textContent = 'Start'
    gStart.onclick = startGame
    gameMessage('')
    gameMessage('', 2)
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

function sitdownReady() {
    hostButtons([
        {btn: 5, action: stopGame, txt: 'Stop', type: actionBtnTypes.FAILURE}
    ])
    gStart = document.getElementById('game-start')
    gStart.textContent = 'Sitdown'
    gStart.onclick = startSitdown

    gStop = document.getElementById('game-stop')
    gStop.hidden = true;

    ws.send(JSON.stringify({type: 'show-roles'}));
}

function startSitdown() {
    handleGamePhase({phase: 'sitdown'});
    ws.send(JSON.stringify({type: 'start-sitdown'}));
}

function handleGameRoles(data) {
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