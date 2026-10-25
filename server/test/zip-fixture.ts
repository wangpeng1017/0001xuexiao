import yazl from 'yazl';

export function createZip(files: Array<{ name: string; content: Buffer | string }>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile();
    for (const file of files) {
      zip.addBuffer(Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content), file.name);
    }
    const chunks: Buffer[] = [];
    zip.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.on('error', reject);
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zip.end();
  });
}
