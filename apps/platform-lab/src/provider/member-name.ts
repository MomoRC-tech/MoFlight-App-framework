/** Display text only: never an identity, matching key or change to source evidence. */
export function abbreviatedMemberName(raw: string): string {
  return raw.split(/\r?\n/).map(line => {
    const text = line.replace(/\s+/g, ' ').trim();
    if (!text) return '';
    const comma = text.split(',').map(part => part.trim());
    if (comma.length === 2 && comma.every(Boolean)) {
      return `${comma[1]!.split(' ')[0]} ${[...comma[0]!][0]}.`;
    }
    // Unexpected comma shapes remain abbreviated instead of exposing a surname.
    if (comma.length > 1) return `${[...text][0]}.`;
    const words = text.split(' ');
    return words.length === 1 ? `${[...text][0]}.` : `${words[0]} ${[...words.at(-1)!][0]}.`;
  }).filter(Boolean).join(' · ');
}
