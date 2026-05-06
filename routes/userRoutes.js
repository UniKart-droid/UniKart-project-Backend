import express from "express";
import {
  signupUser,
  loginUser,
  forgotPassword,
  resetPassword,
  sendOtp,
  // Naye functions jo controllers mein add kiye gaye hain
  getUserById,
  updateUser
} from "../controllers/userController.js";

import multer from "multer";
import path from "path";
import { verifyToken } from "../middleware/authMiddleware.js";
import User from "../model/User.js";

import { getSellerProfile } from "../controllers/getSellerProfile.js";

const router = express.Router();

// ==========================
//  FILE UPLOAD SETUP
// ==========================
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// ==========================
//  AUTH ROUTES
// ==========================

router.post("/send-otp", sendOtp);

router.post(
  "/signup",
  upload.single("id_card"),
  signupUser
);

router.post("/login", loginUser);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);

// ==========================
//  PROTECTED PROFILE
// ==========================

router.get("/profile", verifyToken, (req, res) => {
  res.status(200).json({
    message: "Protected route accessed",
    user: req.user
  });
});

// ==========================
//  SELLER PROFILE ROUTE 
// ==========================

router.get("/seller/:id", getSellerProfile);

// ==========================
//  ADMIN ROUTES 
// ==========================

// Pending users
router.get("/pending-users", async (req, res) => {
  try {
    const users = await User.find({ isApproved: false });
    res.status(200).json({
      count: users.length,
      users
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching users" });
  }
});

// Approve user
router.patch("/approve-user/:id", async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isApproved: true },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      message: "User approved",
      user
    });
  } catch (error) {
    res.status(500).json({ message: "Error approving user" });
  }
});

/**
 * REJECT USER FIX: 
 * Frontend axios.patch use kar raha hai.
 */
router.patch("/reject-user/:id", async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({ message: "User rejected successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error processing rejection" });
  }
});

// Approved students
router.get("/approved-students", async (req, res) => {
  try {
    const students = await User.find({
      role: "student",
      isApproved: true
    });

    res.status(200).json({
      count: students.length,
      students 
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching students" });
  }
});

// Approved teachers
router.get("/approved-teachers", async (req, res) => {
  try {
    const teachers = await User.find({
      role: "teacher",
      isApproved: true
    });

    res.status(200).json({
      count: teachers.length,
      teachers
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching teachers" });
  }
});

// ==========================================
//  NEW: VIEW & EDIT ROUTES (FOR DASHBOARD)
// ==========================================

// Teacher ya Student ki details dekhne ke liye (View Button)
router.get("/user/:id", getUserById);

// Teacher ya Student ka data update karne ke liye (Edit Button)
router.put("/update-user/:id", updateUser);

export default router;