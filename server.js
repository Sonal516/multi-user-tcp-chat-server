const net = require("net");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const configuredPort = Number.parseInt(process.env.TCP_PORT, 10);
const PORT = Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : 5000;
const USERS_FILE = path.join(__dirname, "users.json");
const DEFAULT_ROOMS = ["General", "Gaming", "Study"];
const rooms = new Map(DEFAULT_ROOMS.map((name) => [name, { members: new Set(), pendingRequests: new Map(), adminUsername: null }]));
const clients = new Set();
const messages = new Map(DEFAULT_ROOMS.map((name) => [name, []]));

function loadUsers() {
    try { return JSON.parse(fs.readFileSync(USERS_FILE, "utf8")); } catch { return []; }
}

let users = loadUsers();

function saveUsers() { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); }

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
    const [salt, expected] = String(stored).split(":");
    if (!salt || !expected) return false;
    const actual = crypto.scryptSync(password, salt, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function sendJson(client, payload) {
    if (!client.socket.destroyed) client.socket.write(`${JSON.stringify(payload)}\n`);
}

function sendText(client, text) {
    if (!client.socket.destroyed) client.socket.write(text.endsWith("\n") ? text : `${text}\n`);
}

function publicState(client) {
    const currentRoom = rooms.get(client.room);
    const ownedRooms = [...rooms].filter(([, room]) => room.adminUsername === client.username).map(([name, room]) => ({
        name,
        members: [...room.members].map((username) => {
            const member = [...clients].find((item) => roomMemberKey(item) === username);
            return { username, nickname: member?.nickname || username, online: Boolean(member) };
        }),
        pendingRequests: [...room.pendingRequests.values()]
    }));
    return {
        type: "state", nickname: client.nickname, username: client.username,
        currentRoom: client.room, rooms: [...rooms.keys()],
        memberRooms: [...rooms].filter(([, room]) => room.adminUsername === client.username || room.members.has(roomMemberKey(client))).map(([name]) => name),
        adminRooms: [...rooms].filter(([, room]) => room.adminUsername === client.username).map(([name]) => name),
        pendingRooms: [...rooms].filter(([, room]) => room.pendingRequests.has(roomMemberKey(client))).map(([name]) => name),
        isRoomAdmin: currentRoom?.adminUsername === client.username,
        roomMembers: currentRoom?.adminUsername === client.username ? ownedRooms.find((room) => room.name === client.room)?.members || [] : [],
        pendingRequests: currentRoom?.adminUsername === client.username ? [...currentRoom.pendingRequests.values()] : [],
        ownedRooms,
        users: [...clients].filter((item) => item.nickname && item.joinedRooms.has(client.room)).map((item) => ({ nickname: item.nickname, room: client.room }))
    };
}

function broadcast(payload, predicate = () => true) {
    for (const client of clients) {
        if (client.mode === "json" && client.authenticated && predicate(client)) sendJson(client, payload);
    }
}

function broadcastState() {
    for (const client of clients) if (client.mode === "json" && client.authenticated) sendJson(client, publicState(client));
}

function error(client, message) { client.mode === "json" ? sendJson(client, { type: "error", message }) : sendText(client, message); }

function validName(value) { return typeof value === "string" && /^[A-Za-z0-9_-]{2,20}$/.test(value); }

function roomMemberKey(client) { return client.username || `legacy:${client.nickname}`; }

function addRoomMember(client, roomName) {
    rooms.get(roomName).members.add(roomMemberKey(client));
    client.joinedRooms.add(roomName);
}

function removeRoomMember(client, roomName) {
    rooms.get(roomName)?.members.delete(roomMemberKey(client));
    client.joinedRooms.delete(roomName);
}

function isRoomMember(client, roomName) {
    const room = rooms.get(roomName);
    return Boolean(room && (room.adminUsername === client.username || room.members.has(roomMemberKey(client))));
}

function isRoomAdmin(client, roomName = client.room) {
    return rooms.get(roomName)?.adminUsername === client.username && Boolean(client.username);
}

function addMessage(room, message) {
    const history = messages.get(room) || [];
    history.push(message);
    messages.set(room, history.slice(-100));
}

function removeClient(client) {
    clients.delete(client);
    if (!client.username) for (const roomName of client.joinedRooms) removeRoomMember(client, roomName);
    broadcastState();
}

function finishLogin(client, username) {
    const account = users.find((item) => item.username === username);
    client.username = account.username;
    client.authenticated = true;
    sendJson(client, { type: "auth", status: "ok", username: client.username, needsNickname: true });
}

function handleJson(client, request) {
    if (request.type === "bridge") {
        client.mode = "json";
        sendJson(client, { type: "hello", protocol: "tcp-chat-v1" });
        return;
    }
    if (request.type === "register") {
        if (!validName(request.username) || typeof request.password !== "string" || request.password.length < 6) return error(client, "Username must be 2-20 characters and password must be at least 6 characters.");
        if (users.some((item) => item.username === request.username)) return error(client, "Username is already registered.");
        users.push({ username: request.username, password: hashPassword(request.password) });
        saveUsers();
        sendJson(client, { type: "auth", status: "registered", message: "Registration successful. You can now log in." });
        return;
    }
    if (request.type === "login") {
        const account = users.find((item) => item.username === request.username);
        if (!account || !verifyPassword(request.password || "", account.password)) return error(client, "Invalid username or password.");
        if ([...clients].some((item) => item.username === account.username && item.authenticated)) return error(client, "This account is already connected.");
        finishLogin(client, account.username);
        return;
    }
    if (request.type === "set_nickname") {
        if (!client.authenticated || client.nickname) return error(client, "Choose a nickname after logging in.");
        if (!validName(request.nickname)) return error(client, "Nickname must be 2-20 letters, numbers, _ or -.");
        if ([...clients].some((item) => item.nickname?.toLowerCase() === request.nickname.toLowerCase())) return error(client, "Nickname is already taken.");
        client.nickname = request.nickname;
        for (const roomName of DEFAULT_ROOMS) addRoomMember(client, roomName);
        sendJson(client, publicState(client));
        sendJson(client, { type: "room_history", room: "General", messages: messages.get("General") });
        broadcastState();
        return;
    }
    if (!client.authenticated || !client.nickname) return error(client, "Log in and choose a nickname first.");
    if (request.type === "chat") {
        if (!isRoomMember(client, client.room)) return error(client, "You are not a member of this room.");
        const text = String(request.message || "").trim();
        if (!text) return error(client, "Message cannot be empty.");
        const message = { type: "chat", room: client.room, sender: client.nickname, message: text, timestamp: new Date().toISOString() };
        addMessage(client.room, message);
        broadcast(message, (target) => target.joinedRooms.has(client.room));
        return;
    }
    if (request.type === "private") {
        const text = String(request.message || "").trim();
        const target = [...clients].find((item) => item.nickname?.toLowerCase() === String(request.to || "").toLowerCase());
        if (!text) return error(client, "Private message cannot be empty.");
        if (!target) return error(client, "User not found.");
        const privateMessage = { type: "private", sender: client.nickname, to: target.nickname, message: text, timestamp: new Date().toISOString() };
        sendJson(client, privateMessage);
        if (target !== client) sendJson(target, privateMessage);
        return;
    }
    if (request.type === "join" || request.type === "leave") {
        const destination = request.type === "leave" ? "General" : request.room;
        if (!rooms.has(destination)) return error(client, "Room not found.");
        if (!isRoomMember(client, destination)) {
            return sendJson(client, { type: "room_access", room: destination, status: "denied" });
        }
        client.joinedRooms.add(destination);
        client.room = destination;
        sendJson(client, publicState(client));
        sendJson(client, { type: "room_history", room: destination, messages: messages.get(destination) });
        broadcastState();
        return;
    }
    if (request.type === "request_join") {
        const roomName = request.room;
        const room = rooms.get(roomName);
        if (!room) return error(client, "Room not found.");
        if (isRoomMember(client, roomName)) return error(client, "You are already a member of this room.");
        const memberKey = roomMemberKey(client);
        if (room.pendingRequests.has(memberKey)) {
            return sendJson(client, { type: "room_access", room: roomName, status: "pending", existing: true });
        }
        room.pendingRequests.set(memberKey, {
            room: roomName,
            username: memberKey,
            requestingUsername: client.username,
            nickname: client.nickname,
            adminUsername: room.adminUsername,
            requestedAt: new Date().toISOString()
        });
        sendJson(client, { type: "room_access", room: roomName, status: "pending" });
        for (const admin of clients) {
            if (admin.username === room.adminUsername && admin.authenticated && admin.mode === "json") {
                sendJson(admin, { type: "join_request", room: roomName, request: room.pendingRequests.get(memberKey) });
            }
        }
        broadcastState();
        return;
    }
    if (request.type === "approve_join" || request.type === "reject_join") {
        const roomName = request.room;
        const room = rooms.get(roomName);
        if (!room || room.adminUsername !== client.username) return error(client, "Access denied. You are not the admin of this room.");
        const pending = room.pendingRequests.get(request.username);
        if (!pending) return error(client, "Join request not found.");
        room.pendingRequests.delete(request.username);
        const requester = [...clients].find((item) => roomMemberKey(item) === pending.username);
        if (request.type === "approve_join") {
            room.members.add(pending.username);
            if (requester) {
                requester.joinedRooms.add(roomName);
                requester.room = roomName;
                if (requester.mode === "json") {
                    sendJson(requester, { type: "room_access", room: roomName, status: "approved" });
                    sendJson(requester, publicState(requester));
                    sendJson(requester, { type: "room_history", room: roomName, messages: messages.get(roomName) });
                } else sendText(requester, `Your request to join ${roomName} was approved.`);
            }
        } else if (requester) {
            if (requester.mode === "json") sendJson(requester, { type: "room_access", room: roomName, status: "rejected" });
            else sendText(requester, `Your request to join ${roomName} was rejected. You may request again.`);
        }
        broadcastState();
        return;
    }
    if (request.type === "users" || request.type === "rooms") return sendJson(client, publicState(client));
    if (["kick", "announce"].includes(request.type) && !isRoomAdmin(client)) return error(client, "Access denied. You are not the admin of this room.");
    if (request.type === "kick") {
        const room = rooms.get(client.room);
        const memberUsername = request.username && room.members.has(request.username) ? request.username : [...room.members].find((username) => {
            const member = [...clients].find((item) => roomMemberKey(item) === username);
            return member?.nickname === request.nickname || (!member && username === request.nickname);
        });
        if (!memberUsername) return error(client, "User not found in this room.");
        const target = [...clients].find((item) => roomMemberKey(item) === memberUsername);
        if (memberUsername === roomMemberKey(client)) return error(client, "You cannot kick yourself.");
        room.members.delete(memberUsername);
        if (target) target.joinedRooms.delete(client.room);
        if (target?.room === client.room) {
            target.room = "General";
            addRoomMember(target, "General");
            if (target.mode === "json") {
                sendJson(target, { type: "room_access", room: client.room, status: "removed" });
                sendJson(target, publicState(target));
                sendJson(target, { type: "room_history", room: "General", messages: messages.get("General") });
            }
        } else if (target?.mode === "json") sendJson(target, { type: "room_access", room: client.room, status: "removed" });
        else if (target?.mode === "legacy") sendText(target, "You have been removed from this room by its admin.");
        broadcastState();
        return;
    }
    if (request.type === "announce") {
        const text = String(request.message || "").trim();
        if (!text) return error(client, "Announcement cannot be empty.");
        const announcement = { type: "announcement", room: client.room, message: text, sender: client.nickname, timestamp: new Date().toISOString() };
        broadcast(announcement, (target) => target.joinedRooms.has(client.room));
        return;
    }
    if (request.type === "create_room") {
        if (!client.username) return error(client, "Log in with an account to create a room.");
        if (!validName(request.room) || request.room === "General") return error(client, "Room names must be 2-20 letters, numbers, _ or -.");
        if (rooms.has(request.room)) return error(client, "Room already exists.");
        rooms.set(request.room, { members: new Set(), pendingRequests: new Map(), adminUsername: client.username });
        messages.set(request.room, []);
        addRoomMember(client, request.room);
        client.room = request.room;
        sendJson(client, publicState(client));
        sendJson(client, { type: "room_history", room: request.room, messages: messages.get(request.room) });
        broadcastState();
        return;
    }
    if (request.type === "delete_room") {
        if (request.room === "General") return error(client, "General cannot be deleted.");
        if (!rooms.has(request.room)) return error(client, "Room not found.");
        if (!isRoomAdmin(client, request.room)) return error(client, "Access denied. You are not the admin of this room.");
        for (const target of clients) {
            if (target.joinedRooms.has(request.room)) removeRoomMember(target, request.room);
            if (target.room === request.room) {
                target.room = "General";
                addRoomMember(target, "General");
                if (target.mode === "json") {
                    sendJson(target, publicState(target));
                    sendJson(target, { type: "room_history", room: "General", messages: messages.get("General") });
                }
            }
        }
        rooms.delete(request.room); messages.delete(request.room); broadcastState();
        return;
    }
    if (request.type === "logout") { sendJson(client, { type: "logged_out" }); client.socket.end(); }
}

function handleLegacy(client, line) {
    const clean = line.trim();
    if (!client.nickname) {
        if ([...clients].some((item) => item.nickname === clean)) return sendText(client, "Nickname already taken. Try another: ");
        client.nickname = clean; client.authenticated = true;
        for (const roomName of DEFAULT_ROOMS) addRoomMember(client, roomName);
        sendText(client, `Welcome ${clean}! You are in General room. Type /help to see available commands.`); broadcastState(); return;
    }
    if (clean === "/help") return sendText(client, "/rooms /join <room> /leave /users /kick <nickname> /announce <message> /quit");
    if (clean === "/rooms") return sendText(client, `Available rooms: ${[...rooms.keys()].join(", ")}`);
    if (clean === "/leave" || clean.startsWith("/join ")) {
        const destination = clean === "/leave" ? "General" : clean.slice(6).trim();
        if (!rooms.has(destination)) return sendText(client, "Room not found.");
        if (!isRoomMember(client, destination)) {
            const room = rooms.get(destination);
            const memberKey = roomMemberKey(client);
            if (!room.pendingRequests.has(memberKey)) room.pendingRequests.set(memberKey, { username: memberKey, nickname: client.nickname, requestedAt: new Date().toISOString() });
            broadcastState();
            return sendText(client, `Join request sent to the admin of ${destination}.`);
        }
        client.room = destination;
        return sendText(client, `You joined ${destination} room.`);
    }
    if (clean === "/quit") return client.socket.end();
    if (clean === "/users") return sendText(client, [...clients].map((item) => `- ${item.nickname} [${item.room}]`).join("\n"));
    for (const target of clients) if (target.mode === "legacy" && target.joinedRooms.has(client.room)) sendText(target, `[${client.room}] ${client.nickname}: ${clean}`);
}

const server = net.createServer((socket) => {
    const client = { socket, mode: "legacy", nickname: null, username: null, room: "General", joinedRooms: new Set(), authenticated: false, buffer: "" };
    clients.add(client); socket.write("Enter your nickname: ");
    socket.on("data", (data) => {
        client.buffer += data.toString();
        const lines = client.buffer.split("\n"); client.buffer = lines.pop();
        for (const line of lines) {
            if (!line.trim()) continue;
            if (client.mode === "legacy" && line.trim().startsWith("{")) {
                try { const request = JSON.parse(line); if (request.type === "bridge") client.mode = "json"; handleJson(client, request); } catch { error(client, "Invalid JSON request."); }
            } else if (client.mode === "json") {
                try { handleJson(client, JSON.parse(line)); } catch { error(client, "Invalid JSON request."); }
            } else handleLegacy(client, line);
        }
    });
    socket.on("close", () => removeClient(client)); socket.on("error", () => removeClient(client));
});

server.listen(PORT, () => console.log(`TCP Server is running on port ${PORT} (TCP_PORT=${process.env.TCP_PORT || "default"})`));
