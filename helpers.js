const fs = require('fs');
const axios = require('axios');
const jwt = require('jsonwebtoken');


// Helper function to verify JWT token
function verifyToken(req, res, next) {
    const token = req.cookies.token;
    if (typeof token !== 'undefined') {
        jwt.verify(token, 'penis', (err, authData) => {
            if (err) {
                res.sendStatus(403);
            } else {
                next();
            }
        });
    } else {
        res.sendStatus(401);
    }
}

// Helper function to get the best route with multiple stops using Google Maps API
async function getRouteWithMultipleStops(destinations) {
    const waypoints = destinations.join('|');
    const response = await axios.get(`https://maps.googleapis.com/maps/api/directions/json`, {
        params: {
            origin: startingPoint,
            destination: startingPoint, // Loop back to starting point
            waypoints: `optimize:true|${waypoints}`,
            key: googleApiKey,
        }
    });
    console.log('Google Maps API Response:', response.data);
    return response.data;
}

// Helper function to calculate the best route for deliveries
async function calculateBestRoute(deliveryAddresses) {
    const routeData = await getRouteWithMultipleStops(deliveryAddresses);

    if (!routeData.routes || routeData.routes.length === 0) {
        console.log('No routes found in Google Maps API response.');
        return [];
    }

    const route = routeData.routes[0];

    let orderedStops = [];
    if (route.waypoint_order && route.waypoint_order.length) {
        orderedStops = route.waypoint_order.map(index => deliveryAddresses[index]);
    } else {
        console.log('No waypoint order found in route.');
    }

    return orderedStops.map((stop, index) => {
        const leg = route.legs[index];
        return {
            stop: stop,
            distance: leg.distance.text,
            duration: leg.duration.text
        };
    });
}

// Export helper functions
module.exports = {
    verifyToken,
    getRouteWithMultipleStops,
    calculateBestRoute
};
