import {enableBrowserPush,disableBrowserPush,PUSH_INBOX_EVENT} from './services/browser-push';
declare const __TMS_API_BASE_URL__: string;
const status=document.getElementById('status')!;
let account:string|undefined;
async function currentAccount(){
 const response=await fetch(__TMS_API_BASE_URL__.replace(/\/$/,'')+'/auth/get-session',{credentials:'include'});
 const session=await response.json();
 if(!response.ok||!session?.user?.id) throw new Error('Sign in to the synthetic staging account first.');
 // Runtime audience/content policy remains the independent server-side gate.
 return String(session.user.id);
}
document.getElementById('enable')!.onclick=async()=>{
 try {
  if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
  account=await currentAccount();status.textContent=await enableBrowserPush(account,true);
 }
 catch {status.textContent='Registration failed. Check staging login and browser permission.';}
};
document.getElementById('disable')!.onclick=async()=>{
 try {await disableBrowserPush(true,account);status.textContent='Browser removed.';}
 catch {status.textContent='Removal could not be confirmed.';}
};
window.addEventListener(PUSH_INBOX_EVENT,()=>{status.textContent='A foreground push arrived. Confirm the test receipt with Instinct.';});
