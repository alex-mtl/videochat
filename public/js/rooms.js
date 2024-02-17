
startSignaling();

function createRoom() {
    room = {};
    form = document.getElementById('create-room');
    room.host = form.querySelector("input#userName").value;
    room.name = form.querySelector("input#roomName").value;
    room.password = form.querySelector("input#roomPassword").value;
    room.valid = form.querySelector("input#valid").checked ? 'On' : 'Off';
    room.mute = form.querySelector("input#mute").checked ? 'On' : 'Off';
    room.chat = form.querySelector("input#chat").checked ? 'On' : 'Off';
    room.stream = form.querySelector("input#stream").checked ? 'On' : 'Off';
    room.chatSessionID = chatSessionID;
    roomID = room.name;

    ws.send(JSON.stringify({type: 'create-room', 'room': room}));

}

function joinRoom(elem) {
    room = {};
    row = elem.parentElement.parentElement;
    roomID = row.getAttribute('id').replace("roomID-", "");
    passwordInput = row.querySelector("input#r-pass-"+roomID);
    if (passwordInput !== null) {
        roomPassword = passwordInput.value;
    } else {
        roomPassword = false;
    }

    ws.send(JSON.stringify({type: 'join-room', roomID: roomID, 'password': roomPassword, chatSessionID}));
}

function startSignaling() {
    btn = document.getElementById('createRoom');
    btn.onclick = createRoom;

    ws = new WebSocket(websocketUrl);

    ws.onopen = () => {
        ws.send(JSON.stringify({type: 'connect'}));
    };

    ws.onmessage = event => {
        const data = JSON.parse(event.data);
        if (data.type === 'connected') {
            handleConnected(data);
        } else if (data.type === 'room-list') {
            handleRoomList(data);
        } else if (data.type === 'room-ready') {
            handleRoomReady(data);
        }
    };

    function handleConnected(data) {
        console.log('Room created:', data.room);
    }

    function handleRoomReady(data) {
        if (data.room.name === roomID) {
            // window.location.replace(data.room.link);
            window.location.href = data.room.link;
        }
    }
    function handleRoomList(data) {
        select = document.getElementById('roomList');
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
