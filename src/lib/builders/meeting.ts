export function docFromMeeting(p: any) {
  const lines = [
    'Module: Meetings',
    (p.Subject || p.Event_Title || p.Title) && `Title: ${p.Subject || p.Event_Title || p.Title}`,
    (p.Start_DateTime || p.Start_Time) && `Start: ${p.Start_DateTime || p.Start_Time}`,
    (p.End_DateTime || p.End_Time) && `End: ${p.End_DateTime || p.End_Time}`,
    p.Location && `Location: ${p.Location}`,
    p.Description && `Notes: ${p.Description}`
  ].filter(Boolean);
  return lines.join('\n');
}

