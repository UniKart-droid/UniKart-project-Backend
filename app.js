dotenv.config();
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db/connect.js";

import router from "./routes/userRoutes.js";
import itemRoutes from "./routes/itemRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import notesRoutes from "./routes/notesRoutes.js";
import opportunityRoutes from "./routes/opportunityRoutes.js";
import noticeRoutes from "./routes/noticeRoutes.js";

import http from "http";
import { Server } from "socket.io";

import Chat from "./model/Chat.js";
import Message from "./model/Message.js";

const app = express();

/* ---------------------------
    MIDDLEWARE
---------------------------- */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ---------------------------
    STATIC FILES
---------------------------- */
app.use("/uploads", express.static("uploads"));

/* ---------------------------
    ROUTES
---------------------------- */
app.use("/api/user", router);
app.use("/api/items", itemRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/notes", notesRoutes);
app.use("/api/opportunities", opportunityRoutes);
app.use("/api/notices", noticeRoutes);

/* ---------------------------
    HEALTH CHECK
---------------------------- */
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running fine",
  });
});

/* ---------------------------
    CREATE HTTP SERVER
---------------------------- */
const server = http.createServer(app);

/* ---------------------------
    SOCKET SETUP
---------------------------- */
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", 
    methods: ["GET", "POST"],
  },
});

/* ---------------------------
    HELPER
---------------------------- */
const getConsistentChatId = (id1, id2) => {
  if (!id1 || !id2) return null;
  return [id1.toString(), id2.toString()].sort().join("_");
};

/* ---------------------------
    SOCKET CONNECTION
---------------------------- */
io.on("connection", (socket) => {

  /* JOIN CHAT ROOM */
  socket.on("join_chat", (chatId) => {
    if (!chatId) return;
    socket.join(chatId);
  });

  /* SEND MESSAGE */
  socket.on("send_message", async (data) => {
    try {
      const { sender, receiver, message, chatId } = data;

      // Consistent ID generator logic
      const finalChatId = chatId || getConsistentChatId(sender, receiver);

      /* VALIDATION */
      if (!finalChatId || !sender || !receiver || !message) return;

      /* ENSURE CHAT EXISTS */
      let chat = await Chat.findOne({ chatId: finalChatId });

      if (!chat) {
        chat = await Chat.create({
          chatId: finalChatId,
          members: [sender, receiver],
          lastMessage: message,
        });
      }

      const savedMessage = await Message.create({
        chatId: finalChatId,
        sender,
        receiver,
        text: message, 
      });

      /* UPDATE CHAT COLLECTION */
      chat.lastMessage = message;
      chat.updatedAt = Date.now();
      await chat.save();

      io.to(finalChatId).emit("receive_message", {
        _id: savedMessage._id,
        chatId: finalChatId,
        sender: savedMessage.sender,
        receiver: savedMessage.receiver,
        text: savedMessage.text, 
        createdAt: savedMessage.createdAt,
      });

    } catch (error) {
      // Logic unchanged, only logs removed
    }
  });

  socket.on("disconnect", () => {
    // Silent disconnect
  });
});

/* ---------------------------
    START SERVER
---------------------------- */
const PORT = process.env.PORT || 8000;

const start = async () => {
  try {
    await connectDB();
    
    server.listen(PORT, () => {
      // Server starting message can be kept for basic monitoring
      console.log(` Server running on port: ${PORT}`);
    });
  } catch (error) {
    process.exit(1);
  }
};

start();