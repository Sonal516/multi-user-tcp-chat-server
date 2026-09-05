const net = require("net");
const readline = require("readline");

const client = net.createConnection({
    host: "localhost",
    port: 5000
}, () => {

    console.log("Connected to TCP Server!");
    console.log("You can start chatting...\n");

});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.on("line", (message) => {

    client.write(message + "\n");

});

client.on("data", (data) => {

    console.log(data.toString().trim());

});

client.on("end", () => {

    console.log("Disconnected from server.");
    rl.close();

});