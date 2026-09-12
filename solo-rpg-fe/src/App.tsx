import { BrowserRouter, Routes, Route } from 'react-router-dom'
import StoryEditor from './pages/StoryEditor'
import Home from './pages/Home'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/story/:storyId" element={<StoryEditor />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
