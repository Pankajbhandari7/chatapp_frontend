import React, { useEffect, useState } from "react";
import socket from "../socket";

const Chat = () => {
  const [chat, setChat] = useState([]);
  const [message, setMessage] = useState("");

  const [senderId, setSenderId] = useState("");
  const [receiverId, setReceiverId] = useState("");
  const [joined, setJoined] = useState(false);

  const joinChat = () => {
    if (!senderId || !receiverId) return;

    socket.emit("join", senderId);
    setJoined(true);
  };

  const sendMessage = () => {
    if (!message.trim()) return;

    socket.emit("send_message", {
      message,
      senderId,
      receiverId,
    });

    setMessage("");
  };

  useEffect(() => {
    socket.on("receive_message", (data) => {
      setChat((prev) => [...prev, data]);
    });

    return () => socket.off("receive_message");
  }, []);

  // 🔥 LOGIN SCREEN
  if (!joined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="w-full max-w-md bg-white shadow-lg rounded-2xl p-6 space-y-4">

          <h1 className="text-2xl font-bold text-center text-blue-600">
            Chat Login
          </h1>

          <input
            placeholder="Enter your ID"
            value={senderId}
            onChange={(e) => setSenderId(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />

          <input
            placeholder="Enter receiver ID"
            value={receiverId}
            onChange={(e) => setReceiverId(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />

          <button
            onClick={joinChat}
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition"
          >
            Start Chat
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100">

      {/* Header */}
      <div className="bg-blue-600 text-white p-4 text-center font-semibold shadow-md">
        Chat App
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {chat.map((msg, i) => {
          const isMe = msg.senderId === senderId;

          return (
            <div
              key={i}
              className={`flex ${isMe ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`px-4 py-2 max-w-xs md:max-w-md rounded-2xl text-sm shadow ${
                  isMe
                    ? "bg-blue-600 text-white rounded-br-none"
                    : "bg-white text-gray-800 rounded-bl-none"
                }`}
              >
                {msg.message}
              </div>
            </div>
          );
        })}
      </div>

      {/* Input Box */}
      <div className="bg-white border-t p-3 flex gap-2">
        <input
          className="flex-1 border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type a message..."
        />

        <button
          onClick={sendMessage}
          className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 transition"
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default Chat;