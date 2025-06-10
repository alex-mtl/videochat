const config = require('../../config');
const db = require('../../db')
const avatar = require('../utils/avatar')

const { countries } = require('../utils/countries')
const crypto = require('crypto');
const validator = require('validator');

const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const { determineWinStatus, getRoleLabel, getUserByMduid } = require('../utils/mafia.helpers')


function checkTelegramLogin(data, botToken) {
    const secretKey = crypto.createHash('sha256').update(process.env.TG_TOKEN).digest();
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

async function getUserStats(req, mduid ) {
    if (!mduid) {
        throw new Error('User not authenticated');
    }

    // Query to get aggregated stats for the user
    const query = `
        WITH player_games AS (
            SELECT
                JSON_UNQUOTE(JSON_EXTRACT(g.data, '$.game.result.team')) AS game_result,
                player.role
            FROM
                games g,
                JSON_TABLE(
                    JSON_EXTRACT(g.data, '$.slot'),
                    '$.*' COLUMNS(
                        role VARCHAR(10) PATH '$.role',
                        mduid VARCHAR(20) PATH '$.mduid'
                    )
                ) AS player
            WHERE
                player.mduid = ?
                AND g.g_type = 'mafia'
        )
        SELECT 
            COUNT(*) AS total_games,
            SUM(CASE WHEN (game_result = 'red' AND role IN ('R', 'S')) 
                      OR (game_result = 'black' AND role IN ('B', 'D'))
                 THEN 1 ELSE 0 END) AS total_wins,
            SUM(CASE WHEN role = 'R' THEN 1 ELSE 0 END) AS games_as_r,
            SUM(CASE WHEN role = 'S' THEN 1 ELSE 0 END) AS games_as_s,
            SUM(CASE WHEN role = 'B' THEN 1 ELSE 0 END) AS games_as_b,
            SUM(CASE WHEN role = 'D' THEN 1 ELSE 0 END) AS games_as_d,
            SUM(CASE WHEN game_result = 'red' AND role = 'R' THEN 1 ELSE 0 END) AS wins_as_r,
            SUM(CASE WHEN game_result = 'red' AND role = 'S' THEN 1 ELSE 0 END) AS wins_as_s,
            SUM(CASE WHEN game_result = 'black' AND role = 'B' THEN 1 ELSE 0 END) AS wins_as_b,
            SUM(CASE WHEN game_result = 'black' AND role = 'D' THEN 1 ELSE 0 END) AS wins_as_d
        FROM 
            player_games
    `;

    try {
        const [stats] = await db.query(query, [mduid]);
        const {
            total_games = 0,
            total_wins = 0,
            games_as_r = 0, wins_as_r = 0,
            games_as_s = 0, wins_as_s = 0,
            games_as_b = 0, wins_as_b = 0,
            games_as_d = 0, wins_as_d = 0
        } = stats[0] || {};

        const result = {
            title: 'Game statistics',
            data: [
                { type: 'Wins / Total', value: [total_wins, total_games] },
                { type: 'Red', value: [wins_as_r, games_as_r] },
                { type: 'Sheriff', value: [wins_as_s, games_as_s] },
                { type: 'Mafia', value: [wins_as_b, games_as_b] },
                { type: 'Don', value: [wins_as_d, games_as_d] }
            ]
        };

        // Calculate percentages
        result.data.forEach(stat => {
            if (stat.value[1] === 0) {
                stat.value.push(0); // No games in this role
            } else {
                const progress = (stat.value[0] / stat.value[1]) * 100;
                stat.value.push(Math.floor(progress));
            }
        });

        return result;
    } catch (error) {
        console.error('Error fetching user stats:', error);
        throw error;
    }
}

function getRoleIcon(role) {
    const icons = {
        'R': 'frame_person',
        'S': 'security',
        'B': 'group',
        'D': 'skull'
    };
    return icons[role] || 'person';
}

function getRoleColor(role) {
    const colors = {
        'R': 'var(--g-failure)',
        'S': 'var(--g-warning)',
        'B': 'var(--g-primary)',
        'D': 'var(--g-dark)'
    };
    return colors[role] || 'var(--g-text)';
}


async function getPlayerGameHistory(mduid) {
    if (!mduid) {
        throw new Error('User not authenticated');
    }

    // Query to get game history for the user
    const query = `
        SELECT 
            g.id,
            g.room_id,
            g.created_at,
            JSON_UNQUOTE(JSON_EXTRACT(g.data, '$.game.result.team')) AS game_result,
            player.role,
            player.slot,
            player.status,
--             JSON_EXTRACT(g.data, '$.host.userName') AS host_name,
            JSON_EXTRACT(g.data, '$.game.phase') AS game_phase
        FROM 
            games g,
            JSON_TABLE(
                JSON_EXTRACT(g.data, '$.slot'),
                '$.*' COLUMNS(
                    slot VARCHAR(10) PATH '$.slot',
                    role VARCHAR(10) PATH '$.role',
                    status VARCHAR(20) PATH '$.status',
                    mduid VARCHAR(20) PATH '$.mduid',
                    name VARCHAR(100) PATH '$.name'
                )
            ) AS player
        WHERE 
            player.mduid = ?
            AND g.g_type = 'mafia'
        ORDER BY 
            g.created_at DESC
        LIMIT 10`;

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

// Helper functions
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
    //console.log('session user: ', user)
    req.session.errorMessage = null
    res.render('mafia/login', {
        sessionID : req.sessionID ,
        wssURL : process.env.WSS_URL,
        username,
        password,
        message,
        user
    })
};

module.exports.tgAuth = async (req, res) => {
    //console.log('TG body: ', req.query)
    let tgValidation = checkTelegramLogin(req.query)
    //console.log(tgValidation)
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
                wssURL : process.env.WSS_URL,
                message: "Attempt to hijack via telegram account!"
            })
    }
};

