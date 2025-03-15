import { TextField } from '@mui/material';
import Home from './Home';
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Uploads from './Uploads';

function App() {
  return (
    <Routes>
      <Route path="/home" element={<Home />}/>
    </Routes>
  );
}


export default App;
