const config = require('../../config');

module.exports.homePage = (req, res) => {
    res.render('home', { sessionID : req.sessionID , wssURL : config.wssURL})
};
