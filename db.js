const mysql = require('mysql2/promise');
require('dotenv').config();

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
});

db.getConnection((err, connection) => {
    if (err) {
        console.error('Database connection failed:', err);
        return;
    }

    // Perform a simple query
    connection.query('SELECT 1', (err, results) => {
        connection.release(); // Release the connection back to the pool

        if (err) {
            console.error('Query failed:', err);
        } else {
            console.log('Database connection successful:', results);
        }
    });
});

module.exports = db;
