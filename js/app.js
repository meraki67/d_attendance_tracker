const $=id=>document.getElementById(id);
const cfg=window.SUPABASE_CONFIG||{};
const configReady=cfg.url && cfg.key && !cfg.url.includes('PASTE_') && !cfg.key.includes('PASTE_');
const sb=configReady?window.supabase.createClient(cfg.url,cfg.key,{
  auth:{
    persistSession:true,
    autoRefreshToken:true,
    detectSessionInUrl:true,
    storage:window.localStorage
  }
}):null;
let user=null, profile=null, records=[], cutoffOffset=0, authMode='login', adminUsers=[];
const IDLE_TIMEOUT_MS=2*60*1000;
let idleInterval=null,lastActivityWrite=0;
function rawTime(t){return t?String(t).slice(0,5):''}
function initTimeSelects(){}
function applyTheme(theme='light',saveLocal=true){const t=theme==='dark'?'dark':'light';document.documentElement.dataset.theme=t;document.body.dataset.theme=t;const meta=$('themeColorMeta');if(meta)meta.content=t==='dark'?'#0b1220':'#f5f7fb';if(saveLocal)localStorage.setItem('attendanceTheme',t);document.querySelectorAll('.theme-option').forEach(b=>b.classList.toggle('active',b.dataset.theme===t));if($('themeSummary'))$('themeSummary').textContent=t==='dark'?'Dark':'Light'}
function renderAvatar(){if(!profile)return;const name=profile.name||'User',data=profile.avatarData||'';if($('profileAvatarName'))$('profileAvatarName').textContent=name;if($('profileAvatarInitials'))$('profileAvatarInitials').textContent=initials(name);if($('headerAvatarInitials'))$('headerAvatarInitials').textContent=initials(name);const pairs=[[$('profileAvatarImg'),$('profileAvatarInitials')],[$('headerAvatarImg'),$('headerAvatarInitials')]];pairs.forEach(([img,ini])=>{if(!img||!ini)return;if(data){img.src=data;img.classList.remove('hidden');ini.classList.add('hidden')}else{img.removeAttribute('src');img.classList.add('hidden');ini.classList.remove('hidden')}})}
async function compressAvatar(file){if(!file)return'';if(!/^image\/(png|jpeg|webp)$/.test(file.type))throw new Error('Please choose a JPG, PNG, or WebP image.');if(file.size>8*1024*1024)throw new Error('Image is too large. Maximum is 8 MB.');const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)});const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=data});const size=256,canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;const ctx=canvas.getContext('2d');const side=Math.min(img.width,img.height),sx=(img.width-side)/2,sy=(img.height-side)/2;ctx.drawImage(img,sx,sy,side,side,0,0,size,size);return canvas.toDataURL('image/jpeg',.82)}


function passwordChecks(password=''){
  return {
    length:password.length>=8,
    upper:/[A-Z]/.test(password),
    lower:/[a-z]/.test(password),
    number:/\d/.test(password),
    special:/[^A-Za-z0-9]/.test(password)
  };
}
function passwordIsStrong(password=''){return Object.values(passwordChecks(password)).every(Boolean)}
function renderPasswordRules(){
  const rules=$('passwordRules'); if(!rules)return;
  const checks=passwordChecks($('authPassword').value);
  rules.querySelectorAll('.password-rule').forEach(el=>{
    const ok=checks[el.dataset.rule];
    el.classList.toggle('pass',ok);
    el.classList.toggle('fail',!ok);
    el.textContent=(ok?'✓ ':'○ ')+el.textContent.replace(/^[✓○]\s*/, '');
  });
}

function toast(m){$('toast').textContent=m;$('toast').classList.remove('hidden');setTimeout(()=>$('toast').classList.add('hidden'),1800)}
function setSync(state,text){const b=$('syncBadge'); if(!b)return; b.className='sync-badge'+(state?` ${state}`:''); b.textContent=text||'Cloud'}
function pad(n){return String(n).padStart(2,'0')} function localDateStr(d=new Date()){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function parseLocalDate(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)}
function fmtDate(s,o={month:'short',day:'numeric',year:'numeric'}){return parseLocalDate(s).toLocaleDateString('en-US',o)}
function fmtTime(t){return t?String(t).slice(0,5):'—'} function minutes(t){if(!t)return 0;const [h,m]=String(t).split(':').map(Number);return h*60+m}
function uid(){return crypto.randomUUID()} function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function lateM(t){return Math.max(0,minutes(t)-minutes(profile?.shiftStart||'06:00'))}
function otM(a,b){if(!a||!b)return 0;let x=minutes(a),y=minutes(b);if(y<x)y+=1440;return Math.max(0,y-x)}
function eff(r){return r.status==='Present'&&lateM(r.timeIn)>0?'Late':r.status} function fmtOT(m){return (m/60).toFixed(m%60?2:0)}
function badge(s){return `badge-${s.toLowerCase().replace(/\s+/g,'-')}`}
function normalizeProfile(p){return {name:p?.name||user?.user_metadata?.name||'User',position:p?.position||user?.user_metadata?.position||'',email:p?.email||user?.email||'',role:p?.role||'user',shiftType:p?.shift_type||p?.shiftType||'day',shiftStart:rawTime(p?.shift_start||p?.shiftStart||'06:00'),shiftEnd:rawTime(p?.shift_end||p?.shiftEnd||'15:00'),dayOffs:p?.day_offs||p?.dayOffs||[],avatarData:p?.avatar_data||p?.avatarData||'',theme:p?.theme||'light'}}
function dbRecord(r){return {id:r.id,user_id:user.id,date:r.date,status:r.status,time_in:r.timeIn||null,time_out:r.timeOut||null,has_ot:!!r.hasOT,ot_start:r.otStart||null,ot_end:r.otEnd||null,remarks:r.remarks||'',entry_type:r.entryType||'manual',manually_edited:!!r.manuallyEdited,created_at:r.createdAt||new Date().toISOString(),updated_at:new Date().toISOString()}}
function appRecord(r){return {id:r.id,date:r.date,status:r.status,timeIn:rawTime(r.time_in),timeOut:rawTime(r.time_out),hasOT:r.has_ot,otStart:rawTime(r.ot_start),otEnd:rawTime(r.ot_end),remarks:r.remarks||'',entryType:r.entry_type,manuallyEdited:r.manually_edited,createdAt:r.created_at,updatedAt:r.updated_at}}

