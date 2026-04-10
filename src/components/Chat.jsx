import React, { useEffect, useState } from "react";
import socket from "../socket";

const Chat = () => {
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([]);

  const sendMessage = () => {
    if (!message.trim()) return;

    socket.emit("send_message", {
      message,
      senderId: "123",
      receiverId: "456",
    });

    setChat((prev) => [...prev, { message, self: true }]);
    setMessage("");
  };

  useEffect(() => {
  const handleMessage = (data) => {
    setChat((prev) => [...prev, { ...data, self: false }]);
  };

  socket.on("receive_message", handleMessage);

  return () => {
    socket.off("receive_message", handleMessage);
  };
}, []);

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      
      {/* Header */}
      <div className="bg-blue-600 text-white p-4 text-center font-semibold shadow-md">
        Chat App
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {chat.map((msg, i) => (
          <div
            key={i}
            className={`flex ${
              msg.self ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`px-4 py-2 rounded-lg max-w-xs sm:max-w-md break-words ${
                msg.self
                  ? "bg-blue-500 text-white rounded-br-none"
                  : "bg-white text-gray-800 rounded-bl-none shadow"
              }`}
            >
              {msg.message}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="p-3 bg-white border-t flex gap-2">
        <input
          type="text"
          placeholder="Type a message..."
          className="flex-1 border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button
          onClick={sendMessage}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default Chat;   