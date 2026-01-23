import { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
// import { MicroAppLoader } from '@/components/MicroAppLoader';
import { MICRO_APPS } from '@/config/microApps';

const APP_ID = 'massage-web';

function MassageWebPage() {
  const addTab = useAppStore((state) => state.addTab);
  const app = MICRO_APPS.find((item) => item.id === APP_ID);

  useEffect(() => {
    if (app) {
      addTab(APP_ID);
    }
  }, [app, addTab]);

  if (!app) {
    return (
      <div className="h-full w-full flex items-center justify-center text-gray-500">
        子应用配置缺失
      </div>
    );
  }

  return <micro-app name={app.name} url={app.url} iframe />;
}

export default MassageWebPage;
