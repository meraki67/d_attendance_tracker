import { storage } from './storage.js';

const $ = id => document.getElementById(id);
let profile = storage.getProfile();
let records = storage.getRecords();
let cutoffOffset = 0;

function uid(){return crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}
function pad(n){return String(n).padStart(2,'0')}
function localDateStr(d=new Date()){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function parseLocalDate(str){const [y,m,d]=str.split('-').map(Number);return new Date(y,m-1,d)}
function fmtDate(str, opts={month:'short',day:'numeric',year:'numeric'}){return parseLocalDate(str).toLocaleDateString('en-US',opts)}
function fmtTime(t){if(!t)return '—'; return t.slice(0,5)}
function minutes(t){if(!t)return 0; const [h,m]=t.split(':').map(Number); return h*60+m}
function getLateMinutes(timeIn){return Math.max(0, minutes(timeIn)-minutes(profile?.shiftStart || '06:00'))}
function getOTMinutes(start,end){
  if(!start||!end)return 0;
  let a=minutes(start), b=minutes(end);
  if(b<a)b+=24*60;
  return Math.max(0,b-a);
}
function getRecordOTMinutes(r){return r?.hasOT ? getOTMinutes(r.otStart,r.otEnd) : 0}
function formatOT(mins){return (mins/60).toFixed(mins%60===0?0:2)}
function effectiveStatus(r){ if(r.status==='Present' && getLateMinutes(r.timeIn)>0) return 'Late'; return r.status }
function badgeClass(s){return `badge-${s.toLowerCase().replace(/\s+/g,'-')}`}
function escapeHtml(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

function getCutoffForDate(date){
  const y=date.getFullYear(), m=date.getMonth(), d=date.getDate();
  let start,end;
  if(d>=6 && d<=20){start=new Date(y,m,6); end=new Date(y,m,20)}
  else if(d>=21){start=new Date(y,m,21); end=new Date(y,m+1,5)}
  else {start=new Date(y,m-1,21); end=new Date(y,m,5)}
  return {start,end};
}
function shiftCutoff(base, offset){
  let {start,end}=getCutoffForDate(base);
  if(offset===0)return {start,end};
  const steps=Math.abs(offset), dir=Math.sign(offset);
  for(let i=0;i<steps;i++){
    const next = dir>0 ? new Date(end.getFullYear(),end.getMonth(),end.getDate()+1) : new Date(start.getFullYear(),start.getMonth(),start.getDate()-1);
    ({start,end}=getCutoffForDate(next));
  }
  return {start,end};
}
function inCutoff(r,c){const d=parseLocalDate(r.date);return d>=c.start&&d<=c.end}
function cutoffLabel(c){const sameMonth=c.start.getMonth()===c.end.getMonth();const s=c.start.toLocaleDateString('en-US',{month:'short',day:'numeric'});const e=c.end.toLocaleDateString('en-US',{month:sameMonth?undefined:'short',day:'numeric',year:'numeric'});return `${s} – ${e}`}

function showSetup(){ $('setupScreen').classList.remove('hidden'); $('mainApp').classList.add('hidden') }
function showMain(){ $('setupScreen').classList.add('hidden'); $('mainApp').classList.remove('hidden'); renderAll() }
function greeting(){const h=new Date().getHours();return h<12?'GOOD MORNING':h<18?'GOOD AFTERNOON':'GOOD EVENING'}
function initials(name='U'){return name.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()}

function renderHeader(){ $('greeting').textContent=greeting(); $('headerName').textContent=profile.name; $('headerPosition').textContent=profile.position; $('profileQuickBtn').textContent=initials(profile.name) }
function summarize(rs){
  const s={Present:0,Late:0,Absent:0,'Day Off':0,Leave:0,Holiday:0,'Half Day':0,lateMinutes:0,otMinutes:0,otEntries:0};
  rs.forEach(r=>{const st=effectiveStatus(r);s[st]=(s[st]||0)+1;if(st==='Late')s.lateMinutes+=getLateMinutes(r.timeIn);const ot=getRecordOTMinutes(r);s.otMinutes+=ot;if(ot>0)s.otEntries++});
  const work=s.Present+s.Late+s.Absent+s['Half Day']; const attended=s.Present+s.Late+s['Half Day']; s.rate=work?Math.round((attended/work)*100):0; return s;
}
function renderDashboard(){
  const c=shiftCutoff(new Date(),cutoffOffset); $('cutoffLabel').textContent=cutoffLabel(c); const rs=records.filter(r=>inCutoff(r,c)).sort((a,b)=>b.date.localeCompare(a.date)); const s=summarize(rs);
  $('presentCount').textContent=s.Present; $('lateCount').textContent=s.Late; $('absentCount').textContent=s.Absent; $('dayOffCount').textContent=s['Day Off']; $('leaveCount').textContent=s.Leave; $('holidayCount').textContent=s.Holiday; $('otHoursCount').textContent=formatOT(s.otMinutes); $('attendanceRate').textContent=`${s.rate}%`; $('attendanceProgress').style.width=`${s.rate}%`; $('lateMinutesTotal').textContent=s.lateMinutes;
  $('recentList').innerHTML=rs.length?rs.slice(0,5).map(recordRow).join(''):'No attendance records yet.';
}
function recordRow(r){
  const st=effectiveStatus(r); const ot=getRecordOTMinutes(r); const extra=ot?` • OT ${formatOT(ot)}h`:'';
  const manual=r.entryType==='manual'||r.manuallyEdited?` • ${r.manuallyEdited?'Edited':'Manual'}`:'';
  return `<button class="record-item" data-edit="${r.id}" style="width:100%;background:none;border:0;text-align:left"><div class="record-main"><strong>${fmtDate(r.date,{weekday:'short',month:'short',day:'numeric'})}</strong><span>${escapeHtml(r.remarks||'No remarks')}${extra}${manual}</span></div><div class="record-side"><span class="badge ${badgeClass(st)}">${st}</span><small>${r.timeIn?fmtTime(r.timeIn):'—'}</small></div></button>`
}
function attendanceRow(r){
  const st=effectiveStatus(r); const ot=getRecordOTMinutes(r);
  const extra=ot?` • OT ${formatOT(ot)}h`:'';
  const manual=r.entryType==='manual'||r.manuallyEdited?` • ${r.manuallyEdited?'Edited':'Manual'}`:'';
  return `<button class="attendance-record-card" data-edit="${r.id}" aria-label="Edit attendance for ${r.date}">
    <div class="record-main"><strong>${fmtDate(r.date,{weekday:'short',month:'short',day:'numeric'})}</strong><span>${escapeHtml(r.remarks||'No remarks')}${extra}${manual}</span></div>
    <div class="record-side"><span class="badge ${badgeClass(st)}">${st}</span><small>${r.timeIn?fmtTime(r.timeIn):'—'}${r.timeOut?`–${fmtTime(r.timeOut)}`:''}</small><em>Tap to edit</em></div>
  </button>`;
}
function renderAttendance(){
  const q=$('attendanceSearch').value.trim().toLowerCase(); const f=$('statusFilter').value;
  const rs=records.slice().sort((a,b)=>b.date.localeCompare(a.date)).filter(r=>{const st=effectiveStatus(r);const matchesF=f==='all'||st===f;const text=`${st} ${r.remarks||''} ${r.date} ${r.hasOT?'ot overtime':''}`.toLowerCase();return matchesF&&(!q||text.includes(q))});
  $('attendanceList').innerHTML=rs.length?rs.map(attendanceRow).join(''):'<div class="empty-state">No matching records.</div>';
}
function renderHistory(){
  if(!records.length){$('historyList').innerHTML='<div class="empty-state">No history yet.</div>';return}
  const groups=new Map(); records.forEach(r=>{const c=getCutoffForDate(parseLocalDate(r.date));const k=`${localDateStr(c.start)}_${localDateStr(c.end)}`;if(!groups.has(k))groups.set(k,{c,rs:[]});groups.get(k).rs.push(r)});
  const arr=[...groups.values()].sort((a,b)=>b.c.start-a.c.start);
  $('historyList').innerHTML=arr.map(g=>{const s=summarize(g.rs);return `<div class="history-card"><strong>${cutoffLabel(g.c)}</strong><div class="history-stats"><span>Present ${s.Present}</span><span>Late ${s.Late}</span><span>Absent ${s.Absent}</span><span>Day Off ${s['Day Off']}</span><span>Leave ${s.Leave}</span><span>OT ${formatOT(s.otMinutes)} hrs</span><span>Rate ${s.rate}%</span></div></div>`}).join('');
}
function renderProfile(){ $('profileName').value=profile.name||''; $('profilePosition').value=profile.position||''; $('profileShiftStart').value=profile.shiftStart||'06:00'; $('profileShiftEnd').value=profile.shiftEnd||'15:00' }
function renderAll(){renderHeader();renderDashboard();renderAttendance();renderHistory();renderProfile();bindDynamicRows()}
function bindDynamicRows(){
  document.querySelectorAll('[data-edit]').forEach(el=>el.onclick=()=>openModal(el.dataset.edit));
}
function switchView(id){document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===id));document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.view===id));if(id==='attendanceView')renderAttendance();if(id==='historyView')renderHistory();if(id==='profileView')renderProfile()}
function openModal(id=null){
  const r=id?records.find(x=>x.id===id):null;
  $('recordId').value=r?.id||''; $('modalTitle').textContent=r?'Edit Attendance':'Manual Add Attendance'; $('recordDate').max=localDateStr(); $('recordDate').value=r?.date||localDateStr(); $('recordStatus').value=r?.status==='Late'?'Present':(r?.status||'Present'); $('recordTimeIn').value=r?.timeIn||''; $('recordTimeOut').value=r?.timeOut||''; $('recordRemarks').value=r?.remarks||'';
  $('recordHasOT').checked=!!r?.hasOT; $('recordOTStart').value=r?.otStart||''; $('recordOTEnd').value=r?.otEnd||'';
  $('deleteRecordBtn').classList.toggle('hidden',!r); $('attendanceModal').classList.remove('hidden'); updateTimeFields(); updateLatePreview(); updateOTFields();
}
function closeModal(){$('attendanceModal').classList.add('hidden')}
function updateTimeFields(){const show=['Present','Half Day'].includes($('recordStatus').value);$('timeFields').classList.toggle('hidden',!show);if(!show)$('latePreview').classList.add('hidden')}
function updateLatePreview(){if($('recordStatus').value!=='Present'||!$('recordTimeIn').value){$('latePreview').classList.add('hidden');return}const late=getLateMinutes($('recordTimeIn').value);$('latePreview').textContent=late?`Automatic status: Late by ${late} minute${late>1?'s':''}`:'Automatic status: Present / On time';$('latePreview').classList.remove('hidden')}
function updateOTFields(){
  const has=$('recordHasOT').checked; $('otFields').classList.toggle('hidden',!has);
  if(!has)return;
  const mins=getOTMinutes($('recordOTStart').value,$('recordOTEnd').value);
  $('otPreview').textContent=`OT Total: ${formatOT(mins)} hrs${$('recordOTStart').value&&$('recordOTEnd').value&&minutes($('recordOTEnd').value)<minutes($('recordOTStart').value)?' (next day)':''}`;
}
function toast(msg){$('toast').textContent=msg;$('toast').classList.remove('hidden');setTimeout(()=>$('toast').classList.add('hidden'),1800)}