function roleLabel(role='user'){return ['admin','super_admin'].includes(role)?'Admin':'User'}
function isAdmin(){return ['admin','super_admin'].includes(profile?.role)}
function isSuperAdmin(){return profile?.role==='super_admin'}
function renderRoleAccess(){const allowed=isAdmin();document.querySelectorAll('.admin-only').forEach(el=>el.classList.toggle('hidden',!allowed));if(!allowed&&document.getElementById('usersView')?.classList.contains('active'))switchView('dashboardView');const badge=$('adminRoleBadge');if(badge){badge.textContent=roleLabel(profile?.role);badge.className=`role-badge ${['admin','super_admin'].includes(profile?.role)?'role-admin':'role-user'}`}}
function adminUserCard(p){const r=p.role||'user',protectedRole=r==='super_admin';return `<article class="user-admin-card" data-user-id="${p.user_id}"><div class="user-card-avatar">${esc(initials(p.name||'U'))}</div><div class="user-card-main"><div class="user-card-title"><strong>${esc(p.name||'Unnamed user')}</strong><span class="role-badge ${['admin','super_admin'].includes(r)?'role-admin':'role-user'}">${roleLabel(r)}</span></div><span>${esc(p.email||'No email')}</span><small>${esc(p.position||'No position')} • ${p.shift_type==='night'?'Night':'Day'} ${rawTime(p.shift_start)}–${rawTime(p.shift_end)}</small></div><button class="admin-edit-user-btn" data-admin-edit="${p.user_id}" ${protectedRole&&!isSuperAdmin()?'disabled':''}>${protectedRole&&!isSuperAdmin()?'Protected':'Manage'}</button></article>`}
async function loadAdminUsers(){if(!isAdmin())return;const list=$('usersList');if(list)list.innerHTML='<div class="empty-state">Loading users…</div>';const {data,error}=await sb.from('profiles').select('user_id,name,position,email,role,shift_type,shift_start,shift_end,day_offs,created_at').order('name',{ascending:true});if(error){if(list)list.innerHTML=`<div class="empty-state">${esc(error.message)}</div>`;return}adminUsers=data||[];renderAdminUsers()}
function renderAdminUsers(){if(!isAdmin())return;const q=($('userSearch')?.value||'').trim().toLowerCase();const rows=adminUsers.filter(p=>[p.name,p.email,p.position,p.role].some(v=>String(v||'').toLowerCase().includes(q)));$('registeredUserCount').textContent=`${adminUsers.length} registered user${adminUsers.length===1?'':'s'}`;$('usersList').innerHTML=rows.length?rows.map(adminUserCard).join(''):'<div class="panel empty-state">No users found.</div>';document.querySelectorAll('[data-admin-edit]').forEach(b=>b.onclick=()=>openAdminUserModal(b.dataset.adminEdit))}
function openAdminUserModal(id){
  const p=adminUsers.find(x=>x.user_id===id);if(!p)return;
  const targetSuper=p.role==='super_admin';
  $('adminEditUserId').value=p.user_id;
  $('adminEditIdentityName').textContent=p.name||'User';
  $('adminEditInitials').textContent=initials(p.name||'U');
  $('adminEditCurrentRole').textContent=roleLabel(p.role);
  $('adminEditName').value=p.name||'';
  $('adminEditPosition').value=p.position||'';
  $('adminEditEmail').value=p.email||'';
  $('adminEditRole').value=p.role==='admin'?'admin':'user';
  $('adminEditRole').disabled=targetSuper;
  $('adminEditShiftType').value=p.shift_type||'day';
  $('adminEditShiftStart').value=rawTime(p.shift_start||'06:00');
  $('adminEditShiftEnd').value=rawTime(p.shift_end||'15:00');
  $('adminResetPassword').value='';
  document.querySelectorAll('#adminDayOffPicker input').forEach(cb=>cb.checked=(p.day_offs||[]).includes(Number(cb.value)));
  $('adminDeleteUserBtn').classList.toggle('hidden',targetSuper||p.user_id===user.id);
  $('adminSaveUserBtn').disabled=targetSuper&&!isSuperAdmin();
  $('adminUserModal').classList.remove('hidden')
}
function closeAdminUserModal(){$('adminUserModal').classList.add('hidden')}
async function invokeAdminManage(body){
  const {data:{session}}=await sb.auth.getSession();
  if(!session)throw new Error('Your session expired. Please login again.');
  const {data,error}=await sb.functions.invoke('admin-manage-user',{
    body,
    headers:{Authorization:`Bearer ${session.access_token}`}
  });
  if(error)throw error;
  if(data?.error)throw new Error(data.error);
  return data;
}
function toggleAdminResetPassword(){
  const input=$('adminResetPassword'),show=input.type==='password';
  input.type=show?'text':'password';
  $('adminResetPasswordToggle').textContent=show?'Hide':'Show';
  $('adminResetPasswordToggle').setAttribute('aria-label',show?'Hide password':'Show password')
}
async function saveAdminUser(){
  const id=$('adminEditUserId').value,p=adminUsers.find(x=>x.user_id===id);if(!id||!p)return;
  const days=[...document.querySelectorAll('#adminDayOffPicker input:checked')].map(x=>Number(x.value));
  const name=$('adminEditName').value.trim(),position=$('adminEditPosition').value.trim(),email=$('adminEditEmail').value.trim().toLowerCase();
  const role=$('adminEditRole').value,shiftType=$('adminEditShiftType').value,shiftStart=$('adminEditShiftStart').value,shiftEnd=$('adminEditShiftEnd').value;
  const newPassword=$('adminResetPassword').value;
  if(!name||!position||!email||!shiftStart||!shiftEnd)return toast('Complete the required user fields');
  if(newPassword&&!passwordIsStrong(newPassword))return toast('New password must meet the password rules');
  const btn=$('adminSaveUserBtn');btn.disabled=true;
  try{
    await invokeAdminManage({action:'update',userId:id,name,position,email,role,shiftType,shiftStart,shiftEnd,dayOffs:days,newPassword});
    closeAdminUserModal();await loadAdminUsers();toast(newPassword?'User updated and password reset':'User account updated')
  }catch(e){toast(e.message||'Unable to update user')}
  finally{btn.disabled=false}
}
async function deleteAdminUserProfile(){
  const id=$('adminEditUserId').value,p=adminUsers.find(x=>x.user_id===id);if(!p)return;
  if(!confirm(`Permanently delete ${p.name}'s account, attendance data, and login? This cannot be undone.`))return;
  const btn=$('adminDeleteUserBtn');btn.disabled=true;
  try{
    await invokeAdminManage({action:'delete',userId:id});
    closeAdminUserModal();await loadAdminUsers();toast('User account permanently deleted')
  }catch(e){toast(e.message||'Unable to delete user')}
  finally{btn.disabled=false}
}
function hideAuthLoading(){const el=$('authLoading');if(el)el.classList.add('hidden')}

