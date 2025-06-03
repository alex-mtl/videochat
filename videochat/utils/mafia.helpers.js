const db = require('../../db')
module.exports.determineWinStatus = (role, gameResult) => {
    if (gameResult === 'red' && ['R', 'S'].includes(role)) return 'win';
    if (gameResult === 'black' && ['B', 'D'].includes(role)) return 'win';
    return 'lose';
}

module.exports.getRoleLabel = (role) => {
    const ROLE_CONFIG = {
        'R': `<span class="d-flex align-items-center gap-2">
                <span class="material-symbols-outlined" style="color: var(--g-failure);">
                  frame_person
                </span>
                <span>Citizen</span>
              </span>
            `,
        'S': `<span class="d-flex align-items-center gap-2">
                <span style="
                  display: inline-block;
                  height: 1.2rem;
                  width: 1.2rem;
                  background-image: url('/static/img/sheriff-star.png');
                  background-size: contain;
                  background-repeat: no-repeat;
                  background-position: center;
                "></span>
                <span>Sheriff</span>
              </span>
            `,
        'B': `<span class="d-flex align-items-center gap-2">
                <span class="material-symbols-outlined" style="color: black;">
                  frame_person
                </span>
                <span>Mafia</span>
              </span>
            `,
        'D': `<span class="d-flex align-items-center gap-2">
                <span style="
                  display: inline-block;
                  height: 1.2rem;
                  width: 1.2rem;
                  background-image: url('/static/img/don-ring.png');
                  background-size: contain;
                  background-repeat: no-repeat;
                  background-position: center;
                "></span>
                <span>Don</span>
              </span>
            `,
    };
    return ROLE_CONFIG[role];
}

module.exports.getUserByMduid = async (mduid) => {
    const [rows] = await db.query('SELECT * FROM users WHERE mduid = ?', [mduid]);
    let user = null
    if (rows.length > 0) {
        user = rows[0]; // Now safe to access
    }
    return user;
}
