const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

// Strip leading whitespace and punctuation before classifying the first character.
function firstSignificantChar(title: string): string {
  return title.replace(/^[\s\p{P}]+/u, "");
}

function startsWithLetter(title: string): boolean {
  return /^\p{L}/u.test(firstSignificantChar(title));
}

type SopForSort = { title: string; documentNumber?: string | null; id: string };

export function sopTitleComparator(a: SopForSort, b: SopForSort): number {
  const aLetter = startsWithLetter(a.title);
  const bLetter = startsWithLetter(b.title);

  // Rule: letter-initial titles before number/other-initial titles
  if (aLetter !== bLetter) return aLetter ? -1 : 1;

  // Within the same group: natural, case-insensitive, numeric-aware sort
  const byColl = collator.compare(a.title, b.title);
  if (byColl !== 0) return byColl;

  // Tie-breaker 1: documentNumber
  const aDoc = a.documentNumber ?? "";
  const bDoc = b.documentNumber ?? "";
  const byDoc = collator.compare(aDoc, bDoc);
  if (byDoc !== 0) return byDoc;

  // Tie-breaker 2: id (always stable)
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
