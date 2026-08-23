/**
 * The shell both legal pages are drawn in.
 *
 * Reachable without an account and linked from nowhere: these exist because
 * Google's consent screen asks for them, and whoever reads them is either a
 * reviewer fetching a URL or a player who went looking. Both want a readable
 * page rather than a product.
 */
export default function LegalDocument({ title, updated, children }) {
  return (
    <div className="min-h-screen py-10 px-4">
      <article className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-[0.2em] text-(--color-text-muted)">
            HomeGame
          </p>
          <h1 className="text-2xl font-bold text-(--color-silver)">{title}</h1>
          <p className="text-xs text-(--color-text-muted)">Last updated {updated}</p>
        </header>
        <div className="space-y-6 text-sm leading-relaxed text-(--color-text-muted)">
          {children}
        </div>
      </article>
    </div>
  );
}

/** One section: a heading and whatever it has to say. */
export function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-(--color-silver)">{title}</h2>
      {children}
    </section>
  );
}

/** A list, for the several places these documents are really a list. */
export function Points({ items }) {
  return (
    <ul className="space-y-1.5 pl-4">
      {items.map((item, index) => (
        <li key={index} className="list-disc marker:text-(--color-text-muted)">{item}</li>
      ))}
    </ul>
  );
}