function idleKey(){return user?`attendanceLastActivity:${user.id}`:'attendanceLastActivity'}
function noteActivity(force=false){if(!user)return;const now=Date.now();if(force||now-lastActivityWrite>5000){localStorage.setItem(idleKey(),String(now));lastActivityWrite=now}}
function checkIdle(){if(!user)return;const last=Number(localStorage.getItem(idleKey())||Date.now());if(Date.now()-last>=IDLE_TIMEOUT_MS){logoutUser(true)}}
function startIdleSession(){if(!user)return;const existing=Number(localStorage.getItem(idleKey())||0);if(existing&&Date.now()-existing>=IDLE_TIMEOUT_MS){logoutUser(true);return}noteActivity(true);clearInterval(idleInterval);idleInterval=setInterval(checkIdle,10000)}
function stopIdleSession(){clearInterval(idleInterval);idleInterval=null}
['pointerdown','mousemove','keydown','touchstart','scroll'].forEach(evt=>window.addEventListener(evt,()=>noteActivity(),{passive:true}));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkIdle()});

function openAdminAddUserModal(){
  if(!isAdmin())return;
  $('adminNewName').value='';$('adminNewPosition').value='';$('adminNewEmail').value='';$('adminNewPassword').value='';
  $('adminNewRole').value='user';$('adminNewShiftType').value='day';$('adminNewShiftStart').value='06:00';$('adminNewShiftEnd').value='15:00';
  document.querySelectorAll('#adminNewDayOffPicker input').forEach(cb=>cb.checked=false);
  $('adminAddUserModal').classList.remove('hidden');
}
function closeAdminAddUserModal(){$('adminAddUserModal').classList.add('hidden')}
async function createAdminUser(){
  if(!isAdmin())return;
  const name=$('adminNewName').value.trim(),position=$('adminNewPosition').value.trim(),email=$('adminNewEmail').value.trim().toLowerCase(),password=$('adminNewPassword').value;
  const role=$('adminNewRole').value,shiftType=$('adminNewShiftType').value,shiftStart=$('adminNewShiftStart').value,shiftEnd=$('adminNewShiftEnd').value;
  const dayOffs=[...document.querySelectorAll('#adminNewDayOffPicker input:checked')].map(x=>Number(x.value));
  if(!name||!position||!email||!password||!shiftStart||!shiftEnd)return toast('Complete all required user fields');
  if(!passwordIsStrong(password))return toast('Temporary password must meet the password rules');
  const btn=$('adminCreateUserBtn');btn.disabled=true;
  try{
    await invokeAdminManage({action:'create',name,position,email,password,role,shiftType,shiftStart,shiftEnd,dayOffs});
    closeAdminAddUserModal();await loadAdminUsers();toast('User account created')
  }catch(e){toast(e.message||'Unable to create user')}
  finally{btn.disabled=false}
}
function toggleAdminNewPassword(){
  const input=$('adminNewPassword'),show=input.type==='password';input.type=show?'text':'password';
  $('adminNewPasswordToggle').textContent=show?'Hide':'Show';$('adminNewPasswordToggle').setAttribute('aria-label',show?'Hide password':'Show password')
}

