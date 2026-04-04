
const net = require('net');

const ports = [5432, 5433, 5434, 5435, 56201, 15432];

console.log("Scanning ports for Postgres...");

ports.forEach(port => {
    const socket = new net.Socket();
    socket.setTimeout(2000);

    socket.on('connect', () => {
        console.log(`[SUCCESS] Found open port: ${port}`);
        socket.destroy();
    });

    socket.on('timeout', () => {
        // console.log(`[TIMEOUT] Port ${port}`);
        socket.destroy();
    });

    socket.on('error', (err) => {
        // console.log(`[CLOSED] Port ${port}`);
    });

    socket.connect(port, '127.0.0.1');
});
