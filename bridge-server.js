const net = require("net");
const { WebSocketServer } = require("ws");

const TCP_PORT = Number.parseInt(process.env.TCP_PORT, 10) || 5000;
const WS_PORT = Number.parseInt(process.env.WS_PORT, 10) || 8800;

const server = new WebSocketServer({ port: WS_PORT });

function checkExistingBridge() {
    const probe = new (require("ws"))(`ws://127.0.0.1:${WS_PORT}`);
    let settled = false;
    const finish = (message, exitCode) => {
        if (settled) return;
        settled = true;
        probe.close();
        console[exitCode === 0 ? "log" : "error"](message);
        process.exit(exitCode);
    };

    const timer = setTimeout(() => finish(`WebSocket port ${WS_PORT} is occupied by another process.`, 1), 1000);
    probe.on("open", () => probe.send(JSON.stringify({ type: "bridge" })));
    probe.on("message", (data) => {
        try {
            const payload = JSON.parse(data.toString());
            if (payload.type === "hello" || (payload.type === "error" && payload.message === "TCP server unavailable.")) {
                clearTimeout(timer);
                finish(`WebSocket bridge is already running on port ${WS_PORT}. Start was skipped.`, 0);
            }
        } catch {
            // The occupied port is not this project's bridge.
        }
    });
    probe.on("error", () => {
        clearTimeout(timer);
        finish(`WebSocket port ${WS_PORT} is occupied, but the process is not a compatible bridge.`, 1);
    });
}

server.on("listening", () => console.log(`WebSocket bridge is running on port ${WS_PORT}, forwarding to TCP port ${TCP_PORT}`));
server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
        checkExistingBridge();
        return;
    }
    console.error(`WebSocket bridge failed to start: ${error.message}`);
    process.exitCode = 1;
});

server.on("connection", (webSocket) => {
    const tcp = net.createConnection({ host: "127.0.0.1", port: TCP_PORT });
    let buffer = "";
    let ready = false;
    let handshakePending = false;

    tcp.on("connect", () => tcp.write(JSON.stringify({ type: "bridge" }) + "\n"));
    tcp.on("data", (data) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) {
            const jsonStart = line.indexOf("{");
            if (jsonStart === -1) continue;
            try {
                const payload = JSON.parse(line.slice(jsonStart));
                if (payload.type === "hello") {
                    ready = true;
                    if (handshakePending && webSocket.readyState === webSocket.OPEN) {
                        handshakePending = false;
                        webSocket.send(JSON.stringify(payload));
                    }
                } else if (webSocket.readyState === webSocket.OPEN) {
                    webSocket.send(JSON.stringify(payload));
                }
            } catch {
                // Ignore non-JSON legacy text from the raw TCP greeting.
            }
        }
    });
    tcp.on("error", () => {
        if (webSocket.readyState === webSocket.OPEN) webSocket.send(JSON.stringify({ type: "error", message: "TCP server unavailable." }));
    });
    tcp.on("close", () => {
        if (webSocket.readyState === webSocket.OPEN) webSocket.close();
    });

    webSocket.on("message", (data) => {
        try {
            const payload = JSON.parse(data.toString());
            if (payload.type === "bridge") {
                handshakePending = true;
                if (ready && webSocket.readyState === webSocket.OPEN) {
                    handshakePending = false;
                    webSocket.send(JSON.stringify({ type: "hello", protocol: "tcp-chat-v1" }));
                }
                return;
            }
            if (!ready || tcp.destroyed) return;
            tcp.write(JSON.stringify(payload) + "\n");
        } catch {
            webSocket.send(JSON.stringify({ type: "error", message: "Invalid WebSocket message." }));
        }
    });
    webSocket.on("close", () => tcp.end());
    webSocket.on("error", () => tcp.destroy());
});

