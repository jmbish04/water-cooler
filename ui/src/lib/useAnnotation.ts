export async function fetchAnnotation(input: { title: string; url?: string; content?: string }) {
  const r = await fetch('/ai/annotate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });
  if (!r.ok) throw new Error('AI annotate failed');
  return (await r.json()) as { category: string; score: number; summary: string };
}
