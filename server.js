const net = require("net");

const clients = [];

const server = net.createServer((socket) => {

    console.log("Client connected!");

    // Ask for nickname
    socket.write("Enter your nickname: ");

    let nickname = null;

    socket.on("data", (data) => {

        const message = data.toString().trim();

        // First message is treated as nickname
        if (nickname === null) {

            // Check if nickname is already taken
            const alreadyExists = clients.some(
                (client) => client.nickname === message
            );

            if (alreadyExists) {
                socket.write("Nickname already taken. Try another: ");
                return;
            }

            nickname = message;

            clients.push({
                socket: socket,
                nickname: nickname
            });

            console.log(`${nickname} connected!`);

            socket.write(`Welcome ${nickname}!\n`);

            // Inform other users
            clients.forEach((client) => {
                if (client.socket !== socket) {
                    client.socket.write(
                        `${nickname} joined the chat!\n`
                    );
                }
            });

            return;
        }

        // Normal chat message
        console.log(`${nickname}: ${message}`);

        // Broadcast message
        clients.forEach((client) => {
            client.socket.write(
                `${nickname}: ${message}\n`
            );
        });

    });

    socket.on("end", () => {

        console.log(`${nickname || "Unknown client"} disconnected!`);

        // Remove client
        const index = clients.findIndex(
            (client) => client.socket === socket
        );

        if (index !== -1) {
            clients.splice(index, 1);
        }

        // Inform remaining users
        if (nickname) {
            clients.forEach((client) => {
                client.socket.write(
                    `${nickname} left the chat.\n`
                );
            });
        }

    });

});

server.listen(5000, () => {
    console.log("TCP Server is running on port 5000");
});