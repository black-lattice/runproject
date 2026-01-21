import ProjectDetails from './ProjectDetails';
import WelcomeScreen from './WelcomeScreen';

function MainContent({
	selectedProject,
	runningCommands,
	onExecuteCommand,
	onStopCommand,
	onGetInstalledVersions
}) {
	return (
		<main className='flex-1 bg-white overflow-y-auto relative z-20'>
			{selectedProject ? (
				<ProjectDetails
					project={selectedProject}
					runningCommands={runningCommands}
					onExecuteCommand={onExecuteCommand}
					onStopCommand={onStopCommand}
					onGetInstalledVersions={onGetInstalledVersions}
				/>
			) : (
				<WelcomeScreen />
			)}
		</main>
	);
}

export default MainContent;
