
function startGame() {
    gStop = document.getElementById('game-stop')
    gStop.hidden = true;
    hideMainButton()
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

function mainButton(txt, fn, args = []) {
    gStart = document.getElementById('game-start')
    gStart.textContent = txt
    gStart.onclick = () => fn(...args);
    gStart.classList.add('g-show')
}

function secondaryButton(txt, fn, args = []) {
    button = document.getElementById('game-stop')
    button.hidden = false;
    button.textContent = txt
    button.onclick = () => fn(...args);
    button.classList.add('g-show')
}

function hideSecondaryButton() {
    let button = document.getElementById('game-stop')
    button.classList.remove('g-show')
    button.hidden = true;
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
function showSheriffCheck() {
    mainButton('Sheriff check', startSheriffCheck)
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


function lastSpeech(candidate, action) {
    ws.send(JSON.stringify({type: 'last-speech', candidate: candidate, action: action}));
}

function defenseSpeech(candidate) {
    ws.send(JSON.stringify({type: 'defense-speech', candidate: candidate }));
}

function lockWinners(winners) {
    ws.send(JSON.stringify({type: 'lock-winners', winners: winners }));
}
function teamWins(team) {
    hideSecondaryButton()
    ws.send(JSON.stringify({type: 'team-wins', team: team}));
}

function showPlayerVoted(slot) {
    let vBox = document.querySelector('div.videobox[data-slot="'+slot+'"] span.slot-candidate')
    mainButton('Voted '+slot, playerLock, [vBox])
}

function showPlayerKilled(slot) {
    let vBox = document.querySelector('div.videobox[data-slot="'+slot+'"] span.slot-candidate')
    mainButton('Killed '+slot, playerKill, [vBox])
}



function startDaySend() {
    ws.send(JSON.stringify({type: 'start-day-one'}));
}
function showStartDay1() {
    mainButton('Day 1', startDaySend)
}

function showStartDay() {
    mainButton('Day', startDay)
}

function startDay() {
    ws.send(JSON.stringify({type: 'start-day'}));
}
function startSitdown() {
    hideMainButton()
    //handleGamePhase({phase: 'sitdown'});
    ws.send(JSON.stringify({type: 'start-sitdown'}));
}
function startShooting() {
    hideMainButton()
    ws.send(JSON.stringify({type: 'start-shooting'}));
}

function startDonCheck() {
    mainButton('Sheriff check', startSheriffCheck)
    ws.send(JSON.stringify({type: 'start-don-check'}));
    mafias = document.querySelectorAll(
        'div.videobox[data-slot] span.mafia-shoot[data-victim]'
    )
    mafias.forEach( maf => {
        maf.removeAttribute('data-victim')

    })
}

function startSheriffCheck() {
    mainButton('Day', startDay)
    ws.send(JSON.stringify({type: 'start-sheriff-check'}));
}

function startVotingSend() {
    ws.send(JSON.stringify({type: 'start-voting'}));
}
function startNight() {
    ws.send(JSON.stringify({type: 'start-night'}));
}

function startVoteSend() {
    ws.send(JSON.stringify({type: 'start-voting-round'}));
    hideMainButton()
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
    game.setAttribute('data-stage', 'show-roles')
    if (data.phase === 'night') {

    }
}

function handleReadyToVote(data) {
    gameMessage('Nominees:')
    gameMessage(data.nominees.join(', '),2)
    if (data.nominees.length > 0) {
        mainButton('Start Voting', startVotingSend)
    } else {
        mainButton('Night', startNight)
    }
}
function handleReadyToNight(data) {
    gameMessage('')
    gameMessage('',2)
    mainButton('Night', startNight)

}

function handleSplitSpeech(data) {
    gameMessage('Split ')
    gameMessage(data.winners.join(', '),2)

    if (data.winners.length > data.split.length) {
        mainButton('Defence speech '+data.winners[data.split.length], defenseSpeech, [data.winners[data.split.length]])
    } else {
        mainButton('Vote gain: '+data.winners.join(', '), startVotingSend)

    }

}


function handleLockAllWinners(data) {
    gameMessage('Lock')
    gameMessage(data.winners.join(', '),2)
    // за поднятие всех попильных
    mainButton('Vote: '+data.winners.join(', '), lockWinners, [data.winners])
}




function handleVotingRoundReady(data) {
    mainButton('Vote '+data.candidate, startVoteSend)
}

function handleLastSpeechVoted(data) {
    mainButton('Last speech '+data.candidate, lastSpeech, [data.candidate, data.action])
}

function handleLastSpeechKilled(data) {
    mainButton('Last speech '+data.victim, lastSpeech, [data.victim, data.action])
}

function handleMafiaShoot(data) {

    mafiaShoot = document.querySelector(
        'div.videobox[data-slot="'+data.mafia+'"] span.mafia-shoot'
    )
    mafiaShoot.setAttribute('data-victim', data.victim)
    if (Number(data.victim) < 10) {
        mafiaShoot.style.setProperty('--shootVictim', '"counter_'+data.victim+'"');
    } else {
        style.removeProperty('--shootVictim')
    }


}

function handleTeamWins(data) {
    secondaryButton(data.team.toUpperCase() + ' team wins!', teamWins, [data.team])
}


function detectGameState() {
    if (roomEnv.game.phase === 'lobby') {
        mainButton('Start', startGame)
        gStop = document.getElementById('game-stop')
        gStop.hidden = true;
    } else if (roomEnv.game.phase === 'day') {
        mainButton('Next speaker', nextSpeakerSend)
        gStop = document.getElementById('game-stop')
        gStop.hidden = true;

        hostButtons([
            {btn: 1, action: startGame, txt: 'Start', type: actionBtnTypes.SUCCESS},
            {btn: 3, action: nextSpeakerSend, txt: 'Next', type: actionBtnTypes.INFO},
            {btn: 5, action: stopGame, txt: 'Stop', type: actionBtnTypes.FAILURE}
        ])
    } else if (roomEnv.game.phase === 'shuffle') {
        hostButtons([
            {btn: 1, action: startSitdown, txt: 'Sitdown', type: actionBtnTypes.INFO},
            {btn: 2, action: donWatchSend, txt: 'Don watch', type: actionBtnTypes.INFO},
            {btn: 3, action: sheriffWatchSend, txt: 'Sheriff watch', type: actionBtnTypes.INFO},
            {btn: 4, action: sheriffWatchSend, txt: 'Day start', type: actionBtnTypes.INFO},
            {btn: 5, action: stopGame, txt: 'Stop', type: actionBtnTypes.FAILURE}
        ])
    }



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

function playerKill(el) {
    let slot = el.parentElement.getAttribute('data-slot')
    ws.send(JSON.stringify({type: 'player-kill', slot: slot}));
}

function playerLock(el) {
    let slot = el.parentElement.getAttribute('data-slot')
    ws.send(JSON.stringify({type: 'player-lock', slot: slot}));
}

function playerRestore(el) {
    let slot = el.parentElement.getAttribute('data-slot')
    ws.send(JSON.stringify({type: 'player-restore', slot: slot}));
}