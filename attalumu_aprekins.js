const axios = require('axios');
const fs = require('fs');
const { parse } = require('csv-parse/sync');

const GOOGLE_API_KEY = 'AIzaSyAJ8yFFMQ5kNg_-FQR9dw42ut3qGDGKXRU'; // Aizstājiet ar savu API atslēgu
const START_ADDRESS = 'Ķīpsalas iela 6A, Riga';
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const db = require('./database.js');


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

async function executeMain(deliveryFile, username) {
    console.log('Attalumu aprekins aktivizēts, apstrādā failu:', deliveryFile);
    console.log('Lietotājs tikko pieprasīja maršruta optimizāciju:', username);

    // Read assigned deliveries from the database
    const assignedDeliveriesQuery = `
        SELECT courier
        FROM assigned_deliveries
        WHERE deliveryFile = ? AND courier != ?
    `;

    let differentUsernames = await allPromise(assignedDeliveriesQuery, [deliveryFile, username]);
    differentUsernames = differentUsernames.map(row => row.courier);

    const differentUsernamesSkaits = differentUsernames.length + 1;

    console.log('Atšķirīgie lietotājvārdi:', differentUsernames);
    console.log('Atšķirīgo lietotājvārdu skaits:', differentUsernamesSkaits);

    // Read addresses from the database
    const selectAddressesQuery = `
        SELECT address
        FROM orders
        WHERE delivery_date = ?
    `;

    const addresses = await allPromise(selectAddressesQuery, [deliveryFile]);
    const addressArray = addresses.map(row => row.address);

    // Function to get distance matrix from Google Maps API
    const getDistanceMatrix = async (origins, destinations) => {
        try {
            const response = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
                params: {
                    origins: origins.join('|'),
                    destinations: destinations.join('|'),
                    key: GOOGLE_API_KEY,
                    traffic_model: 'best_guess',
                    departure_time: 'now'
                }
            });

            // Log the entire response for debugging
            // console.log('Google Maps API response:', response);

            // Check if the required properties are present in the response
            if (response.data && response.data.rows && response.data.rows[0] && response.data.rows[0].elements) {
                return response.data.rows[0].elements;
            } else {
                console.error('Error: Invalid response format from Google Maps API');
                throw new Error('Invalid response format from Google Maps API');
            }
        } catch (error) {
            console.error('Error fetching distance matrix', error);
            throw error;
        }
    };

    // Function to distribute routes among couriers
    const distributeRoutes = async () => {
        const distanceElements = await getDistanceMatrix([START_ADDRESS], addressArray);

        // Calculate the total duration of the route
        let totalDuration = 0;
        distanceElements.forEach(el => {
            if (el && el.duration && el.duration.value) {
                totalDuration += el.duration.value;
            } else {
                console.error('Kļūda: Nav iespējams iegūt brauciena laiku vienai vai vairākām adresēm.');
            }
        });

        // Prepare the list of couriers, starting with the main username and adding different usernames
        const allCouriers = [username, ...differentUsernames];

        // Initialize arrays for courier routes and durations
        const courierRoutes = Array.from({length: allCouriers.length}, () => []);
        const courierDurations = Array.from({length: allCouriers.length}, () => 0);

        // Distribute addresses among couriers
        distanceElements.forEach((el, index) => {
            const minDurationIndex = courierDurations.indexOf(Math.min(...courierDurations));
            courierRoutes[minDurationIndex].push(addressArray[index]);
            courierDurations[minDurationIndex] += el.duration.value;
        });

        return {courierRoutes, allCouriers};
    };

    // Function to save routes to the database
    const saveRoutesToDatabase = async (courierRoutes, allCouriers, deliveryFile) => {
        // SQL query to create 'routes' table if it doesn't exist

        // SQL query to insert routes into the 'routes' table
        const insertRoutesQuery = `
            INSERT INTO routes (Courier, Address, DeliveryFile)
            VALUES (?, ?, ?)
        `;

        for (const courier of allCouriers) {
            const courierRoutesBatch = courierRoutes[allCouriers.indexOf(courier)];

            for (const address of courierRoutesBatch) {
                await runPromise(insertRoutesQuery, [courier, address, deliveryFile]);
            }
        }

        console.log('Data inserted into routes table.');
    };

    try {
        const { courierRoutes, allCouriers } = await distributeRoutes();

        allCouriers.forEach((courier, index) => {
            console.log(`Kurjers ${courier} maršruti:`, courierRoutes[index]);
        });

        await saveRoutesToDatabase(courierRoutes, allCouriers, deliveryFile);

        console.log('Attalumu aprekinasana tika izpildīta');
    } catch (error) {
        console.error('Error:', error);
    }
}

module.exports = executeMain;