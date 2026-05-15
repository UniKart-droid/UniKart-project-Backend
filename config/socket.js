import { Server } from "socket.io";
import Chat from "../models/Chat.js";

let io;

export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "https://uni-kart-project.vercel.app", 
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log(" User connected:", socket.id);

    socket.on("join_user", (userId) => {
      socket.join(userId);
      console.log(`User joined room: ${userId}`);
    });


    socket.on("send_message", async (data) => {
      /*
        data = {
          sender,
          receiver,
          message
        }
      */

      try {
        // 1. Save message in DB
        const newMessage = await Chat.create({
          sender: data.sender,
          receiver: data.receiver,
          message: data.message,
        });

        // 2. Send message to receiver ONLY
        io.to(data.receiver).emit("receive_message", newMessage);

        // 3. Optional: send back to sender (for sync UI)
        io.to(data.sender).emit("message_sent", newMessage);
      } catch (error) {
        console.log("Socket message error:", error);
      }
    });

    /* ---------------------------
       TYPING INDICATOR (optional feature)
    ---------------------------- */
    socket.on("typing", (data) => {
      socket.to(data.receiver).emit("typing", {
        sender: data.sender,
      });
    });

    /* ---------------------------
       DISCONNECT
    ---------------------------- */
    socket.on("disconnect", () => {
      console.log("🔴 User disconnected:", socket.id);
    });
  });
};

/* optional export */
export const getIO = () => io;