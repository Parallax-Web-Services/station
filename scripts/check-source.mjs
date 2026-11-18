import { readdir, readFile, lstat } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const excluded=new Set(['.git','node_modules','bin','obj','artifacts','.build','.state']);
const errors=[];
const secrets=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/,/\bAKIA[A-Z0-9]{16}\b/,/\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}\b/];
async function walk(dir){for(const item of await readdir(dir,{withFileTypes:true})){
 if(excluded.has(item.name))continue;
 const file=resolve(dir,item.name),name=relative(root,file).replaceAll('\\','/');
 if((await lstat(file)).isSymbolicLink()){errors.push(name+': symlink is not allowed in the public source baseline');continue;}
 if(item.isDirectory()){
  if(['workspace-profiles','shell-profile','drafts','evidence'].includes(item.name))errors.push(name+': private state must not be published');
  await walk(file);continue;
 }
 if(/^\.env(?:\.|$)/.test(item.name)||/\.(?:pfx|p12|key)$/i.test(item.name)||item.name==='workspace-context.json')errors.push(name+': private file');
 const content=await readFile(file);
 if(secrets.some(pattern=>pattern.test(content.toString('utf8'))))errors.push(name+': possible secret; inspect locally');
}}
await walk(root);
const build=await readFile(resolve(root,'scripts/build-shell.mjs'),'utf8');
for(const forbidden of ['slipstream/node_modules','marketing/public','shchytok/parallax','/mnt/','/home/'])if(build.includes(forbidden))errors.push('Build depends on a sibling checkout or local machine: '+forbidden);
for(const file of ['LICENSE','BRANDING.md','SECURITY.md','package-lock.json','shared/core/LICENSE','shared/helm/LICENSE','windows/ThirdParty/Fonts/Inter-OFL.txt']){
 try{await readFile(resolve(root,file));}catch{errors.push('Missing publication input: '+file);}
}
if(errors.length){for(const error of errors)console.error(error);process.exitCode=1;}else console.log('Public-source checks passed: no known secret patterns, private state, symlinks or sibling build dependencies. This bounded scan does not replace review.');
