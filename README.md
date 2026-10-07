# Multi-User TCP Chat Server

A Computer Networks project demonstrating a multi-user chat application built on a raw Node.js TCP server, with rooms, nicknames, authentication, private messages, and explicit admin controls.

## Features

- Multiple simultaneous raw TCP clients
- Newline-delimited TCP message framing and buffering
- Persistent registration with `crypto.scrypt` password hashing
- Separate account username and chat nickname
- Login, logout, and duplicate-session protection
- Independent room admins assigned to the user who creates each room
- General, Gaming, and Study default rooms
- Runtime room creation by any authenticated user; non-members request access and the room creator approves or rejects requests
- Room history, server-generated ISO timestamps, and room broadcasts
- Private messages delivered only to sender and recipient
- Connected-user list, kick, and announcement controls
- Legacy terminal client plus React browser client

## Architecture

```text
React browser
    | WebSocket JSON (localhost:8800)
    v
bridge-server.js
    | newline-delimited JSON over raw TCP
    v
server.js (localhost:5000)
```

The browser does not connect directly to the raw TCP server. The bridge exists because browsers cannot open arbitrary Node `net` sockets. The TCP server remains the authoritative application and routing layer.

## Technologies

- Node.js built-in `net`, `crypto`, and filesystem APIs
- `ws` WebSocket bridge
- React and Vite
- Plain JavaScript and CSS

## Installation

From the project root:

```powershell
npm.cmd install
cd client
npm.cmd install
cd ..
```

`npm.cmd` is useful on Windows systems where PowerShell script execution blocks `npm.ps1`.

Passwords in `users.json` are salted scrypt hashes, not plaintext. There is no server-wide admin account; users become admins only for rooms they create.

## Run the application

Use three terminals from the project root.

Terminal 1, raw TCP server:

```powershell
npm.cmd run tcp
```

Terminal 2, WebSocket bridge:

```powershell
npm.cmd run bridge
```

Terminal 3, React frontend:

```powershell
cd client
npm.cmd run dev
```

Open the Vite URL shown in Terminal 3, normally `http://localhost:5173`.

The default ports are TCP `5000`, WebSocket `8800`, and Vite `5173`. Override the TCP and WebSocket ports with `TCP_PORT` and `WS_PORT` when needed.

## Terminal client

The existing `client.js` remains a raw TCP demonstration client:

```powershell
node client.js
```

It supports the legacy nickname flow and commands:

- `/help`
- `/rooms`
- `/join <room>`
- `/leave`
- `/users`
- `/quit`

The browser uses the authenticated JSON protocol through the bridge. Room-management actions are checked by `server.js` against ownership of the affected room, even if a client manually sends an admin request.

## Testing checklist

1. Register two accounts and verify duplicate usernames are rejected.
2. Log in with a wrong password and verify the error.
3. Log in with two normal accounts.
4. Choose different nicknames and verify usernames are not displayed as chat identities.
5. Open two browser sessions, join rooms, and exchange room messages.
6. Verify timestamps come from server events and private messages are not broadcast to a room.
7. Create a room with one account, verify it becomes that room's admin, and request access with another account.
8. Approve and reject requests; verify approved users can enter, rejected users can request again, and pending requests are shown to the room admin.
9. Verify existing members can enter directly, admins can see and kick members, and users retain access to their other rooms after being kicked.
10. Verify General cannot be deleted, duplicate rooms are rejected, and invalid names are rejected.
11. Verify only that room's creator can announce to or delete that room; another room's creator cannot manage it.
12. Run `node client.js` to verify the raw TCP terminal path remains available.

## Project structure

```text
server.js          Raw TCP server and application protocol
bridge-server.js   WebSocket-to-TCP browser bridge
client.js          Terminal raw TCP client
users.json         Created at runtime; persistent account records
client/            React/Vite frontend
```

## Computer Networks concepts demonstrated

The project makes TCP connection setup, port numbers, reliable byte-stream delivery, buffering, newline framing, concurrent clients, application-layer messages, broadcasting, room routing, private routing, authentication, authorization, and the WebSocket browser compatibility layer visible in one small system.

## Future scope

A production version could add TLS, a database-backed account store, refreshable sessions, rate limiting, moderation logs, and automated end-to-end tests.
