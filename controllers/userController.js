import User from "../model/User.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import crypto from "crypto";

// ==========================
//  HELPER: GET TRANSPORTER
// ==========================
const getTransporter = () => {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
  });
};

// ==========================
//  SEND OTP CONTROLLER
// ==========================
export const sendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const existingUser = await User.findOne({ email });
    if (existingUser && existingUser.password) {
      return res.status(400).json({ message: "User already exists with this email" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpire = Date.now() + 5 * 60 * 1000;

    await User.findOneAndUpdate(
      { email },
      { otp, otpExpire, name: existingUser?.name || "TempUser" },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    const transporter = getTransporter();

    await transporter.sendMail({
      from: `"UniKart Verification" <${process.env.EMAIL}>`,
      to: email,
      subject: "Your UniKart Verification Code",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee;">
          <h2 style="color: #333;">UniKart Verification</h2>
          <p>Your OTP for registration is:</p>
          <h1 style="color: #1f2937; letter-spacing: 5px;">${otp}</h1>
          <p>This code is valid for <b>5 minutes</b>.</p>
        </div>
      `,
    });

    res.status(200).json({ success: true, message: "OTP sent to your email" });
  } catch (error) {
    console.error(" SEND OTP ERROR:", error);
    res.status(500).json({ success: false, message: "Error sending OTP", error: error.message });
  }
};

// ==========================
//  WELCOME EMAIL FUNCTION
// ==========================
const sendWelcomeEmail = async (email, name) => {
  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"UniKart Team" <${process.env.EMAIL}>`,
      to: email,
      subject: "Welcome to UniKart | Your Account is Ready",
      html: `
        <div style="font-family: Arial, sans-serif; background-color:#f4f4f4; padding:20px;">
          <div style="max-width:600px; margin:auto; background:#ffffff; border-radius:10px; overflow:hidden;">
            <div style="background:#1f2937; padding:20px; text-align:center;">
              <h1 style="color:#ffffff; margin:0;">UniKart</h1>
              <p style="color:#d1d5db;">Smart Learning Platform</p>
            </div>
            <div style="padding:30px; color:#333;">
              <h2>Hello ${name},</h2>
              <p>Welcome to <b>UniKart</b>! We're excited to have you on board.</p>
              <p>Your account has been created successfully and is pending admin approval.</p>
              <div style="margin:20px 0; padding:15px; background:#f3f4f6; border-left:4px solid #1f2937;">
                <p><b>Email:</b> ${email}</p>
              </div>
              <a href="${process.env.FRONTEND_URL}/login"
                 style="display:inline-block;margin-top:20px;padding:12px 20px;
                 background:#1f2937;color:#fff;text-decoration:none;border-radius:5px;">
                 Go to Login
              </a>
            </div>
          </div>
        </div>
      `,
    });
  } catch (error) {
    console.log(" Welcome Email failed:", error.message);
  }
};

// ==========================
//  SIGNUP CONTROLLER
// ==========================
export const signupUser = async (req, res) => {
  try {
    const { name, email, password, confirm_password, sel_role, teacher_id, admin_id, otp } = req.body;

    if (!name || !email || !password || !confirm_password || !sel_role || !otp) {
      return res.status(400).json({ message: "All required fields must be filled" });
    }

    const userWithOtp = await User.findOne({ email });
    if (!userWithOtp || userWithOtp.otp !== otp || userWithOtp.otpExpire < Date.now()) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (password !== confirm_password) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const updateFields = {
      name,
      email,
      password: hashedPassword,
      role: sel_role,
      isApproved: false, 
    };

    if (sel_role === "teacher") {
      if (!teacher_id) return res.status(400).json({ message: "Teacher ID is required" });
      updateFields.teacher_id = teacher_id;
    } else if (sel_role === "admin") {
      if (!admin_id) return res.status(400).json({ message: "Admin ID is required" });
      updateFields.admin_id = admin_id;
    } else if (sel_role === "student") {
      if (!req.file) return res.status(400).json({ message: "ID Card is required" });
      updateFields.id_card = req.file.path.replace(/\\/g, "/");
    }

    const newUser = await User.findOneAndUpdate(
      { email }, 
      { $set: updateFields, $unset: { otp: 1, otpExpire: 1 } }, 
      { new: true }
    );

    if (!newUser) return res.status(400).json({ message: "Signup failed." });

    sendWelcomeEmail(newUser.email, newUser.name);

    return res.status(201).json({
      success: true,
      message: "Signup successful. Wait for admin approval",
      user: { id: newUser._id, name: newUser.name, role: newUser.role, isApproved: newUser.isApproved }
    });

  } catch (error) {
    console.error("🔥 SIGNUP ERROR:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ==========================
//  LOGIN CONTROLLER
// ==========================
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });


    if (!user.isApproved) {
      return res.status(403).json({ message: "Your account is pending admin approval" });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET || "fallback_secret",
      { expiresIn: "1d" }
    );

    res.status(200).json({
      success: true,
      token,
      user: { id: user._id, name: user.name, role: user.role, isApproved: user.isApproved }
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ==========================
//  FORGOT & RESET PASSWORD
// ==========================
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;
    await user.save();

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;
    const transporter = getTransporter();

    await transporter.sendMail({
      from: `"UniKart Team" <${process.env.EMAIL}>`,
      to: user.email,
      subject: "Reset Your UniKart Password ",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>Hello ${user.name},</p>
          <p>You requested a password reset. Please click the button below to set a new password:</p>
          <a href="${resetUrl}" 
             style="display: inline-block; padding: 12px 25px; background-color: #1f2937; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 10px 0;">
             Reset Password
          </a>
          <p style="margin-top: 20px; font-size: 12px; color: #666;">
            If the button doesn't work, copy and paste this link into your browser:<br>
            <span style="color: #2563eb;">${resetUrl}</span>
          </p>
          <p>This link is valid for 10 minutes.</p>
        </div>
      `,
    });

    res.status(200).json({ message: "Reset link sent to email" });
  } catch (error) {
    console.error(" FORGOT PASSWORD ERROR:", error);
    res.status(500).json({ message: "Failed to send email. Check your internet connection." });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) return res.status(400).json({ message: "Invalid or expired token" });

    user.password = await bcrypt.hash(password, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// ==========================================
//  ADMIN: DASHBOARD CONTROLLERS
// ==========================================

// 1. Fetch Approved Students for Dashboard
export const getApprovedStudents = async (req, res) => {
  try {
    const students = await User.find({ role: "student", isApproved: true });
    res.status(200).json({ success: true, students });
  } catch (error) {
    res.status(500).json({ message: "Error fetching approved students", error: error.message });
  }
};

// 2. Reject/Remove User (PATCH) - Using findByIdAndDelete to fully remove if needed
export const rejectUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByIdAndDelete(id);
    
    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json({ success: true, message: "User removed successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error rejecting user", error: error.message });
  }
};

// 3. GET SINGLE USER (For "View" button)
export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password -otp");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json({ success: true, user });
  } catch (error) {
    res.status(500).json({ message: "Error fetching user details", error: error.message });
  }
};

// 4. UPDATE USER (For "Edit" button)
export const updateUser = async (req, res) => {
  try {
    const { name, email } = req.body;
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { name, email },
      { new: true, runValidators: true }
    ).select("-password");

    if (!updatedUser) return res.status(404).json({ message: "User not found" });

    res.status(200).json({ success: true, message: "User updated successfully", user: updatedUser });
  } catch (error) {
    res.status(500).json({ message: "Error updating user", error: error.message });
  }
};