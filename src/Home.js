import React from 'react'
import Input from '@mui/joy/Input';
import Button from '@mui/material/Button';
import { borderRadius, fontSize } from '@mui/system';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import './styles.css';
import axios from 'axios';
import { useState,useRef } from "react"; // Import useState



function Home() {

  const [file, setFile] = useState(null); // Initialize as null
  const [fileName, setFileName] = useState('Choose File');
  const [deidentifiedData, setDeidentifiedData] = useState('');
  const fileInputRef = useRef(null);

  const handleChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setFileName(selectedFile.name);
    }
  };

  const handleFileUpload =  async (e) => {
    e.preventDefault(); // Prevent form submission refresh
    if(!file){
      alert("Please select a file first.");
      return;
    }

    const reader = new FileReader(); // creates a new file reader object which is used to read the contents of a file
    reader.onload = (event) => { // When the file is successfully read, the onload event is triggered
      const text = event.target.result; // contains the file's content as a text string
      const deidentifiedText = deidentifyData(text); // text is passed to the deidentifyData function to process it (removing sensitive information)
      setDeidentifiedData(deidentifiedText); // the processed (de-identified) text is then stored in state
    };
    reader.readAsText(file); // reads the file as a plain text string and triggers the onload event once reading is complete

  }

  // Processes text to remove personally identifiable information (PII).
  const deidentifyData = (text) => {
      return text
      .replace(/(?<=Patient:\s)[A-Za-z ]+/g, '*name') // Name
      .replace(/(?<=Address:\s)[A-Za-z0-9,\s]+/g, '*address') // Address
      .replace(/\b\d{2}\/\d{2}\/\d{4}\b/g, '*date_of_birth') // Dates
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '*ssn') // Social Security Number
      .replace(/\b\d{3}-\d{3}-\d{4}\b/g, '*phone') // Phone number
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '*email'); // Email
  }

  const handleIconClick = () => {
    if (fileInputRef.current){
      fileInputRef.current.click();
    }
  }
  // function creates a downloadable text file with the deidentified data
  const handleDownload = () => {
    if(!deidentifiedData) return;
    const blob = new Blob([deidentifiedData], {type: 'text/plain'}); // Creates a Blob (Binary Large Object) containing the deidentified text, specifies the file type is plain text
    const url = URL.createObjectURL(blob); // generates a temporary URL for the blob, allowing the browser to access it as downloadable file.
    const link = document.createElement("a"); // an <a> (anchor) elemnt is created dynamically, which will act as a download link.
    link.href = url; // sets the href of the <a> elemnent to the blob URL
    link.download = "deidentified_data.txt" // sets the filename to "deidentified_data.txt", so when the user downloads it, the file will have this name
    document.body.appendChild(link); // the link is added to the document body
    link.click(); // the click method is triggered programatically, simulating a user clicking the downlaod link

    document.body.removeChild(link); // the <a> element is removed from the document to clean up.
    URL.revokeObjectURL(url); // releases the allocated memory for the Blob URL to prevent memory leaks

  }

  return ( 
        <form onSubmit={handleFileUpload}>
            <Input placeholder="Upload documents here for deidentification… " variant="solid" className = "inputfield" value={fileName} readOnly></Input>
            <AttachFileIcon className="icon" onClick={() => fileInputRef.current?.click()}/>
            <input type="file" ref={fileInputRef} onChange={handleChange} style={{ display: 'none'}}/>
            <Button variant="contained" onClick={handleFileUpload} className="button" sx = {{backgroundColor: 'primary.main', position: 'absolute', top: '45%', right: '30%', borderRadius: '20px', padding: 1.5, '&hover':{ backgroundColor: 'secondary.dark' }} } type = "submit">Submit for Deidentification</Button>
            {deidentifiedData && (
              <Button variant="contained" sx={{marginTop: 10, display: "block", marginLeft: 118}} onClick={handleDownload} className = "download">
                Download Deidentified Data
              </Button>
            )}
        </form>
  )
}


export default Home;