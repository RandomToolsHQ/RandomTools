import {readFile,writeFile} from 'node:fs/promises';import {execFileSync} from 'node:child_process';import process from 'node:process';import console from 'node:console';
/* global fetch */
const root='.wrangler/phase9',work=JSON.parse(await readFile(root+'/workloads.json','utf8'));
if(work.verifiedAccounts!==true||!Array.isArray(work.samples)||!work.samples.length)throw Error('No verified authenticated workload exists. Do not benchmark denied requests as authenticated work.');
const {token}=JSON.parse(execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','auth','token','--json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true}));
const query='query($account:string,$start:string,$end:string){viewer{accounts(filter:{accountTag:$account}){workersInvocationsAdaptive(limit:100,filter:{scriptName:"randomtools-firebase-poc-api",datetime_geq:$start,datetime_leq:$end}){sum{requests errors} quantiles{cpuTimeP50 cpuTimeP95 cpuTimeP99} dimensions{status}}}}}';
const reports=[];
for(const s of work.samples){
 if(!Number.isFinite(Date.parse(s.start))||!Number.isFinite(Date.parse(s.end))||Date.parse(s.start)>=Date.parse(s.end)||!s.requests)throw Error('Invalid bounded measurement interval');
 const r=await fetch('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({query,variables:{account:'5c172e2e4c51cfc7dc512c96825b2912',start:s.start,end:s.end}})});const d=await r.json();
 if(!r.ok||d.errors?.length){reports.push({run:s.run,analyticsUnavailable:true});continue;}
 reports.push({run:s.run,groups:d.data.viewer.accounts[0].workersInvocationsAdaptive.map(x=>({status:x.dimensions.status,requests:x.sum.requests,errors:x.sum.errors,cpuP50ms:x.quantiles.cpuTimeP50/1000,cpuP95ms:x.quantiles.cpuTimeP95/1000,cpuP99ms:x.quantiles.cpuTimeP99/1000}))});
}
const report={script:'randomtools-firebase-poc-api',reports,limitation:'Adaptive/sampled analytics; correlate with observed HTTP and provider errors. Warm bounded requests cannot establish Free-plan reliability.'};await writeFile(root+'/cpu.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
