import ProjectDetails from './ProjectDetails';
import WelcomeScreen from './WelcomeScreen';

function MainContent({
	selectedProject,
	onAddWorkspace,
	runningCommands,
	onExecuteCommand,
	onStopCommand,
	onGetInstalledVersions
}) {
	return (
		<main className='project-main flex-1 overflow-y-auto relative z-20'>
			{selectedProject ? (
				<ProjectDetails
					project={selectedProject}
					runningCommands={runningCommands}
					onExecuteCommand={onExecuteCommand}
					onStopCommand={onStopCommand}
					onGetInstalledVersions={onGetInstalledVersions}
				/>
			) : (
				<WelcomeScreen onAddWorkspace={onAddWorkspace} />
			)}
		</main>
	);
}

export default MainContent;
