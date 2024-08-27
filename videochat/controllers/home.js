const config = require('../../config');
const db = require('../../db')
const avatar = require('../utils/avatar')

const { countries } = require('../utils/countries')
const crypto = require('crypto');
const validator = require('validator');

const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);


function checkTelegramLogin(data, botToken) {
    const secretKey = crypto.createHash('sha256').update(config.tg_token).digest();
    const checkString = Object.keys(data)
        .filter(key => key !== 'hash')
        .map(key => `${key}=${data[key]}`)
        .sort()
        .join('\n');

    const hash = crypto.createHmac('sha256', secretKey)
        .update(checkString)
        .digest('hex');

    return hash === data.hash;
}

function getUserStats(userId) {

    stats = {
        title: 'Game statistics',
        data: [
            {type: 'Wins / Total', value: [Math.floor(Math.random() * 101),100]},
            {type: 'Red', value: [Math.floor(Math.random() * 101),100]},
            {type: 'Sheriff', value: [Math.floor(Math.random() * 101),100]},
            {type: 'Mafia', value: [Math.floor(Math.random() * 101),100]},
            {type: 'Don', value: [Math.floor(Math.random() * 101),100]}
        ]
    }
    stats.data.forEach(stat => {
        if (stat.value[1] === 0) {
            stat.value.push(0)
        } else {
            let progress = (stat.value[0] / stat.value[1]) * 100
            stat.value.push(Math.floor(progress))
        }
    })
    return stats;
}

function getUserBadges(userId) {
    stats = {
        title: 'Badges',
        data: [
            {type: 'Host', value: [Math.floor(Math.random() * 101),100]},
            {type: 'Played ', value: [Math.floor(Math.random() * 101),100]},
            {type: 'Won', value: [Math.floor(Math.random() * 101),100]},
            {type: 'Referral', value: [Math.floor(Math.random() * 101),100]},
            {type: 'Days', value: [Math.floor(Math.random() * 101),100]}
        ]
    }
    stats.data.forEach(stat => {
        if (stat.value[1] === 0) {
            stat.value.push(0)
        } else {
            let progress = (stat.value[0] / stat.value[1]) * 100
            stat.value.push(Math.floor(progress))
        }
    })
    return stats
}

module.exports.homePage = (req, res) => {
    const { username = '', password = '' } = req.query;
    let message = (req.session.errorMessage || (req.query.message || null))
    let user = req.session.user || null
    console.log('session user: ', user)
    req.session.errorMessage = null
    res.render('mafia/login', {
        sessionID : req.sessionID ,
        wssURL : config.wssURL,
        username,
        password,
        message,
        user
    })
};

module.exports.tgAuth = async (req, res) => {
    console.log('TG body: ', req.query)
    let tgValidation = checkTelegramLogin(req.query)
    console.log(tgValidation)
    if (tgValidation) {
        const { id, first_name, last_name, username, photo_url, auth_date, hash } = req.query;
        let [rows] =  await db.query('SELECT * FROM users WHERE telegram_id = ?', [id]);
        if (rows.length === 0) {
            let nickname = username || `${first_name} ${last_name}`
            const [result] = await db.query('INSERT INTO users (telegram_id, username, first_name, last_name, avatar_url) VALUES (?, ?, ?)',
                [id, nickname, first_name, last_name, photo_url]);
            const [newUser] = await db.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
            req.session.user = newUser[0];
        } else {
            req.session.user = rows[0];
        }
        res.redirect('/user');
    } else {

        res.render('mafia/alert', {
                sessionID : req.sessionID ,
                wssURL : config.wssURL,
                message: "Attempt to hijack via telegram account!"
            })
    }
};

