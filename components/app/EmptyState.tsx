export default function EmptyState({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-surface/50 px-6 py-16 text-center">
      <div className="cover-c h-12 w-12 rounded-full opacity-80" />
      <p className="text-[15px] font-medium text-text">{title}</p>
      <p className="max-w-[220px] text-sm text-muted">{subtitle}</p>
    </div>
  );
}
