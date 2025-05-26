const fs = require('fs');
const path = require('path');

const config = require('../../config');
const db = require('../../db')

module.exports.home = (req, res) => {
    let nickname = '';
    if (req.session.user) {
        nickname = req.session.user.nickname || req.session.user.username;
    }
    // console.log(req.session.user)
    getActiveRooms()
        .then(roomList => {
            roomList = roomList.filter(room => room.type === 'mafia' && room.hidden !== true);

            roomList.forEach( room => {
                if (room.host.sessionID !== req.sessionID) {
                    delete room.host.sessionID;
                }
                room.userCount = Object.keys(room.users).length
                room.aliveCount = (() => {
                    let count = 0
                    for (const [slot, player] of Object.entries(room.slot)) {
                        if (player.status === 'alive') {
                            count++
                        }
                    }
                    console.log('VC 26', count)
                    return count
                })()
            })
            console.log(roomList)
            // console.log('VC 19', req.sessionID)
            // console.log('VC 20', req.session)
            req.session.test = 'lets check'

            let data = {
                sessionID: req.sessionID,
                wssURL: config.wssURL,
                roomList,
                nickname
            };

            data = {...data, user: req.session.user || null}

            if (req.session.hasOwnProperty('error')) {
                error = req.session.error ;
                console.log('error message', error);
                //delete res.session.error;
                //if (error !== undefined && error !== null) {
                    data['error'] = error;
                    delete req.session.error;
                //}
            }
            console.log('VC 38 ',data)
            res.render('mafia/home-mafia', data)
            // res.render('mafia/home', data)
        })
        .catch(error => {
            console.error('Error retrieving active rooms:', error);
            res.status(500).send('Internal Server Error');
        });
};

module.exports.history = (req, res) => {
    // console.log(req.session.user)
    getGameHistory()
        .then(roomList => {


            let data = {
                sessionID: req.sessionID,
                wssURL: config.wssURL,
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
    roomFile = config.roomsFolder+'/'+req.params.room+'.json';
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
                wssURL: config.wssURL,
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
        fs.readdir(config.roomsFolder, (err, files) => {
            if (err) {
                console.error('Error reading rooms folder:', err);
                reject(err);
                return;
            }

            const jsonFiles = files.filter(file => file.endsWith('.json'));
            const promises = jsonFiles.map(file => {
                const filePath = path.join(config.roomsFolder, file);
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
                    resolve(rooms);
                })
                .catch(error => {
                    reject(error);
                });
        });
    });
}



async function getGameHistory() {
    if (!mduid) {
        throw new Error('User not authenticated');
    }

    // Query to get game history for the user
    const query = `
        SELECT
            g.id,
            g.room_id,
            g.created_at,

            JSON_OBJECT(
                    'name', JSON_UNQUOTE(JSON_EXTRACT(g.data, '$.slot."1".name')),
                    'mduid', JSON_UNQUOTE(JSON_EXTRACT(g.data, '$.slot."1".mduid')),
                    'avatar', JSON_UNQUOTE(JSON_EXTRACT(g.data, '$.slot."1".avatar')),
                    'role', JSON_UNQUOTE(JSON_EXTRACT(g.data, '$.slot."1".role'))
            ) AS slot1,

        FROM
            games g
        WHERE
            g.g_type = 'mafia'
        ORDER BY
            g.created_at DESC
            LIMIT 100;
    `;

    try {
        const [games] = await db.query(query, [mduid]);
        // Transform raw data into table-friendly format
        const playerGames = games.map((game, index) => {
            const winStatus = determineWinStatus(game.role, game.game_result);

            return {
                number: index + 1,
                role: getRoleLabel(game.role),
                slot: game.slot,
                result: winStatus,
                state: game.status,
                timestamp: game.created_at,
                room_id: game.room_id,
                host: game.host_name
            };
        });
        return playerGames
    } catch (error) {
        console.error('Error fetching player game history:', error);
        throw error;
    }
}
