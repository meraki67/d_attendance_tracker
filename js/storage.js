const KEYS = { profile: 'attendance_profile_v1', records: 'attendance_records_v1' };
export const storage = {
  getProfile(){ try{return JSON.parse(localStorage.getItem(KEYS.profile))}catch{return null}},
  saveProfile(profile){ localStorage.setItem(KEYS.profile, JSON.stringify(profile)) },
  getRecords(){ try{return JSON.parse(localStorage.getItem(KEYS.records)) || []}catch{return []}},
  saveRecords(records){ localStorage.setItem(KEYS.records, JSON.stringify(records)) },
  exportData(){ return { version:3, exportedAt:new Date().toISOString(), profile:this.getProfile(), records:this.getRecords() } },
  importData(data){ if(!data || ![1,2,3].includes(data.version) || !data.profile || !Array.isArray(data.records)) throw new Error('Invalid backup file'); this.saveProfile(data.profile); this.saveRecords(data.records) },
  reset(){ localStorage.removeItem(KEYS.profile); localStorage.removeItem(KEYS.records) }
};
