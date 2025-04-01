import React from 'react';
import Input from '@mui/joy/Input';
import Button from '@mui/material/Button';
import { borderRadius, fontSize } from '@mui/system';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import axios from 'axios';
import { useState, useRef } from "react";
import './styles.css';

function Home() {
  const [fileName, setFileName] = useState("");
  const [deidentifiedData, setDeidentifiedData] = useState(null);
  const [recordId, setRecordId] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  // Handle file selection
  const handleChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFileName(file.name);
      setDeidentifiedData(null);
      setRecordId(null);
      setError(null);
    }
  };

  // Handle file upload
  const handleFileUpload = async (e) => {
    e.preventDefault();
    if (!fileInputRef.current?.files[0]) {
      setError("Please select a file to upload");
      return;
    }

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", fileInputRef.current.files[0]);

    try {
      const response = await axios.post("http://localhost:8000/upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      setDeidentifiedData(response.data.deidentifiedFile);
      setRecordId(response.data.recordId);
    } catch (err) {
      setError(err.response?.data?.error || "An error occurred while uploading the file");
    } finally {
      setLoading(false);
    }
  };

  // Handle Download
  const handleDownload = async () => {
    if (!deidentifiedData) return;
    try {
      const encodedFileName = encodeURIComponent(deidentifiedData); // Encode the filename
      const response = await axios.get(`http://localhost:8000/download/${encodedFileName}`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", deidentifiedData.split("/").pop()); // Use the unencoded filename for download
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error("Download error:", err);
      setError("Failed to download the de-identified file: " + (err.response?.data?.error || err.message));
    }
  };

  // Handle Download of Original File
  const handleDownloadOriginal = async () => {
    if (!recordId) return;
    try {
      const response = await axios.get(`http://localhost:8000/download-original/${recordId}`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `original-${recordId}.txt`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error("Download original file error:", err);
      setError("Failed to download the original file: " + (err.response?.data?.error || err.message));
    }
  };

  return (
    <form onSubmit={handleFileUpload}>
      <Input
        placeholder="Upload documents here for deidentification… "
        variant="solid"
        className="inputfield"
        value={fileName}
        readOnly
      />
      <AttachFileIcon className="icon" onClick={() => fileInputRef.current?.click()} />
      <input type="file" ref={fileInputRef} onChange={handleChange} style={{ display: 'none' }} />
      <Button
        variant="contained"
        onClick={handleFileUpload}
        className="button"
        sx={{
          backgroundColor: 'primary.main',
          position: 'absolute',
          top: '45%',
          right: '30%',
          borderRadius: '20px',
          padding: 1.5,
          '&hover': { backgroundColor: 'secondary.dark' }
        }}
        type="submit"
        disabled={loading}
      >
        {loading ? "Uploading..." : "Submit for Deidentification"}
      </Button>

      {/* Display error message if any */}
      {error && (
        <div style={{ marginTop: '20px', color: 'red' }}>
          {error}
        </div>
      )}

      {/* Display buttons to download de-identified and original files after upload */}
      {deidentifiedData && recordId && (
        <div style={{ marginTop: '20px' }}>
          <Button
            variant="contained"
            sx={{ marginRight: 2 }}
            onClick={handleDownload}
            className="download"
          >
            Download Deidentified Data
          </Button>
          <Button
            variant="contained"
            color="secondary"
            onClick={handleDownloadOriginal}
            className="download"
          >
            Download Original File
          </Button>
        </div>
      )}
    </form>
  );
}

export default Home;