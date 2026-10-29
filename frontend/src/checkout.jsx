import React from 'react';
import ReactDOM from 'react-dom/client';
import CheckoutPage from './components/CheckoutPage.jsx';
import { AuthProvider } from './context/AuthContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <CheckoutPage />
    </AuthProvider>
  </React.StrictMode>,
);
