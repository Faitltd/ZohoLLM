import { docFromDeal } from './deal';
import { docFromNote } from './note';
import { docFromCall } from './call';
import { docFromTask } from './task';
import { docFromContact } from './contact';
import { docFromLead } from './lead';
import { docFromProject } from './project';
import { docFromWorkDriveFile } from './workdrive';

export function buildDoc(moduleName: string, payload: any): string {
  const m = (moduleName || '').toLowerCase();
  try {
    if (m === 'deals') return docFromDeal(payload);
    if (m === 'notes') return docFromNote(payload);
    if (m === 'calls') return docFromCall(payload);
    if (m === 'tasks') return docFromTask(payload);
    if (m === 'contacts') return docFromContact(payload);
    if (m === 'leads') return docFromLead(payload);
    if (m === 'projects') return docFromProject(payload);
  } catch {}
  // fallback: structured dump
  const header = moduleName ? `Module: ${moduleName}\n` : '';
  const body = Object.entries(payload).map(([k, v]) => `${k}: ${String(v)}`).join('\n');
  return header + body;
}

export { docFromWorkDriveFile };

