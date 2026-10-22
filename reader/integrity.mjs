export async function sha256(bytes) {
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export const objectDigest = value => sha256(new TextEncoder().encode(JSON.stringify(value)));
export async function verifyResponse(response, file) {
 if (!response || response.status !== 200) throw new Error('Incomplete download: ' + file.path);
 const bytes = await response.clone().arrayBuffer();
 if (bytes.byteLength !== file.bytes) throw new Error('Size mismatch: ' + file.path);
 const hash = await sha256(bytes);
 if (hash !== file.sha256) throw new Error('Content mismatch: ' + file.path);
 return response;
}
