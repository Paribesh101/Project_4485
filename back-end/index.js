import express from "express"
import mongoose from "mongoose"
import dotenv from "dotenv"
import multer from "multer";
import { spawn } from "child_process"; // To run Python script
import fs from "fs";
import path from "path";
import csvParser from "csv-parser"; // For processing CSV files
import User from "/models/user.js"; // Import the correct User model

const app = express();
dotenv.config()
app.use(express.json()); // Middleware to parse JSON data

const PORT = process.env.PORT;
const MONGOURI = process.env.MONGOURI;

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // Make sure this folder exists
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname);
    }
});

const upload = multer({storage: storage});

// Create directories if they don't exist
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
if (!fs.existsSync("deidentified")) fs.mkdirSync("deidentified");

// Patient Schema for MongoDB
const patientSchema = new mongoose.Schema({
    originalName: String,
    originalDOB: String,
    originalMRN: String,
    originalVisitDate: String,
    orginalAddress: String,
    originalPhone: String,
    originalEmail: String,
    orginalSSN: String,
    orignalProvider: String,
    fileReference: String
});

const PatientModel = mongoose.model("Patient", patientSchema, "patients");


// connect to MongoDB Atlas
mongoose.connect(MONGOURI, { dbName: "project_DB_4485" }).then(() => {
    console.log("Database Connected")
    app.listen(PORT, () => {
        console.log('Server is running on PORT 8000')
    })
}).catch((err)=>console.log(err))

// Upload and De-identify Endpoint
app.post("/upload", upload.single("file"), async (req, res) => {
    try {
        if (!req.file){
            return res.status(400).json({ error: "No file uploaded" });
        }

        const inputFilePath = req.file.path;
        const deidentifiedFileName = 'deidentified-${Date.now()}-${req.file.originalname}';
        const outputFilePath = path.join("deidentified", deidentifiedFileName);

        // Read the original file content to extract PHI for storage
        const originalContent = fs.readFileSync(inputFilePath, "utf-8");

         // Extract PHI using regex
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
        for(const [key, pattern] of Object.entries(phiPatterns)){
            const match = originalContent.match(pattern);
            patientData[key] = match ? match[0] : null;
        }

        // Store original data in MongoDB
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
        await PatientModel.create(patientToStore);
        
        // Run Python script for de-identification
        const pythonProcess =  spawn("python3", [
            "readact_phi.py",
            inputFilePath,
            outputFilePath,
        ]);

        pythonProcess.stdout.on("data", (data) => {
            console.log(`Python output: ${data}`);
        });

        pythonProcess.stderr.on("data", (data) => {
            console.error(`Python error: ${data}`);
        });

        pythonProcess.on("close", (code) => {
            if (code === 0) {
                fs.unlinkSync(inputFilePath);
                res.status(200).json({
                    message: "File de-identified and stored successfully",
                    deidentifiedFile: deidentifiedFileName,
                });
            } else {
                res.status(500).json({ error: "De-identification failed" });
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }

});

// Retrieve Original Data Endpoint
app.get("/reidentify/:fileReference", async (req, res) => {
    try {
        const patient = await PatientModel.findOne({ fileReference: req.params.fileReference });
        if (!patient){
            return res.status(404).json({error: "No data found for this file"});
        }
        res.json(patient);
    } catch (error){
        res.status(500).json({ error: error.message });
    }
});


// Basic endpoint to test server
app.get("/", (req, res) => {
    res.send("Server is running");
});


