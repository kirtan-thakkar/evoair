import React from 'react';
import ReactDOM from 'react-dom/client';
import AdminDashboard from './components/AdminDashboard.jsx';
import { AuthProvider } from './context/AuthContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <AdminDashboard />
    </AuthProvider>
  </React.StrictMode>,
);