module.exports.googleAuth = async (req, res) => {
    // console.log('Google body: ', req.body)
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
                wssURL : process.env.WSS_URL,
                message: "Attempt to hijack via google account!"
            })
    }
};

module.exports.login = (req, res) => {
    // console.log('TG body: ', req.query)
    const { username = '', password = '' } = req.query;
    let message = (req.session.errorMessage || (req.query.message || null))
    // console.log('session error 1223: ', message, req.query)
    req.session.errorMessage = null
    res.render('mafia/login', {
        sessionID : req.sessionID ,
        wssURL : process.env.WSS_URL,
        username,
        password,
        message,
        user: req.session.user || null
    })
};

module.exports.privacyPolicy = (req, res) => {
    res.render('mafia/privacy-policy', {
        sessionID : req.sessionID ,
        wssURL : process.env.WSS_URL,
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
    // console.log('53', email, rows, rows.length )
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

module.exports.userProfile = async (req, res) => {
    user = req.session.user || null
    if (user) {
        // console.log(user, (user !== {}))
        user.stats = await getUserStats(user.id, user.mduid)
        user.badges = getUserBadges(user.id)
        user.games = await getPlayerGameHistory(user.mduid)

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

        res.render('mafia/user/user', {
            sessionID : req.sessionID ,
            wssURL : process.env.WSS_URL,
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



module.exports.userPublic = async (req, res) => {
    let user = req.session.user || null
    let mduid  = req.params.mduid
    console.log(mduid)
    if (mduid) {
        let publicUser = await getUserByMduid(mduid);
        if (publicUser) {
            // console.log(user, (user !== {}))
            publicUser.stats = await getUserStats(publicUser.id, mduid)
            publicUser.badges = getUserBadges(publicUser.id)
            publicUser.games = await getPlayerGameHistory(mduid)

            publicProps = {
                'Username_Nickname': [
                    publicUser.username,
                    publicUser.nickname
                ],
                'Country': countries[(publicUser.country || 'US')]
            }

            res.render('mafia/user/user-public', {
                sessionID : req.sessionID ,
                wssURL : process.env.WSS_URL,
                publicProps,
                user,
                publicUser
            })
        }

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
        wssURL : process.env.WSS_URL,
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
        // console.log(salt,`\n`, salt.length)
        const hashPassword = (password, salt) =>
            crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
        const hash = hashPassword(password, salt);
        const password_hash =  `${salt}:${hash}`;
          // const hash = await bcrypt.hash(password, 10);
        let [rows] =  await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length === 0) {
            let nickname = username = email.split('@')[0]
            let avatar_url = await avatar.generateAvatar()
            // console.log(avatar_url)
            const [result] = await db.query('INSERT INTO users (nickname, username, email, password_hash, avatar_url) VALUES (?, ?, ?, ?, ?)',
                [nickname, username, email, password_hash, avatar_url]);
            const [newUser] = await db.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
            req.session.user = newUser[0];
            res.redirect('/user');
        } else {
            errors.push('An account with these details may already exist.')
            res.render('mafia/register', {
                sessionID : req.sessionID ,
                wssURL : process.env.WSS_URL,
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
            wssURL : process.env.WSS_URL,
            title: 'Sign Up',
            email,
            password,
            passwordConfirm,
            errors
        })
    }


};

