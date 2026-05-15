import User from "../model/User.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import brevo from "@getbrevo/brevo";

// ==========================
// BREVO CONFIG
// ==========================
const apiInstance = new brevo.TransactionalEmailsApi();

apiInstance.setApiKey(
  brevo.TransactionalEmailsApiApiKeys.apiKey,
  process.env.BREVO_API_KEY
);

// ==========================
// HELPER: SEND EMAIL
// ==========================
const sendEmail = async (to, subject, html) => {
  try {
    const sendSmtpEmail = new brevo.SendSmtpEmail();

    sendSmtpEmail.sender = {
      email: "rajputridhi92@gmail.com",
      name: "UniKart",
    };

    sendSmtpEmail.to = [{ email: to }];

    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = html;

    const data = await apiInstance.sendTransacEmail(sendSmtpEmail);

    console.log("EMAIL SENT SUCCESS:", data);
  } catch (err) {
    console.log(
      "EMAIL ERROR:",
      err.response?.body || err.message || err
    );
  }
};

// ==========================
// SEND OTP CONTROLLER
// ==========================
export const sendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        message: "Email is required",
      });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser && existingUser.password) {
      return res.status(400).json({
        message: "User already exists with this email",
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const otpExpire = Date.now() + 5 * 60 * 1000;

    await User.findOneAndUpdate(
      { email },
      {
        otp,
        otpExpire,
        name: existingUser?.name || "TempUser",
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    await sendEmail(
      email,
      "Your UniKart Verification Code",
      `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color:#111827;">UniKart Verification</h2>
        <p>Your OTP for registration is:</p>
        <h1 style="letter-spacing:5px; color:#2563eb;">
          ${otp}
        </h1>
        <p>This OTP is valid for 5 minutes.</p>
      </div>
      `
    );

    res.status(200).json({
      success: true,
      message: "OTP sent to your email",
    });

  } catch (error) {
    console.error("SEND OTP ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Error sending OTP",
      error: error.message,
    });
  }
};

// ==========================
// WELCOME EMAIL
// ==========================
const sendWelcomeEmail = async (email, name) => {
  try {
    await sendEmail(
      email,
      "Welcome to UniKart | Your Account is Ready",
      `
      <div style="font-family: Arial, sans-serif; background:#f4f4f4; padding:20px;">
        <div style="max-width:600px; margin:auto; background:#fff; border-radius:10px; overflow:hidden;">
          
          <div style="background:#111827; padding:20px; text-align:center;">
            <h1 style="color:white; margin:0;">UniKart</h1>
            <p style="color:#d1d5db;">Smart Learning Platform</p>
          </div>

          <div style="padding:30px;">
            <h2>Hello ${name},</h2>

            <p>
              Welcome to <b>UniKart</b>!
            </p>

            <p>
              Your account has been created successfully and is pending admin approval.
            </p>

            <div style="background:#f3f4f6; padding:15px; border-left:4px solid #111827; margin:20px 0;">
              <p><b>Email:</b> ${email}</p>
            </div>

            <a 
              href="${process.env.FRONTEND_URL}/login"
              style="
                display:inline-block;
                padding:12px 20px;
                background:#111827;
                color:white;
                text-decoration:none;
                border-radius:5px;
              "
            >
              Go to Login
            </a>
          </div>
        </div>
      </div>
      `
    );
  } catch (error) {
    console.log("WELCOME EMAIL ERROR:", error.message);
  }
};

// ==========================
// SIGNUP CONTROLLER
// ==========================
export const signupUser = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      confirm_password,
      sel_role,
      teacher_id,
      admin_id,
      otp,
    } = req.body;

    if (
      !name ||
      !email ||
      !password ||
      !confirm_password ||
      !sel_role ||
      !otp
    ) {
      return res.status(400).json({
        message: "All required fields must be filled",
      });
    }

    const userWithOtp = await User.findOne({ email });

    if (
      !userWithOtp ||
      userWithOtp.otp !== otp ||
      userWithOtp.otpExpire < Date.now()
    ) {
      return res.status(400).json({
        message: "Invalid OTP",
      });
    }

    if (password !== confirm_password) {
      return res.status(400).json({
        message: "Passwords do not match",
      });
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
      if (!teacher_id) {
        return res.status(400).json({
          message: "Teacher ID is required",
        });
      }

      updateFields.teacher_id = teacher_id;
    }

    if (sel_role === "admin") {
      if (!admin_id) {
        return res.status(400).json({
          message: "Admin ID is required",
        });
      }

      updateFields.admin_id = admin_id;
    }

    if (sel_role === "student") {
      if (!req.file) {
        return res.status(400).json({
          message: "ID Card is required",
        });
      }

      updateFields.id_card = req.file.path.replace(/\\/g, "/");
    }

    const newUser = await User.findOneAndUpdate(
      { email },
      {
        $set: updateFields,
        $unset: {
          otp: 1,
          otpExpire: 1,
        },
      },
      {
        new: true,
      }
    );

    if (!newUser) {
      return res.status(400).json({
        message: "Signup failed",
      });
    }

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

    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

// ==========================
// LOGIN CONTROLLER
// ==========================
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password required",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({
        message: "Invalid credentials",
      });
    }

    if (!user.isApproved) {
      return res.status(403).json({
        message: "Your account is pending admin approval",
      });
    }

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
      },
      process.env.JWT_SECRET || "fallback_secret",
      {
        expiresIn: "1d",
      }
    );

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        role: user.role,
        isApproved: user.isApproved,
      },
    });

  } catch (error) {
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

// ==========================
// FORGOT PASSWORD
// ==========================
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");

    user.resetPasswordToken = resetToken;

    user.resetPasswordExpire =
      Date.now() + 10 * 60 * 1000;

    await user.save();

    const frontendUrl =
      process.env.FRONTEND_URL || "http://localhost:5173";

    const resetUrl =
      `${frontendUrl}/reset-password/${resetToken}`;

    await sendEmail(
      user.email,
      "Reset Your UniKart Password",
      `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Password Reset Request</h2>

        <p>Hello ${user.name},</p>

        <p>
          Click the button below to reset your password:
        </p>

        <a
          href="${resetUrl}"
          style="
            display:inline-block;
            padding:12px 25px;
            background:#111827;
            color:white;
            text-decoration:none;
            border-radius:5px;
            margin-top:10px;
          "
        >
          Reset Password
        </a>

        <p style="margin-top:20px;">
          This link is valid for 10 minutes.
        </p>
      </div>
      `
    );

    res.status(200).json({
      message: "Reset link sent to email",
    });

  } catch (error) {
    console.error("FORGOT PASSWORD ERROR:", error);

    res.status(500).json({
      message: "Failed to send email",
    });
  }
};

