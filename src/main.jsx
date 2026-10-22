import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Last line of defence: a crash outside a page (e.g. in the login or data providers) */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
