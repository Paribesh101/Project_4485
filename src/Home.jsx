import React from 'react'
import Input from '@mui/joy/Input';
import Button from '@mui/material/Button';
import { borderRadius, fontSize } from '@mui/system';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import axios from 'axios';
import { useState,useRef } from "react"; // Import useState
import './styles.css'

function Home() {

  const [fileName, setFileName] = useState("");
  const [deidentifiedData, setDeidentifiedData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  // Handle file selection
     const handleChange = (e) => {
      const file = e.target.files[0];
      if (file) {
          setFileName(file.name); // Display the selected file name
          setDeidentifiedData(null); // Reset download link
          setError(null); // Reset errors
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

          // Set the de-identified file name from the response
          setDeidentifiedData(response.data.deidentifiedFile);
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
        const response = await axios.get(`http://localhost:8000/download/${deidentifiedData}`, {
            responseType: "blob",
        });
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", deidentifiedData);
        document.body.appendChild(link);
        link.click();
        link.remove();
    } catch (err) {
        console.error("Download error:", err);
        setError("Failed to download the de-identified file");
    }
};

  return ( 
        <form onSubmit={handleFileUpload}>
            <Input placeholder="Upload documents here for deidentification… " variant="solid" className = "inputfield" value={fileName} readOnly></Input>
            <AttachFileIcon className="icon" onClick={() => fileInputRef.current?.click()}/>
            <input type="file" ref={fileInputRef} onChange={handleChange} style={{ display: 'none'}}/>
            <Button variant="contained" onClick={handleFileUpload} className="button" sx = {{backgroundColor: 'primary.main', position: 'absolute', top: '45%', right: '30%', borderRadius: '20px', padding: 1.5, '&hover':{ backgroundColor: 'secondary.dark' }} } type = "submit" disabled={loading}>{loading ? "Uploading..." : "Submit for Deidentification"}</Button>
            {deidentifiedData && (
              <Button variant="contained" sx={{marginTop: 10, display: "block", marginLeft: 118}} onClick={handleDownload} className = "download">
                Download Deidentified Data
              </Button>
            )}
        </form>
  )
}


export default Home;