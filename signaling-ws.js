const WebSocket = require('ws');
const express = require('express');
const https = require('https');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
let db = new sqlite3.Database('video.db');

db.serialize(() => {
    db.prepare(`CREATE TABLE IF NOT EXISTS rooms (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, room TEXT NOT NULL )`).run().finalize();
    var n = 0;
    db.all(`SELECT * FROM rooms`, (err, rows) => {

        rows.forEach(function (row) {
            n++;
            console.log(row)
        });
        if (n===0) {
            db.run('INSERT INTO rooms(name, room) VALUES(?, ?)', ['test-room1','{}'], (err) => {
                if(err) {
                    return console.log(err.message);
                }
                console.log("Row was added to the table: ", db.lastID);
            })
        }
    })

    db.close();
});


const app = express();

// Load SSL certificate and private key
const privateKey = fs.readFileSync('video-key.pem', 'utf8');
const certificate = fs.readFileSync('video-cert.pem', 'utf8');
const credentials = { key: privateKey, cert: certificate };

const server = https.createServer(credentials, app);
const wss = new WebSocket.Server({ server });

const clients = {};
const clientOffers = {};
const rooms = {};

wss.on('connection', ws => {
    ws.on('message', message => {
        const data = JSON.parse(message);

        switch (data.type) {
            case 'join':
                handleJoin(ws, data);
                break;
            case 'offer':
                handleOffer(ws, data);
                break;
            case 'answer':
                handleAnswer(ws, data);
                break;
            case 'ice-candidate':
                handleIceCandidate(ws, data);
                break;
            case 'create-room':
                handleCreateRoom(ws, data);
                break;
            case 'send-chat-message':
                handleSendChatMessage(ws, data);
                break;
            default:
                console.error('Unknown message type:', data.type);
        }
    });

    ws.on('close', () => {
        removeClient(ws);
    });
});

function handleJoin(ws, data) {
    const clientId = generateClientId();
    roomId = data.roomId;
    var roomFile = 'rooms/'+roomId+'.json';
    var obj = {};
    fs.readFile(roomFile, 'utf8', function (err, data) {
        if (err) {
            obj['host'] = { uid: clientId };
            obj['size'] = 1;
        } else {
            obj = JSON.parse(data);
            obj['u'+obj.size] = { uid: clientId };
            obj.size = obj.size + 1;

        }

        clients[clientId] = ws;
        ws.uid = clientId;

        // Send the new client their ID
        ws.send(JSON.stringify({ type: 'id', id: clientId, room: obj, test: "test : " }));
        console.log('wsid: ',ws.uid,clientId, 'obj :',  JSON.stringify(obj));

        fs.writeFileSync(roomFile, JSON.stringify(obj) , 'utf-8');


        // Notify other clients about the new participant
        broadcast(JSON.stringify({ type: 'participant-joined', id: clientId }));
    });

}

function handleOffer(sender, data) {
    const recipient = clients[data.to];
    console.log('Offer from : ',sender.uid, ' to: ',data.to);
    if (recipient) {
        recipient.send(JSON.stringify({ type: 'participant-offer', from: data.from, description: data.offer }));
    }

}

function handleCreateRoom(sender, data) {
    rooms.push({ name: data.name, host: data.host})

    broadcast(JSON.stringify({ type: 'room-list', roomList: rooms }));

}

function handleSendChatMessage(sender, data) {
    ts = new Date();
    time = ts.toLocaleTimeString('it-IT');
    broadcast(JSON.stringify({ type: 'chat-message', time: time, from: data.from, message: data.message }));

}

function handleAnswer(sender, data) {
    const recipient = clients[data.to];


    if (recipient) {
        recipient.send(JSON.stringify({ type: 'answer', from: data.from, description: data.description }));
    }
}

function handleIceCandidate(sender, data) {
    const recipient = clients[data.to];

    if (recipient) {
        // recipient.send(JSON.stringify({ type: 'ice-candidate', from: data.from, candidate: data.candidate }));
        recipient.send(JSON.stringify({ type: 'ice-candidate', from: data.from, candidate: data.candidate }));
    }
}

function sendOffer(sender, recipientId, offerDescription) {
    const recipient = clients[recipientId];

    if (recipient) {
        sender.send(JSON.stringify({ type: 'offer', to: recipientId, description: offerDescription }));
    }
}

function broadcast(message) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

function removeClient(ws) {
    const clientId = ws.uid;
    var roomFile = 'rooms/'+'test-room'+'.json';
    fs.readFile(roomFile, 'utf8', function (err, data) {
        obj = JSON.parse(data);
        if (clientId) {
            delete clients[clientId];
            removeId = 0;
            if (obj.host.uid === clientId) {
                if (obj.hasOwnProperty('u1')) {
                    obj.host = obj.u1;
                    removeId = 1;
                    obj.size = obj.size - 1;
                    console.log('183 size:', obj.size);
                }
            } else {
                for (let i= 1; i <= 10; i++) {
                    if (obj.hasOwnProperty('u'+i)) {
                        if (obj['u'+i].uid === clientId) {
                            delete obj['u'+i];
                            removeId = i;
                            obj.size = obj.size - 1;
                            console.log('192 size:', obj.size);
                            break;
                        }
                    }
                }
            }
            for (let i= removeId; i <= 10; i++) {
                if (obj.hasOwnProperty('u'+(i+1))) {
                    obj['u'+i] = obj['u'+(i+1)];
                    delete obj['u'+(i+1)];
                    console.log('202 size:', obj.size, 'remove id: ', removeId);
                    //obj.size = obj.size - 1;
                }
            }
            fs.writeFileSync(roomFile, JSON.stringify(obj) , 'utf-8');
            // Notify other clients about the departure
            broadcast(JSON.stringify({ type: 'participant-left', id: clientId, room: obj }));
        }
    });

}

function getClientId(ws) {
    for (const clientId in clients) {
        if (clients[clientId] === ws) {
            return clientId;
        }
    }
    return null;
}

function generateClientId() {
    return Math.random().toString(36).substr(2, 9);
}

const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
