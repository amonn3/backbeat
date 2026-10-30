import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter, Route, Routes } from "react-router-dom"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import BoardPage from "@/pages/BoardPage"
import HomePage from "@/pages/HomePage"
import "./index.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/b/:boardId" element={<BoardPage />} />
        </Routes>
      </BrowserRouter>
      <Toaster theme="dark" position="bottom-right" richColors />
    </TooltipProvider>
  </StrictMode>,
)
