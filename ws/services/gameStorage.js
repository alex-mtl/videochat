const db = require('../../db');

async function storeGameResult(roomId, gameType, gameData) {
        const connection = await db.getConnection();
        try {
                await connection.query(
                    'INSERT INTO games (room_id, g_type, data) VALUES (?, ?, ?) ' +
                    'ON DUPLICATE KEY UPDATE data = VALUES(data)',
                    [roomId, gameType, JSON.stringify(gameData)]
                );
        } catch (error) {
                console.error('Error storing game result:', error);
                throw error; // Re-throw to handle in calling function
        } finally {
                connection.release();
        }
}

module.exports = {
        storeGameResult
};