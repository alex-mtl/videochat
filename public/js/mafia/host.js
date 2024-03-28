function startGame() {
    ws.send(JSON.stringify({type: 'game-start'}));
}

function stopGame() {
    shuffle.stop()
    ws.send(JSON.stringify({type: 'game-stop'}));
}