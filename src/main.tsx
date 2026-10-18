import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app'
import { load_pixel_fonts } from './lib/studio/text-font'
import './index.css'

await load_pixel_fonts()
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
