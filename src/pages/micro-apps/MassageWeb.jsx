import { MICRO_APPS } from '@/config/microApps';

const APP_ID = 'massage-web';

function MassageWebPage() {
	const app = MICRO_APPS.find(item => item.id === APP_ID);

	if (!app) {
		return (
			<div className='h-full w-full flex items-center justify-center text-gray-500'>
				子应用配置缺失
			</div>
		);
	}

	return (
		<div className='h-full w-full overflow-hidden bg-white'>
			123
			<micro-app
				name={app.name}
				url={app.url}
				baseroute={app.baseroute}
				// iframe
			/>
		</div>
	);
}

export default MassageWebPage;
