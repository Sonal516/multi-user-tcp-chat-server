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
    let isAdmin = false;

    socket.on("data", (data) => {

        const message = data.toString().trim();

        // ---------------- NICKNAME ----------------

        if (nickname === null) {

            const alreadyExists = clients.some(
                (client) => client.nickname === message
            );

            if (alreadyExists) {
                socket.write("Nickname already taken. Try another: ");
                return;
            }

            nickname = message;

            // First user becomes admin
            if (clients.length === 0) {
                isAdmin = true;
            }

            clients.push({
                socket: socket,
                nickname: nickname,
                room: currentRoom,
                isAdmin: isAdmin
            });

            rooms.General.push(nickname);

            socket.write(`Welcome ${nickname}!\n`);

            if (isAdmin) {
                socket.write("You are the ADMIN.\n");
            }

            socket.write(`You are in ${currentRoom} room.\n`);
            socket.write("Type /help to see available commands.\n");

            console.log(
                `${nickname} connected${isAdmin ? " as ADMIN" : ""}.`
            );

            return;
        }

        // ---------------- HELP ----------------

        if (message === "/help") {

            socket.write(
                "\nAvailable commands:\n" +
                "/rooms - Show available rooms\n" +
                "/join <room> - Join a room\n" +
                "/leave - Return to General room\n" +
                "/users - Show connected users (Admin)\n" +
                "/kick <nickname> - Kick a user (Admin)\n" +
                "/announce <message> - Send announcement (Admin)\n" +
                "/help - Show commands\n\n"
            );

            return;
        }

        // ---------------- ROOMS ----------------

        if (message === "/rooms") {

            socket.write(
                "\nAvailable rooms:\n" +
                "- General\n" +
                "- Gaming\n" +
                "- Study\n\n"
            );

            return;
        }

        // ---------------- JOIN ROOM ----------------

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

            // Change room
            currentRoom = roomName;

            // Add to new room
            rooms[currentRoom].push(nickname);

            // Update client information
            const client = clients.find(
                (client) => client.nickname === nickname
            );

            client.room = currentRoom;

            socket.write(`You joined ${currentRoom} room.\n`);

            console.log(`${nickname} joined ${currentRoom} room.`);

            return;
        }

        // ---------------- LEAVE ROOM ----------------

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

            socket.write(
                "You left the room and returned to General.\n"
            );

            return;
        }

        // =================================================
        //                  ADMIN CONTROLS
        // =================================================

        // ---------------- USERS ----------------

        if (message === "/users") {

            if (!isAdmin) {
                socket.write("Access denied. Admin only.\n");
                return;
            }

            socket.write("\nConnected users:\n");

            clients.forEach((client) => {

                socket.write(
                    `- ${client.nickname} [${client.room}]` +
                    `${client.isAdmin ? " (ADMIN)" : ""}\n`
                );

            });

            socket.write("\n");

            return;
        }

        // ---------------- KICK ----------------

        if (message.startsWith("/kick ")) {

            if (!isAdmin) {
                socket.write("Access denied. Admin only.\n");
                return;
            }

            const targetNickname = message.substring(6).trim();

            if (targetNickname === nickname) {
                socket.write("You cannot kick yourself.\n");
                return;
            }

            const target = clients.find(
                (client) => client.nickname === targetNickname
            );

            if (!target) {
                socket.write("User not found.\n");
                return;
            }

            // Remove target from room
            rooms[target.room] = rooms[target.room].filter(
                (name) => name !== target.nickname
            );

            // Remove target from clients
            const index = clients.indexOf(target);

            if (index !== -1) {
                clients.splice(index, 1);
            }

            // Tell target
            target.socket.write(
                "You have been kicked by the admin.\n"
            );

            target.socket.end();

            // Tell all remaining users
            clients.forEach((client) => {
                client.socket.write(
                    `${targetNickname} was kicked by the admin.\n`
                );
            });

            console.log(
                `${targetNickname} was kicked by admin ${nickname}.`
            );

            return;
        }

        // ---------------- ANNOUNCE ----------------

        if (message.startsWith("/announce ")) {

            if (!isAdmin) {
                socket.write("Access denied. Admin only.\n");
                return;
            }

            const announcement = message.substring(10).trim();

            if (announcement === "") {
                socket.write("Please enter an announcement message.\n");
                return;
            }

            clients.forEach((client) => {

                client.socket.write(
                    `\n[ADMIN ANNOUNCEMENT] ${announcement}\n`
                );

            });

            console.log(
                `Admin announcement: ${announcement}`
            );

            return;
        }

        // ---------------- NORMAL CHAT ----------------

        console.log(
            `[${currentRoom}] ${nickname}: ${message}`
        );

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

        console.log(
            `${nickname || "Unknown client"} disconnected.`
        );

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