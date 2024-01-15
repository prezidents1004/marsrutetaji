const axios = require('axios');
const fs = require('fs');
const { parse } = require('csv-parse/sync');

const GOOGLE_API_KEY = 'AIzaSyAJ8yFFMQ5kNg_-FQR9dw42ut3qGDGKXRU\n'; // Aizstājiet ar savu API atslēgu
const START_ADDRESS = 'Ķīpsalas iela 6A, Riga';

// Nolasīt CSV failu un iegūt adreses
const inputFilePath = 'deliveryinfo.csv';
const inputFile = fs.readFileSync(inputFilePath, 'utf8');
const records = parse(inputFile, { columns: true, skip_empty_lines: true });

const addresses = records.map(rec => rec.Address);

// Funkcija, lai iegūtu attālumus un brauciena laikus
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
        return response.data.rows[0].elements;
    } catch (error) {
        console.error('Error fetching distance matrix', error);
        throw error;
    }
};

// Sadalīt maršrutus starp diviem kurjeriem
const distributeRoutes = async () => {
    const distanceElements = await getDistanceMatrix([START_ADDRESS], addresses);

    // Aprēķināt kopējo brauciena laiku
    let totalDuration = 0;
    distanceElements.forEach(el => totalDuration += el.duration.value);

    // Sadalīt adreses starp kurjeriem
    let courier1Duration = 0;
    let courier1Routes = [];
    let courier2Routes = [];

    distanceElements.forEach((el, index) => {
        if (courier1Duration < totalDuration / 2) {
            courier1Routes.push(addresses[index]);
            courier1Duration += el.duration.value;
        } else {
            courier2Routes.push(addresses[index]);
        }
    });

    return { courier1Routes, courier2Routes };
};

distributeRoutes()
    .then(({ courier1Routes, courier2Routes }) => {
        console.log('Kurjers 1 maršruti:', courier1Routes);
        console.log('Kurjers 2 maršruti:', courier2Routes);
    })
    .catch(console.error);
