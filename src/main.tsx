import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { storedPreference } from './lib/preferences'
import './index.css'

const theme = storedPreference('theme')
document.documentElement.classList.toggle('dark', theme === 'dark' || (theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches))

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
