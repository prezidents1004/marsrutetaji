// Required modules
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const axios = require('axios');
const { createObjectCsvWriter, createObjectCsvReader } = require('csv-writer');
const saltRounds = 10;
const app = express();
const port = 5000;
const { verifyToken, getRouteWithMultipleStops, calculateBestRoute } = require('./helpers');
const deliveryService = require('./deliveryService');
const config = require('./config');
const db = require('./database.js');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const createCsvReader = require('csv-writer').createObjectCsvReader;
const moment = require('moment');

app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');


process.on('exit', () => {
    console.log('Closing the database connection...');
    db.close((err) => {
        if (err) {
            console.error('Error closing the database connection:', err);
        } else {
            console.log('Database connection closed successfully');
        }
    });
});

// Handle Ctrl+C or SIGINT (Ctrl+C in terminal) to ensure the exit event is triggered
process.on('SIGINT', () => {
    process.exit();
});

// User signup
app.post('/signup', async (req, res) => {
    const { user, pswd, name, surname } = req.body;

    if (!user || !pswd) {
        return res.status(400).send('Username and password are required.');
    }

    try {
        const hashedPassword = await bcrypt.hash(pswd, saltRounds);
        const query = 'INSERT INTO users (user, pswd, name, surname) VALUES (?, ?, ?, ?)';
        // Insert user data into the database
        db.run(query, [user, hashedPassword, name, surname], function (err) {
            if (err) {
                console.error(err.message);
                return res.status(500).send('Error registering new user');
            }
            res.render('signupsuccess', {}); // Render success page
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error hashing the password');
    }
});

// User login
app.post('/login', (req, res) => {
    const { user, pswd } = req.body;

    if (!user || !pswd) {
        return res.status(400).send('Username and password are required.');
    }

    const query = 'SELECT user, pswd, name, surname, role FROM users WHERE user = ?';
    // Verify user credentials and create a JWT token
    db.get(query, [user], async (err, row) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send('Error during login');
        }

        if (row && await bcrypt.compare(pswd, row.pswd)) {
            const token = jwt.sign(
                { username: row.user, role: row.role, name: row.name, surname: row.surname },
                'penis' // Replace with your actual JWT secret
            );
            res.cookie('token', token); // Set JWT token as a cookie
            res.redirect('/dashboard');
        } else {
            res.status(400).send('Invalid credentials');
        }
    });
});

// User dashboard
app.get('/dashboard', verifyToken, (req, res) => {
    const token = req.cookies.token;
    jwt.verify(token, 'penis', (err, authData) => {
        if (err) {
            res.sendStatus(403); // Forbidden
        } else {
            if (authData.role === 'admin') {
                res.redirect('/dashboard_admin');
            } else if (authData.role === 'kurjers') {
                res.redirect('/dashboard_courier')
            } else {
                // Fetch deliveries for the regular user
                const username = authData.username;
                const compilecsv = 'compilecsv.csv';

                let userDeliveries = [];
                if (fs.existsSync(compilecsv)) {
                    const records = fs.readFileSync(compilecsv, 'utf8').split('\n');
                    userDeliveries = records.filter(record => {
                        const data = record.split(',');
                        return data[3] === username; // Assuming username is at index 3
                    }).map(record => {
                        const [sequenceNumber, name, surname, username, address, deliveryDate, deliveryTimeStart, deliveryTimeEnd] = record.split(',');
                        return {
                            sequenceNumber,
                            name,
                            surname,
                            username,
                            address,
                            deliveryDate,
                            deliveryTimeStart,
                            deliveryTimeEnd
                        };
                    });
                }

                res.render('dashboard', { user: authData, deliveries: userDeliveries });
            }
        }
    });
});



app.get('/getUserDeliveries', verifyToken, (req, res) => {
    const token = req.cookies.token;
    jwt.verify(token, 'penis', (err, authData) => {
        if (err) {
            console.error('JWT verification error:', err);
            return res.status(403).json({ error: 'Forbidden' });
        }

        const username = authData.username;

        db.all('SELECT * FROM orders WHERE user = ?', [username], (dbError, rows) => {
            if (dbError) {
                console.error('Database error:', dbError);
                return res.status(500).json({ error: 'Internal server error' });
            }

            const userDeliveries = rows.map(row => ({
                sequenceNumber: row.id,
                name: row.name,
                surname: row.surname,
                recordUsername: row.user,
                address: row.address,
                deliveryDate: row.delivery_date,
                deliveryTimeStart: row.delivery_time_start,
                deliveryTimeEnd: row.delivery_time_end
            }));

            console.log('Deliveries found:', userDeliveries.length);
            res.json(userDeliveries);
        });
    });
});

