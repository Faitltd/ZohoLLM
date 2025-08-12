export function docFromDeal(p: any) {
  const lines = [
    'Module: Deals',
    p.Deal_Name && `Deal Name: ${p.Deal_Name}`,
    p.Stage && `Stage: ${p.Stage}`,
    p.Amount && `Amount: ${p.Amount}`,
    p.Probability && `Probability: ${p.Probability}%`,
    p.Next_Step && `Next Step: ${p.Next_Step}`,
    p.Description && `Description: ${p.Description}`,
    p.Email && `Email: ${p.Email}`,
    p.Phone && `Phone: ${p.Phone}`,
    (p.Street || p.City || p.Zip_Code) && `Address: ${[p.Street, p.City, p.Zip_Code].filter(Boolean).join(', ')}`,
    p.Account_Name && `Account: ${p.Account_Name}`
  ].filter(Boolean);
  return lines.join('\n');
}

