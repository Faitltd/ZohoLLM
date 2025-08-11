// src/lib/personKey.ts
import { createHash } from 'node:crypto';

/** tiny utils */
const norm = (s: any) => String(s ?? '').trim();
const lower = (s: any) => norm(s).toLowerCase();
const digits = (s: any) => norm(s).replace(/\D+/g, '');
const slug = (s: string) =>
  lower(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
const hash6 = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 6);

/** deep-get by dotted path */
function get(obj: any, path: string) {
  return path.split('.').reduce((acc, k) => (acc && k in acc ? (acc as any)[k] : undefined), obj);
}

/** case-insensitive scan for a key containing token (e.g., 'email', 'phone') */
function scanByToken(obj: any, token: string) {
  const t = token.toLowerCase();
  for (const [k, v] of Object.entries(obj || {})) {
    if (k.toLowerCase().includes(t) && typeof v === 'string' && v) return v as string;
  }
  return undefined;
}

/** best-guess extractors for Zoho payloads */
export function pickEmail(p: any): string {
  const CANDIDATES = [
    'Email', 'Primary_Email', 'Contact_Email',
    'Contact.email', 'Owner.email',
    'Account_Email', 'Work_Email'
  ];
  for (const k of CANDIDATES) {
    const v = get(p, k);
    if (v) return lower(v);
  }
  const scanned = scanByToken(p, 'email');
  return lower(scanned || '');
}

export function pickPhone(p: any): { phone: string; phoneDigits: string } {
  const CANDIDATES = [
    'Phone', 'Mobile', 'Work_Phone', 'Home_Phone',
    'Contact_Phone', 'Contact.mobile', 'Fax'
  ];
  for (const k of CANDIDATES) {
    const v = get(p, k);
    if (v) return { phone: norm(v), phoneDigits: digits(v) };
  }
  const scanned = scanByToken(p, 'phone') || scanByToken(p, 'mobile');
  return { phone: norm(scanned || ''), phoneDigits: digits(scanned || '') };
}

export function pickNameAndCompany(p: any): { name: string; company: string } {
  const first = get(p, 'First_Name') || get(p, 'FirstName') || '';
  const last = get(p, 'Last_Name') || get(p, 'LastName') || '';
  const full =
    get(p, 'Full_Name') ||
    get(p, 'Name') ||
    get(p, 'Lead_Name') ||
    get(p, 'Contact_Name') ||
    [first, last].filter(Boolean).join(' ');
  const company =
    get(p, 'Company') ||
    get(p, 'Account_Name') ||
    get(p, 'Organization') ||
    get(p, 'Org') ||
    get(p, 'Vendor_Name') ||
    '';
  return { name: norm(full), company: norm(company) };
}

export function pickAddressLine(p: any): string {
  // favor mailing/billing/shipping fields commonly seen in Zoho
  const parts = [
    get(p, 'Mailing_Street') || get(p, 'Street') || get(p, 'Address') || get(p, 'Mailing_Address'),
    get(p, 'City') || get(p, 'Mailing_City') || get(p, 'Billing_City') || get(p, 'Shipping_City'),
    get(p, 'State') || get(p, 'Mailing_State') || get(p, 'Billing_State') || get(p, 'Shipping_State'),
    get(p, 'Postal_Code') || get(p, 'Zip') || get(p, 'Mailing_Zip') || get(p, 'Billing_Code') || get(p, 'Shipping_Code'),
    get(p, 'Country') || get(p, 'Mailing_Country') || get(p, 'Billing_Country') || get(p, 'Shipping_Country')
  ]
    .filter(Boolean)
    .join(', ');
  return norm(parts);
}

/** Guess the Zoho module from common field shapes (optional but handy for meta) */
export function guessModule(p: any): string {
  if (p?.Note_Title || p?.Note_Content) return 'Notes';
  if (p?.Deal_Name || p?.Stage) return 'Deals';
  if (p?.Project_Name || p?.Project_Id) return 'Projects';
  if (p?.Task || p?.Due_Date) return 'Tasks';
  if (p?.Call_Duration || p?.Call_Start_Time) return 'Calls';
  if (p?.WorkDrive_Id || p?.File_Name || p?.Folder_Name) return 'WorkDrive';
  if (p?.Lead_Name || p?.Lead_Status) return 'Leads';
  if (p?.Contact_Name || p?.First_Name || p?.Last_Name) return 'Contacts';
  if (p?.Account_Name) return 'Accounts';
  return 'Unknown';
}

/**
 * Infer a stable per-person entity key.
 * Priority: email (lowercased) → phone digits → slug(name+company)+short-hash
 */
export function inferPersonKey(payload: any) {
  const email = pickEmail(payload);
  const { phone, phoneDigits } = pickPhone(payload);
  const { name, company } = pickNameAndCompany(payload);
  const address = pickAddressLine(payload);

  let entity = '';
  if (email) entity = email;
  else if (phoneDigits) entity = phoneDigits;
  else {
    const base = slug([name, company].filter(Boolean).join(' ')) || 'unknown';
    entity = `${base}-${hash6(JSON.stringify({ name, company }))}`;
  }

  return { entity, email, phone, phoneDigits, name, company, address };
}

/**
 * Chroma collection names have constraints. Produce a safe name:
 * - prefix with "entity_"
 * - only [a-z0-9-_], starts/ends alnum, <= 63 chars
 */
export function toCollectionName(entity: string) {
  let safe = slug(entity) || `e-${hash6(entity)}`;
  let name = `entity_${safe}`;
  if (name.length > 63) name = name.slice(0, 63);
  if (!/^[a-z0-9]/.test(name)) name = `e${name}`;
  if (!/[a-z0-9]$/.test(name)) name = `${name}0`;
  return name;
}

