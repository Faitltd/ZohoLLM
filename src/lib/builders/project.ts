export function docFromProject(p: any) {
  const lines = [
    'Module: Projects',
    p.Project_Name && `Project: ${p.Project_Name}`,
    p.Status && `Status: ${p.Status}`,
    p.Owner && `Owner: ${p.Owner}`,
    p.Start_Date && `Start: ${p.Start_Date}`,
    p.End_Date && `End: ${p.End_Date}`,
    p.Description && `Notes: ${p.Description}`
  ].filter(Boolean);
  return lines.join('\n');
}

