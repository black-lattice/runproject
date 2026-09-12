export default function PageEmptyState({
  icon: Icon,
  title,
  description,
  children,
}) {
  return (
    <div className="page-empty-state">
      <div className="page-empty-icon">
        <Icon aria-hidden="true" />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {children && <div className="page-empty-actions">{children}</div>}
    </div>
  );
}
