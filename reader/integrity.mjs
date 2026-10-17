export async function verifyResponse(response, file) {
 if (!response || response.status !== 200) throw new Error('Incomplete download: ' + file.path);
 const bytes = await response.clone().arrayBuffer();
 if (bytes.byteLength !== file.bytes) throw new Error('Size mismatch: ' + file.path);
 const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
 if (hash !== file.sha256) throw new Error('Content mismatch: ' + file.path);
 return response;
}
