const fs = require('fs');
const path = require('path');

// Path to the rooms folder
//const roomsFolder = '../../rooms';
const config = require('../../config');

module.exports.page = (req, res) => {

    getActiveRooms()
        .then(roomList => {
            data = {
                sessionID: req.sessionID,
                wssURL: config.wssURL,
                roomList
            };
            if (req.session.hasOwnProperty('error')) {
                error = req.session.error ;
                console.log('error message', error);
                //delete res.session.error;
                if (error !== undefined && error !== null) {
                    data['error'] = error;
                    delete req.session.error;
                }
            }

            res.render('rooms', data);
        })
        .catch(error => {
            console.error('Error retrieving active rooms:', error);
            res.status(500).send('Internal Server Error');
        });
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



