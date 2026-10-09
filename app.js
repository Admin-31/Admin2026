/* EVENT CHECK-IN — GitHub Pages Edition. Semua data disimpan lokal di browser. */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const DB_NAME = "event-check-in-static-v1";
  const DB_VERSION = 1;
  const STORES = { participants: "participants", attendance: "attendance", logs: "logs", queue: "queue" };
  const DEFAULT_SETTINGS = {
    title: "EVENT CHECK-IN", subtitle: "Registrasi & absensi acara",
    eventName: "Konferensi / Seminar", eventDate: new Date().toISOString().slice(0,10),
    eventLocation: "Lokasi kegiatan", idPrefix: "EVT2026-", urlParam: "id",
    successMessage: "CHECK-IN BERHASIL", primaryColor: "#0b4f47"
  };
  let db, settings = readSettings(), currentStream = null, cameraDevices = [], cameraIndex = 0, scanLoop = null;
  let lastScanned = "", lastScanAt = 0, deferredInstallPrompt = null, currentResult = null;

  function readSettings() {
    try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem("ec-settings") || "{}") }; }
    catch { return { ...DEFAULT_SETTINGS }; }
  }
  function saveSettings(s) {
    settings = { ...settings, ...s };
    localStorage.setItem("ec-settings", JSON.stringify(settings));
    applySettings();
  }
  function applySettings() {
    document.documentElement.style.setProperty("--primary", settings.primaryColor || DEFAULT_SETTINGS.primaryColor);
    $("#brandTitle").textContent = settings.title;
    $("#brandSubtitle").textContent = settings.subtitle;
    $("#eventName").textContent = settings.eventName;
    $("#eventMeta").textContent = [settings.eventDate, settings.eventLocation].filter(Boolean).join(" · ");
    document.title = settings.title + " — EVENT CHECK-IN";
  }
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORES.participants)) d.createObjectStore(STORES.participants, { keyPath: "participant_code" });
        if (!d.objectStoreNames.contains(STORES.attendance)) d.createObjectStore(STORES.attendance, { keyPath: "key" });
        if (!d.objectStoreNames.contains(STORES.logs)) d.createObjectStore(STORES.logs, { keyPath: "id" });
        if (!d.objectStoreNames.contains(STORES.queue)) d.createObjectStore(STORES.queue, { keyPath: "transaction_id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function tx(store, mode = "readonly") { return db.transaction(store, mode).objectStore(store); }
  function reqPromise(req) { return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
  async function all(store) { return reqPromise(tx(store).getAll()); }
  async function get(store, key) { return reqPromise(tx(store).get(key)); }
  async function put(store, value) { return reqPromise(tx(store, "readwrite").put(value)); }
  async function remove(store, key) { return reqPromise(tx(store, "readwrite").delete(key)); }
  async function clearStore(store) { return reqPromise(tx(store, "readwrite").clear()); }
  function toast(message, type = "") {
    const el = document.createElement("div"); el.className = "toast " + type; el.textContent = message;
    $("#toastRegion").append(el); setTimeout(() => el.remove(), 4200);
  }
  function esc(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
  function formatTime(v) { if (!v) return "—"; try { return new Intl.DateTimeFormat("id-ID", { dateStyle:"medium", timeStyle:"medium" }).format(new Date(v)); } catch { return v; } }
  function todayStart() { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); }
  function participantKey(eventName, code) { return `${eventName}::${code}`; }
  function makeId() { return crypto.randomUUID ? crypto.randomUUID() : `tx-${Date.now()}-${Math.random().toString(16).slice(2)}`; }

  async function renderStats() {
    const [participants, attendance, queue] = await Promise.all([all(STORES.participants), all(STORES.attendance), all(STORES.queue)]);
    const activeParticipants = participants.filter(p => (p.registration_status || "terdaftar").toLowerCase() !== "nonaktif");
    const present = attendance.filter(a => a.event_name === settings.eventName);
    const pending = queue.filter(q => q.status === "menunggu");
    $("#statPresent").textContent = present.length;
    $("#statQueue").textContent = pending.length;
    $("#statTotal").textContent = activeParticipants.length;
    $("#statAbsent").textContent = Math.max(0, activeParticipants.length - present.length);
    $("#reportTotal").textContent = activeParticipants.length;
    $("#reportPresent").textContent = present.length;
    $("#reportAbsent").textContent = Math.max(0, activeParticipants.length - present.length);
    $("#reportPercent").textContent = activeParticipants.length ? Math.round(present.length / activeParticipants.length * 100) + "%" : "0%";
    $("#queueTitle").textContent = `${pending.length} transaksi menunggu`;
  }
  async function addLog(code, status, participantCode = "") {
    await put(STORES.logs, { id: makeId(), event_name: settings.eventName, scanned_code: code, participant_code: participantCode, scan_time: new Date().toISOString(), result_status: status });
  }
  function parseCode(raw) {
    let value = String(raw || "").trim();
    if (!value) return "";
    try {
      const u = new URL(value);
      const p = u.searchParams.get(settings.urlParam || "id");
      if (p) value = p.trim();
      else {
        const last = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || "");
        if (last && /^[A-Za-z0-9_-]{3,80}$/.test(last)) value = last;
      }
    } catch { /* Bukan URL: dianggap kode langsung. */ }
    return value.replace(/\s+/g, "").slice(0, 100);
  }
  function validCode(code) {
    if (!code || code.length < 3 || code.length > 80) return false;
    if (!/^[A-Za-z0-9_-]+$/.test(code)) return false;
    if (settings.idPrefix && settings.idPrefix.trim() && !code.startsWith(settings.idPrefix.trim())) {
      // Prefix merupakan petunjuk format, bukan syarat mutlak agar ID lama tetap dapat dicari.
    }
    return true;
  }
  async function verify(raw) {
    const original = String(raw || "").trim();
    const code = parseCode(original);
    if (!validCode(code)) {
      showResult({ type:"error", heading:"ID TIDAK VALID", message:"Masukkan ID peserta yang valid.", code });
      await addLog(original, "id_tidak_valid"); await renderStats(); return;
    }
    const participant = await get(STORES.participants, code);
    if (!participant) {
      showResult({ type:"error", heading:"PESERTA TIDAK TERDAFTAR", message:"ID tidak ditemukan di data lokal perangkat ini.", code });
      await addLog(code, "tidak_ditemukan"); await renderStats(); return;
    }
    if ((participant.registration_status || "terdaftar").toLowerCase() !== "terdaftar") {
      showResult({ type:"error", heading:"REGISTRASI TIDAK AKTIF", message:"Peserta ini tidak berstatus terdaftar aktif.", code, participant });
      await addLog(code, "registrasi_nonaktif", code); await renderStats(); return;
    }
    const key = participantKey(settings.eventName, code);
    const existing = await get(STORES.attendance, key);
    if (existing) {
      showResult({ type:"warning", heading:"ANDA SUDAH TERABSEN", message:`Check-in pertama: ${formatTime(existing.checkin_time)}`, code, participant, attendance:existing });
      await addLog(code, "sudah_terabsen", code); await renderStats(); return;
    }
    const now = new Date().toISOString();
    const record = { key, event_name: settings.eventName, participant_code: code, full_name: participant.full_name, institution: participant.institution || "", checkin_time: now, received_at: null, device_id: getDeviceId(), sync_status:"lokal_menunggu" };
    await put(STORES.attendance, record);
    const queueRecord = { transaction_id: makeId(), event_name: settings.eventName, participant_code: code, checkin_time_local: now, created_at: now, device_id: getDeviceId(), status:"menunggu" };
    await put(STORES.queue, queueRecord);
    await addLog(code, "checkin_berhasil", code);
    showResult({ type:"success", heading:"SELAMAT DATANG", message:settings.successMessage || "CHECK-IN BERHASIL", code, participant, attendance:record });
    await renderStats();
  }
  function getDeviceId() {
    let id = localStorage.getItem("ec-device-id");
    if (!id) { id = makeId(); localStorage.setItem("ec-device-id", id); }
    return id;
  }
  function showResult(r) {
    currentResult = r;
    const badge = $("#resultBadge");
    badge.className = "result-badge " + (r.type || "neutral");
    badge.textContent = r.type === "success" ? "BERHASIL" : r.type === "warning" ? "PERHATIAN" : r.type === "error" ? "DITOLAK" : "SIAP";
    $("#resultHeading").textContent = r.heading || "Hasil verifikasi";
    const p = r.participant;
    if (!p) {
      $("#resultContent").className = "result-content empty-result";
      $("#resultContent").innerHTML = `<div class="avatar avatar-large">${r.type === "error" ? "!" : "?"}</div><strong>${esc(r.heading || "Belum ada peserta")}</strong><p class="result-message">${esc(r.message || "")}</p>${r.code ? `<p class="profile-id">${esc(r.code)}</p>` : ""}`;
      return;
    }
    const img = p.photo_url ? `<img src="${esc(p.photo_url)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : "";
    $("#resultContent").className = "result-content";
    $("#resultContent").innerHTML = `<div class="profile"><div class="avatar">${img || esc((p.full_name || "?").trim().slice(0,1).toUpperCase())}</div><span class="profile-id">${esc(p.participant_code)}</span><h3>${esc(p.full_name)}</h3><span class="institution">${esc(p.institution || "Lembaga tidak dicantumkan")}</span><p class="result-message">${esc(r.message || "")}</p><div class="profile-details"><div class="detail"><span>Status registrasi</span><strong>${esc(p.registration_status || "terdaftar")}</strong></div><div class="detail"><span>Check-in pertama</span><strong>${esc(formatTime(r.attendance?.checkin_time))}</strong></div><div class="detail"><span>Status data</span><strong>Lokal · menunggu ekspor</strong></div><div class="detail"><span>Kegiatan</span><strong>${esc(settings.eventName)}</strong></div></div></div>`;
  }

  async function renderParticipants() {
    const query = ($("#participantSearch").value || "").toLowerCase().trim();
    const participants = (await all(STORES.participants)).sort((a,b) => a.participant_code.localeCompare(b.participant_code));
    const filtered = participants.filter(p => [p.participant_code,p.full_name,p.institution].some(v => String(v||"").toLowerCase().includes(query)));
    $("#participantsBody").innerHTML = filtered.map(p => `<tr><td><span class="code-pill">${esc(p.participant_code)}</span></td><td><strong>${esc(p.full_name)}</strong></td><td>${esc(p.institution || "—")}</td><td>${esc(p.registration_status || "terdaftar")}</td><td><button class="table-action" data-edit="${esc(p.participant_code)}">Edit</button><button class="table-action danger" data-delete="${esc(p.participant_code)}">Hapus</button></td></tr>`).join("");
    $("#participantsEmpty").classList.toggle("hidden", filtered.length > 0);
    $("#participantCount").textContent = `${filtered.length} dari ${participants.length} peserta`;
  }
  async function renderAttendance() {
    const query = ($("#attendanceSearch").value || "").toLowerCase().trim();
    const attendance = (await all(STORES.attendance)).filter(a => a.event_name === settings.eventName).sort((a,b) => b.checkin_time.localeCompare(a.checkin_time));
    const filtered = attendance.filter(a => [a.participant_code,a.full_name,a.institution].some(v => String(v||"").toLowerCase().includes(query)));
    $("#attendanceBody").innerHTML = filtered.map(a => `<tr><td>${esc(formatTime(a.checkin_time))}</td><td><span class="code-pill">${esc(a.participant_code)}</span></td><td><strong>${esc(a.full_name)}</strong></td><td>${esc(a.institution || "—")}</td><td><span class="result-badge warning">LOKAL / BELUM DIEKSPOR</span></td></tr>`).join("");
    $("#attendanceEmpty").classList.toggle("hidden", filtered.length > 0);
  }
  async function refreshAll() { await Promise.all([renderStats(),renderParticipants(),renderAttendance()]); }

  function parseCSV(text) {
    const rows=[]; let row=[], cell="", quoted=false;
    for(let i=0;i<text.length;i++){const c=text[i], n=text[i+1];
      if(c === '"' && quoted && n === '"'){cell+='"';i++;}
      else if(c === '"'){quoted=!quoted;}
      else if(c === "," && !quoted){row.push(cell);cell="";}
      else if((c === "\n" || c === "\r") && !quoted){if(c==="\r"&&n==="\n")i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell="";}
      else cell+=c;
    }
    row.push(cell); if(row.some(x=>x.trim())) rows.push(row);
    if(!rows.length) return [];
    const headers=rows.shift().map(h=>h.trim().replace(/^\uFEFF/,"").toLowerCase());
    return rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,(r[i]||"").trim()])));
  }
  function download(filename, content, type="text/plain;charset=utf-8") {
    const blob = new Blob([content], {type}); const url = URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download=filename; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function csvEscape(v) { const s=String(v??""); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; }
  function toCSV(rows, headers) { return "\uFEFF"+[headers.join(","),...rows.map(r=>headers.map(h=>csvEscape(r[h])).join(","))].join("\r\n"); }
  async function importCSV(file) {
    const text=await file.text(); const rows=parseCSV(text);
    if(!rows.length) throw new Error("File CSV kosong atau formatnya tidak terbaca.");
    const required=["participant_code","full_name","institution","photo_url","registration_status"];
    const missing=required.filter(h=>!(h in rows[0]));
    if(missing.length) throw new Error("Kolom CSV tidak lengkap. Kolom yang diperlukan: "+required.join(", "));
    let added=0, updated=0, skipped=0;
    for(const r of rows){
      const code=(r.participant_code||"").trim(), name=(r.full_name||"").trim();
      if(!code||!name||!validCode(code)){skipped++;continue;}
      const old=await get(STORES.participants,code);
      await put(STORES.participants,{participant_code:code,full_name:name,institution:r.institution||"",photo_url:r.photo_url||"",registration_status:r.registration_status||"terdaftar",created_at:old?.created_at||new Date().toISOString(),updated_at:new Date().toISOString(),demo:false});
      old?updated++:added++;
    }
    await refreshAll(); toast(`Impor selesai: ${added} baru, ${updated} diperbarui, ${skipped} dilewati.`);
  }
  async function loadDemo() {
    const list=[];
    const first=["Andi","Siti","Muhammad","Nur","Ayu","Rizky","Dewi","Fajar","Rahma","Akbar","Putri","Ilham","Nadia","Arif","Maya","Wahyu","Indah","Dimas","Fitri","Rian"];
    const last=["Pratama","Rahman","Saputra","Lestari","Wijaya","Maulana","Permata","Hidayat","Ananda","Putri"];
    for(let i=1;i<=50;i++){
      const code=`EVT2026-${String(i).padStart(4,"0")}`;
      list.push({participant_code:code,full_name:`${first[(i-1)%first.length]} ${last[(i*3)%last.length]}`,institution:["Komunitas Belajar Nusantara","Universitas Sulawesi","Forum Pemuda Daerah","Lembaga Riset Mandiri","Panitia Demonstrasi"][i%5],photo_url:"",registration_status:"terdaftar",created_at:new Date().toISOString(),updated_at:new Date().toISOString(),demo:true});
    }
    let count=0;
    for(const p of list){if(!(await get(STORES.participants,p.participant_code))){await put(STORES.participants,p);count++;}}
    await refreshAll(); toast(`${count} peserta demonstrasi ditambahkan. Data ini fiktif.`);
  }
  async function openParticipant(code) {
    const form=$("#participantForm"); form.reset();
    const p=code ? await get(STORES.participants,code) : null;
    $("#participantDialogTitle").textContent=p?"Edit peserta":"Tambah peserta";
    form.elements.originalCode.value=p?.participant_code||"";
    for(const field of ["participant_code","full_name","institution","photo_url","registration_status"]) form.elements[field].value=p?.[field] || (field==="registration_status"?"terdaftar":"");
    $("#participantDialog").showModal();
  }
  async function saveParticipant(form) {
    const fd=new FormData(form), code=String(fd.get("participant_code")||"").trim(), name=String(fd.get("full_name")||"").trim(), original=String(fd.get("originalCode")||"");
    if(!validCode(code)||!name) throw new Error("ID dan nama wajib diisi. ID hanya boleh berisi huruf, angka, tanda hubung, dan garis bawah.");
    const existing=await get(STORES.participants,code);
    if(existing && code!==original) throw new Error("ID peserta sudah digunakan.");
    const old=original?await get(STORES.participants,original):null;
    const p={participant_code:code,full_name:name,institution:String(fd.get("institution")||"").trim(),photo_url:String(fd.get("photo_url")||"").trim(),registration_status:String(fd.get("registration_status")||"terdaftar"),created_at:old?.created_at||new Date().toISOString(),updated_at:new Date().toISOString(),demo:false};
    if(original && original!==code){
      await put(STORES.participants,p);
      // Rekam kehadiran lama tidak dihapus demi menjaga audit; perubahan ID tidak memindahkan catatan historis.
      await remove(STORES.participants,original);
    } else await put(STORES.participants,p);
    $("#participantDialog").close(); await refreshAll(); toast("Data peserta berhasil disimpan.");
  }
  async function exportParticipants() {
    const rows=(await all(STORES.participants)).sort((a,b)=>a.participant_code.localeCompare(b.participant_code));
    download("event-check-in-peserta.csv",toCSV(rows,["participant_code","full_name","institution","photo_url","registration_status"]),"text/csv;charset=utf-8");
  }
  async function exportAttendance() {
    const rows=(await all(STORES.attendance)).filter(a=>a.event_name===settings.eventName).sort((a,b)=>a.checkin_time.localeCompare(b.checkin_time)).map(a=>({...a, sync_status:"lokal_belum_disinkronkan"}));
    download("event-check-in-kehadiran.csv",toCSV(rows,["event_name","participant_code","full_name","institution","checkin_time","sync_status"]),"text/csv;charset=utf-8");
  }
  async function exportBackup() {
    const payload={format:"EVENT-CHECK-IN-BACKUP",version:1,exported_at:new Date().toISOString(),settings,device_id:getDeviceId(),participants:await all(STORES.participants),attendance:await all(STORES.attendance),logs:await all(STORES.logs),queue:await all(STORES.queue)};
    download("event-check-in-cadangan.json",JSON.stringify(payload,null,2),"application/json;charset=utf-8");
    toast("Cadangan lengkap diunduh. Simpan di lokasi aman.");
  }
  async function exportQueue() {
    const payload={format:"EVENT-CHECK-IN-QUEUE",version:1,exported_at:new Date().toISOString(),device_id:getDeviceId(),queue:await all(STORES.queue),attendance:(await all(STORES.attendance)).filter(a=>a.event_name===settings.eventName)};
    download("event-check-in-antrean.json",JSON.stringify(payload,null,2),"application/json;charset=utf-8");
    toast("Antrean diekspor. Tidak ada pengiriman ke server.");
  }
  async function importBackup(file) {
    const data=JSON.parse(await file.text());
    if(!data || data.format!=="EVENT-CHECK-IN-BACKUP" || !Array.isArray(data.participants) || !Array.isArray(data.attendance)) throw new Error("Format cadangan tidak dikenali.");
    let added=0, merged=0;
    for(const p of data.participants){if(!p.participant_code||!p.full_name)continue; const old=await get(STORES.participants,p.participant_code); await put(STORES.participants,old?{...old,...p}:p); old?merged++:added++;}
    for(const a of (data.attendance||[])){if(!a.key||!a.participant_code)continue; const old=await get(STORES.attendance,a.key); if(!old) await put(STORES.attendance,a);}
    for(const l of (data.logs||[])){if(l.id && !(await get(STORES.logs,l.id))) await put(STORES.logs,l);}
    for(const q of (data.queue||[])){if(q.transaction_id && !(await get(STORES.queue,q.transaction_id))) await put(STORES.queue,q);}
    if(data.settings && confirm("Cadangan juga berisi pengaturan kegiatan. Terapkan pengaturan dari cadangan?")) saveSettings(data.settings);
    await refreshAll(); toast(`Pemulihan selesai: ${added} peserta baru, ${merged} peserta digabung. Check-in yang ada tidak digandakan.`);
  }

  async function startCamera() {
    if(!navigator.mediaDevices?.getUserMedia){toast("Browser ini tidak mendukung akses kamera. Gunakan input manual atau scanner USB.", "warning");return;}
    if(!("BarcodeDetector" in window)){toast("Scanner bawaan browser tidak tersedia. Coba Chrome/Edge terbaru atau gunakan scanner USB/input manual.", "warning");$("#scannerMessage").textContent="BarcodeDetector tidak didukung browser ini. Gunakan input manual atau scanner USB.";return;}
    try {
      stopCamera();
      const constraints={audio:false,video:cameraDevices.length?{deviceId:{exact:cameraDevices[cameraIndex%cameraDevices.length].deviceId}}:{facingMode:{ideal:"environment"}}};
      currentStream=await navigator.mediaDevices.getUserMedia(constraints);
      $("#cameraVideo").srcObject=currentStream; await $("#cameraVideo").play();
      $("#cameraStage").classList.add("camera-on");$("#cameraPlaceholder").classList.add("hidden");
      $("#cameraState").textContent="Kamera aktif";$("#cameraSwitch").disabled=false;$("#cameraStart").textContent="Matikan kamera";
      cameraDevices=await navigator.mediaDevices.enumerateDevices().then(d=>d.filter(x=>x.kind==="videoinput"));
      let detector;
      try { detector=new BarcodeDetector({formats: await BarcodeDetector.getSupportedFormats()}); }
      catch { detector=new BarcodeDetector(); }
      const video=$("#cameraVideo"), canvas=$("#scanCanvas"), ctx=canvas.getContext("2d",{willReadFrequently:true});
      const loop=async()=>{
        if(!currentStream)return;
        if(video.readyState>=2){
          canvas.width=video.videoWidth;canvas.height=video.videoHeight;
          if(canvas.width&&canvas.height){
            ctx.drawImage(video,0,0,canvas.width,canvas.height);
            try{
              const codes=await detector.detect(canvas);
              if(codes.length){
                const raw=codes[0].rawValue||"";
                const now=Date.now();
                if(raw && (raw!==lastScanned || now-lastScanAt>5000)){
                  lastScanned=raw;lastScanAt=now;await verify(raw);
                }
              }
            }catch(e){ /* Frame mungkin belum siap atau format tidak didukung. */ }
          }
        }
        scanLoop=requestAnimationFrame(loop);
      };
      scanLoop=requestAnimationFrame(loop);
      $("#scannerMessage").textContent="Kamera aktif. Arahkan QR Code/barcode ke dalam bingkai.";
    } catch(err) {
      stopCamera();$("#cameraState").textContent="Kamera tidak aktif";
      toast(err.name==="NotAllowedError"?"Izin kamera ditolak. Aktifkan izin kamera di pengaturan browser.":"Kamera tidak dapat diakses. Coba input manual.", "error");
    }
  }
  function stopCamera() {
    if(scanLoop) cancelAnimationFrame(scanLoop); scanLoop=null;
    if(currentStream){currentStream.getTracks().forEach(t=>t.stop());currentStream=null;}
    const video=$("#cameraVideo");if(video)video.srcObject=null;
    $("#cameraStage")?.classList.remove("camera-on");$("#cameraPlaceholder")?.classList.remove("hidden");
    if($("#cameraState"))$("#cameraState").textContent="Kamera belum aktif";
    if($("#cameraStart"))$("#cameraStart").textContent="Aktifkan kamera";
    if($("#cameraSwitch"))$("#cameraSwitch").disabled=true;
  }
  function updateConnection() {
    const el=$("#connectionStatus");
    if(navigator.onLine){el.className="status-pill online";el.innerHTML="<i></i>Perangkat online";}
    else{el.className="status-pill offline";el.innerHTML="<i></i>Offline";}
  }
  function navigate(view) {
    $$(".tab").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
    $$(".view").forEach(v=>v.classList.toggle("active",v.id==="view-"+view));
    if(view==="participants")renderParticipants();
    if(view==="reports"){renderStats();renderAttendance();}
  }
  function openSettings() {
    const f=$("#settingsForm");
    for(const [k,v] of Object.entries(settings)) if(f.elements[k]) f.elements[k].value=v;
    $("#settingsDialog").showModal();
  }

  function wireEvents() {
    $$(".tab").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.view)));
    $("#settingsOpen").addEventListener("click",openSettings);
    $$("[data-close]").forEach(b=>b.addEventListener("click",()=>$("#"+b.dataset.close).close()));
    $("#settingsForm").addEventListener("submit",e=>{e.preventDefault();const f=e.currentTarget;const s={...settings};for(const k of Object.keys(settings))if(f.elements[k])s[k]=f.elements[k].value;saveSettings(s);$("#settingsDialog").close();toast("Pengaturan disimpan pada browser ini.");});
    $("#resetSettings").addEventListener("click",()=>{if(confirm("Pulihkan pengaturan awal?")){saveSettings(DEFAULT_SETTINGS);openSettings();toast("Pengaturan awal dipulihkan.");}});
    $("#manualForm").addEventListener("submit",async e=>{e.preventDefault();const input=$("#manualCode");const value=input.value;input.value="";await verify(value);});
    $("#nextScan").addEventListener("click",()=>{currentResult=null;$("#resultHeading").textContent="Menunggu pemindaian";$("#resultBadge").className="result-badge neutral";$("#resultBadge").textContent="SIAP";$("#resultContent").className="result-content empty-result";$("#resultContent").innerHTML='<div class="avatar avatar-large">?</div><strong>Belum ada peserta dipindai</strong><p class="muted">Hasil verifikasi akan muncul di sini.</p>';$("#manualCode").value="";$("#manualCode").focus();});
    $("#cameraStart").addEventListener("click",()=>currentStream?stopCamera():startCamera());
    $("#cameraSwitch").addEventListener("click",async()=>{if(cameraDevices.length>1){cameraIndex=(cameraIndex+1)%cameraDevices.length;await startCamera();}else toast("Browser hanya mendeteksi satu kamera.", "warning");});
    $("#importBtn").addEventListener("click",()=>$("#csvFile").click());
    $("#csvFile").addEventListener("change",async e=>{const f=e.target.files[0];if(f)try{await importCSV(f);}catch(err){toast(err.message||"Impor gagal.","error");}e.target.value="";});
    $("#exportParticipants").addEventListener("click",exportParticipants);
    $("#exportAttendance").addEventListener("click",exportAttendance);
    $("#exportBackup").addEventListener("click",exportBackup);
    $("#exportQueue").addEventListener("click",exportQueue);
    $("#importBackupBtn").addEventListener("click",()=>$("#backupFile").click());
    $("#backupFile").addEventListener("change",async e=>{const f=e.target.files[0];if(f)try{if(confirm("Pulihkan cadangan? Data yang sudah ada akan digabung; catatan yang cocok tidak digandakan."))await importBackup(f);}catch(err){toast(err.message||"Pemulihan gagal.","error");}e.target.value="";});
    $("#participantSearch").addEventListener("input",renderParticipants);
    $("#attendanceSearch").addEventListener("input",renderAttendance);
    $("#addParticipantBtn").addEventListener("click",()=>openParticipant());
    $("#participantForm").addEventListener("submit",async e=>{e.preventDefault();try{await saveParticipant(e.currentTarget);}catch(err){toast(err.message||"Tidak dapat menyimpan peserta.","error");}});
    $("#participantsBody").addEventListener("click",async e=>{
      const edit=e.target.closest("[data-edit]"), del=e.target.closest("[data-delete]");
      if(edit)openParticipant(edit.dataset.edit);
      if(del && confirm(`Hapus peserta ${del.dataset.delete}? Catatan kehadiran lama tidak akan dihapus.`)){await remove(STORES.participants,del.dataset.delete);await refreshAll();toast("Peserta dihapus dari daftar.");}
    });
    $("#loadDemo").addEventListener("click",async()=>{if(confirm("Tambahkan 50 peserta demonstrasi fiktif? Data yang ID-nya sudah ada tidak ditimpa."))await loadDemo();});
    window.addEventListener("online",updateConnection);window.addEventListener("offline",updateConnection);
    window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstallPrompt=e;$("#installBtn").classList.remove("hidden");});
    $("#installBtn").addEventListener("click",async()=>{if(!deferredInstallPrompt)return;deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;$("#installBtn").classList.add("hidden");});
    window.addEventListener("pagehide",stopCamera);
  }
  async function init() {
    applySettings(); updateConnection(); wireEvents();
    try { db=await openDB(); await refreshAll(); }
    catch(err){toast("Penyimpanan lokal tidak dapat dibuka. Coba browser terbaru atau jangan gunakan mode privat.","error");console.error(err);}
    if("serviceWorker" in navigator && location.protocol!=="file:"){
      navigator.serviceWorker.register("./sw.js").catch(err=>console.warn("Service worker tidak terdaftar:",err));
    }
  }
  document.addEventListener("DOMContentLoaded",init);
})();
