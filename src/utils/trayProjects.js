export function trayProjects(data) {
  const seen = new Set();
  const usage = data?.commandUsage || [];
  const scores = new Map();
  const projectScores = new Map();
  for (const item of usage) {
    const key = `${item.projectPath}::${item.commandName}`;
    if (scores.has(key)) continue;
    scores.set(key, item);
    const score = projectScores.get(item.projectPath) || { count: 0, lastStartedAt: 0 };
    projectScores.set(item.projectPath, {
      count: score.count + item.count,
      lastStartedAt: Math.max(score.lastStartedAt, item.lastStartedAt),
    });
  }
  const compare = (a, b) => (b?.count || 0) - (a?.count || 0)
    || (b?.lastStartedAt || 0) - (a?.lastStartedAt || 0);
  return (data?.workspaces || []).flatMap(workspace =>
    (workspace.projects || []).flatMap(project => {
      if (!project.path || seen.has(project.path)) return [];
      seen.add(project.path);
      return [{
        ...project,
        commands: (project.commands || []).flatMap(command => {
          const saved = data.commandTags?.[`${project.path}::${command.name}`];
          const tags = Array.isArray(saved)
            ? [...new Set(saved.filter(tag => typeof tag === 'string').map(tag => tag.trim()).filter(Boolean))]
            : [];
          return tags.length ? [{ ...command, tags }] : [];
        }).sort((a, b) => compare(scores.get(`${project.path}::${a.name}`), scores.get(`${project.path}::${b.name}`))),
      }];
    }),
  ).sort((a, b) => compare(projectScores.get(a.path), projectScores.get(b.path)));
}
