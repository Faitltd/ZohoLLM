export function docFromTask(p: any) {
  const lines = [
    'Module: Tasks',
    p.Subject && `Subject: ${p.Subject}`,
    p.Due_Date && `Due: ${p.Due_Date}`,
    p.Status && `Status: ${p.Status}`,
    p.Description && `Notes: ${p.Description}`
  ].filter(Boolean);
  return lines.join('\n');
}