$('continueBtn').onclick=()=>{const name=$('setupName').value.trim(),pos=$('setupPosition').value.trim();if(!name||!pos)return toast('Please enter Name and Position');profile={name,position:pos,shiftStart:$('setupShiftStart').value||'06:00',shiftEnd:$('setupShiftEnd').value||'15:00'};storage.saveProfile(profile);showMain()};
$('profileQuickBtn').onclick=()=>switchView('profileView'); document.querySelectorAll('.nav-item').forEach(n=>n.onclick=()=>switchView(n.dataset.view));
$('prevCutoffBtn').onclick=()=>{cutoffOffset--;renderDashboard();bindDynamicRows()};$('nextCutoffBtn').onclick=()=>{cutoffOffset++;renderDashboard();bindDynamicRows()};$('currentCutoffBtn').onclick=()=>{cutoffOffset=0;renderDashboard();bindDynamicRows()};
$('addAttendanceBtn').onclick=()=>openModal();$('addAttendanceBtn2').onclick=()=>openModal();$('viewAllBtn').onclick=()=>switchView('attendanceView');$('closeModalBtn').onclick=closeModal;$('attendanceModal').onclick=e=>{if(e.target===$('attendanceModal'))closeModal()};
$('recordStatus').onchange=()=>{updateTimeFields();updateLatePreview()};$('recordTimeIn').oninput=updateLatePreview;
$('recordHasOT').onchange=updateOTFields; $('recordOTStart').oninput=updateOTFields; $('recordOTEnd').oninput=updateOTFields;
$('saveRecordBtn').onclick=()=>{
  const date=$('recordDate').value,status=$('recordStatus').value,hasOT=$('recordHasOT').checked;
  const editingId=$('recordId').value;
  if(!date)return toast('Please select a date');
  if(parseLocalDate(date)>parseLocalDate(localDateStr()))return toast('Future attendance dates are not allowed');
  if(['Present','Half Day'].includes(status)&&!$('recordTimeIn').value)return toast('Please enter Time In');
  if(hasOT&&(!$('recordOTStart').value||!$('recordOTEnd').value))return toast('Please enter OT Start and OT End');
  if(hasOT&&getOTMinutes($('recordOTStart').value,$('recordOTEnd').value)<=0)return toast('OT duration must be greater than 0');

  const duplicate=records.find(r=>r.date===date && r.id!==editingId);
  if(duplicate){
    const openExisting=confirm(`Attendance already exists for ${fmtDate(date)}. Open the existing record for editing?`);
    if(openExisting)openModal(duplicate.id);
    return;
  }

  const existing=editingId?records.find(r=>r.id===editingId):null;
  const item={
    id:editingId||uid(),date,status,
    timeIn:['Present','Half Day'].includes(status)?$('recordTimeIn').value:'',
    timeOut:['Present','Half Day'].includes(status)?$('recordTimeOut').value:'',
    hasOT,otStart:hasOT?$('recordOTStart').value:'',otEnd:hasOT?$('recordOTEnd').value:'',
    remarks:$('recordRemarks').value.trim(),
    entryType:existing?.entryType||'manual',
    createdAt:existing?.createdAt||new Date().toISOString(),
    manuallyEdited:!!existing,
    updatedAt:new Date().toISOString()
  };
  const idx=records.findIndex(r=>r.id===item.id);
  if(idx>=0)records[idx]=item;else records.push(item);
  storage.saveRecords(records);closeModal();renderAll();toast(idx>=0?'Attendance updated':'Manual attendance saved')
};
$('deleteRecordBtn').onclick=()=>{const id=$('recordId').value;if(!id)return; if(!confirm('Delete this attendance record?'))return;records=records.filter(r=>r.id!==id);storage.saveRecords(records);closeModal();renderAll();toast('Record deleted')};
$('attendanceSearch').oninput=()=>{renderAttendance();bindDynamicRows()};$('statusFilter').onchange=()=>{renderAttendance();bindDynamicRows()};
$('saveProfileBtn').onclick=()=>{const name=$('profileName').value.trim(),position=$('profilePosition').value.trim();if(!name||!position)return toast('Name and Position are required');profile={...profile,name,position,shiftStart:$('profileShiftStart').value||'06:00',shiftEnd:$('profileShiftEnd').value||'15:00'};storage.saveProfile(profile);renderAll();toast('Profile saved')};
$('exportBtn').onclick=()=>{const blob=new Blob([JSON.stringify(storage.exportData(),null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`attendance-backup-${localDateStr()}.json`;a.click();URL.revokeObjectURL(a.href);toast('Backup exported')};
$('importInput').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{const data=JSON.parse(await file.text());storage.importData(data);profile=storage.getProfile();records=storage.getRecords();renderAll();toast('Backup restored')}catch(err){toast(err.message||'Import failed')}finally{e.target.value=''}};
$('resetBtn').onclick=()=>{if(!confirm('Reset profile and all attendance records? This cannot be undone unless you exported a backup.'))return;storage.reset();profile=null;records=[];showSetup();toast('App data reset')};

if(profile) showMain(); else showSetup();
