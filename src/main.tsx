import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './App';
import { AppProvider } from './app/app-context';
import { createBackend } from './app/backend-factory';
import { readConfig } from './app/config';
import { SetupRequiredPage } from './ui/pages/SetupRequiredPage';
import './styles.css';

const config = readConfig(import.meta.env);
const backend = createBackend(config);

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    {backend ? (
      <AppProvider backend={backend}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AppProvider>
    ) : (
      <SetupRequiredPage />
    )}
  </StrictMode>,
);
