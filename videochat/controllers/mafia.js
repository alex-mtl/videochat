const fs = require('fs');
const path = require('path');

require('dotenv').config();
const db = require('../../db')

const helpers = require('../utils/mafia.helpers')
module.exports.home = async (req, res) => {
    try {
        let nickname = '';
        if (req.session.user) {
            nickname = req.session.user.nickname || req.session.user.username;
        }

        // Get both active rooms and history in parallel
        const [roomList, historyList] = await Promise.all([
            getActiveRooms(),
            getHistoryRooms() // You'll need to implement this function
        ]);

        // Process active rooms
        const filteredRooms = roomList.filter(room => room.type === 'mafia' && room.hidden !== true);

        filteredRooms.forEach(room => {
            if (room.host.sessionID !== req.sessionID) {
                delete room.host.sessionID;
            }
            room.userCount = Object.keys(room.users).length;
            room.aliveCount = (() => {
                let count = 0;
                for (const [slot, player] of Object.entries(room.slot)) {
                    if (player.status === 'alive') {
                        count++;
                    }
                }
                return count;
            })();
        });

        req.session.test = 'lets check';

        let data = {
            sessionID: req.sessionID,
            wssURL: process.env.WSS_URL,
            roomList: filteredRooms,
            ver: global.ver,
            historyList, // Add the history list to the data
            nickname
        };

        data = {...data, user: req.session.user || null};

        if (req.session.hasOwnProperty('error')) {
            const error = req.session.error;
            console.log('error message', error);
            data['error'] = error;
            delete req.session.error;
        }
        res.render('mafia/home-mafia', data);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Internal Server Error');
    }
};

module.exports.roomRow = async (req, res) => {
    roomFile = process.env.ROOMS_DIR+'/'+req.params.room+'.json';
    if (!fs.existsSync(roomFile)) {
        res.set('Content-Type', 'text/html');
        res.status(404).end();
    } else {
        fs.readFile(roomFile, 'utf8', function (err, roomData) {
            room = JSON.parse(roomData);
            res.render('mafia/partials/room-row', {
                r: room,
            })
        })
    }

};
module.exports.history = (req, res) => {
    // console.log(req.session.user)
    getGameHistory()
        .then(roomList => {


            let data = {
                sessionID: req.sessionID,
                wssURL: process.env.WSS_URL,
                roomList,
                nickname
            };

            data = {...data, user: req.session.user || null}


            res.render('mafia/history', data)
        })
        .catch(error => {
            console.error('120 Error retrieving games:', error);
            res.status(500).send('Internal Server Error');
        });
};

module.exports.game = (req, res) => {
    roomFile = process.env.ROOMS_DIR+'/'+req.params.room+'.json';
    if (!fs.existsSync(roomFile)) {
        req.session.error = "Room "+req.params.room+" does not exist!";
        res.redirect('/mafia');
    } else {
        fs.readFile(roomFile, 'utf8', function (err, roomData) {
            room = JSON.parse(roomData);
            console.log('VC 51', req.sessionID)
            const user = req.session.user || null;
            res.render('mafia/game', {
                sessionID: req.sessionID,
                wssURL: process.env.WSS_URL,
                ver: global.ver,
                roomID: req.params.room,
                room,
                user
            })
        })
    }
};

function getActiveRooms() {
    return new Promise((resolve, reject) => {
        let rooms = [];
        fs.readdir(process.env.ROOMS_DIR, (err, files) => {
            if (err) {
                console.error('Error reading rooms folder:', err);
                reject(err);
                return;
            }

            const jsonFiles = files.filter(file => file.endsWith('.json'));
            const promises = jsonFiles.map(file => {
                const filePath = path.join(process.env.ROOMS_DIR, file);
                return new Promise((resolveFile, rejectFile) => {
                    fs.readFile(filePath, 'utf8', (err, data) => {
                        if (err) {
                            console.error(`Error reading file ${filePath}:`, err);
                            rejectFile(err);
                            return;
                        }
                        try {
                            const room = JSON.parse(data);
                            if(!room.hasOwnProperty('name')) {
                                room.name = file.replace('.json','');
                            }
                            rooms.push(room);
                            resolveFile();
                        } catch (error) {
                            console.error(`Error parsing JSON from file ${filePath}:`, error);
                            rejectFile(error);
                        }
                    });
                });
            });

            Promise.all(promises)
                .then(() => {
                    rooms.sort((a, b) => b.createdAt - a.createdAt);
                    resolve(rooms);
                })
                .catch(error => {
                    reject(error);
                });
        });
    });
}


async function getHistoryRooms() {
    // if (!mduid) {
    //     throw new Error('User not authenticated');
    // }

    // Query to get game history for the user
    let query = `
        SELECT
            g.id,
            g.room_id,
            g.created_at,
            JSON_UNQUOTE(JSON_EXTRACT(g.data, '$.name')) as name,
            JSON_UNQUOTE(JSON_EXTRACT(g.data, '$.game.result.team')) as result,
            
        `
    for (let i = 0; i < 10; i++) {
        query += `
            JSON_OBJECT(
                    'name', JSON_UNQUOTE(JSON_EXTRACT(g.data, '$.slot."${i + 1}".name')),
                    'mduid', JSON_UNQUOTE(JSON_EXTRACT(g.data, '$.slot."${i + 1}".mduid')),
                    'avatar', COALESCE(
                        NULLIF(JSON_UNQUOTE(JSON_EXTRACT(g.data, '$.slot."${i + 1}".avatar')), 'null'),
                        '/static/img/avatar/d450356dc7cb3609.png'
                    ),
                    'role', JSON_UNQUOTE(JSON_EXTRACT(g.data, '$.slot."${i + 1}".role'))
            ) AS slot${i + 1},
        `
    }
    query += `
            JSON_UNQUOTE(JSON_EXTRACT(g.data, '$.host.userName')) AS host_name,  
            JSON_UNQUOTE(JSON_EXTRACT(g.data, '$.host.mduid')) AS host_mduid,
            JSON_UNQUOTE(JSON_EXTRACT(g.data, '$.host.avatar')) AS host_avatar
              
        FROM
            games g
        WHERE
            g.g_type = 'mafia'
        ORDER BY
            g.created_at DESC
            LIMIT 20;
    `;

    try {
        const [games] = await db.query(query);

        //return games;

        const playerGames = games.map((game, index) => {
            console.log(game.id, game.host_name, game.host_mduid, game.host_avatar) //
            const players = [ game.slot1, game.slot2, game.slot3, game.slot4, game.slot5, game.slot6, game.slot7, game.slot8, game.slot9, game.slot10 ];
            console.log(game)
            return {
                number: index + 1,
                role: helpers.getRoleLabel(game.role),
                name: game.name,
                slot: game.slot,
                players,
                result: game.result,
                state: game.status,
                timestamp: game.created_at,
                room_id: game.room_id,
                host: {
                    name: game.host_name,
                    mduid: game.host_mduid,
                    avatar: game.host_avatar

                }
            };
        });
        return playerGames
    } catch (error) {
        console.error('Error fetching player game history:', error);
        throw error;
    }
}
