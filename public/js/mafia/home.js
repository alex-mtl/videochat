
let instaRoom = '';

startSignaling();

function createRoom() {
    room = {};
    form = document.getElementById('create-room');
    room.host = form.querySelector("input#userName").value;
    room.name = form.querySelector("input#roomName").value;
    // room.password = form.querySelector("input#roomPassword").value;
    // room.valid = form.querySelector("input#valid").checked ? 'On' : 'Off';
    // room.mute = form.querySelector("input#mute").checked ? 'On' : 'Off';
    // room.chat = form.querySelector("input#chat").checked ? 'On' : 'Off';
    // room.stream = form.querySelector("input#stream").checked ? 'On' : 'Off';
    room.password = '';
    room.valid = 'Off';
    room.mute = 'On';
    room.chat = 'Off';
    room.stream = 'Off';
    room.chatSessionID = chatSessionID;
    roomID = room.name;

    ws.send(JSON.stringify({type: 'create-game', 'room': room}));

}

function joinGame(elem) {
    room = {};
    row = elem.parentElement.parentElement;
    roomID = row.getAttribute('id').replace("roomID-", "");
    instaRoom = roomID;
    passwordInput = row.querySelector("input#r-pass-"+roomID);
    if (passwordInput !== null) {
        roomPassword = passwordInput.value;
    } else {
        roomPassword = false;
    }

    ws.send(JSON.stringify({type: 'join-room-game', roomID: roomID, 'password': roomPassword, chatSessionID}));
}

function joinGamePassword(roomID, roomPassword) {
    instaRoom = roomID
    ws.send(JSON.stringify({type: 'join-room-game', roomID: roomID, 'password': roomPassword, chatSessionID}));
}

async function saveGameSettings() {
    const gamePassword = document.getElementById('gamePassword');
    const registeredOnly = document.getElementById('registeredOnly');
    settings = {}
    if (gamePassword.value.trim() !== '') {
        settings['password'] = gamePassword.value;
    } else {
        settings['password'] = false;
    }
    settings['registeredOnly'] = registeredOnly.checked;

    ws.send(JSON.stringify({type: 'game-settings', settings: settings}));
    document.querySelector('div#gameSettingsPopup').classList.remove('show')
};

