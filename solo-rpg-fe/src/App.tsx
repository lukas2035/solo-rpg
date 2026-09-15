import { BrowserRouter, Routes, Route } from 'react-router-dom'
import StoryEditor from './pages/StoryEditor'
import Home from './pages/Home'
import VaultGate from './components/VaultGate'
import './App.css'

function App() {
  return (
    <VaultGate>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/story/:storyId" element={<StoryEditor />} />
        </Routes>
      </BrowserRouter>
    </VaultGate>
  )
}

export default App