function showAuth(){stopIdleSession();hideAuthLoading();$('authScreen').classList.remove('hidden');$('mainApp').classList.add('hidden')}
function showMain(){hideAuthLoading();$('authScreen').classList.add('hidden');$('mainApp').classList.remove('hidden');renderAll();startIdleSession()}
function greeting(){const h=new Date().getHours();return h<12?'GOOD MORNING':h<18?'GOOD AFTERNOON':'GOOD EVENING'}
function initials(n='U'){return n.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()}
function renderHeader(){$('greeting').textContent=greeting();$('headerName').textContent=profile.name;$('headerPosition').textContent=profile.position;renderAvatar()}
function getCutoffForDate(date){const y=date.getFullYear(),m=date.getMonth(),d=date.getDate();let start,end;if(d>=6&&d<=20){start=new Date(y,m,6);end=new Date(y,m,20)}else if(d>=21){start=new Date(y,m,21);end=new Date(y,m+1,5)}else{start=new Date(y,m-1,21);end=new Date(y,m,5)}return{start,end}}
function shiftCutoff(base,off){let c=getCutoffForDate(base);for(let i=0;i<Math.abs(off);i++){const n=off>0?new Date(c.end.getFullYear(),c.end.getMonth(),c.end.getDate()+1):new Date(c.start.getFullYear(),c.start.getMonth(),c.start.getDate()-1);c=getCutoffForDate(n)}return c}
function cutoffLabel(c){
  const sameYear=c.start.getFullYear()===c.end.getFullYear();
  const sameMonth=sameYear&&c.start.getMonth()===c.end.getMonth();
  const s=c.start.toLocaleDateString('en-US',{month:'short',day:'numeric'});
  const e=c.end.toLocaleDateString('en-US',{month:'short',day:'numeric'});
  const year=c.end.getFullYear();
  return sameMonth?`${s} – ${e}, ${year}`:`${s}, ${c.start.getFullYear()} – ${e}, ${year}`;
}
function summarize(rs){const s={Present:0,Late:0,Absent:0,'Day Off':0,Leave:0,Holiday:0,'Half Day':0,lateMinutes:0,otMinutes:0};rs.forEach(r=>{const st=eff(r);s[st]=(s[st]||0)+1;if(st==='Late')s.lateMinutes+=lateM(r.timeIn);s.otMinutes+=r.hasOT?otM(r.otStart,r.otEnd):0});const work=s.Present+s.Late+s.Absent+s['Half Day'],att=s.Present+s.Late+s['Half Day'];s.rate=work?Math.round(att/work*100):0;return s}
function recordRow(r,full=false){const st=eff(r),ot=r.hasOT?` • OT ${fmtOT(otM(r.otStart,r.otEnd))}h`:'';return `<button class="${full?'attendance-record-card':'record-item'}" data-edit="${r.id}" style="width:100%;background:none;border:0;text-align:left"><div class="record-main"><strong>${fmtDate(r.date,{weekday:'short',month:'short',day:'numeric'})}</strong><span>${esc(r.remarks||'No remarks')}${ot}</span></div><div class="record-side"><span class="badge ${badge(st)}">${st}</span><small>${r.timeIn?fmtTime(r.timeIn):'—'}${full&&r.timeOut?`–${fmtTime(r.timeOut)}`:''}</small>${full?'<em>Tap to edit</em>':''}</div></button>`}
function renderTodayOverview(){if(!profile)return;const now=new Date(),days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],shortDays=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];const day=now.getDay(),isOff=(profile.dayOffs||[]).includes(day);$('todayMonth').textContent=now.toLocaleDateString('en-US',{month:'short'}).toUpperCase();$('todayDateNumber').textContent=now.getDate();$('todayDayName').textContent=days[day];$('todayFullDate').textContent=now.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});$('todayWorkBadge').textContent=isOff?'DAY OFF':'WORK DAY';$('todayWorkBadge').classList.toggle('is-off',isOff);$('dashboardShiftType').textContent=profile.shiftType==='night'?'Night Shift':'Day Shift';$('dashboardShiftTime').textContent=`${profile.shiftStart}–${profile.shiftEnd}`;const offs=(profile.dayOffs||[]).map(d=>shortDays[d]);$('dashboardDayOff').textContent=offs.length?offs.join(', '):'Not set';$('dashboardDayOffHint').textContent=offs.length?(isOff?'Today is your day off':'Weekly schedule'):'Manage in Profile'}
function renderDashboard(){renderTodayOverview();const c=shiftCutoff(new Date(),cutoffOffset),rs=records.filter(r=>{const d=parseLocalDate(r.date);return d>=c.start&&d<=c.end}).sort((a,b)=>b.date.localeCompare(a.date)),s=summarize(rs);$('cutoffLabel').textContent=cutoffLabel(c);$('presentCount').textContent=s.Present;$('lateCount').textContent=s.Late;$('absentCount').textContent=s.Absent;$('dayOffCount').textContent=s['Day Off'];$('leaveCount').textContent=s.Leave;$('holidayCount').textContent=s.Holiday;$('otHoursCount').textContent=fmtOT(s.otMinutes);$('attendanceRate').textContent=`${s.rate}%`;$('attendanceProgress').style.width=`${s.rate}%`;$('lateMinutesTotal').textContent=s.lateMinutes;$('recentList').innerHTML=rs.length?rs.slice(0,5).map(r=>recordRow(r)).join(''):'No attendance records yet.'}
function renderAttendance(){const q=$('attendanceSearch').value.trim().toLowerCase(),f=$('statusFilter').value;const rs=records.slice().sort((a,b)=>b.date.localeCompare(a.date)).filter(r=>(f==='all'||eff(r)===f)&&(!q||`${eff(r)} ${r.remarks||''} ${r.date}`.toLowerCase().includes(q)));$('attendanceList').innerHTML=rs.length?rs.map(r=>recordRow(r,true)).join(''):'<div class="empty-state">No matching records.</div>';bindRows()}
function renderHistory(){const groups=new Map();records.forEach(r=>{const c=getCutoffForDate(parseLocalDate(r.date)),k=`${localDateStr(c.start)}_${localDateStr(c.end)}`;if(!groups.has(k))groups.set(k,{c,rs:[]});groups.get(k).rs.push(r)});const arr=[...groups.values()].sort((a,b)=>b.c.start-a.c.start);$('historyList').innerHTML=arr.length?arr.map(g=>{const s=summarize(g.rs);return `<div class="history-card"><strong>${cutoffLabel(g.c)}</strong><div class="history-stats"><span>Present ${s.Present}</span><span>Late ${s.Late}</span><span>Absent ${s.Absent}</span><span>Day Off ${s['Day Off']}</span><span>Leave ${s.Leave}</span><span>OT ${fmtOT(s.otMinutes)} hrs</span><span>Rate ${s.rate}%</span></div></div>`}).join(''):'<div class="empty-state">No history yet.</div>'}
function renderProfile(){$('profileName').value=profile.name;$('profilePosition').value=profile.position;$('profileShiftStart').value=rawTime(profile.shiftStart);$('profileShiftEnd').value=rawTime(profile.shiftEnd);document.querySelectorAll('.shift-option').forEach(b=>b.classList.toggle('active',b.dataset.shift===profile.shiftType));document.querySelectorAll('#dayOffPicker input').forEach(cb=>cb.checked=profile.dayOffs.includes(Number(cb.value)));$('scheduleSummary').textContent=`${profile.shiftType==='night'?'Night':'Day'} Shift • ${profile.shiftStart}–${profile.shiftEnd}`;const rb=$('profileRoleBadge');if(rb){rb.textContent=roleLabel(profile.role);rb.className=`role-badge ${['admin','super_admin'].includes(profile.role)?'role-admin':'role-user'}`}applyTheme(profile.theme||'light');renderAvatar()}
function renderAll(){renderHeader();renderDashboard();renderAttendance();renderHistory();renderProfile();renderRoleAccess();bindRows()}
function bindRows(){document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openModal(b.dataset.edit))}
function switchView(id){if(id==='usersView'&&!isAdmin())return;document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===id));document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.view===id));if(id==='attendanceView')renderAttendance();if(id==='historyView')renderHistory();if(id==='profileView')renderProfile();if(id==='usersView')loadAdminUsers()}
function openModal(id=null){const r=id?records.find(x=>x.id===id):null;$('recordId').value=r?.id||'';$('modalTitle').textContent=r?'Edit Attendance':'Manual Add Attendance';$('recordDate').max=localDateStr();$('recordDate').value=r?.date||localDateStr();$('recordStatus').value=r?.status==='Late'?'Present':(r?.status||'Present');$('recordTimeIn').value=rawTime(r?.timeIn||'');$('recordTimeOut').value=rawTime(r?.timeOut||'');$('recordRemarks').value=r?.remarks||'';$('recordHasOT').checked=!!r?.hasOT;$('recordOTStart').value=rawTime(r?.otStart||'');$('recordOTEnd').value=rawTime(r?.otEnd||'');$('deleteRecordBtn').classList.toggle('hidden',!r);$('attendanceModal').classList.remove('hidden');updateFields();if(!r&&profile.dayOffs.includes(parseLocalDate($('recordDate').value).getDay())){$('recordStatus').value='Day Off';updateFields()}}
function closeModal(){$('attendanceModal').classList.add('hidden')} function updateFields(){const show=['Present','Half Day'].includes($('recordStatus').value);$('timeFields').classList.toggle('hidden',!show);const lp=$('latePreview');if(show&&$('recordStatus').value==='Present'&&$('recordTimeIn').value){const l=lateM($('recordTimeIn').value);lp.textContent=l?`Automatic status: Late by ${l} minute${l>1?'s':''}`:'Automatic status: Present / On time';lp.classList.remove('hidden')}else lp.classList.add('hidden');$('otFields').classList.toggle('hidden',!$('recordHasOT').checked);if($('recordHasOT').checked)$('otPreview').textContent=`OT Total: ${fmtOT(otM($('recordOTStart').value,$('recordOTEnd').value))} hrs`}

