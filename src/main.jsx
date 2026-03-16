import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider } from './components/theme-provider.jsx'
import AppRouter from './router.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="smartclass-theme">
      <AppRouter />
    </ThemeProvider>
  </React.StrictMode>,
)
