/** Stand-in for a screen that is not built yet. */
export function PagePlaceholder({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-page flex-col gap-2 px-6 py-10">
      <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
      <p className="text-text-muted">{text}</p>
    </div>
  );
}
