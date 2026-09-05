const net = require("net");

const client = net.createConnection({
    host: "localhost",
    port: 5000
}, () => {

    console.log("Connected to TCP Server!");

    client.write("Hello Server!");
});

client.on("data", (data) => {
    console.log("Server says:", data.toString());
});

client.on("end", () => {
    console.log("Disconnected from server.");
});