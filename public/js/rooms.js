
let instaRoom = '';

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
    instaRoom = roomID;
    passwordInput = row.querySelector("input#r-pass-"+roomID);
    if (passwordInput !== null) {
        roomPassword = passwordInput.value;
    } else {
        roomPassword = false;
    }

    ws.send(JSON.stringify({type: 'join-room', roomID: roomID, 'password': roomPassword, chatSessionID}));
}

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
        } else if (data.type === 'error') {
            handleError(data, 'error');
        } else if (data.type === 'info') {
            handleError(data, 'info');
        }
    };

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
                    tableBody = document.getElementById('room-list').querySelector('.table tbody');
                    var newRow = document.createElement('tr');
                    if (data.room.type === 'stream') {
                        type = 'Stream';
                        pwd = '';
                        btn = '<button class="btn btn-primary" onClick="joinRoom(this)" type="button">Join Stream</button>';
                    } else if (data.room.type === 'public') {
                        type = 'Public';
                        pwd = '';
                        btn = '<button class="btn btn-primary" onClick="joinRoom(this)" type="button">Join Room</button>';
                    } else if (data.room.type === 'private') {
                        type = 'Private';
                        pwd = '<input id="r-pass-'+data.room.name+'" type="text" size="32" placeholder="$ecr3t p@ssw0rd">';
                        btn = '<button class="btn btn-primary" onClick="joinRoom(this)" type="button">Join Room</button>';
                    } else if (data.room.type === 'master') {
                        type = 'Admission';
                        pwd = '<input id="r-admit-'+data.room.name+'" type="text" size="32" placeholder="May I join the room?">';
                        btn = '<button class="btn btn-primary" onClick="requestJoinRoom(this)" type="button">Join Room</button>';
                    }

                    newRow.id = 'roomID-'+data.room.name;
                    newRow.innerHTML = '<td>'+data.room.name+'</td>'
                        +'<td>'+data.room.host.userName+'</td>'
                        +'<td>'+type+'</td>'
                        +'<td>'+pwd+'</td>'
                        +'<td>'+btn+'</td>'
                    ;
                    tableBody.prepend(newRow);
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