module.exports.googleAuth = async (req, res) => {
    console.log('Google body: ', req.body)
    let payload = null

    const ticket = await client.verifyIdToken({
        idToken: req.body['credential'] || null,
        audience: process.env.GOOGLE_CLIENT_ID,
    });
    if (ticket != null) {
        payload = ticket.getPayload();
        const googleId = payload['sub'];
        const email = payload['email'];
        const email_verified = payload['email_verified'];
        const username = nickname = payload['name'] || email.split('@')[0];
        const u_picture = payload['picture'];
        const u_givenName = payload['given_name'];
        const u_familyName = payload['family_name'];
    //     const { id, first_name, last_name, username, photo_url, auth_date, hash } = req.query;
        let [rows] =  await db.query('SELECT * FROM users WHERE google_id = ?', [googleId]);
        if (rows.length === 0) {
            // let nickname = u_name || `${u_givenName} ${u_familyName}`
            const [result] = await db.query('INSERT INTO users (google_id, email, email_confirmed, username, nickname, first_name, last_name, avatar_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [googleId, email, email_verified, username, nickname, u_givenName, u_familyName, u_picture]);
            const [newUser] = await db.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
            req.session.user = newUser[0];
        } else {
            req.session.user = rows[0];
        }
        res.redirect('/user');
    } else {

        res.render('mafia/alert', {
                sessionID : req.sessionID ,
                wssURL : config.wssURL,
                message: "Attempt to hijack via google account!"
            })
    }
};

module.exports.login = (req, res) => {
    console.log('TG body: ', req.query)
    const { username = '', password = '' } = req.query;
    let message = (req.session.errorMessage || (req.query.message || null))
    console.log('session error 1223: ', message, req.query)
    req.session.errorMessage = null
    res.render('mafia/login', {
        sessionID : req.sessionID ,
        wssURL : config.wssURL,
        username,
        password,
        message,
        user: req.session.user || null
    })
};

module.exports.privacyPolicy = (req, res) => {
    res.render('mafia/privacy-policy', {
        sessionID : req.sessionID ,
        wssURL : config.wssURL,
        user: req.session.user || null
    })
};

module.exports.loginPost = async (req, res)  => {
    const { email = '', password = '' } = req.body;
    // console.log(req.body)
    // console.log(req.query)

    // const [rows] =  await db.query('SELECT * FROM users WHERE email = ?', [email]);
    // const [rows] =  await db.query('SELECT * FROM users');
    // // done(null, rows[0]);
    // console.log('48',rows)

    let [rows] =  await db.query('SELECT * FROM users WHERE email = ?', [email]);
    // done(null, rows[0]);
    console.log('53', email, rows, rows.length )
    if (rows.length === 0 ) {
        res.redirect('/login');
    } else {
        let salt = rows[0].password_hash.split(':')[0]
        let password_hash = rows[0].password_hash.split(':')[1]
        const hashPassword = (password, salt) =>
            crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
        if (hashPassword(password, salt)  === password_hash) {
            req.session.user = rows[0];
            res.redirect('/user');
        } else {
            req.session.errorMessage = "Invalid email or password.";
            res.redirect('/login');
        }


    }
    // const { username = '', password = '' } = req.query;

};

module.exports.userProfile = (req, res) => {
    user = req.session.user || null
    if (user) {
        console.log(user, (user !== {}))
        user.stats = getUserStats(user.id)
        user.badges = getUserBadges(user.id)
        userProps = {
            'Username_Nickname': [
                user.username,
                user.nickname
            ],
            'Email_Phone': [
                user.email,
                user.phone
            ],

            'First Name_Last Name': [
                user.first_name,
                user.last_name
            ],
            'Country': countries[(user.country || 'US')]
        }

        res.render('mafia/user', {
            sessionID : req.sessionID ,
            wssURL : config.wssURL,
            username: user.username,
            email: user.email,
            avatar: user.avatar_url,
            userProps,
            country: countries[(user.country || 'US')],
            countryCode: (user.country || 'US'),
            user
        })
    } else {
        req.session.errorMessage = "You need to login first";
        res.redirect('/login', {user});
    }
};



module.exports.logout = (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Error occurred while logging out.');
        }

        // const sessionFilePath = path.join( process.env.SESSIONS_DIR, `sess_${req.sessionID}`);
        //
        // // Delete the session file
        // fs.unlink(sessionFilePath, (err) => {
        //     if (err) {
        //         console.error('Failed to delete session file:', err);
        //     } else {
        //         console.log('Session file deleted successfully.');
        //     }
        // });

        // req.session.errorMessage = "Session successfully terminated"
        res.redirect('/login?message=Session successfully terminated');
    });

};

module.exports.register = (req, res) => {

    res.render('mafia/register', {
        sessionID : req.sessionID ,
        wssURL : config.wssURL,
        title: 'Sign Up',
        user: req.session.user || null
    })
};

module.exports.registerPost = async (req, res) => {
    const { email = '', password = '', passwordConfirm } = req.body;
    let errors = []
    if (!validator.isEmail(email)) {
        errors.push('Please enter valid email')
    }

    const passwordRules = [
        {
            rule: validator.isLength(password, { min: 12 }),
            message: 'Password must be at least 8 characters long'
        },
        {
            rule: validator.isLength(password, { max: 32 }),
            message: 'Password must be at most 32 characters long'
        },
        {
            rule: validator.matches(password, /[a-z]/),
            message: 'Password must contain at least one lowercase letter'
        },
        {
            rule: validator.matches(password, /[0-9]/),
            message: 'Password must contain at least one digit'
        }
    ];
    for (const rule of passwordRules) {
        if (!rule.rule) {
            errors.push(rule.message);
        }
    }
    if (password !== passwordConfirm) {
        errors.push('The passwords do not match.');
    }
    if (errors.length === 0) {
        const salt = crypto.randomBytes(16).toString('hex');
        console.log(salt,`\n`, salt.length)
        const hashPassword = (password, salt) =>
            crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
        const hash = hashPassword(password, salt);
        const password_hash =  `${salt}:${hash}`;
          // const hash = await bcrypt.hash(password, 10);
        let [rows] =  await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length === 0) {
            let nickname = username = email.split('@')[0]
            let avatar_url = await avatar.generateAvatar()
            console.log(avatar_url)
            const [result] = await db.query('INSERT INTO users (nickname, username, email, password_hash, avatar_url) VALUES (?, ?, ?, ?, ?)',
                [nickname, username, email, password_hash, avatar_url]);
            const [newUser] = await db.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
            req.session.user = newUser[0];
            res.redirect('/user');
        } else {
            errors.push('An account with these details may already exist.')
            res.render('mafia/register', {
                sessionID : req.sessionID ,
                wssURL : config.wssURL,
                title: 'Sign Up',
                email,
                password,
                passwordConfirm,
                errors
            })
        }
        // res.redirect('/user');
        // res.redirect('/user-et');
    } else {
        res.render('mafia/register', {
            sessionID : req.sessionID ,
            wssURL : config.wssURL,
            title: 'Sign Up',
            email,
            password,
            passwordConfirm,
            errors
        })
    }


};