// Close the database connection when the application exits






// Admin dashboard
app.get('/dashboard_admin', verifyToken, async (req, res) => {
    const authData = jwt.verify(req.cookies.token, 'penis');
    if (authData.role === 'admin') {
        // Query to select all users with the role 'kurjers'
        const courierQuery = 'SELECT user FROM users WHERE role = "kurjers"';



        db.all(courierQuery, [], (err, couriers) => {
            if (err) {
                console.error(err);
                db.close(); // Close the database connection
                return res.status(500).send('Database query error');
            }

            // Query to select all usernames and their roles for the role manager
            const userQuery = 'SELECT user, role FROM users';
            db.all(userQuery, [], (err, users) => {
                if (err) {
                    console.error(err);
                    db.close(); // Close the database connection
                    return res.status(500).send('Database query error');
                }

                // Query to fetch orders (adjust as needed)
                const deliveryDatesQuery = 'SELECT DISTINCT delivery_date FROM orders';

                db.all(deliveryDatesQuery, [], (err, deliveryDates) => {
                    if (err) {
                        console.error(err);
                        db.close(); // Close the database connection
                        return res.status(500).send('Database query error');
                    }

                    // Extracting unique delivery dates from the result
                    const uniqueDeliveryDates = deliveryDates.map(dateObj => dateObj.delivery_date);

                    res.render('dashboard_admin', {
                        user: authData,
                        users: users, // Users for the role manager
                        couriers: couriers, // Couriers for the "Select Courier" dropdown
                        deliveryFiles: uniqueDeliveryDates // Unique delivery dates for the "Select Delivery Date" dropdown
                    });


                });
            });
        });
    } else {
        res.redirect('/dashboard'); // Redirect non-admin users
    }
});


app.get('/dashboard_courier', verifyToken, async (req, res) => {
    const authData = jwt.verify(req.cookies.token, 'penis');
    if (authData.role === 'kurjers') {
        try {
            // Get user deliveries from the database
            const userDeliveriesQuery = 'SELECT * FROM orders WHERE user = ?';
            const userDeliveries = await queryDatabase(userDeliveriesQuery, [authData.username]);

            // Get assigned deliveries for the courier from the database
            const assignedDeliveriesQuery = 'SELECT deliveryFile FROM assigned_deliveries WHERE courier = ?';
            const assignedDeliveries = await queryDatabase(assignedDeliveriesQuery, [authData.username]);

            res.render('dashboard_courier', {
                user: authData,
                deliveries: userDeliveries,
                assignedDeliveries: assignedDeliveries
            });
        } catch (error) {
            console.error('Error:', error);
            res.status(500).send('Error processing request');
        }
    } else {
        res.redirect('/dashboard');
    }
});

