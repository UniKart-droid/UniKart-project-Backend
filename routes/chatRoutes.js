import express from "express";
import mongoose from "mongoose";
import Chat from "../model/Chat.js";
import Message from "../model/Message.js";
import User from "../model/User.js";

const router = express.Router();

const getConsistentChatId = (id1, id2) => {
  if (!id1 || !id2) return null;
  return [id1.toString(), id2.toString()].sort().join("_");
};

/* ---------------------------
    SAVE MESSAGE API
---------------------------- */
router.post("/send", async (req, res) => {
  try {
    const { chatId, sender, receiver, message } = req.body;

    if (!sender || !message) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const finalChatId = chatId || getConsistentChatId(sender, receiver);

    // 1. Ensure chat exists
    let chat = await Chat.findOne({ chatId: finalChatId });

    if (!chat) {
      chat = await Chat.create({
        chatId: finalChatId,
        members: [sender, receiver],
        lastMessage: ""
      });
    }

    // 2. Save message in Message collection 
   
    const newMessage = await Message.create({
      chatId: finalChatId,
      sender,
      text: message, 
    });

    // 3. Update chat last message and timestamp
    chat.lastMessage = message;
    chat.lastMessageSender = sender;
    chat.updatedAt = Date.now();
    await chat.save();

    res.status(201).json({
      success: true,
      data: newMessage,
    });

  } catch (error) {
    console.error(" Chat send error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error while sending message",
    });
  }
});

/* ---------------------------
    CREATE / GET CHAT
---------------------------- */
router.post("/create", async (req, res) => {
  try {
    const { sender, receiver } = req.body;

    if (!sender || !receiver) {
      return res.status(400).json({
        success: false,
        message: "Both sender and receiver IDs are required",
      });
    }

    const consistentId = getConsistentChatId(sender, receiver);

    let chat = await Chat.findOne({ chatId: consistentId });

    if (!chat) {
      chat = await Chat.create({
        chatId: consistentId,
        members: [sender, receiver],
        lastMessage: ""
      });
    }

    res.status(200).json({
      success: true,
      chatId: consistentId,
      data: chat,
    });

  } catch (error) {
    console.error(" Create chat error:", error);
    res.status(500).json({
      success: false,
      message: "Could not initialize chat session",
    });
  }
});

/* ---------------------------
    GET USER INFO
---------------------------- */
router.get("/user/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid User ID format"
      });
    }

    const user = await User.findById(id).select("name email profilePic");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });

  } catch (error) {
    console.error(" User fetch error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching user details"
    });
  }
});

/* ---------------------------
    GET CHAT MESSAGES
---------------------------- */
router.get("/messages/:chatId", async (req, res) => {
  try {
    const { chatId } = req.params;

    // String based chatId query
    const messages = await Message.find({ chatId })
      .sort({ createdAt: 1 })
      .lean();

    res.status(200).json({
      success: true,
      count: messages.length,
      data: messages,
    });

  } catch (error) {
    console.error(" Fetch messages error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve chat history",
    });
  }
});

/* ---------------------------
    GET USER CHATS (ChatList)
---------------------------- */
router.get("/user-chats/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid User ID format"
      });
    }

    const chats = await Chat.find({
      members: { $in: [userId] }
    }).sort({ updatedAt: -1 });

    const chatList = await Promise.all(
      chats.map(async (chat) => {
        const otherUserId = chat.members.find(
          id => id.toString() !== userId
        );

        let otherUser = null;
        if (otherUserId) {
          otherUser = await User.findById(otherUserId).select("name profilePic");
        }

        return {
          chatId: chat.chatId,
          otherUserId,
          otherUserName: otherUser?.name || "Unknown User",
          profilePic: otherUser?.profilePic || null,
          lastMessage: chat.lastMessage,
          lastMessageTime: chat.updatedAt,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: chatList
    });

  } catch (error) {
    console.error(" Fetch user-chats error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching chats"
    });
  }
});

export default router;