// ==========================
// RESET PASSWORD
// ==========================
export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;

    const { password } = req.body;

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpire: {
        $gt: Date.now(),
      },
    });

    if (!user) {
      return res.status(400).json({
        message: "Invalid or expired token",
      });
    }

    user.password = await bcrypt.hash(password, 10);

    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    res.status(200).json({
      message: "Password updated successfully",
    });

  } catch (error) {
    res.status(500).json({
      message: "Server error",
    });
  }
};

// ==========================
// ADMIN CONTROLLERS
// ==========================
export const getApprovedStudents = async (req, res) => {
  try {
    const students = await User.find({
      role: "student",
      isApproved: true,
    });

    res.status(200).json({
      success: true,
      students,
    });

  } catch (error) {
    res.status(500).json({
      message: "Error fetching approved students",
      error: error.message,
    });
  }
};

export const rejectUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByIdAndDelete(id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "User removed successfully",
    });

  } catch (error) {
    res.status(500).json({
      message: "Error rejecting user",
      error: error.message,
    });
  }
};

export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select("-password -otp");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      user,
    });

  } catch (error) {
    res.status(500).json({
      message: "Error fetching user details",
      error: error.message,
    });
  }
};

export const updateUser = async (req, res) => {
  try {
    const { name, email } = req.body;

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      {
        name,
        email,
      },
      {
        new: true,
        runValidators: true,
      }
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "User updated successfully",
      user: updatedUser,
    });

  } catch (error) {
    res.status(500).json({
      message: "Error updating user",
      error: error.message,
    });
  }
};