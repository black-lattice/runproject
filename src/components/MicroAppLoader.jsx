import { useEffect, useRef, useState } from 'react';

export function MicroAppLoader({ app }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const microAppRef = useRef(null);

  useEffect(() => {
    // 简单的加载逻辑
    const timer = setTimeout(() => {
      setLoading(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [app]);

  // 监听子应用挂载
  useEffect(() => {
    const handleMount = () => {
      console.log('[MicroAppLoader] App mounted:', app.name);
      setLoading(false);
    };

    const handleError = (e) => {
      console.error('[MicroAppLoader] App error:', e);
      setError('子应用加载失败，请检查网络连接');
      setLoading(false);
    };

    const currentRef = microAppRef.current;

    if (currentRef) {
      currentRef.addEventListener('mounted', handleMount);
      currentRef.addEventListener('error', handleError);
    }

    return () => {
      if (currentRef) {
        currentRef.removeEventListener('mounted', handleMount);
        currentRef.removeEventListener('error', handleError);
      }
    };
  }, [app]);

  if (error) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center text-red-500">
        <p className="text-lg font-semibold">加载失败</p>
        <p className="text-sm mt-2">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden bg-white relative">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-500">正在加载 {app.title}...</p>
          </div>
        </div>
      )}

      <micro-app
        ref={microAppRef}
        name={app.name}
        url={app.url}
        iframe
        keep-alive
      />
    </div>
  );
}
