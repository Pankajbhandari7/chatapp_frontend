import { io } from "socket.io-client";

const socket = io("http://localhost:5000");

socket.on("connect", () => {
    console.log("Connected");
    socket.emit("join", "123");
    
    socket.emit("send_message", {
        senderId: "123",
        receiverId: "456",
        message: "Hello world"
    });
});

socket.on("receive_message", (data) => {
    console.log("Received:", data);
    process.exit(0);
});
