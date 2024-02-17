const fs = require('fs');

const config = require('../../config');

module.exports.room = (req, res) => {
    console.log('Room ID ', req.params.room);
    console.log('/p/:room sessionID ', req.sessionID);

    roomFile = 'rooms/'+req.params.room+'.json';
    if (!fs.existsSync(roomFile)) {
        req.session.error = "Room "+req.params.room+" does not exist!";
        res.redirect('/rooms');
    } else {
        res.render('p-room', {
            sessionID: req.sessionID,
            wssURL : config.wssURL,
            roomID : req.params.room
        })
    }
};
