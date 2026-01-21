import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { MICRO_APPS } from '@/config/microApps';

const APP_ID = 'massage-web';

function MassageWebPage() {
	const navigate = useNavigate();
	const { addTab } = useAppStore();

	const app = MICRO_APPS.find(item => item.id === APP_ID);

	useEffect(() => {
		if (app) {
			addTab(APP_ID);
		}
	}, [app, addTab]);

	if (!app) {
		return (
			<div className='h-full w-full flex items-center justify-center text-gray-500'>
				子应用配置缺失
			</div>
		);
	}

	return (
		<div className='h-full w-full overflow-hidden bg-white'>
			<iframe
				src={app.url}
				className='w-full h-full border-0'
				title={app.title}
				allowFullScreen
			/>
		</div>
	);
}

export default MassageWebPage;
