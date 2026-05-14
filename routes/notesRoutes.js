import express from "express";
import multer from "multer";
import path from "path";
import { uploadNotes, getNotes, deleteNote, updateNote } from "../controllers/notesController.js"; 
import { verifyToken, checkApprovedUser } from "../middleware/authMiddleware.js";

const router = express.Router();

//
//  MULTER CONFIG 
// 
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); 
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = [".pdf", ".doc", ".docx", ".txt", ".jpg", ".jpeg", ".png"];
    if (!allowed.includes(ext)) {
      return cb(new Error("Only documents and images are allowed"), false);
    }
    cb(null, true);
  }
});

// ==========================
//  NOTES ROUTES
// ==========================

router.post("/upload", verifyToken, checkApprovedUser, upload.single("file"), uploadNotes);

router.get("/all", getNotes); 


router.put("/update/:id", verifyToken, checkApprovedUser, upload.single("file"), updateNote);

router.delete("/delete/:id", verifyToken, checkApprovedUser, deleteNote);

export default router;
