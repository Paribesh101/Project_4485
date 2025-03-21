import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import cors from "cors";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// Define __dirname and __filename for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Multer setup for file uploads, saving to 'uploads/' directory
const upload = multer({
    dest: "uploads/", // Save uploaded files to 'uploads/'
    limits: { fileSize: 5 * 1024 * 1024 }, // Limit file size to 5MB
});

// MongoDB connection using MONGOURI from .env
mongoose.connect(process.env.MONGOURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
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
});

const PatientModel = mongoose.model("Patient", patientSchema);

// Ensure uploads and deidentified directories exist
const uploadsDir = path.join(__dirname, "uploads");
const deidentifiedDir = path.join(__dirname, "deidentified");

if (!fs.existsSync(uploadsDir)) {
    console.log(`Creating uploads directory at: ${uploadsDir}`);
    fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(deidentifiedDir)) {
    console.log(`Creating deidentified directory at: ${deidentifiedDir}`);
    fs.mkdirSync(deidentifiedDir, { recursive: true });
}

// File Upload and De-identification Endpoint
app.post("/upload", upload.single("file"), async (req, res) => {
    try {
        // Log the incoming request details
        console.log("Received upload request");
        console.log("Request body:", req.body);
        console.log("Request file:", req.file);

        // Check if a file was uploaded
        if (!req.file) {
            console.log("No file uploaded in the request");
            return res.status(400).json({ error: "No file uploaded" });
        }

        console.log(`File successfully uploaded to: ${req.file.path}`);
        console.log(`Original filename: ${req.file.originalname}`);
        console.log(`File size: ${req.file.size} bytes`);

        const inputFilePath = req.file.path;
        const deidentifiedFileName = `deidentified-${Date.now()}-${req.file.originalname}`;
        const outputFilePath = path.join(deidentifiedDir, deidentifiedFileName);

        console.log(`Input file path: ${inputFilePath}`);
        console.log(`Output file path: ${outputFilePath}`);

        // Read the original file content
        let originalContent;
        try {
            originalContent = fs.readFileSync(inputFilePath, { encoding: "utf-8", flag: "r" });
            console.log(`Original file content:\n${originalContent}`);
        } catch (err) {
            console.error(`Error reading input file: ${err.message}`);
            // Do not delete the file for debugging purposes
            return res.status(500).json({ error: "Failed to read the uploaded file" });
        }

        // Extract PHI for database storage
        const phiPatterns = {
            patientName: /(?<=Patient:\s)[A-Z][a-z]+(\s[A-Z][a-z]+){1,2}(?=\n|$)/,
            dob: /(?<=Date of Birth:\s)\d{2}\/\d{2}\/\d{4}/,
            mrn: /(?<=Medical Record Number:\s)\d+/,
            visitDate: /(?<=Date of Visit:\s)\d{2}\/\d{2}\/\d{4}/,
            address: /(?<=Address:\s)([\w\s,]+,\s[A-Z]{2}\s\d{5})/,
            phone: /\b\(?\d{3}\)?[-\s]?\d{3}-\d{4}\b/,
            email: /\b[\w.-]+@[\w.-]+\.\w+\b/,
            ssn: /\b\d{3}-\d{2}-\d{4}\b/,
            provider: /(?<=Provider:\s)Dr\.\s[\w\s]+,\sMD/,
        };

        const patientData = {};
        for (const [key, pattern] of Object.entries(phiPatterns)) {
            const match = originalContent.match(pattern);
            patientData[key] = match ? match[0] : null;
        }

        // Store patient data in the database
        const patientToStore = {
            originalName: patientData.patientName,
            originalDOB: patientData.dob,
            originalMRN: patientData.mrn,
            originalVisitDate: patientData.visitDate,
            originalAddress: patientData.address,
            originalPhone: patientData.phone,
            originalEmail: patientData.email,
            originalSSN: patientData.ssn,
            originalProvider: patientData.provider,
            fileReference: deidentifiedFileName,
        };

        try {
            await PatientModel.create(patientToStore);
            console.log("Patient data stored in database");
        } catch (err) {
            console.error(`Error storing patient data in database: ${err.message}`);
            // Do not delete the file for debugging purposes
            return res.status(500).json({ error: "Failed to store patient data in database" });
        }

        // Run the de-identification script
        const pythonScriptPath = path.join(__dirname, "redact_phi.py");
        if (!fs.existsSync(pythonScriptPath)) {
            console.log("De-identification script not found");
            // Do not delete the file for debugging purposes
            return res.status(500).json({ error: "De-identification script (redact_phi.py) not found" });
        }

        console.log(`Running Python script: ${pythonScriptPath}`);
        const pythonProcess = spawn("python3", [
            pythonScriptPath,
            inputFilePath,
            outputFilePath,
        ]);

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
            // Do not delete the file for debugging purposes
            res.status(500).json({ error: "Failed to run de-identification script" });
        });

        pythonProcess.on("close", (code) => {
            console.log(`Python process exited with code ${code}`);
            if (code === 0) {
                if (fs.existsSync(outputFilePath)) {
                    console.log(`De-identified file created: ${outputFilePath}`);
                    // Do not delete the file for debugging purposes
                    // fs.unlinkSync(inputFilePath);
                    res.status(200).json({
                        message: "File de-identified and stored successfully",
                        deidentifiedFile: deidentifiedFileName,
                    });
                } else {
                    console.log("De-identified file not created");
                    // Do not delete the file for debugging purposes
                    // fs.unlinkSync(inputFilePath);
                    res.status(500).json({ error: "De-identified file was not created" });
                }
            } else {
                console.error(`Python process failed with code ${code}`);
                console.error(`Python error output: ${pythonError}`);
                // Do not delete the file for debugging purposes
                // fs.unlinkSync(inputFilePath);
                res.status(500).json({ error: "De-identification failed", details: pythonError });
            }
        });
    } catch (error) {
        console.error(`Error in /upload endpoint: ${error.message}`);
        if (req.file && fs.existsSync(req.file.path)) {
            console.log(`File exists at ${req.file.path}, not deleting for debugging`);
            // Do not delete the file for debugging purposes
            // fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: "Server error", details: error.message });
    }
});

// Download De-identified File Endpoint
app.get("/download/:filename", (req, res) => {
    const fileName = req.params.filename;
    const filePath = path.join(deidentifiedDir, fileName);

    console.log(`Download request for file: ${filePath}`);

    if (!fs.existsSync(filePath)) {
        console.log(`File not found: ${filePath}`);
        return res.status(404).json({ error: "File not found" });
    }

    res.download(filePath, fileName, (err) => {
        if (err) {
            console.error(`Error downloading file: ${err.message}`);
            res.status(500).json({ error: "Error downloading file", details: err.message });
        } else {
            console.log(`File downloaded successfully: ${fileName}`);
        }
    });
});

// Start the server using PORT from .env
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});