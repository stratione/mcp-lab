import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { queryClient } from './lib/query'
import { bootstrapTheme } from './lib/theme'
import { Toaster } from '@/components/ui/toaster'
import './styles/globals.css'

if (import.meta.env.DEV) {
  void Promise.all([import('@axe-core/react'), import('react-dom')]).then(([axe, ReactDOM]) => {
    axe.default(React, ReactDOM, 1000)
  })
}

bootstrapTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster />
    </QueryClientProvider>
  </React.StrictMode>,
)
