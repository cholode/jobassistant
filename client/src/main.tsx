import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
// 挂载工作台；StrictMode 帮助开发时发现未正确清理的副作用。
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