async function loadCloud(){setSync('syncing','Syncing');const {data:p,error:pe}=await sb.from('profiles').select('*').eq('user_id',user.id).maybeSingle();if(pe)throw pe;if(!p){setSync('error','Account missing');const err=new Error('ACCOUNT_PROFILE_NOT_FOUND');err.code='ACCOUNT_PROFILE_NOT_FOUND';throw err}profile=normalizeProfile(p);const {data:r,error:re}=await sb.from('attendance').select('*').order('date',{ascending:false});if(re)throw re;records=(r||[]).map(appRecord);setSync('','Synced')}
async function saveProfileCloud(){setSync('syncing','Saving');const payload={user_id:user.id,name:profile.name,position:profile.position,shift_type:profile.shiftType,shift_start:profile.shiftStart,shift_end:profile.shiftEnd,day_offs:profile.dayOffs,avatar_data:profile.avatarData||'',theme:profile.theme||'light',updated_at:new Date().toISOString()};const {error}=await sb.from('profiles').upsert(payload,{onConflict:'user_id'});if(error)throw error;setSync('','Synced')}
async function saveRecordCloud(item){setSync('syncing','Saving');const {error}=await sb.from('attendance').upsert(dbRecord(item),{onConflict:'user_id,date'});if(error)throw error;setSync('','Synced')}
async function deleteRecordCloud(id){setSync('syncing','Saving');const {error}=await sb.from('attendance').delete().eq('id',id);if(error)throw error;setSync('','Synced')}

