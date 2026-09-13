/** Označí celý text při kliknutí do políčka i při příchodu Tabem */
export const selectAll = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => e.currentTarget.select()

export const inputClass =
  'px-3 py-2 rounded-lg border border-[var(--accent)]/40 bg-black/50 text-[var(--text)] focus:outline-none focus:border-[var(--accent)]'