function requestJoinRoom(elem) {
    room = {};
    row = elem.parentElement.parentElement;
    roomID = row.getAttribute('id').replace("roomID-", "");
    requestInput = row.querySelector("input#r-admit-"+roomID);
    if (requestInput !== null) {
        roomRequest = requestInput.value;
    } else {
        roomRequest = false;
    }
    instaRoom = roomID;

    ws.send(JSON.stringify({type: 'join-room', roomID: roomID, 'request': roomRequest, chatSessionID}));
}
function startSignaling() {
    btn = document.getElementById('createRoom');
    btn.onclick = createRoom;

    ws = new WebSocket(websocketUrl);

    ws.onopen = () => {
        ws.send(JSON.stringify({type: 'connect', page: 'mafia-home'}));
    };

    ws.onmessage = event => {
        const data = JSON.parse(event.data);
        if (data.type === 'connected') {
            handleConnected(data);
        } else if (data.type === 'room-list') {
            handleRoomList(data);
        } else if (data.type === 'room-ready') {
            handleRoomReady(data);
        } else if (data.type === 'error') {
            handleError(data, 'error');
        } else if (data.type === 'info') {
            handleError(data, 'info');
        } else if (data.type === 'game-player-status') {
            handleGamePlayerStatus(data);
        } else if (data.type === 'new-room') {
            handleNewRoom(data);
        } else if (data.type === 'access-grant') {
            handleAccessGrant(data);
        }
    };

    function handleAccessGrant(data) {
        if (data.grantAccess){
            console.log(data.to+" was granted permission to "+data.roomId+" room","info")
            alertToaster(data.to+" was granted permission to "+data.roomId+" room","info");
            var tr = document.getElementById("roomID-"+data.roomId);
            tr.getElementsByTagName("td")[3].innerHTML = "";
            tr.getElementsByTagName("button")[0].innerHTML= "Join Room";
            // change button!
        } else {
            console.log(data.to+" was denied to "+data.roomId+" room","info")
            alertToaster(data.to+" was granted permission to "+data.roomId+" room", "error");
        }
    }
    function handleGamePlayerStatus(data) {
        const selector = `#active-tab tr#roomID-${data.roomID} div.player-slot[data-slot="${data.slot}"] div.role-badge`;
        const playerRoleBadge = document.querySelector(selector);
        console.log(selector);
        if (playerRoleBadge) {
            playerRoleBadge.setAttribute('data-status', data.status);
        } else {
            console.log(selector, "not found");
        }

        if (data.avatar) {
            const img = document.querySelector(`#active-tab tr#roomID-${data.roomID} div.player-slot[data-slot="${data.slot}"] img.avatar`);

            if (img && img.src !== data.avatar) {
                img.src = data.avatar;
            }
        }

    }

    async function handleNewRoom(data) {
        if (data.roomID) {
            const response = await fetch(`/ajax/m/${data.roomID}`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            } else if (response.status !== 404) {
                const html = await response.text();

                // Insert into DOM (example using a div with ID 'room-container')
                const tbody = document.querySelector('div#active-tab table tbody');
                if (tbody) {
                    tbody.insertAdjacentHTML('afterbegin', html);
                }
            }


        }
    }





    function handleConnected(data) {
        console.log('Room created:', data.room);
    }

    function handleError(data, type) {
        alertToaster(data.message, type);
    }

    function handleRoomReady(data) {
        if (instaRoom !== data.room.name) {
            showModal(
                "Would you like to join room "+data.room.name+'?',
                'Now',
                'Later',
                () => {
                    if (data.room.name === roomID) {
                        // window.location.replace(data.room.link);
                        window.location.href = data.room.link;
                    }
                },
                () => {
                    // tableBody = document.getElementById('room-list').querySelector('.table tbody');
                    // var newRow = document.createElement('tr');
                    // if (data.room.game.type === 'public') {
                    //     type = 'Open';
                    //     pwd = '';
                    //     btn = '<button class="btn btn-primary" onClick="joinGame(this)" type="button">Join Room</button>';
                    // } else if (data.room.game.type === 'private') {
                    //     type = 'Private';
                    //     pwd = '<input id="r-pass-'+data.room.name+'" type="text" size="32" placeholder="$ecr3t p@ssw0rd">';
                    //     btn = '<button class="btn btn-primary" onClick="joinGame(this)" type="button">Join Room</button>';
                    // } else if (data.room.game.type === 'master') {
                    //     type = 'Admission';
                    //     pwd = '<input id="r-admit-'+data.room.name+'" type="text" size="32" placeholder="May I join the room?">';
                    //     btn = '<button class="btn btn-primary" onClick="requestJoinRoom(this)" type="button">Join Room</button>';
                    // }
                    //
                    // newRow.id = 'roomID-'+data.room.name;
                    // newRow.innerHTML = '<td>'+data.room.name+'</td>'
                    //     +'<td>'+data.room.host.userName+'</td>'
                    //     +'<td>'+type+'</td>'
                    //     +'<td>'+pwd+'</td>'
                    //     +'<td>'+btn+'</td>'
                    // ;
                    // tableBody.prepend(newRow);
                }
            );
        } else {
            if (data.room.name === roomID) {
                // window.location.replace(data.room.link);
                window.location.href = data.room.link;
            }
        }


    }
    function handleRoomList(data) {
        const select = document.getElementById('roomList');
        select.innerHTML = '';
        roomlist = data.room - list;
        roomlist.forEach(room => {
            var opt = document.createElement('option');
            opt.innerHTML = room.name;
            opt.value = room.host;
            select.appendChild(opt);
        })

    }

}
