import React, { useEffect, useState, useRef } from "react";
import socket from "../socket";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";

const Chat = () => {
  // Auth State
  const [user, setUser] = useState(null);
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [isResetMode, setIsResetMode] = useState(false);
  
  // Dashboard State
  const [allUsers, setAllUsers] = useState([]);
  const [myRooms, setMyRooms] = useState([]);
  const [activeTab, setActiveTab] = useState(null); // { type: 'user', id: '...', name: '...' } or { type: 'room', id: '...', name: '...' }
  const [activeRoomDetails, setActiveRoomDetails] = useState(null);
  const [searchPhoneNumber, setSearchPhoneNumber] = useState("");
  const [userSearchMessage, setUserSearchMessage] = useState("");
  
  // Chat State
  const [chat, setChat] = useState([]);
  const [message, setMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState(null);
  const messagesEndRef = useRef(null);

  // WebRTC State
  const [incomingCall, setIncomingCall] = useState(null);
  const [callStatus, setCallStatus] = useState("idle");
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isVideoCall, setIsVideoCall] = useState(false);
  const peerRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pendingCandidates = useRef([]);
  const configuration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, callStatus]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, callStatus]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chat]);

  // Handle Login/Register
  const handleAuth = async () => {
    if (!phoneNumber || !password) return;
    try {
      if (isResetMode) {
        await axios.post(`${BACKEND_URL}/api/users/reset-password`, { phoneNumber, name, newPassword: password });
        alert("Password updated. Please login now.");
        setIsResetMode(false);
        setIsRegisterMode(false);
        setPassword("");
        return;
      }

      if (isRegisterMode) {
         const res = await axios.post(`${BACKEND_URL}/api/users/register`, { phoneNumber, name, password });
         setUser(res.data);
         fetchDashboardData(res.data.phoneNumber);
      } else {
         const res = await axios.post(`${BACKEND_URL}/api/users/login`, { phoneNumber, password });
         setUser(res.data);
         fetchDashboardData(res.data.phoneNumber);
      }
    } catch (err) {
      alert("Auth Error: " + (err.response?.data?.message || err.message));
    }
  };

  const fetchDashboardData = async (phone) => {
    try {
      const usersRes = await axios.get(`${BACKEND_URL}/api/users/all`);
      setAllUsers(usersRes.data.filter(u => u.phoneNumber !== phone));
      
      const roomsRes = await axios.get(`${BACKEND_URL}/api/rooms/${phone}`);
      setMyRooms(roomsRes.data);

      const roomIds = roomsRes.data.map(r => r._id);
      socket.emit("join", { userId: phone, roomIds });
    } catch (err) {
      console.error(err);
    }
  };

  // Open Chat
  const openChat = async (type, id, name) => {
    if (type === "user" && !id) {
      alert("This user does not have a valid phone number for direct messaging.");
      return;
    }
    setActiveTab({ type, id, name });
    if (type === "room") {
      try {
        const roomRes = await axios.get(`${BACKEND_URL}/api/rooms/details/${id}`);
        setActiveRoomDetails(roomRes.data);
      } catch (error) {
        console.error("Error fetching room details", error);
        setActiveRoomDetails(null);
      }
    } else {
      setActiveRoomDetails(null);
    }
    
    try {
      let url = "";
      if (type === "user") {
        url = `${BACKEND_URL}/api/messages/${user.phoneNumber}/${id}`;
        await axios.post(`${BACKEND_URL}/api/messages/mark-read`, { senderId: id, receiverId: user.phoneNumber });
      } else {
        url = `${BACKEND_URL}/api/rooms/messages/${id}`;
      }
      const res = await axios.get(url);
      setChat(res.data);
    } catch (error) {
      console.error("Error fetching history", error);
    }
  };

  // WebRTC Call Logic
  const startCall = async (video) => {
    setIsVideoCall(video);
    setCallStatus("calling");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video, audio: true });
      setLocalStream(stream);

      const peer = new RTCPeerConnection(configuration);
      peerRef.current = peer;

      stream.getTracks().forEach((track) => peer.addTrack(track, stream));

      peer.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
      };

      peer.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("ice_candidate", { candidate: event.candidate, receiverId: activeTab.id, senderId: user.phoneNumber });
        }
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      socket.emit("call_user", {
        receiverId: activeTab.id,
        signalData: offer,
        senderId: user.phoneNumber,
        isVideo: video
      });
    } catch (err) {
      console.error("Failed to start call", err);
      setCallStatus("idle");
    }
  };

  const acceptCall = async () => {
    if (!incomingCall) return;
    setCallStatus("connected");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: incomingCall.isVideo, audio: true });
      setLocalStream(stream);

      const peer = new RTCPeerConnection(configuration);
      peerRef.current = peer;

      stream.getTracks().forEach((track) => peer.addTrack(track, stream));

      peer.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
      };

      peer.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("ice_candidate", { candidate: event.candidate, receiverId: incomingCall.senderId, senderId: user.phoneNumber });
        }
      };

      await peer.setRemoteDescription(new RTCSessionDescription(incomingCall.signal));
      
      for (const c of pendingCandidates.current) {
        await peer.addIceCandidate(new RTCIceCandidate(c));
      }
      pendingCandidates.current = [];

      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      socket.emit("answer_call", {
        signalData: answer,
        senderId: incomingCall.senderId
      });
    } catch (err) {
      console.error("Failed to accept call", err);
      setCallStatus("idle");
    }
  };

  const endCall = () => {
    setCallStatus("idle");
    setIncomingCall(null);
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }
    setRemoteStream(null);
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }
    pendingCandidates.current = [];
  };

  const terminateCall = () => {
    let otherId = null;
    if (incomingCall) otherId = incomingCall.senderId;
    else if (activeTab && activeTab.type === "user") otherId = activeTab.id;

    if (otherId) {
      socket.emit("end_call", { receiverId: otherId, senderId: user.phoneNumber });
    }
    endCall();
  };

  const handleSearchUserByPhone = async () => {
    const phone = searchPhoneNumber.trim();
    if (!phone) {
      setUserSearchMessage("Please enter a phone number.");
      return;
    }

    try {
      const res = await axios.get(`${BACKEND_URL}/api/users/by-phone/${encodeURIComponent(phone)}`);
      const foundUser = res.data;

      if (foundUser.phoneNumber === user.phoneNumber) {
        setUserSearchMessage("This is your own number.");
        return;
      }

      if (!allUsers.some((u) => u.phoneNumber === foundUser.phoneNumber)) {
        setAllUsers((prev) => [...prev, foundUser]);
      }

      setUserSearchMessage(`User found: ${foundUser.name || foundUser.phoneNumber}`);
      openChat("user", foundUser.phoneNumber, foundUser.name || foundUser.phoneNumber);
    } catch (error) {
      if (error.response?.status === 404) {
        setUserSearchMessage("This phone number is not registered.");
      } else {
        setUserSearchMessage("Unable to search right now. Please try again.");
      }
    }
  };

  // Create Group
  const handleCreateGroup = async () => {
    const groupName = prompt("Enter Group Name:");
    if (!groupName) return;
    try {
      const res = await axios.post(`${BACKEND_URL}/api/rooms/create`, { name: groupName, members: [user.phoneNumber] });
      setMyRooms([...myRooms, res.data]);
      socket.emit("join_room", res.data._id);
    } catch(err) {
      console.error(err);
    }
  };

  // Send Message
  const sendMessage = () => {
    if (!message.trim() || !activeTab) return;

    socket.emit("send_message", {
      message,
      senderId: user.phoneNumber,
      receiverId: activeTab.type === "user" ? activeTab.id : null,
      roomId: activeTab.type === "room" ? activeTab.id : null,
    });

    if (typingTimeout) clearTimeout(typingTimeout);
    socket.emit("stop_typing", { senderId: user.phoneNumber, receiverId: activeTab.id }); // Using ID for simplicity on both routing
    setMessage("");
  };

  const handleTyping = (e) => {
    setMessage(e.target.value);
    if (!activeTab) return;
    
    socket.emit("typing", { senderId: user.phoneNumber, receiverId: activeTab.id });
    
    if (typingTimeout) clearTimeout(typingTimeout);
    
    const timeout = setTimeout(() => {
      socket.emit("stop_typing", { senderId: user.phoneNumber, receiverId: activeTab.id });
    }, 2000);
    setTypingTimeout(timeout);
  };

  useEffect(() => {
    const handleReceiveMessage = (data) => {
      // Validate if message belongs to current active tab
      if (!activeTab) return;
      if (activeTab.type === "room" && data.roomId === activeTab.id) {
        setChat((prev) => [...prev, data]);
      } else if (activeTab.type === "user" && ((data.senderId === activeTab.id) || (data.senderId === user.phoneNumber && data.receiverId === activeTab.id))) {
        setChat((prev) => [...prev, data]);
      }
    };

    const handleAddedToGroup = (room) => {
      setMyRooms((prev) => {
        if (!prev.find(r => r._id === room._id)) {
          return [...prev, room];
        }
        return prev;
      });
      socket.emit("join_room", room._id);
    };

    const handleRoomUpdated = (room) => {
      setMyRooms((prev) => prev.map((r) => (r._id === room._id ? room : r)));
      if (activeTab && activeTab.type === "room" && activeTab.id === room._id) {
        setActiveRoomDetails(room);
      }
    };

    const handleIncomingCall = (data) => {
      setIncomingCall(data);
      setCallStatus("ringing");
      setIsVideoCall(data.isVideo);
    };

    const handleCallAccepted = async (signalData) => {
      setCallStatus("connected");
      if (peerRef.current) {
        await peerRef.current.setRemoteDescription(new RTCSessionDescription(signalData));
        for (const c of pendingCandidates.current) {
          await peerRef.current.addIceCandidate(new RTCIceCandidate(c));
        }
        pendingCandidates.current = [];
      }
    };

    const handleIceCandidate = async (data) => {
      if (peerRef.current) {
        if (peerRef.current.remoteDescription) {
          await peerRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        } else {
          pendingCandidates.current.push(data.candidate);
        }
      } else {
        pendingCandidates.current.push(data.candidate);
      }
    };

    const handleCallEnded = () => {
      endCall();
    };

    socket.on("receive_message", handleReceiveMessage);
    socket.on("typing", (id) => { if (activeTab && id === activeTab.id) setIsTyping(true); });
    socket.on("stop_typing", (id) => { if (activeTab && id === activeTab.id) setIsTyping(false); });
    socket.on("added_to_group", handleAddedToGroup);
    socket.on("room_updated", handleRoomUpdated);
    
    socket.on("incoming_call", handleIncomingCall);
    socket.on("call_accepted", handleCallAccepted);
    socket.on("res_ice_candidate", handleIceCandidate);
    socket.on("call_ended", handleCallEnded);

    return () => {
      socket.off("receive_message", handleReceiveMessage);
      socket.off("typing");
      socket.off("stop_typing");
      socket.off("added_to_group", handleAddedToGroup);
      socket.off("room_updated", handleRoomUpdated);
      socket.off("incoming_call", handleIncomingCall);
      socket.off("call_accepted", handleCallAccepted);
      socket.off("res_ice_candidate", handleIceCandidate);
      socket.off("call_ended", handleCallEnded);
    };
    
   // eslint-disable-next-line react-hooks/exhaustive-deps



  }, [activeTab, user]);

  // LOGIN SCREEN
  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100">
        <div className="w-full max-w-md bg-white shadow-lg rounded-2xl p-6 space-y-4">
          <h1 className="text-2xl font-bold text-center text-blue-600">
            {isResetMode ? "Reset Password" : (isRegisterMode ? "Register" : "Login")}
          </h1>
          {(isRegisterMode || isResetMode) && (
            <input
              placeholder="Your Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400"
            />
          )}
          <input
            placeholder="Phone Number (e.g. 555-1234)"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400"
          />
          <input
            type="password"
            placeholder={isResetMode ? "Create New Password (min 6 chars)" : "Password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400"
          />
          <button
            onClick={handleAuth}
            className={`w-full transition text-white py-2 rounded-lg font-bold ${isResetMode ? "bg-yellow-600 hover:bg-yellow-700" : (isRegisterMode ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700")}`}
          >
            {isResetMode ? "Update Password" : (isRegisterMode ? "Create Account" : "Login")}
          </button>
          <div className="flex justify-between text-xs">
            <button
              onClick={() => {
                setIsRegisterMode((prev) => !prev);
                setIsResetMode(false);
              }}
              className="text-blue-600 hover:underline"
            >
              {isRegisterMode ? "Have an account? Login" : "New user? Register"}
            </button>
            <button
              onClick={() => {
                setIsResetMode((prev) => !prev);
                setIsRegisterMode(false);
              }}
              className="text-red-500 hover:underline"
            >
              Forgot password?
            </button>
          </div>
        </div>
      </div>
    );
  }

  // DASHBOARD LAYOUT
  return (
    <div className="flex h-screen bg-gray-100 text-gray-800">
      {/* Sidebar */}
      <div className="w-1/3 md:w-1/4 bg-white border-r flex flex-col">
        <div className="bg-blue-600 text-white p-4 font-semibold shadow flex flex-col">
          <div className="flex justify-between items-center">
             <span className="text-xl font-extrabold tracking-wider drop-shadow-sm">Chat App</span>
             <button onClick={() => {setUser(null); setActiveTab(null);}} className="text-xs bg-red-500 px-2 py-1 rounded">Logout</button>
          </div>
          <span className="text-[10px] tracking-widest text-blue-200 uppercase opacity-90 font-medium">By Pankaj Bhandari</span>
          <div className="mt-2 text-sm opacity-80">📱 {user.phoneNumber} <br/><span className="text-xs">({user.name})</span></div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2">
          {/* Group Chats */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2 px-2">
               <h2 className="text-xs font-bold text-gray-400 uppercase">My Groups</h2>
               <button onClick={handleCreateGroup} className="text-blue-500 text-xs">+ New Group</button>
            </div>
            {myRooms.map(r => (
              <div 
                key={r._id} 
                onClick={() => openChat("room", r._id, r.name)}
                className={`p-3 rounded-lg cursor-pointer transition ${activeTab?.id === r._id ? 'bg-blue-100 font-semibold' : 'hover:bg-gray-50'}`}
              >
                👥 {r.name}
              </div>
            ))}
          </div>

          <hr className="my-2" />

          {/* 1-on-1 Chats */}
          <div>
            <h2 className="text-xs font-bold text-gray-400 uppercase mb-2 px-2">Direct Messages</h2>
            <div className="px-2 mb-2 space-y-2">
              <input
                value={searchPhoneNumber}
                onChange={(e) => {
                  setSearchPhoneNumber(e.target.value);
                  setUserSearchMessage("");
                }}
                onKeyDown={(e) => e.key === "Enter" && handleSearchUserByPhone()}
                placeholder="Search by phone number"
                className="w-full border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <button
                onClick={handleSearchUserByPhone}
                className="w-full text-xs bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg transition"
              >
                Search User
              </button>
              {userSearchMessage && (
                <div className={`text-[11px] ${userSearchMessage.includes("not registered") ? "text-red-500" : "text-green-600"}`}>
                  {userSearchMessage}
                </div>
              )}
            </div>
            {allUsers.filter(u => u.phoneNumber).map(u => (
              <div 
                key={u._id} 
                onClick={() => openChat("user", u.phoneNumber, u.name || u.phoneNumber)}
                className={`p-3 rounded-lg cursor-pointer transition ${activeTab?.id === u.phoneNumber ? 'bg-blue-100 font-semibold' : 'hover:bg-gray-50'}`}
              >
                👤 {u.name || u.phoneNumber}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-gray-50 relative overflow-hidden">
        
        {/* INCOMING CALL OVERLAY */}
        {callStatus === "ringing" && incomingCall && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-2xl shadow-2xl flex flex-col items-center animate-pulse">
              <h2 className="text-xl font-bold mb-2">Incoming {incomingCall.isVideo ? "Video" : "Voice"} Call</h2>
              <p className="mb-6 font-medium text-gray-700">From: {incomingCall.senderId}</p>
              <div className="flex gap-4">
                <button onClick={acceptCall} className="bg-green-500 hover:bg-green-600 text-white px-8 py-2 rounded-full font-semibold transition">Accept</button>
                <button onClick={() => { terminateCall(); setIncomingCall(null); setCallStatus("idle"); }} className="bg-red-500 hover:bg-red-600 text-white px-8 py-2 rounded-full font-semibold transition">Reject</button>
              </div>
            </div>
          </div>
        )}

        {/* ACTIVE CALL OVERLAY */}
        {(callStatus === "calling" || callStatus === "connected") && (
          <div className="absolute inset-0 bg-gray-900 flex flex-col items-center justify-center z-40">
            <h2 className="text-white text-xl mb-6 font-semibold">
              {callStatus === "calling" ? "Calling..." : "Call Connected"}
            </h2>
            <div className="flex flex-col md:flex-row gap-6 w-full justify-center items-center mb-8">
              {/* Local Video */}
              <div className="relative bg-black rounded-xl overflow-hidden shadow-lg w-64 h-48 flex items-center justify-center">
                <video ref={localVideoRef} autoPlay playsInline muted className={`w-full h-full object-cover ${!isVideoCall && 'hidden'}`} />
                {!isVideoCall && <div className="text-white text-4xl">🎙️ You</div>}
                <div className="absolute bottom-2 left-2 text-white text-xs bg-black/50 px-2 py-1 rounded">You</div>
              </div>
              
              {/* Remote Video */}
              {callStatus === "connected" && (
                <div className="relative bg-black rounded-xl overflow-hidden shadow-lg w-64 h-48 flex items-center justify-center">
                  <video ref={remoteVideoRef} autoPlay playsInline className={`w-full h-full object-cover ${!isVideoCall && 'hidden'}`} />
                  {!isVideoCall && <div className="text-white text-4xl">📞 Remote</div>}
                  <div className="absolute bottom-2 left-2 text-white text-xs bg-black/50 px-2 py-1 rounded">Remote</div>
                </div>
              )}
            </div>
            <button onClick={terminateCall} className="bg-red-600 hover:bg-red-700 text-white px-10 py-3 rounded-full font-bold shadow-xl transition">
              End Call
            </button>
          </div>
        )}

        {activeTab ? (
          <>
            {/* Header */}
            <div className="bg-white border-b p-4 font-semibold flex justify-between items-center z-10 shadow-sm text-blue-600">
               <div>
                 {activeTab.type === "room" ? "👥 " : "👤 "}
                 {activeTab.name}
               </div>
               <div className="flex gap-3 items-center">
                 {activeTab.type === "user" && (
                   <div className="flex gap-2 mr-2">
                     <button onClick={() => startCall(false)} className="bg-green-100 hover:bg-green-200 text-green-700 px-3 py-1 rounded shadow-sm transition text-sm flex items-center gap-1">📞 Voice</button>
                     <button onClick={() => startCall(true)} className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded shadow-sm transition text-sm flex items-center gap-1">📹 Video</button>
                   </div>
                 )}
                 {activeTab.type === "room" && (
                   <button 
                   onClick={async () => {
                     const ans = prompt("Enter the Phone Number of the user to invite:");
                     if (ans) {
                       try {
                          const addRes = await axios.post(`${BACKEND_URL}/api/rooms/add-member`, { roomId: activeTab.id, phoneNumber: ans });
                          const updatedRoom = addRes.data?.room;
                          if (updatedRoom) {
                            setMyRooms((prev) => prev.map((room) => (room._id === updatedRoom._id ? updatedRoom : room)));
                            setActiveRoomDetails(updatedRoom);
                            socket.emit("group_updated", { room: updatedRoom, addedUserId: ans });
                          }
                          alert("User added to group successfully!");
                       } catch(e) {
                          alert(e.response?.data?.message || "Error adding user");
                       }
                     }
                   }} 
                   className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded shadow-sm transition"
                 >
                   + Add by Phone
                 </button>
                 )}
               </div>
            </div>
            {activeTab.type === "room" && activeRoomDetails && (
              <div className="bg-blue-50 border-b px-4 py-2 text-xs text-blue-800">
                <div className="font-semibold">Total Members: {activeRoomDetails.memberCount || 0}</div>
                <div className="mt-1">
                  {(activeRoomDetails.memberDetails || []).map((member) => (
                    <div key={member.phoneNumber}>
                      {member.name} ({member.phoneNumber})
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 relative">
              {chat.map((msg, i) => {
                const isMe = msg.senderId === user.phoneNumber;
                return (
                  <div key={msg._id || i} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                    <div className="flex flex-col max-w-xs md:max-w-md">
                      {/* Show sender name in groups if not me */}
                      {activeTab.type === "room" && !isMe && (
                        <span className="text-[10px] text-gray-400 ml-1 mb-1">{msg.senderId}</span>
                      )}
                      <div className={`px-4 py-2 rounded-2xl text-sm shadow inline-block break-words ${isMe ? "bg-blue-600 text-white rounded-br-none" : "bg-white text-gray-800 rounded-bl-none"}`}>
                        <span>{msg.message}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="px-4 py-2 rounded-2xl text-sm shadow bg-white text-gray-500 rounded-bl-none animate-pulse">typing...</div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Box */}
            <div className="bg-white border-t p-3 flex gap-2">
              <input
                className="flex-1 border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={message}
                onChange={handleTyping}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder="Type a message..."
              />
              <button onClick={sendMessage} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg transition">Send</button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-gray-400">
            Select a group or user to start chatting
          </div>
        )}
      </div>
    </div>
  );
};

export default Chat;
