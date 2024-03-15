const fs = require('fs');

const config = require('../../config');

module.exports.room = (req, res) => {
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

module.exports.stream = (req, res) => {
    roomFile = 'rooms/'+req.params.room+'.json';
    if (!fs.existsSync(roomFile)) {
        req.session.error = "Room "+req.params.room+" does not exist!";
        res.redirect('/rooms');
    } else {
        res.render('stream', {
            sessionID: req.sessionID,
            wssURL : config.wssURL,
            roomID : req.params.room
        })
    }
};

module.exports.watch = (req, res) => {
    roomFile = 'rooms/'+req.params.room+'.json';
    if (!fs.existsSync(roomFile)) {
        req.session.error = "Room "+req.params.room+" does not exist!";
        res.redirect('/rooms');
    } else {
        res.render('watch', {
            sessionID: req.sessionID,
            wssURL : config.wssURL,
            roomID : req.params.room
        })
    }
};
