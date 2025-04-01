import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import { spawn } from "child_process";
import path from "path";
import cors from "cors";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import fs from "fs";
import { Readable } from "stream";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

// Load environment variables from .env file
dotenv.config();

// Define __dirname and __filename for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure AWS SDK v3 S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Initialize Express app
const app = express();

// Middleware
app.use(cors({ origin: "http://localhost:3000" })); // Allow requests from frontend
app.use(express.json());

// Multer setup for file uploads (store in memory instead of disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// MongoDB connection using MONGOURI from .env
mongoose.connect(process.env.MONGOURI)
  .then(() => console.log("Database Connected"))
  .catch((err) => console.error("Database connection error:", err));

// Patient Schema and Model
const patientSchema = new mongoose.Schema({
  originalName: String,
  originalDOB: String,
  originalMRN: String,
  originalVisitDate: String,
  originalAddress: String,
  originalPhone: String,
  originalEmail: String,
  originalSSN: String,
  originalProvider: String,
  fileReference: String,
  originalFileReference: String,
  recordId: String,
  encryptedPii: String,
  encryptionKey: String,
});

const PatientModel = mongoose.model("Patient", patientSchema);

// File Upload and De-identification Endpoint
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    console.log("Received upload request");
    console.log("Request body:", req.body);
    console.log("Request file:", req.file);

    if (!req.file) {
      console.log("No file uploaded in the request");
      return res.status(400).json({ error: "No file uploaded" });
    }

    console.log(`File received: ${req.file.originalname}`);
    console.log(`File size: ${req.file.size} bytes`);

    // Upload the original file to S3
    const originalS3Key = `original/${Date.now()}-${req.file.originalname}`;
    const originalS3Params = {
      Bucket: process.env.S3_BUCKET,
      Key: originalS3Key,
      Body: req.file.buffer,
      ContentType: "text/plain",
    };

    try {
      const uploadOriginalCommand = new PutObjectCommand(originalS3Params);
      await s3Client.send(uploadOriginalCommand);
      console.log(`Original file uploaded to S3: ${originalS3Key}`);
    } catch (err) {
      console.error(`Error uploading original file to S3: ${err.message}`);
      return res.status(500).json({ error: "Failed to upload original file to S3", details: err.message });
    }

    // Run the de-identification script
    const pythonScriptPath = path.join(__dirname, "redact_phi.py");
    if (!fs.existsSync(pythonScriptPath)) {
      console.log("De-identification script not found");
      return res.status(500).json({ error: "De-identification script (redact_phi.py) not found" });
    }

    // Create temporary files for input and output
    const tempInputFile = path.join(__dirname, `temp-input-${Date.now()}.txt`);
    const tempOutputFile = path.join(__dirname, `temp-output-${Date.now()}.txt`);

    try {
      fs.writeFileSync(tempInputFile, req.file.buffer.toString());

      console.log(`Running Python script: ${pythonScriptPath} with input: ${tempInputFile} and output: ${tempOutputFile}`);
      const pythonProcess = spawn("python3", [pythonScriptPath, tempInputFile, tempOutputFile]);

      let pythonOutput = "";
      let pythonError = "";

      pythonProcess.stdout.on("data", (data) => {
        pythonOutput += data.toString();
        console.log(`Python output: ${data}`);
      });

      pythonProcess.stderr.on("data", (data) => {
        pythonError += data.toString();
        console.error(`Python error: ${data}`);
      });

      pythonProcess.on("error", (err) => {
        console.error(`Failed to start Python process: ${err.message}`);
        res.status(500).json({ error: "Failed to run de-identification script" });
      });

      pythonProcess.on("close", async (code) => {
        console.log(`Python process exited with code ${code}`);
        if (code === 0) {
          let recordId = null;
          let encryptedPii = null;
          let encryptionKey = null;

          const outputLines = pythonOutput.split('\n');
          for (const line of outputLines) {
            if (line.startsWith("Record ID:")) {
              recordId = line.split("Record ID: ")[1].trim();
            } else if (line.startsWith("Encryption Key:")) {
              encryptionKey = line.split("Encryption Key: ")[1].trim();
            } else if (line.startsWith("Encrypted Removed Items:")) {
              encryptedPii = line.split("Encrypted Removed Items: ")[1].trim();
            }
          }

          if (!recordId || !encryptedPii || !encryptionKey) {
            console.error("Failed to extract record_id, encrypted_pii, or encryption_key from Python script output");
            return res.status(500).json({ error: "Failed to parse de-identification script output" });
          }

          let deidentifiedContent;
          try {
            deidentifiedContent = fs.readFileSync(tempOutputFile, 'utf8');
            console.log(`De-identified content read from ${tempOutputFile}`);
          } catch (err) {
            console.error(`Error reading de-identified file: ${err.message}`);
            return res.status(500).json({ error: "Failed to read de-identified file", details: err.message });
          }

          const deidentifiedFileName = `deidentified-${Date.now()}-${req.file.originalname}`;
          const deidentifiedS3Key = `deidentified/${deidentifiedFileName}`;
          const deidentifiedS3Params = {
            Bucket: process.env.S3_BUCKET,
            Key: deidentifiedS3Key,
            Body: deidentifiedContent,
            ContentType: "text/plain",
          };

          try {
            const uploadDeidentifiedCommand = new PutObjectCommand(deidentifiedS3Params);
            await s3Client.send(uploadDeidentifiedCommand);
            console.log(`De-identified file uploaded to S3: ${deidentifiedS3Key}`);
          } catch (err) {
            console.error(`Error uploading de-identified file to S3: ${err.message}`);
            return res.status(500).json({ error: "Failed to upload de-identified file to S3", details: err.message });
          }

          const patientToStore = {
            originalName: null,
            originalDOB: null,
            originalMRN: null,
            originalVisitDate: null,
            originalAddress: null,
            originalPhone: null,
            originalEmail: null,
            originalSSN: null,
            originalProvider: null,
            fileReference: deidentifiedS3Key,
            originalFileReference: originalS3Key,
            recordId: recordId,
            encryptedPii: encryptedPii,
            encryptionKey: encryptionKey,
          };

          try {
            const savedPatient = await PatientModel.create(patientToStore);
            console.log("Patient data stored in database:", savedPatient);
          } catch (err) {
            console.error(`Error storing patient data in database: ${err.message}`);
            return res.status(500).json({ error: "Failed to store patient data in database", details: err.message });
          }

          res.status(200).json({
            message: "File de-identified and stored successfully",
            deidentifiedFile: deidentifiedS3Key,
            recordId: recordId,
          });
        } else {
          console.error(`Python process failed with code ${code}`);
          console.error(`Python error output: ${pythonError}`);
          res.status(500).json({ error: "De-identification failed", details: pythonError });
        }

        try {
          if (fs.existsSync(tempInputFile)) fs.unlinkSync(tempInputFile);
          if (fs.existsSync(tempOutputFile)) fs.unlinkSync(tempOutputFile);
          console.log("Temporary files cleaned up");
        } catch (err) {
          console.error(`Error cleaning up temporary files: ${err.message}`);
        }
      });
    } catch (err) {
      console.error(`Error setting up temporary files: ${err.message}`);
      res.status(500).json({ error: "Failed to set up temporary files", details: err.message });

      try {
        if (fs.existsSync(tempInputFile)) fs.unlinkSync(tempInputFile);
        if (fs.existsSync(tempOutputFile)) fs.unlinkSync(tempOutputFile);
      } catch (cleanupErr) {
        console.error(`Error during cleanup: ${cleanupErr.message}`);
      }
    }
  } catch (error) {
    console.error(`Error in /upload endpoint: ${error.message}`);
    res.status(500).json({ error: "Server error", details: error.message });
  }
});

