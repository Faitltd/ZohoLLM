export function docFromLead(p: any) {
  const lines = [
    'Module: Leads',
    p.Lead_Name && `Name: ${p.Lead_Name}`,
    p.Company && `Company: ${p.Company}`,
    p.Lead_Status && `Status: ${p.Lead_Status}`,
    p.Email && `Email: ${p.Email}`,
    p.Phone && `Phone: ${p.Phone}`,
    p.Description && `Notes: ${p.Description}`
  ].filter(Boolean);
  return lines.join('\n');
}

