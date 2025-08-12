export function docFromCall(p: any) {
  const lines = [
    'Module: Calls',
    p.Subject && `Subject: ${p.Subject}`,
    p.Call_Start_Time && `When: ${p.Call_Start_Time}`,
    p.Call_Duration && `Duration: ${p.Call_Duration}`,
    p.Call_Result && `Result: ${p.Call_Result}`,
    p.Description && `Notes: ${p.Description}`,
    p.Phone && `Phone: ${p.Phone}`
  ].filter(Boolean);
  return lines.join('\n');
}

