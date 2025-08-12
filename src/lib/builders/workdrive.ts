export function docFromWorkDriveFile(p: any, chunkText?: string) {
  const lines = [
    'Module: WorkDrive',
    p.Path && `Path: ${p.Path}`,
    p.Name && `File: ${p.Name}`,
    p.Size && `Size: ${p.Size}`,
    p.Url && `URL: ${p.Url}`,
    chunkText && `Content:\n${(chunkText || '').trim()}`
  ].filter(Boolean);
  return lines.join('\n');
}

