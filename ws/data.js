const clients = {};
const sessions = {};
const rooms = {};
const transports = new Map();
const producerTransports = new Map();
const consumerTransports = new Map();
const producers = new Map();

module.exports = { clients, sessions, rooms, transports, producers, producerTransports, consumerTransports };
