export function docFromContact(p: any) {
  const name = [p.First_Name, p.Last_Name].filter(Boolean).join(' ');
  const lines = [
    'Module: Contacts',
    name && `Name: ${name}`,
    p.Email && `Email: ${p.Email}`,
    p.Phone && `Phone: ${p.Phone}`,
    p.Mailing_Street && `Address: ${[p.Mailing_Street, p.Mailing_City, p.Mailing_State, p.Mailing_Zip].filter(Boolean).join(', ')}`,
    p.Account_Name && `Account: ${p.Account_Name}`,
    p.Description && `Notes: ${p.Description}`
  ].filter(Boolean);
  return lines.join('\n');
}

