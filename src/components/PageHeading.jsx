export default function PageHeading({ title, description, children }) {
  return (
    <header className="page-heading">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {description && (
          <p className="page-heading-description">{description}</p>
        )}
      </div>
      {children && <div className="page-heading-actions">{children}</div>}
    </header>
  );
}
