import './styles/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/app'
import { createAppRouter } from './app/router'
import { queryClient } from './lib/query-client'
import { installGlobalErrorReporting } from './lib/report-error'

installGlobalErrorReporting()

const router = createAppRouter({ queryClient })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App queryClient={queryClient} router={router} />
  </StrictMode>
)
