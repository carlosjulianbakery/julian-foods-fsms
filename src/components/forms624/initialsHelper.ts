export function deriveInitials(name: string | null | undefined, emailFallback?: string | null): string {
  const src = (name ?? "").trim();
  if (src) {
    const letters = src
      .split(/[\s\-]+/)
      .filter(Boolean)
      .map((w) => w.replace(/[^a-zA-ZÀ-ÿ]/g, "")[0] ?? "")
      .filter(Boolean)
      .join("")
      .toUpperCase()
      .slice(0, 4);
    if (letters) return letters;
  }
  if (emailFallback) {
    const letter = emailFallback.split("@")[0].replace(/[^a-zA-Z]/g, "")[0]?.toUpperCase();
    if (letter) return letter;
  }
  return "";
}

export function normalizeInitials(raw: string): string {
  return raw.replace(/[^a-zA-ZÀ-ÿ]/g, "").toUpperCase().slice(0, 4);
}

export function validateInitials(value: string): string | null {
  if (!normalizeInitials(value)) return "Initials are required";
  return null;
}
