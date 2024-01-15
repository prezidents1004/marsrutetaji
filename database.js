const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

// Connect to SQLite database
const db = new sqlite3.Database('./users.db', async (err) => {
    if (err) {
        console.error(err.message);
    } else {
        console.log('Connected to the SQLite database.');

        // Create users table with 'role' column
        await db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            surname TEXT NOT NULL,
            user TEXT NOT NULL UNIQUE,
            pswd TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user' -- Default role is 'user'
        )`);


        await db.run(`CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                surname TEXT NOT NULL,
                user TEXT NOT NULL,
                address TEXT NOT NULL,
                delivery_date TEXT NOT NULL DEFAULT '',
                delivery_time_start TEXT NOT NULL DEFAULT '',
                delivery_time_end TEXT NOT NULL DEFAULT ''
        )`);

        await db.run(`
        CREATE TABLE IF NOT EXISTS completed_deliveries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            delivery_file TEXT NOT NULL,
            courier TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

        await db.run( `
            CREATE TABLE IF NOT EXISTS routes (
                ID INTEGER PRIMARY KEY AUTOINCREMENT,
                Courier TEXT,
                Address TEXT,
                DeliveryFile TEXT,
                CONSTRAINT unique_constraint UNIQUE (Courier, Address, DeliveryFile)
            )
        `);

        await db.run( `
            CREATE TABLE IF NOT EXISTS assigned_deliveries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                courier TEXT,
                deliveryFile TEXT
            )
        `);

        //await db.run('DROP TABLE IF EXISTS orders');

// Drop completed_deliveries table
        //await db.run('DROP TABLE IF EXISTS completed_deliveries');

// Drop routes table
        //await db.run('DROP TABLE IF EXISTS routes');

        //await db.run('DROP TABLE IF EXISTS assigned_deliveries');



        //await db.run('DROP TABLE IF EXISTS completed_deliveries');





        // Check if the admin user already exists
        const adminQuery = 'SELECT * FROM users WHERE user = ?';
        db.get(adminQuery, ['admin'], async (err, row) => {
            if (err) {
                console.error(err.message);
            } else if (!row) {
                // Admin user doesn't exist, create it
                const adminPassword = await bcrypt.hash('admin', 10); // Hash the admin password
                const adminInsertQuery = 'INSERT INTO users (name, surname, user, pswd, role) VALUES (?, ?, ?, ?, ?)';
                db.run(adminInsertQuery, ['Admin', 'Admin', 'admin', adminPassword, 'admin'], (err) => {
                    if (err) {
                        console.error(err.message);
                    } else {
                        console.log('Admin user created successfully.');
                    }
                });
            }
        });
    }
});

function allPromise(query, params) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

module.exports = db;

