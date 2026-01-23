import React from 'react';
import ReactDOM from 'react-dom/client';
import microApp from '@micro-zoe/micro-app';
import App from './App';
import './App.css';

// 初始化 micro-app
microApp.start({
  lifeCycles: {
    created(e) {
      console.log('[Micro-app] Created:', e.detail.name);
    },
    beforemount(e) {
      console.log('[Micro-app] Before mount:', e.detail.name);
    },
    mounted(e) {
      console.log('[Micro-app] Mounted:', e.detail.name);
    },
    unmount(e) {
      console.log('[Micro-app] Unmounted:', e.detail.name);
    },
    error(e) {
      console.error('[Micro-app] Error:', e.detail);
    }
  },
  iframe: true
  // // 自定义 fetch，禁用 credentials 避免 CORS 通配符冲突
  // fetch(url, options, appName) {
  //   return fetch(url, {
  //     ...options,
  //     credentials: 'omit'
  //   });
  // }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
