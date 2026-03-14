interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
}

export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 sm:mb-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-neutral-900">{title}</h1>
        {description && (
          <p className="text-sm text-neutral-500 mt-1">{description}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2 sm:gap-3 flex-wrap">{children}</div>}
    </div>
  );
}