// Download De-identified File Endpoint
app.get("/download/:filename", async (req, res) => {
  const s3Key = req.params.filename;
  console.log(`Download request for de-identified file with S3 key: ${s3Key}`);

  try {
    const s3Params = {
      Bucket: process.env.S3_BUCKET,
      Key: s3Key,
    };

    const getObjectCommand = new GetObjectCommand(s3Params);
    const s3Response = await s3Client.send(getObjectCommand);

    const nodeStream = Readable.from(s3Response.Body);

    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(s3Key)}"`);
    res.setHeader('Content-Type', 'text/plain');

    nodeStream.pipe(res);

    nodeStream.on('error', (err) => {
      console.error(`Error downloading file from S3: ${err.message}`);
      res.status(500).json({ error: "Error downloading file", details: err.message });
    });
  } catch (err) {
    console.error(`Error retrieving file from S3: ${err.message}`);
    res.status(404).json({ error: "File not found in S3", details: err.message });
  }
});

// Download Original File Endpoint
app.get("/download-original/:recordId", async (req, res) => {
  const recordId = req.params.recordId;
  console.log(`Download request for original file with recordId: ${recordId}`);

  try {
    const patient = await PatientModel.findOne({ recordId: recordId }).lean();
    if (!patient || !patient.originalFileReference) {
      console.log(`Original file not found for recordId: ${recordId}`);
      return res.status(404).json({ error: "Original file not found" });
    }

    const s3Key = patient.originalFileReference;
    const s3Params = {
      Bucket: process.env.S3_BUCKET,
      Key: s3Key,
    };

    const getObjectCommand = new GetObjectCommand(s3Params);
    const s3Response = await s3Client.send(getObjectCommand);

    const nodeStream = Readable.from(s3Response.Body);

    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(s3Key)}"`);
    res.setHeader('Content-Type', 'text/plain');

    nodeStream.pipe(res);

    nodeStream.on('error', (err) => {
      console.error(`Error downloading file from S3: ${err.message}`);
      res.status(500).json({ error: "Error downloading file", details: err.message });
    });
  } catch (err) {
    console.error(`Error retrieving file from S3: ${err.message}`);
    res.status(404).json({ error: "File not found in S3", details: err.message });
  }
});

// Start the server
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});