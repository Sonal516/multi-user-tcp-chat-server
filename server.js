const net = require("net");

const clients = [];

const server = net.createServer((socket) => {

    console.log("Client connected!");

    clients.push(socket);

    socket.write("Welcome to TCP Chat Server!\n");

    socket.on("data", (data) => {

        const message = data.toString().trim();

        console.log("Client says:", message);

        // Send message to all connected clients
        clients.forEach((client) => {
            client.write("Client: " + message + "\n");
        });

    });

    socket.on("end", () => {

        console.log("Client disconnected!");

        // Remove disconnected client
        const index = clients.indexOf(socket);

        if (index !== -1) {
            clients.splice(index, 1);
        }

    });

});

server.listen(5000, () => {
    console.log("TCP Server is running on port 5000");
});