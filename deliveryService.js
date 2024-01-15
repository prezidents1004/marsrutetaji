const fs = require('fs');
const csvParser = require('csv-parser');
const path = require('path');

function readDeliveryAddressesFromDB(username) {
    return new Promise((resolve, reject) => {
        if (typeof username !== 'string' || username.length === 0) {
            reject(new Error('Invalid username'));
            return;
        }

        // Assuming you have a 'orders' table with 'address' column in your database
        const query = 'SELECT address FROM orders WHERE user = ?';

        db.all(query, [username], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                const addresses = rows.map(row => row.address);
                resolve(addresses);
            }
        });
    });
}

module.exports = {
    readDeliveryAddressesFromDB,
};