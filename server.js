const net = require("net");

const clients = [];

const rooms = {
    General: [],
    Gaming: [],
    Study: []
};

const server = net.createServer((socket) => {

    console.log("Client connected!");

    socket.write("Enter your nickname: ");

    let nickname = null;
    let currentRoom = "General";

    socket.on("data", (data) => {

        const message = data.toString().trim();

        // First message = nickname
        if (nickname === null) {

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
                nickname: nickname,
                room: currentRoom
            });

            rooms.General.push(nickname);

            socket.write(`Welcome ${nickname}!\n`);
            socket.write(`You are in ${currentRoom} room.\n`);
            socket.write("Type /help to see available commands.\n");

            console.log(`${nickname} joined the chat.`);

            return;
        }

        // ---------------- COMMANDS ----------------

        // Show available commands
        if (message === "/help") {

            socket.write(
                "\nAvailable commands:\n" +
                "/rooms - Show available rooms\n" +
                "/join <room> - Join a room\n" +
                "/leave - Leave current room and return to General\n" +
                "/help - Show commands\n" +
                "\n"
            );

            return;
        }

        // Show rooms
        if (message === "/rooms") {

            socket.write(
                "\nAvailable rooms:\n" +
                "- General\n" +
                "- Gaming\n" +
                "- Study\n\n"
            );

            return;
        }

        // Join room
        if (message.startsWith("/join ")) {

            const roomName = message.substring(6).trim();

            if (!rooms[roomName]) {
                socket.write(
                    "Room not found. Available rooms: General, Gaming, Study\n"
                );
                return;
            }

            if (currentRoom === roomName) {
                socket.write(`You are already in ${roomName} room.\n`);
                return;
            }

            // Remove from old room
            rooms[currentRoom] = rooms[currentRoom].filter(
                (name) => name !== nickname
            );

            // Update current room
            currentRoom = roomName;

            // Add to new room
            rooms[currentRoom].push(nickname);

            // Update client's room
            const client = clients.find(
                (client) => client.nickname === nickname
            );

            client.room = currentRoom;

            socket.write(`You joined ${currentRoom} room.\n`);

            console.log(`${nickname} joined ${currentRoom} room.`);

            return;
        }

        // Leave current room
        if (message === "/leave") {

            if (currentRoom === "General") {
                socket.write("You are already in General room.\n");
                return;
            }

            rooms[currentRoom] = rooms[currentRoom].filter(
                (name) => name !== nickname
            );

            currentRoom = "General";

            rooms.General.push(nickname);

            const client = clients.find(
                (client) => client.nickname === nickname
            );

            client.room = "General";

            socket.write("You left the room and returned to General.\n");

            return;
        }

        // ---------------- NORMAL CHAT ----------------

        console.log(`[${currentRoom}] ${nickname}: ${message}`);

        // Send message only to users in same room
        clients.forEach((client) => {

            if (client.room === currentRoom) {

                client.socket.write(
                    `[${currentRoom}] ${nickname}: ${message}\n`
                );

            }

        });

    });

    // ---------------- DISCONNECT ----------------

    socket.on("end", () => {

        console.log(`${nickname || "Unknown client"} disconnected.`);

        if (nickname) {

            // Remove from clients
            const index = clients.findIndex(
                (client) => client.socket === socket
            );

            if (index !== -1) {
                clients.splice(index, 1);
            }

            // Remove from room
            rooms[currentRoom] = rooms[currentRoom].filter(
                (name) => name !== nickname
            );

        }

    });

});

server.listen(5000, () => {
    console.log("TCP Server is running on port 5000");
});