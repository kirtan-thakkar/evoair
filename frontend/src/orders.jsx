import React from 'react';
import ReactDOM from 'react-dom/client';
import OrdersPage from './components/OrdersPage.jsx';
import { AuthProvider } from './context/AuthContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <OrdersPage />
    </AuthProvider>
  </React.StrictMode>,
);
