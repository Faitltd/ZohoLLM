export function docFromNote(p: any) {
  const lines = [
    'Module: Notes',
    p.Note_Title && `Title: ${p.Note_Title}`,
    p.Note_Content && `Content: ${p.Note_Content}`,
    p.Parent_Id && `Related To: ${p.Parent_Id}`
  ].filter(Boolean);
  return lines.join('\n');
}

