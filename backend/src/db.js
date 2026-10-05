require('dotenv').config();
const mysql =require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'monitoreo',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'monitoreo',
    waitForConnections: true,
    connectionLimit:10,
    queueLimit: 0,  
});

if (!process.env.DB_PASSWORD) {
    console.warn('[db] DB_PASSWORD no definido: copia backend/.env.example a backend/.env');
}

module.exports = pool;