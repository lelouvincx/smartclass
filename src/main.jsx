import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider } from './components/theme-provider.jsx'
import { Toaster } from './components/ui/sonner.jsx'
import AppRouter from './router.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="smartclass-theme">
      <AppRouter />
      <Toaster position="top-center" richColors />
    </ThemeProvider>
  </React.StrictMode>,
)
