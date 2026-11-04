export default function WorkspaceScanMode({ workspace, disabled, onChange }) {
  return <select className="workspace-scan-mode" aria-label={`${workspace.name} 的项目扫描范围`}
    value={workspace.scanMode || 'folders'} disabled={disabled} onChange={event=>onChange(event.target.value)}>
    <option value="folders">直属文件夹</option>
    <option value="recursive">包含嵌套项目</option>
  </select>;
}
