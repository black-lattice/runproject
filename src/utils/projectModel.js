export const PROJECT_TYPE_LABELS = {
  node: 'Node.js', swift: 'Swift', rust: 'Rust', go: 'Go', python: 'Python',
  dotnet: '.NET', cmake: 'C/C++', directory: '项目目录',
};

export function normalizeProject(project) {
  if (!project) return project;
  const projectType = project.projectType || project.project_type || 'node';
  return {
    ...project,
    projectType,
    packageName: project.packageName ?? project.package_name ?? null,
    packageManager: projectType === 'node'
      ? project.packageManager || project.package_manager || 'npm' : '',
    nodeVersion: projectType === 'node'
      ? project.nodeVersion || project.node_version || null : null,
    commands: project.commands || [],
  };
}

export function projectPreference(project, preferences) {
  return preferences[`${project.name}_${project.path}`]
    ?? preferences[`${project.packageName}_${project.path}`] ?? {};
}
