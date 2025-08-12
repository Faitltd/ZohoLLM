export function docFromEmail(p: any) {
  const lines = [
    'Module: Emails',
    p.Subject && `Subject: ${p.Subject}`,
    (p.From || p.To || p.Cc) && `Participants: ${[p.From, p.To, p.Cc].filter(Boolean).join(' | ')}`,
    (p.Snippet || p.Body) && `Body: ${p.Snippet || p.Body}`,
    p.Date && `Date: ${p.Date}`
  ].filter(Boolean);
  return lines.join('\n');
}

