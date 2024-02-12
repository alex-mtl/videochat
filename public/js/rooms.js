const configuration = {iceServers: [{urls: 'stun:stun.l.google.com:19302'}]};
const constraints = {video: true, audio: true};

const localVideo = document.getElementById('localVideo');
const remoteVideosContainer = document.getElementById('remoteVideos');
var sessionID = null;
var roomEnv = null;
let roomId = null;
let localStream;
const peerConnections = {};
var ws = null;// = new WebSocket('wss://video.ttl10.net:3000');
function escapeHtml(unsafe)
{
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
startSignaling();

function createRoom(elem) {
    room = {};
    form = elem.parentElement.parentElement;
    room.host = form.querySelector("input#userName").value;
    room.name = form.querySelector("input#roomName").value;
    room.password = form.querySelector("input#roomPassword").value;
    room.valid = form.querySelector("input#valid").checked ? 'On' : 'Off';
    room.mute = form.querySelector("input#mute").checked ? 'On' : 'Off';
    room.chat = form.querySelector("input#chat").checked ? 'On' : 'Off';
    room.stream = form.querySelector("input#stream").checked ? 'On' : 'Off';
    room.chatSessionID = chatSessionID;

    ws.send(JSON.stringify({type: 'create-room', 'room': room}));

}

function startSignaling() {
    //ws = new WebSocket('wss://video.ttl10.net:3000'); // Replace with your WebSocket server
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
        } else if (data.type === 'room-created') {
            handleRoomCreated(data);
        }
    };

    function handleConnected(data) {
        console.log('Room created:', data.room);
    }

    function handleRoomCreated(data) {

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