async function handleMissingAccount(){try{await sb.auth.signOut()}catch(_e){}user=null;profile=null;records=[];authMode='register';$('registerFields').classList.remove('hidden');$('passwordRules').classList.remove('hidden');$('authTitle').textContent='Create your account';$('authSubtitle').textContent='No active attendance profile was found for this login. Create an account to continue.';$('authSubmitBtn').textContent='Create Account';$('authSwitchBtn').textContent='Already have an account? Login';$('authPassword').autocomplete='new-password';$('authPassword').placeholder='Use a strong password';$('authMessage').textContent='This account is no longer active in the attendance database. Please create a new account. If you want to reuse the same email, delete the user first in Supabase Authentication > Users.';$('authMessage').classList.remove('hidden');showAuth();renderPasswordRules()}
$('authSwitchBtn').onclick=()=>{authMode=authMode==='login'?'register':'login';const reg=authMode==='register';$('registerFields').classList.toggle('hidden',!reg);$('passwordRules').classList.toggle('hidden',!reg);$('authTitle').textContent=reg?'Create your account':'Welcome back';$('authSubtitle').textContent=reg?'Your attendance will sync securely across devices.':'Sign in to sync your attendance across devices.';$('authSubmitBtn').textContent=reg?'Create Account':'Login';$('authSwitchBtn').textContent=reg?'Already have an account? Login':'Create an account';$('authPassword').autocomplete=reg?'new-password':'current-password';$('authPassword').placeholder=reg?'Use a strong password':'Enter your password';$('authMessage').classList.add('hidden');renderPasswordRules()};
$('togglePasswordBtn').onclick=()=>{const p=$('authPassword'),show=p.type==='password';p.type=show?'text':'password';$('togglePasswordBtn').setAttribute('aria-label',show?'Hide password':'Show password');$('togglePasswordBtn').title=show?'Hide password':'Show password';$('passwordEyeIcon').textContent=show?'🙈':'👁'};
$('authPassword').addEventListener('input',()=>{if(authMode==='register')renderPasswordRules()});
$('authSubmitBtn').onclick=async()=>{if(!configReady){$('authMessage').textContent='Supabase is not configured yet. Open js/config.js and add your Project URL and publishable/anon key.';$('authMessage').classList.remove('hidden');return}const email=$('authEmail').value.trim(),password=$('authPassword').value;if(!email||!password)return toast('Enter your email and password');$('authSubmitBtn').disabled=true;try{let res;if(authMode==='register'){const name=$('registerName').value.trim(),position=$('registerPosition').value.trim();if(!name||!position)throw new Error('Full Name and Position are required');if(!passwordIsStrong(password)){renderPasswordRules();throw new Error('Password does not meet all security requirements.')}res=await sb.auth.signUp({email,password,options:{data:{name,position}}});if(res.error)throw res.error;if(!res.data.session){$('authMessage').textContent='Account created. Check your email to confirm, then login.';$('authMessage').classList.remove('hidden');return}}else{res=await sb.auth.signInWithPassword({email,password});if(res.error)throw res.error}user=res.data.user||res.data.session?.user;noteActivity(true);await loadCloud();showMain()}catch(e){if(e?.code==='ACCOUNT_PROFILE_NOT_FOUND'||e?.message==='ACCOUNT_PROFILE_NOT_FOUND'){await handleMissingAccount()}else{$('authMessage').textContent=e.message||'Authentication failed';$('authMessage').classList.remove('hidden')}}finally{$('authSubmitBtn').disabled=false}};
async function logoutUser(idle=false){
  const oldKey=idleKey();stopIdleSession();
  try{await sb.auth.signOut()}catch(_e){}
  localStorage.removeItem(oldKey);
  user=null;profile=null;records=[];cutoffOffset=0;
  $('authPassword').value='';
  showAuth();
  if(idle){$('authMessage').textContent='You were logged out after 2 minutes of inactivity.';$('authMessage').classList.remove('hidden')}
}
$('logoutBtn').onclick=logoutUser;
if($('topLogoutBtn'))$('topLogoutBtn').onclick=logoutUser;
$('profileQuickBtn').onclick=()=>switchView('profileView');document.querySelectorAll('.nav-item').forEach(n=>n.onclick=()=>switchView(n.dataset.view));
const mainAppEl=$('mainApp'),sidebarToggle=$('sidebarToggle');
function applySidebarState(collapsed){mainAppEl.classList.toggle('sidebar-collapsed',collapsed);if(sidebarToggle){sidebarToggle.classList.toggle('is-collapsed',collapsed);sidebarToggle.setAttribute('aria-label',collapsed?'Expand sidebar':'Collapse sidebar');sidebarToggle.title=collapsed?'Expand sidebar':'Collapse sidebar'}}
if(sidebarToggle){applySidebarState(localStorage.getItem('attendanceSidebarCollapsed')==='1');sidebarToggle.onclick=()=>{const collapsed=!mainAppEl.classList.contains('sidebar-collapsed');applySidebarState(collapsed);localStorage.setItem('attendanceSidebarCollapsed',collapsed?'1':'0')}};$('prevCutoffBtn').onclick=()=>{cutoffOffset--;renderDashboard();bindRows()};$('nextCutoffBtn').onclick=()=>{cutoffOffset++;renderDashboard();bindRows()};$('currentCutoffBtn').onclick=()=>{cutoffOffset=0;renderDashboard();bindRows()};$('addAttendanceBtn').onclick=()=>openModal();$('addAttendanceBtn2').onclick=()=>openModal();$('viewAllBtn').onclick=()=>switchView('attendanceView');$('closeModalBtn').onclick=closeModal;$('recordStatus').onchange=updateFields;$('recordTimeIn').oninput=updateFields;$('recordHasOT').onchange=updateFields;$('recordOTStart').oninput=updateFields;$('recordOTEnd').oninput=updateFields;$('recordDate').onchange=()=>{if(!$('recordId').value&&profile.dayOffs.includes(parseLocalDate($('recordDate').value).getDay())){$('recordStatus').value='Day Off'}updateFields()};
$('saveRecordBtn').onclick=async()=>{const date=$('recordDate').value,status=$('recordStatus').value,editingId=$('recordId').value,hasOT=$('recordHasOT').checked;if(!date)return toast('Please select a date');if(parseLocalDate(date)>parseLocalDate(localDateStr()))return toast('Future dates are not allowed');if(['Present','Half Day'].includes(status)&&!$('recordTimeIn').value)return toast('Please enter Time In');if(hasOT&&(!$('recordOTStart').value||!$('recordOTEnd').value))return toast('Enter OT Start and End');const dup=records.find(r=>r.date===date&&r.id!==editingId);if(dup){toast('Attendance already exists for that date');return}const existing=editingId?records.find(r=>r.id===editingId):null;const item={id:editingId||uid(),date,status,timeIn:['Present','Half Day'].includes(status)?$('recordTimeIn').value:'',timeOut:['Present','Half Day'].includes(status)?$('recordTimeOut').value:'',hasOT,otStart:hasOT?$('recordOTStart').value:'',otEnd:hasOT?$('recordOTEnd').value:'',remarks:$('recordRemarks').value.trim(),entryType:existing?.entryType||'manual',manuallyEdited:!!existing,createdAt:existing?.createdAt||new Date().toISOString()};try{await saveRecordCloud(item);const i=records.findIndex(r=>r.id===item.id);if(i>=0)records[i]=item;else records.push(item);closeModal();renderAll();toast(existing?'Attendance updated':'Attendance saved')}catch(e){setSync('error','Sync error');toast(e.message)}};
$('deleteRecordBtn').onclick=async()=>{const id=$('recordId').value;if(!id||!confirm('Delete this attendance record?'))return;try{await deleteRecordCloud(id);records=records.filter(r=>r.id!==id);closeModal();renderAll();toast('Record deleted')}catch(e){toast(e.message)}};
$('attendanceSearch').oninput=renderAttendance;$('statusFilter').onchange=renderAttendance;$('saveProfileBtn').onclick=async()=>{profile.name=$('profileName').value.trim();profile.position=$('profilePosition').value.trim();if(!profile.name||!profile.position)return toast('Name and Position are required');try{await saveProfileCloud();renderAll();toast('Profile saved')}catch(e){toast(e.message)}};$('changeAvatarBtn').onclick=()=>$('avatarInput').click();$('avatarInput').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{profile.avatarData=await compressAvatar(f);renderAvatar();await saveProfileCloud();toast('Avatar updated')}catch(err){toast(err.message)}finally{e.target.value=''}};
async function changeTheme(t){profile.theme=t;applyTheme(t);try{await saveProfileCloud();toast(`${t==='dark'?'Dark':'Light'} theme applied`)}catch(e){toast(e.message)}}$('lightThemeBtn').onclick=()=>changeTheme('light');$('darkThemeBtn').onclick=()=>changeTheme('dark');
function setShift(t){profile.shiftType=t;$('profileShiftStart').value=t==='night'?'18:00':'06:00';$('profileShiftEnd').value=t==='night'?'03:00':'15:00';renderProfile()} $('dayShiftBtn').onclick=()=>setShift('day');$('nightShiftBtn').onclick=()=>setShift('night');
$('saveScheduleBtn').onclick=async()=>{profile.shiftStart=$('profileShiftStart').value;profile.shiftEnd=$('profileShiftEnd').value;profile.dayOffs=[...document.querySelectorAll('#dayOffPicker input:checked')].map(x=>Number(x.value));try{await saveProfileCloud();renderAll();toast('Schedule saved')}catch(e){toast(e.message)}};
if($('userSearch'))$('userSearch').oninput=renderAdminUsers;if($('closeAdminUserModalBtn'))$('closeAdminUserModalBtn').onclick=closeAdminUserModal;if($('adminCancelUserBtn'))$('adminCancelUserBtn').onclick=closeAdminUserModal;if($('adminSaveUserBtn'))$('adminSaveUserBtn').onclick=saveAdminUser;if($('adminDeleteUserBtn'))$('adminDeleteUserBtn').onclick=deleteAdminUserProfile;if($('adminEditShiftType'))$('adminEditShiftType').onchange=()=>{const t=$('adminEditShiftType').value;if(t==='night'){$('adminEditShiftStart').value='18:00';$('adminEditShiftEnd').value='03:00'}else{$('adminEditShiftStart').value='06:00';$('adminEditShiftEnd').value='15:00'}};if($('adminAddUserBtn'))$('adminAddUserBtn').onclick=openAdminAddUserModal;if($('closeAdminAddUserModalBtn'))$('closeAdminAddUserModalBtn').onclick=closeAdminAddUserModal;if($('adminCancelAddUserBtn'))$('adminCancelAddUserBtn').onclick=closeAdminAddUserModal;if($('adminCreateUserBtn'))$('adminCreateUserBtn').onclick=createAdminUser;if($('adminNewPasswordToggle'))$('adminNewPasswordToggle').onclick=toggleAdminNewPassword;if($('adminResetPasswordToggle'))$('adminResetPasswordToggle').onclick=toggleAdminResetPassword;if($('adminNewShiftType'))$('adminNewShiftType').onchange=()=>{const t=$('adminNewShiftType').value;if(t==='night'){$('adminNewShiftStart').value='18:00';$('adminNewShiftEnd').value='03:00'}else{$('adminNewShiftStart').value='06:00';$('adminNewShiftEnd').value='15:00'}};
$('exportBtn').onclick=()=>{const blob=new Blob([JSON.stringify({version:8,profile,records},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`attendance-backup-${localDateStr()}.json`;a.click();URL.revokeObjectURL(a.href)};
$('importInput').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{const d=JSON.parse(await f.text());if(!d.profile||!Array.isArray(d.records))throw new Error('Invalid backup');profile={...profile,...d.profile};await saveProfileCloud();for(const r of d.records){r.id=r.id||uid();await saveRecordCloud(r)}await loadCloud();renderAll();toast('Backup imported')}catch(err){toast(err.message)}e.target.value=''};
$('resetBtn').onclick=async()=>{if(!confirm('Delete all attendance records for this account?'))return;const {error}=await sb.from('attendance').delete().eq('user_id',user.id);if(error)return toast(error.message);records=[];renderAll();toast('Attendance cleared')};

(async function init(){
  applyTheme(localStorage.getItem('attendanceTheme')||'light',false);
  initTimeSelects();
  if(!configReady){
    showAuth();
    $('authMessage').textContent='Setup required: add your Supabase Project URL and publishable/anon key in js/config.js.';
    $('authMessage').classList.remove('hidden');
    return;
  }

  try{
    const {data:{session},error}=await sb.auth.getSession();
    if(error)throw error;
    if(session?.user){
      user=session.user;
      try{
        await loadCloud();
        showMain();
      }catch(e){
        if(e?.code==='ACCOUNT_PROFILE_NOT_FOUND'||e?.message==='ACCOUNT_PROFILE_NOT_FOUND')await handleMissingAccount();
        else{showAuth();$('authMessage').textContent=e.message||'Unable to restore your session';$('authMessage').classList.remove('hidden')}
      }
    }else{
      showAuth();
    }
  }catch(e){
    showAuth();
    $('authMessage').textContent=e.message||'Unable to restore your login session';
    $('authMessage').classList.remove('hidden');
  }

  sb.auth.onAuthStateChange(async(event,session)=>{
    if(event==='SIGNED_OUT'||!session){
      user=null;profile=null;records=[];
      showAuth();
      return;
    }
    if(['SIGNED_IN','TOKEN_REFRESHED','INITIAL_SESSION','USER_UPDATED'].includes(event)){
      if(!user||user.id!==session.user.id){
        user=session.user;
        try{
          await loadCloud();
          showMain();
        }catch(e){
          if(e?.code==='ACCOUNT_PROFILE_NOT_FOUND'||e?.message==='ACCOUNT_PROFILE_NOT_FOUND')await handleMissingAccount();
          else{showAuth();$('authMessage').textContent=e.message||'Unable to load account';$('authMessage').classList.remove('hidden')}
        }
      }
    }
  });
})();