// Example function to query the database
async function queryDatabase(query, params) {
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






// Set user role (admin only)
app.post('/setUserRole', verifyToken, async (req, res) => {
    const { username, role } = req.body;

    // Verify if the authenticated user is an admin
    const authData = jwt.verify(req.cookies.token, 'penis');
    if (authData.role !== 'admin') {
        return res.status(403).send('Unauthorized');
    }

    // Update the user's role in the database
    const updateQuery = 'UPDATE users SET role = ? WHERE user = ?';
    db.run(updateQuery, [role, username], function(err) {
        if (err) {
            console.error(err.message);
            return res.status(500).send('Error updating user role');
        }
        res.redirect('/dashboard_admin');
    });
});

app.post('/deleteUser', verifyToken, async (req, res) => {
    const { username } = req.body;

    // Verify if the authenticated user is an admin
    const authData = jwt.verify(req.cookies.token, 'penis');
    if (authData.role !== 'admin') {
        return res.status(403).send('Unauthorized');
    }

    // Delete the user from the database
    const deleteQuery = 'DELETE FROM users WHERE user = ?';
    db.run(deleteQuery, [username], function(err) {
        if (err) {
            console.error(err.message);
            return res.status(500).send('Error deleting user');
        }
        res.redirect('/dashboard_admin');
    });
});







// User logout
app.post('/logout', (req, res) => {
    res.clearCookie('token'); // Clear the user's session or token
    res.redirect('/'); // Redirect to the login page or homepage after logging out
});

// Serve the homepage
app.get('/', (req, res) => {
    res.render('home', {});
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

const orderNumbers = {}; // Separate order number counters for each date

app.post('/saveDeliveryInfo', verifyToken, (req, res) => {
    const { address, deliveryDate, deliveryTimeStart, deliveryTimeEnd } = req.body;
    const token = req.cookies.token;

    let username = '';
    let name = '';
    let surname = '';
    if (token) {
        try {
            const decoded = jwt.verify(token, 'penis'); // Use your JWT secret
            username = decoded.username;
            name = decoded.name;
            surname = decoded.surname;

        } catch (err) {
            console.error('Error decoding token:', err);
            return res.status(403).send('Invalid token');
        }
    }

    const formattedDate = deliveryDate.replace(/\//g, '_');

    let sequenceNumber = 1;

    // You may want to fetch the sequenceNumber from the database if you want to maintain a unique sequence.


    // Assuming the table structure in your SQLite database
    const sql = `
        INSERT INTO orders (name, surname, user, address, delivery_date, delivery_time_start, delivery_time_end)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(sql, [name, surname, username, address, deliveryDate, deliveryTimeStart, deliveryTimeEnd], function (err) {
        if (err) {
            console.error(err.message);
            res.status(500).send('Error occurred while saving data to the database');
        } else {
            console.log('Order saved to the database');
            res.status(200).send('Order successfully saved to the database');
        }


    });
});


function readCSV(filePath) {
    return new Promise((resolve, reject) => {
        const deliveryData = [];
        fs.createReadStream(filePath)
            .pipe(csv.parse({ headers: true, delimiter: ';' }))
            .on('data', row => {
                deliveryData.push({
                    orderId: row['Pasutijuma nr'],
                    client: row['Klients'],
                    address: row['Adrese'],
                    timeFrom: row['Laiks no'],
                    timeTo: row['Laiks lidz'],
                    courierName: row['Kurjera vards']
                });
            })
            .on('end', () => resolve(deliveryData))
            .on('error', error => reject(error));
    });
}

app.post('/assignDelivery', verifyToken, async (req, res) => {
    const { deliverySelect, courierSelect } = req.body;
    const assignedDeliveriesTable = 'assigned_deliveries';
    const completedDeliveriesTable = 'completed_deliveries';
    const ordersTable = 'orders';
    console.log("Selected day:", deliverySelect);

    try {

        // Check if the delivery is already calculated in completed_deliveries table
        const completedDeliveryQuery = `SELECT * FROM ${completedDeliveriesTable} WHERE delivery_file = ?`;
        const completedDeliveryResult = await allPromise(completedDeliveryQuery, [deliverySelect]);

        if (completedDeliveryResult.length > 0) {
            console.log('Delivery Already Calculated');
            return res.json({ error: 'Delivery Already Calculated' });
        }

        // Check the count in the orders table for the selected date
        const ordersCountQuery = `SELECT COUNT(*) AS count FROM ${ordersTable} WHERE delivery_date = ?`;
        const ordersCountResult = await allPromise(ordersCountQuery, [deliverySelect]);
        const ordersCount = ordersCountResult[0].count;

        // Check the count of assigned deliveries for the same date
        const assignedCountQuery = `SELECT COUNT(*) AS count FROM ${assignedDeliveriesTable} WHERE deliveryFile = ?`;
        const assignedCountResult = await allPromise(assignedCountQuery, [deliverySelect]);
        const assignedCount = assignedCountResult[0].count;

        if (assignedCount < ordersCount) {
            // If fewer couriers are assigned than the count in orders, proceed to assign a new courier
            const duplicateQuery = `SELECT * FROM ${assignedDeliveriesTable} WHERE courier = ? AND deliveryFile = ?`;
            const existingAssignment = await allPromise(duplicateQuery, [courierSelect, deliverySelect]);

            if (!existingAssignment.length) {
                // Insert the new assignment into the database
                const insertQuery = `INSERT INTO ${assignedDeliveriesTable} (courier, deliveryFile) VALUES (?, ?)`;
                await runPromise(insertQuery, [courierSelect, deliverySelect]);

                // Respond with JSON indicating success
                res.json({ assignmentSuccess: true });
            } else {
                // Respond with JSON indicating duplicate record
                console.log('Duplicate record found, not adding to the database');
                res.json({ assignmentSuccess: false, error: 'Duplicate record found' });
            }
        } else {
            // Respond with JSON indicating maximum couriers already assigned
            console.log('Maximum number of couriers for this date already assigned');
            res.json({ assignmentSuccess: false, error: 'Maximum couriers assigned' });

        }
    } catch (err) {
        console.error('Error:', err);
        res.status(500).json({ assignmentSuccess: false, error: 'Server error' });
    }
});





app.post('/DeliveryShow', async (req, res) => {
    const selectedDeliveryFile = req.body.deliverySelect2;
    const authData = jwt.verify(req.cookies.token, 'penis');

    try {
        // Fetch assigned deliveries from the database
        const assignedDeliveriesTable = 'assigned_deliveries';
        const assignedDeliveriesQuery = `SELECT courier, deliveryFile FROM ${assignedDeliveriesTable}`;
        db.all(assignedDeliveriesQuery, [], async (err, assignedDeliveries) => {
            if (err) {
                console.error(err);
                return res.status(500).send('Database query error');
            }

            // Filter couriers based on the selected delivery file
            const filteredCouriers = assignedDeliveries
                .filter(row => row.deliveryFile === selectedDeliveryFile)
                .map(row => row.courier);

            // Fetch all users from the database
            const userQuery = 'SELECT user, role FROM users';
            db.all(userQuery, [], async (err, users) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('Database query error');
                }

                // Fetch CSV file names for deliveries
                const csvFiles = fs.readdirSync(__dirname)
                    .filter(file => file.startsWith('deliveryInfo_') && file.endsWith('.csv'));

                res.json({ couriers: filteredCouriers });
                console.log('Filtered Couriers:', filteredCouriers);
            });
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error reading data');
    }
});






app.get('/fetchOrders', (req, res) => {
    const selectedDate = req.query.date;
    const formattedDate = selectedDate.replace(/\//g, '_');
    const csvFileName = `deliveryInfo_${formattedDate}.csv`;

    let userDeliveries = [];

    const selectQuery = `
        SELECT id, name, surname, user, address, delivery_date, delivery_time_start, delivery_time_end
        FROM orders
        WHERE delivery_date = ?
    `;

    // Assuming you have a database connection named 'db'
    db.all(selectQuery, [selectedDate], (err, rows) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }

        userDeliveries = rows.map(row => ({
            sequenceNumber: row.id,
            name: row.name,
            surname: row.surname,
            username: row.user,
            address: row.address,
            deliveryDate: row.delivery_date,
            deliveryTimeStart: row.delivery_time_start,
            deliveryTimeEnd: row.delivery_time_end
        })).filter(delivery => delivery.name && delivery.surname && delivery.address); // Filter out empty or incomplete records

        res.json({ deliveries: userDeliveries });
    });
});

// Google Maps API Key
const googleApiKey = config.googleApiKey;
const startingPoint = 'Ķīpsalas iela 6A';



// Get deliveries for a specific date
app.get('/getDeliveriesForDate', async (req, res) => {
    const selectedDate = req.query.date; // Expected format 'dd_mm_yyyy'
    if (!selectedDate) {
        return res.status(400).send('Date is required');
    }

    try {
        const formattedSelectedDate = moment(selectedDate, 'DD_MM_YYYY').format('DD/MM/YYYY');
        console.log('Selected Date:', formattedSelectedDate);

        // Fetch delivery addresses from the database based on the selected date
        const selectQuery = `
            SELECT address, delivery_date
            FROM orders
            WHERE delivery_date = ?
        `;
        db.all(selectQuery, [formattedSelectedDate], async (err, rows) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).send('Error reading delivery data from the database');
            }

            const deliveryAddresses = rows.map(row => {
                console.log('Date from Database:', row.delivery_date);
                return row.address;
            });
            res.json({ addresses: deliveryAddresses });
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Error reading delivery data');
    }
});










const executeAttalumuAprekins = require('./attalumu_aprekins');

const isValidDate = (dateString) => {
    const regex = /^\d{2}\/\d{2}\/\d{4}$/;
    return regex.test(dateString);
};

// ...

app.post('/completeDelivery', (req, res) => {
    const deliveryFile = req.body.deliveryFile;
    const token = req.cookies.token; // Get JWT from request cookies

    if (!token) {
        return res.status(403).send('Access denied. No token provided.');
    }

    // Open the SQLite database

    // Create 'completed_deliveries' table if it doesn't exist


    try {
        const decoded = jwt.verify(token, 'penis'); // Decode JWT
        const username = decoded.username; // Get username from decoded token

        console.log('Received delivery file:', deliveryFile);
        console.log('Lietotājvārds:', username);

        if (isValidDate(deliveryFile)) {
            const deliveryDate = deliveryFile
            const outputPath = path.join(__dirname, `Izpilde${deliveryDate}.csv`);

            // Check if the file already exists in the database
            const checkFileExistsQuery = 'SELECT COUNT(*) AS count FROM completed_deliveries WHERE delivery_file = ?';
            db.get(checkFileExistsQuery, [deliveryFile], (err, result) => {
                if (err) {
                    console.error('Database error:', err);
                    db.close();
                    return res.status(500).send('Error occurred while processing data');
                }

                if (result.count === 0) {
                    // File does not exist in the database, execute attalumu_aprekins.js with delivery file
                    console.log('File does not exist, executing attalumu_aprekins.js with delivery file');
                    executeAttalumuAprekins(deliveryFile, username); // Pass deliveryFile and username as arguments

                    // Insert the completed delivery information into the database
                    const insertCompletedDeliveryQuery = 'INSERT INTO completed_deliveries (delivery_file, courier) VALUES (?, ?)';
                    db.run(insertCompletedDeliveryQuery, [deliveryFile, username], (err) => {
                        if (err) {
                            console.error('Error inserting record into completed_deliveries:', err);
                            //db.close();
                            return res.status(500).send('Error occurred while processing data');
                        }

                        //db.close();
                        res.redirect('/dashboard_courier');
                    });
                } else {
                    // File already exists in the database
                    console.log('File already exists in the database:', outputPath);
                    //db.close();
                    res.redirect('/dashboard_courier');
                }
            });
        } else {
            console.error('Invalid date format');
            db.close();
            res.status(400).send('Invalid date format');
        }
    } catch (err) {
        console.error('Invalid or expired token:', err);
        db.close();
        res.status(400).send('Invalid or expired token');
    }
});





app.get('/getDeliveriesForKurjers', verifyToken, async (req, res) => {
    const selectedFile = req.query.file;
    const token = req.cookies.token;
    if (!selectedFile || !token) {
        return res.status(400).send('Delivery file and token are required');
    }

    // Check if the file exists in the database
    const checkFileExistsQuery = 'SELECT COUNT(*) AS count FROM completed_deliveries WHERE delivery_file = ?';

    db.get(checkFileExistsQuery, [selectedFile], async (err, result) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).send('Error occurred while processing data');
        }

        if (result.count === 0) {
            // File does not exist in the database
            return res.status(404).send('File not found');
        }

        try {
            // Decode JWT to get the current username
            const decoded = jwt.verify(token, 'penis');
            const currentUsername = decoded.username;

            // Read delivery addresses from the database
            const deliveryAddresses = await readAddressesFromDatabase(selectedFile, currentUsername);
            res.json({ addresses: deliveryAddresses });
        } catch (error) {
            console.error('Error:', error);
            res.status(500).send('Error processing request');
        }
    });
});

// Example function to read delivery addresses from the database

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

const runPromise = (query, params) => {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) {
                reject(err);
            } else {
                resolve({ lastID: this.lastID, changes: this.changes });
            }
        });
    });
};
async function readAddressesFromDatabase(selectedFile, currentUsername) {
    const query = 'SELECT Address FROM routes WHERE DeliveryFile = ? AND Courier = ?';

    try {
        const rows = await allPromise(query, [selectedFile, currentUsername]);
        const addresses = rows.map(row => row.Address);
        return addresses;
    } catch (error) {
        console.error('Error reading addresses from the database:', error);
        throw error;
    }
}

// Example middleware to verify JWT token

// Function to read CSV and filter by courier name
async function readCSVAndFilter(filePath, courierName) {
    const addresses = [];
    try {
        const data = fs.readFileSync(filePath, 'utf8').split('\n');
        for (let line of data) {
            const [courier, address] = line.split(',');
            if (courier === courierName) {
                addresses.push(address);
            }
        }
    } catch (error) {
        console.error('Error reading the file:', error);
    }
    return addresses;
}









// Start the server
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    console.log('l');
});