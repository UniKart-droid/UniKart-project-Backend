import User from "../model/User.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import * as Brevo from "@getbrevo/brevo";   // ✅ FIXED IMPORT

// ==========================
//  HELPER: SEND EMAIL
// ==========================
const sendEmail = async (to, subject, html) => {
  try {
    const apiInstance = new Brevo.TransactionalEmailsApi();

    apiInstance.setApiKey(
      Brevo.TransactionalEmailsApiApiKeys.apiKey,
      process.env.BREVO_API_KEY
    );

    await apiInstance.sendTransacEmail({
      sender: { email: "rajputridhi92@gmail.com", name: "UniKart" },
      to: [{ email: to }],
      subject: subject,
      htmlContent: html,
    });
  } catch (err) {
    console.log("EMAIL ERROR:", err.message);
  }
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
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    await sendEmail(
      email,
      "Your UniKart Verification Code",
      `<div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>UniKart Verification</h2>
        <h1>${otp}</h1>
        <p>Valid for 5 minutes</p>
      </div>`
    );

    res.status(200).json({ success: true, message: "OTP sent to your email" });
  } catch (error) {
    console.error("SEND OTP ERROR:", error);
    res.status(500).json({ success: false, message: "Error sending OTP" });
  }
};

// ==========================
//  WELCOME EMAIL FUNCTION
// ==========================
const sendWelcomeEmail = async (email, name) => {
  try {
    await sendEmail(
      email,
      "Welcome to UniKart",
      `<div>
        <h2>Hello ${name}</h2>
        <p>Welcome to UniKart!</p>
      </div>`
    );
  } catch (error) {
    console.log("Welcome Email failed:", error.message);
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
      user: {
        id: newUser._id,
        name: newUser.name,
        role: newUser.role,
        isApproved: newUser.isApproved,
      },
    });
  } catch (error) {
    console.error("SIGNUP ERROR:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ==========================
// LOGIN CONTROLLER
// ==========================
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    if (!user.isApproved) {
      return res.status(403).json({ message: "Pending admin approval" });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(200).json({
      success: true,
      token,
      user: { id: user._id, name: user.name, role: user.role },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// ==========================
// FORGOT PASSWORD
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

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    await sendEmail(
      email,
      "Reset Password",
      `<a href="${resetUrl}">Reset Password</a>`
    );

    res.status(200).json({ message: "Reset link sent" });
  } catch (error) {
    res.status(500).json({ message: "Error sending email" });
  }
};

// ==========================
// RESET PASSWORD
// ==========================
export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) return res.status(400).json({ message: "Invalid token" });

    user.password = await bcrypt.hash(req.body.password, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    res.status(200).json({ message: "Password updated" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// ==========================
// ADMIN CONTROLLERS
// ==========================
export const getApprovedStudents = async (req, res) => {
  const students = await User.find({ role: "student", isApproved: true });
  res.json({ students });
};

export const rejectUser = async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ message: "User deleted" });
};

export const getUserById = async (req, res) => {
  const user = await User.findById(req.params.id);
  res.json({ user });
};

export const updateUser = async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  );
  res.json({ user });
};