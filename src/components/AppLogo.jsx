import logoDark from '@/assets/logo/moon-logo-dark-512.png';
import logoLight from '@/assets/logo/moon-logo-light-512.png';

function AppLogo({ className = '' }) {
	return (
		<picture className={className}>
			<source media='(prefers-color-scheme: dark)' srcSet={logoDark} />
			<img
				src={logoLight}
				alt='RunProject'
				className='h-full w-full rounded-md object-cover'
				draggable='false'
			/>
		</picture>
	);
}

export default AppLogo;
