import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth';
import { GameProvider } from './game';
import { LanguageProvider } from './i18n';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LanguageProvider>
      <AuthProvider>
        <GameProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </GameProvider>
      </AuthProvider>
    </LanguageProvider>
  </React.StrictMode>
);
