// src/config/microApps.js
const isDev = import.meta.env.DEV;

export const MICRO_APPS = [
  {
    id: 'massage-web',
    name: 'massage-web',
    title: '按按管理平台',
    description: '公司平台子应用入口',

    // 直接使用子应用 URL
    url: isDev
      ? 'http://localhost:8080/massage-web/'
      : 'https://foxlair-dev.juhux.com/jbs-web',

    baseroute: '/massage-web',
    keepAlive: true
  }
];
