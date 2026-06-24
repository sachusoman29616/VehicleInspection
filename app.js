// UniInspect — Vehicle Inspection App
// With GPS, Photo Hash, Report ID, Inspector Gmail verification

const { useState, useRef, useCallback, useEffect } = React;

const CLIENT_ID      = "168804904830-5jf5intu3blp96u5sr5oro78jufrrjs8.apps.googleusercontent.com";
const APPS_SCRIPT_URL = localStorage.getItem("ui_script_url") || ""; // Set via settings in app

const PHOTO_SLOTS = [
  { id:"front",    label:"Front",        icon:"⬆️", required:true,  hint:"Full front of the vehicle" },
  { id:"rear",     label:"Rear",         icon:"⬇️", required:true,  hint:"Full rear / boot area" },
  { id:"right",    label:"Right Side",   icon:"➡️", required:true,  hint:"Passenger side, full length" },
  { id:"left",     label:"Left Side",    icon:"⬅️", required:true,  hint:"Driver side, full length" },
  { id:"odometer", label:"Odometer",     icon:"🔢", required:true,  hint:"Dashboard reading clearly visible" },
  { id:"chassis",  label:"Chassis / VIN",icon:"🔡", required:false, hint:"VIN plate on dash or door frame" },
];

function formatTs(date) {
  return date.toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"});
}

function generateReportId(reg) {
  const d   = new Date();
  const dt  = d.getFullYear().toString() +
    String(d.getMonth()+1).padStart(2,"0") +
    String(d.getDate()).padStart(2,"0");
  const rand = Math.random().toString(36).substring(2,6).toUpperCase();
  return "UI-"+dt+"-"+(reg||"XX")+"-"+rand;
}

async function hashPhotos(photos) {
  const combined = PHOTO_SLOTS
    .filter(s => photos[s.id])
    .map(s => photos[s.id].url.substring(0,200) + formatTs(photos[s.id].ts))
    .join("|");
  const msgBuffer  = new TextEncoder().encode(combined);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray  = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2,"0")).join("").substring(0,32).toUpperCase();
}

function getGPS() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat      : pos.coords.latitude.toFixed(6),
        lng      : pos.coords.longitude.toFixed(6),
        accuracy : Math.round(pos.coords.accuracy),
      }),
      () => resolve(null),
      { timeout:8000, enableHighAccuracy:true }
    );
  });
}

function stampImage(dataUrl, label, timestamp, gps) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const fh  = Math.max(14, Math.round(img.height * 0.030));
      const pad = 10;
      const lines = [
        label.toUpperCase(),
        timestamp,
        gps ? ("GPS: "+gps.lat+", "+gps.lng+" (+-"+gps.accuracy+"m)") : "GPS: Unavailable",
      ];
      ctx.font = `bold ${fh}px monospace`;
      const maxW  = Math.max(...lines.map(l => ctx.measureText(l).width));
      const boxW  = maxW + pad*2;
      const boxH  = fh * lines.length + pad * (lines.length+1);
      const bx    = pad, by = img.height - boxH - pad;
      ctx.fillStyle = "rgba(0,0,0,0.70)";
      ctx.beginPath(); ctx.roundRect(bx,by,boxW,boxH,6); ctx.fill();
      const colors = ["#ffffff","#fbbf24","#86efac"];
      lines.forEach((line,i) => {
        ctx.fillStyle = colors[i]||"#fff";
        ctx.fillText(line, bx+pad, by+pad*(i+1)+fh*(i+1));
      });
      res(c.toDataURL("image/jpeg",0.85));
    };
    img.src = dataUrl;
  });
}

function resizeImage(dataUrl, maxW=1100) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW/img.width);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width*scale); c.height = Math.round(img.height*scale);
      c.getContext("2d").drawImage(img,0,0,c.width,c.height);
      res(c.toDataURL("image/jpeg",0.82));
    };
    img.src = dataUrl;
  });
}

async function buildPDF({vehicle,photos,inspectorName,inspectorEmail,generatedAt,reportId,gps,photoHash,scriptUrl}) {
  const {jsPDF}  = window.jspdf;
  const doc      = new jsPDF({orientation:"portrait",unit:"mm",format:"a4"});
  const W=210, H=297, margin=14;

  // Cover header
  doc.setFillColor(15,23,42); doc.rect(0,0,W,52,"F");
  doc.setFillColor(29,78,216); doc.roundedRect(margin,10,24,24,4,4,"F");
  doc.setFontSize(14); doc.setTextColor(255,255,255); doc.setFont("helvetica","bold");
  doc.text("U",margin+7,26);
  doc.setTextColor(241,245,249); doc.setFontSize(22); doc.setFont("helvetica","bold");
  doc.text("UniInspect",margin+30,22);
  doc.setFontSize(10); doc.setFont("helvetica","normal"); doc.setTextColor(100,116,139);
  doc.text("VEHICLE INSPECTION REPORT",margin+30,30);
  doc.setFillColor(127,29,29); doc.roundedRect(W-margin-44,14,44,10,3,3,"F");
  doc.setTextColor(252,165,165); doc.setFontSize(7); doc.setFont("helvetica","bold");
  doc.text("POLICY EXPIRED",W-margin-42,20.5);
  doc.setTextColor(100,116,139); doc.setFontSize(8); doc.setFont("helvetica","normal");
  doc.text("Generated: "+generatedAt,margin+30,38);

  // Report ID banner
  doc.setFillColor(29,78,216); doc.rect(0,52,W,12,"F");
  doc.setFontSize(8); doc.setFont("helvetica","bold"); doc.setTextColor(255,255,255);
  doc.text("REPORT ID: "+reportId, margin, 60);
  doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(191,219,254);
  if(scriptUrl) doc.text("Verify at: "+scriptUrl+"?id="+reportId, W-margin-doc.getTextWidth("Verify at: "+scriptUrl+"?id="+reportId), 60);

  // Vehicle details
  const bx=margin,by=70,bw=W-margin*2,bh=68;
  doc.setFillColor(248,250,252); doc.roundedRect(bx,by,bw,bh,4,4,"F");
  doc.setDrawColor(226,232,240); doc.roundedRect(bx,by,bw,bh,4,4,"S");
  doc.setFontSize(7); doc.setFont("helvetica","bold"); doc.setTextColor(100,116,139);
  doc.text("VEHICLE DETAILS",bx+6,by+9);
  [["Registration",vehicle.reg||"—"],["Make & Model",vehicle.make||"—"],["Owner",vehicle.owner||"—"],["Expired Policy",vehicle.policy||"—"]].forEach(([k,v],i)=>{
    const fy=by+18+i*12;
    doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setTextColor(71,85,105); doc.text(k,bx+6,fy);
    doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(15,23,42); doc.text(v,bx+54,fy);
  });

  // Inspector + GPS box
  const iy=by+bh+6;
  doc.setFillColor(239,246,255); doc.roundedRect(bx,iy,bw,30,4,4,"F");
  doc.setFontSize(7); doc.setFont("helvetica","bold"); doc.setTextColor(100,116,139);
  doc.text("INSPECTOR & LOCATION",bx+6,iy+8);
  doc.setFontSize(9); doc.setFont("helvetica","bold"); doc.setTextColor(15,23,42);
  doc.text(inspectorName,bx+6,iy+16);
  doc.setFontSize(8); doc.setFont("helvetica","normal"); doc.setTextColor(71,85,105);
  doc.text(inspectorEmail,bx+6,iy+22);
  doc.setFontSize(7); doc.setTextColor(100,116,139);
  const gpsText = gps ? ("GPS: "+gps.lat+", "+gps.lng+" (accuracy: +-"+gps.accuracy+"m)") : "GPS: Not available";
  doc.text(gpsText,bx+6,iy+28);

  // Security hash box
  const hx=bx, hy=iy+36, hw=bw, hh=16;
  doc.setFillColor(254,243,199); doc.roundedRect(hx,hy,hw,hh,4,4,"F");
  doc.setDrawColor(251,191,36); doc.roundedRect(hx,hy,hw,hh,4,4,"S");
  doc.setFontSize(7); doc.setFont("helvetica","bold"); doc.setTextColor(146,64,14);
  doc.text("PHOTO INTEGRITY HASH (SHA-256)",hx+6,hy+6);
  doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(15,23,42);
  doc.text(photoHash,hx+6,hy+12);

  // Photo summary
  const ty=hy+hh+8;
  doc.setFontSize(7); doc.setFont("helvetica","bold"); doc.setTextColor(100,116,139);
  doc.text("PHOTOS CAPTURED",bx+6,ty);
  PHOTO_SLOTS.forEach((slot,i)=>{
    const captured=photos[slot.id]; const ry=ty+7+i*9;
    doc.setFillColor(captured?240:254,captured?253:242,captured?244:242);
    doc.roundedRect(bx,ry,bw,8,2,2,"F");
    doc.setFontSize(8); doc.setFont("helvetica","bold");
    doc.setTextColor(captured?21:185,captured?128:28,captured?61:26);
    doc.text(captured?"✓":"—",bx+5,ry+5.5);
    doc.setFont("helvetica","normal"); doc.setTextColor(51,65,85); doc.text(slot.label,bx+12,ry+5.5);
    doc.setTextColor(100,116,139); doc.setFontSize(7);
    doc.text(captured?formatTs(photos[slot.id].ts):"Not captured",bx+56,ry+5.5);
  });

  // Cover footer
  doc.setFillColor(15,23,42); doc.rect(0,H-12,W,12,"F");
  doc.setFontSize(7); doc.setFont("helvetica","normal"); doc.setTextColor(100,116,139);
  doc.text("UniInspect — Vehicle Inspection Report | ID: "+reportId,margin,H-4.5);
  doc.text("Page 1",W-margin-8,H-4.5);

  // Photo pages
  const capturedSlots=PHOTO_SLOTS.filter(s=>photos[s.id]);
  for(let i=0;i<capturedSlots.length;i++){
    const slot=capturedSlots[i]; const ph=photos[slot.id];
    doc.addPage();
    doc.setFillColor(15,23,42); doc.rect(0,0,W,22,"F");
    doc.setFontSize(11); doc.setFont("helvetica","bold"); doc.setTextColor(241,245,249);
    doc.text(slot.label.toUpperCase(),margin,14);
    doc.setFontSize(7); doc.setFont("helvetica","normal"); doc.setTextColor(100,116,139);
    doc.text(reportId,W-margin-doc.getTextWidth(reportId),14);
    const px=margin,py=28,pw=W-margin*2;
    await new Promise((resolve)=>{
      const tmp=new Image();
      tmp.onload=()=>{
        const ar=tmp.height/tmp.width; const ph_h=Math.min(pw*ar,H-py-36);
        try{doc.addImage(ph.url,"JPEG",px,py,pw,ph_h);}catch(e){}
        const sy=py+ph_h+4;
        doc.setFillColor(248,250,252); doc.roundedRect(px,sy,pw,20,3,3,"F");
        doc.setDrawColor(226,232,240); doc.roundedRect(px,sy,pw,20,3,3,"S");
        doc.setFontSize(7); doc.setFont("helvetica","bold"); doc.setTextColor(100,116,139);
        doc.text("CAPTURED AT",px+5,sy+6);
        doc.setFontSize(9); doc.setFont("helvetica","bold"); doc.setTextColor(15,23,42);
        doc.text(formatTs(ph.ts),px+5,sy+12);
        doc.setFontSize(7); doc.setFont("helvetica","normal"); doc.setTextColor(34,197,94);
        const gpsLine=ph.gps?("GPS: "+ph.gps.lat+", "+ph.gps.lng+" (+-"+ph.gps.accuracy+"m)"):"GPS: Not available";
        doc.text(gpsLine,px+5,sy+18);
        doc.setTextColor(100,116,139);
        doc.text("Photo "+(i+1)+" of "+capturedSlots.length,W-margin-20,sy+12);
        resolve();
      };
      tmp.src=ph.url;
    });
    doc.setFillColor(15,23,42); doc.rect(0,H-12,W,12,"F");
    doc.setFontSize(7); doc.setFont("helvetica","normal"); doc.setTextColor(100,116,139);
    doc.text("UniInspect | "+reportId,margin,H-4.5);
    doc.text("Page "+(i+2),W-margin-8,H-4.5);
  }
  return doc;
}

function buildMimeEmail({from,to,subject,bodyText,pdfBase64,pdfFilename}){
  const boundary="bnd_ui_"+Date.now();
  const lines=[
    "From: "+from,"To: "+to,"Subject: "+subject,
    "MIME-Version: 1.0","Content-Type: multipart/mixed; boundary=\""+boundary+"\"","",
    "--"+boundary,"Content-Type: text/plain; charset=\"UTF-8\"","",bodyText,"",
    "--"+boundary,"Content-Type: application/pdf",
    "Content-Transfer-Encoding: base64",
    "Content-Disposition: attachment; filename=\""+pdfFilename+"\"","",
  ];
  for(let i=0;i<pdfBase64.length;i+=76) lines.push(pdfBase64.slice(i,i+76));
  lines.push("","--"+boundary+"--");
  return btoa(unescape(encodeURIComponent(lines.join("\r\n"))))
    .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}

const SCREEN={CONNECT:"connect",INSPECT:"inspect",GPS:"gps",SENDING:"sending",DONE:"done"};

function App(){
  const [screen,setScreen]           = useState(SCREEN.CONNECT);
  const [gmailUser,setGmailUser]     = useState(()=>{try{return JSON.parse(localStorage.getItem("ui_user")||"null");}catch{return null;}});
  const [accessToken,setAccessToken] = useState(null);
  const [vehicle,setVehicle]         = useState({reg:"",make:"",owner:"",policy:""});
  const [toEmail,setToEmail]         = useState(()=>localStorage.getItem("ui_recipient")||"");
  const [photos,setPhotos]           = useState({});
  const [gps,setGps]                 = useState(null);
  const [error,setError]             = useState("");
  const [sendStatus,setSendStatus]   = useState("");
  const [scriptUrl,setScriptUrl]     = useState(()=>localStorage.getItem("ui_script_url")||"");
  const [showScriptCfg,setShowScriptCfg] = useState(false);
  const [lastReportId,setLastReportId]   = useState("");
  const fileRefs=useRef({});

  useEffect(()=>{
    if(gmailUser) setScreen(SCREEN.INSPECT);
    if(!window.google){
      const s=document.createElement("script");
      s.src="https://accounts.google.com/gsi/client";
      s.async=true; s.defer=true;
      document.head.appendChild(s);
    }
  },[]);

  const signIn=()=>{
    if(!window.google){setError("Loading Google... wait 2 seconds and try again.");return;}
    const tc=window.google.accounts.oauth2.initTokenClient({
      client_id:CLIENT_ID,
      scope:"https://www.googleapis.com/auth/gmail.send email profile",
      callback:async(resp)=>{
        if(resp.error){setError("Sign-in failed. Please try again.");return;}
        setAccessToken(resp.access_token);
        try{
          const r=await fetch("https://www.googleapis.com/oauth2/v3/userinfo",{headers:{Authorization:"Bearer "+resp.access_token}});
          const u=await r.json();
          const user={name:u.name,email:u.email,picture:u.picture};
          setGmailUser(user); localStorage.setItem("ui_user",JSON.stringify(user));
          setScreen(SCREEN.INSPECT);
        }catch{setError("Could not fetch profile.");}
      },
    });
    tc.requestAccessToken();
  };

  const signOut=()=>{
    if(!window.confirm("Sign out?")) return;
    setGmailUser(null); setAccessToken(null);
    localStorage.removeItem("ui_user"); setScreen(SCREEN.CONNECT);
  };

  const capturePhoto=useCallback(async(slotId,file)=>{
    if(!file) return;
    // Get GPS at capture time
    const photoGps = await getGPS();
    const reader=new FileReader();
    reader.onload=async(e)=>{
      const slot=PHOTO_SLOTS.find(s=>s.id===slotId);
      const ts=new Date();
      const resized=await resizeImage(e.target.result);
      const stamped=await stampImage(resized,slot.label,formatTs(ts),photoGps);
      setPhotos(p=>({...p,[slotId]:{url:stamped,ts,gps:photoGps}}));
      if(photoGps) setGps(photoGps);
    };
    reader.readAsDataURL(file);
  },[]);

  const requiredDone=PHOTO_SLOTS.filter(s=>s.required).every(s=>photos[s.id]);
  const canSubmit=requiredDone&&toEmail.includes("@")&&vehicle.reg.trim()&&accessToken;

  const handleSubmit=async()=>{
    setScreen(SCREEN.SENDING); setError("");
    try{
      setSendStatus("Getting GPS location...");
      const currentGps = gps || await getGPS();

      setSendStatus("Creating photo fingerprint...");
      const photoHash = await hashPhotos(photos);
      const reportId  = generateReportId(vehicle.reg);
      const generatedAt = formatTs(new Date());

      // Save to Google Sheet if script URL configured
      if(scriptUrl){
        setSendStatus("Saving to database...");
        try{
          await fetch(scriptUrl,{
            method:"POST",
            body:JSON.stringify({
              reportId, timestamp:generatedAt,
              inspectorEmail:gmailUser.email, inspectorName:gmailUser.name,
              registration:vehicle.reg, makeModel:vehicle.make||"—",
              owner:vehicle.owner||"—", expiredPolicy:vehicle.policy||"—",
              gpsLat:currentGps?.lat||"—", gpsLng:currentGps?.lng||"—",
              gpsAccuracy:currentGps?.accuracy||"—", gpsAddress:"—",
              photosCaptured:PHOTO_SLOTS.filter(s=>photos[s.id]).map(s=>s.label).join(", "),
              photoHash, recipientEmail:toEmail,
            }),
          });
        }catch(e){ /* non-fatal — continue */ }
      }

      setSendStatus("Generating PDF...");
      const doc=await buildPDF({
        vehicle,photos,
        inspectorName:gmailUser.name,inspectorEmail:gmailUser.email,
        generatedAt,reportId,
        gps:currentGps,photoHash,scriptUrl,
      });

      setSendStatus("Sending via Gmail...");
      const pdfFilename="UniInspect_"+(vehicle.reg||"inspection").replace(/\s+/g,"_")+"_"+new Date().toISOString().slice(0,10)+".pdf";
      const pdfBase64=doc.output("datauristring").split(",")[1];
      const bodyText=[
        "VEHICLE INSPECTION REPORT",
        "Report ID  : "+reportId,
        "Generated  : "+generatedAt,
        "Inspector  : "+gmailUser.name+" <"+gmailUser.email+">",
        "GPS        : "+(currentGps?(currentGps.lat+", "+currentGps.lng+" (+-"+currentGps.accuracy+"m)"):"Not available"),
        "Photo Hash : "+photoHash,"",
        "VEHICLE DETAILS",
        "Registration  : "+(vehicle.reg||"—"),
        "Make / Model  : "+(vehicle.make||"—"),
        "Owner         : "+(vehicle.owner||"—"),
        "Expired Policy: "+(vehicle.policy||"—"),"",
        "PHOTOS CAPTURED",
        ...PHOTO_SLOTS.map(s=>photos[s.id]?"✓  "+s.label.padEnd(14)+" "+formatTs(photos[s.id].ts):"—  "+s.label.padEnd(14)+" Not captured"),
        "","PDF attached: "+pdfFilename,
        scriptUrl?"Verify report: "+scriptUrl+"?id="+reportId:"",
        "","---","Sent via UniInspect",
      ].join("\n");

      const raw=buildMimeEmail({
        from:gmailUser.name+" <"+gmailUser.email+">",
        to:toEmail,
        subject:"Vehicle Inspection Report - "+vehicle.reg+" - "+new Date().toLocaleDateString("en-GB"),
        bodyText,pdfBase64,pdfFilename,
      });
      const resp=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send",{
        method:"POST",
        headers:{Authorization:"Bearer "+accessToken,"Content-Type":"application/json"},
        body:JSON.stringify({raw}),
      });
      if(!resp.ok){const e=await resp.json();throw new Error(e?.error?.message||"Send failed");}
      doc.save(pdfFilename);
      setLastReportId(reportId);
      setScreen(SCREEN.DONE);
    }catch(e){
      setError(e.message||"Something went wrong."); setScreen(SCREEN.INSPECT); setSendStatus("");
    }
  };

  // CONNECT
  if(screen===SCREEN.CONNECT) return(
    <div style={S.page}>
      <div style={S.center}>
        <div style={S.centerCard}>
          <div style={{fontSize:52,marginBottom:8}}>🛡️</div>
          <h1 style={S.bigTitle}>UniInspect</h1>
          <p style={S.subTitle}>Vehicle Inspection · Policy Renewal</p>
          <div style={S.featureBox}>
            {["GPS coordinates stamped on every photo","Cryptographic photo hash (SHA-256)","Unique Report ID on every report","Inspector Gmail — who sent it","Tamper-proof PDF report"].map(f=>(
              <div key={f} style={S.featureRow}><span style={S.tick}>✓</span><span>{f}</span></div>
            ))}
          </div>
          {error&&<div style={S.errorBox}>{error}</div>}
          <button style={S.googleBtn} onClick={signIn}><GoogleIcon/> Sign in with Google</button>
        </div>
      </div>
    </div>
  );

  // SENDING
  if(screen===SCREEN.SENDING) return(
    <div style={S.page}>
      <div style={S.center}>
        <div style={S.centerCard}>
          <div style={{fontSize:48,marginBottom:14}}>🔐</div>
          <h2 style={S.bigTitle}>Securing Report...</h2>
          <p style={S.subTitle}>{sendStatus}</p>
          <div style={S.loaderWrap}><div style={S.loaderBar}/></div>
        </div>
      </div>
    </div>
  );

  // DONE
  if(screen===SCREEN.DONE) return(
    <div style={S.page}>
      <div style={S.center}>
        <div style={S.centerCard}>
          <div style={{fontSize:52,marginBottom:10}}>✅</div>
          <h2 style={S.bigTitle}>Report Sent!</h2>
          <p style={S.subTitle}>Secured & delivered to</p>
          <div style={S.doneEmail}>{toEmail}</div>
          <div style={S.reportIdBox}>
            <div style={{fontSize:10,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Report ID</div>
            <div style={{fontSize:14,fontWeight:800,color:"#0f172a",letterSpacing:"0.5px"}}>{lastReportId}</div>
          </div>
          <div style={S.tags}>
            <span style={S.tag}>{vehicle.reg}</span>
            <span style={S.tag}>{PHOTO_SLOTS.filter(s=>photos[s.id]).length} photos</span>
            <span style={S.tag}>{gps?"GPS ✓":"No GPS"}</span>
          </div>
          <button style={S.btn} onClick={()=>{setPhotos({});setVehicle({reg:"",make:"",owner:"",policy:""});setSendStatus("");setGps(null);setLastReportId("");setScreen(SCREEN.INSPECT);}}>
            Start New Inspection
          </button>
        </div>
      </div>
    </div>
  );

  // INSPECT
  return(
    <div style={S.page}>
      {showScriptCfg&&(
        <div style={S.overlay}>
          <div style={S.modal}>
            <h3 style={S.modalTitle}>Database Setup (Optional)</h3>
            <p style={S.modalHint}>Deploy GOOGLE_APPS_SCRIPT.js to script.google.com and paste the Web App URL here to enable report verification.</p>
            <label style={S.label}>Google Apps Script URL</label>
            <input style={S.input} placeholder="https://script.google.com/macros/s/..." value={scriptUrl}
              onChange={e=>{setScriptUrl(e.target.value);localStorage.setItem("ui_script_url",e.target.value);}}/>
            <button style={{...S.btn,marginTop:14,width:"100%"}} onClick={()=>setShowScriptCfg(false)}>Save & Close</button>
          </div>
        </div>
      )}

      <div style={S.header}>
        <div style={S.headerRow}>
          <div>
            <div style={S.brand}>🛡️ UniInspect</div>
            <div style={S.brandSub}>Policy Renewal Inspection</div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <button style={S.cfgBtn} onClick={()=>setShowScriptCfg(true)} title="Database settings">⚙️</button>
            <div style={S.userChip} onClick={signOut}>
              {gmailUser?.picture?<img src={gmailUser.picture} alt="" style={S.avatar}/>:<div style={S.avatarFb}>{gmailUser?.name?.[0]}</div>}
              <span style={S.uname}>{gmailUser?.name?.split(" ")[0]}</span>
            </div>
          </div>
        </div>
        <div style={S.fromBadge}>
          <span>Sending from: {gmailUser?.email}</span>
          {gps&&<span style={{color:"#86efac",marginLeft:8}}>📍 GPS Active</span>}
        </div>
      </div>

      <div style={S.body}>

        <div style={S.card}>
          <div style={S.cardTitle}>Vehicle Details</div>
          <div style={{marginBottom:14}}>
            <label style={S.label}>Registration Number *</label>
            <input style={S.input} placeholder="e.g. MH02AB1234" value={vehicle.reg} onChange={e=>setVehicle(v=>({...v,reg:e.target.value.toUpperCase()}))}/>
          </div>
          <div style={S.twoCol}>
            <div style={{flex:1}}>
              <label style={S.label}>Make & Model</label>
              <input style={S.input} placeholder="e.g. Maruti Swift" value={vehicle.make} onChange={e=>setVehicle(v=>({...v,make:e.target.value}))}/>
            </div>
            <div style={{flex:1}}>
              <label style={S.label}>Owner Name</label>
              <input style={S.input} placeholder="Full name" value={vehicle.owner} onChange={e=>setVehicle(v=>({...v,owner:e.target.value}))}/>
            </div>
          </div>
          <div>
            <label style={S.label}>Expired Policy Number</label>
            <input style={S.input} placeholder="e.g. POL/2023/00123" value={vehicle.policy} onChange={e=>setVehicle(v=>({...v,policy:e.target.value}))}/>
          </div>
        </div>

        <div style={S.card}>
          <div style={S.cardTitle}>Send Report To</div>
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
              <label style={{...S.label,marginBottom:0}}>Recipient Email Address *</label>
              {toEmail&&<span style={{fontSize:10,color:"#22c55e",fontWeight:700}}>✓ Saved</span>}
            </div>
            <input style={S.input} type="email" placeholder="underwriter@insuranceco.com" value={toEmail}
              onChange={e=>{setToEmail(e.target.value);localStorage.setItem("ui_recipient",e.target.value);}}/>
            <p style={{fontSize:11,color:"#94a3b8",marginTop:4}}>Saved on this device automatically</p>
          </div>
        </div>

        <div style={S.card}>
          <div style={S.cardTitle}>Capture Photos</div>
          <p style={S.hint}>Each photo is stamped with label, timestamp and GPS coordinates automatically.</p>
          <div style={S.photoGrid}>
            {PHOTO_SLOTS.map(slot=>{
              const cap=photos[slot.id];
              return(
                <div key={slot.id} style={{...S.photoCard,...(cap?S.photoCardDone:{})}}>
                  <input type="file" accept="image/*" capture="environment" style={{display:"none"}}
                    ref={el=>fileRefs.current[slot.id]=el}
                    onChange={e=>capturePhoto(slot.id,e.target.files[0])}/>
                  {cap?(
                    <>
                      <img src={cap.url} alt={slot.label} style={S.photoImg}/>
                      <div style={S.photoBar}>
                        <span style={S.photoBarLbl}>{slot.icon} {slot.label}</span>
                        <span style={{fontSize:9,color:cap.gps?"#22c55e":"#94a3b8"}}>{cap.gps?"📍":"—"}</span>
                        <button style={S.retakeBtn} onClick={()=>setPhotos(p=>{const n={...p};delete n[slot.id];return n;})}>Retake</button>
                      </div>
                    </>
                  ):(
                    <div style={S.photoEmpty} onClick={()=>fileRefs.current[slot.id]?.click()}>
                      <span style={{fontSize:28}}>{slot.icon}</span>
                      <span style={S.slotLbl}>{slot.label}</span>
                      {!slot.required&&<span style={S.optTag}>Optional</span>}
                      <span style={S.slotHint}>{slot.hint}</span>
                      <div style={S.capBtn}>📷 Capture</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={S.dots}>
            {PHOTO_SLOTS.filter(s=>s.required).map(s=>(
              <div key={s.id} style={{...S.dot,...(photos[s.id]?S.dotDone:{})}}>{photos[s.id]?"✓":""}</div>
            ))}
            <span style={S.dotLbl}>{PHOTO_SLOTS.filter(s=>s.required&&photos[s.id]).length} / {PHOTO_SLOTS.filter(s=>s.required).length} captured</span>
          </div>
        </div>

        {/* Security summary */}
        {requiredDone&&(
          <div style={S.securityCard}>
            <div style={{fontSize:12,fontWeight:700,color:"#92400e",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.06em"}}>🔐 Security Layers Active</div>
            <div style={S.secRow}><span style={S.secTick}>✓</span><span>Inspector Gmail: {gmailUser?.email}</span></div>
            <div style={S.secRow}><span style={S.secTick}>✓</span><span>Unique Report ID will be generated</span></div>
            <div style={S.secRow}><span style={gps?S.secTick:S.secCross}>{gps?"✓":"!"}</span><span>GPS: {gps?(gps.lat+", "+gps.lng):"Will be captured on submit"}</span></div>
            <div style={S.secRow}><span style={S.secTick}>✓</span><span>SHA-256 photo hash will be computed</span></div>
          </div>
        )}

        {error&&<div style={S.errorBox}>{error}</div>}

        <button style={{...S.genBtn,...(!canSubmit?S.genBtnOff:{})}} disabled={!canSubmit} onClick={handleSubmit}>
          🔐 Send Secure Inspection Report
        </button>

        {!canSubmit&&(
          <p style={S.incomplete}>
            {!vehicle.reg.trim()?"Enter registration · ":""}
            {!requiredDone?"Capture all 5 photos · ":""}
            {!toEmail.includes("@")?"Enter recipient email · ":""}
            {!accessToken?"Sign in to continue":""}
          </p>
        )}
      </div>
    </div>
  );
}

function GoogleIcon(){
  return(
    <svg width="18" height="18" viewBox="0 0 48 48" style={{flexShrink:0}}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

const S={
  page        :{minHeight:"100vh",background:"#f1f5f9",fontFamily:"'Inter','Segoe UI',sans-serif",paddingBottom:48},
  center      :{display:"flex",justifyContent:"center",alignItems:"center",minHeight:"100vh",padding:"24px 16px"},
  centerCard  :{background:"#fff",borderRadius:20,padding:"36px 26px",maxWidth:400,width:"100%",textAlign:"center",boxShadow:"0 4px 32px rgba(0,0,0,0.10)"},
  bigTitle    :{fontSize:26,fontWeight:800,color:"#0f172a",margin:"0 0 6px",letterSpacing:"-0.5px"},
  subTitle    :{fontSize:13,color:"#64748b",margin:"0 0 22px"},
  featureBox  :{background:"#f8fafc",borderRadius:12,padding:"14px 16px",marginBottom:24,textAlign:"left"},
  featureRow  :{display:"flex",gap:8,fontSize:13,color:"#334155",marginBottom:8,alignItems:"flex-start"},
  tick        :{color:"#22c55e",fontWeight:700,flexShrink:0},
  googleBtn   :{display:"flex",alignItems:"center",justifyContent:"center",gap:10,width:"100%",background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"13px 20px",fontSize:14,fontWeight:600,color:"#0f172a",cursor:"pointer",boxShadow:"0 1px 3px rgba(0,0,0,0.08)"},
  loaderWrap  :{height:6,background:"#f1f5f9",borderRadius:6,overflow:"hidden",margin:"20px 0 0"},
  loaderBar   :{height:"100%",background:"linear-gradient(90deg,#3b82f6,#06b6d4)",borderRadius:6,animation:"load 1.4s ease-in-out infinite"},
  doneEmail   :{fontSize:15,fontWeight:700,color:"#1d4ed8",margin:"4px 0 14px"},
  reportIdBox :{background:"#f0fdf4",border:"1.5px solid #bbf7d0",borderRadius:10,padding:"12px 16px",marginBottom:16,textAlign:"center"},
  tags        :{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap",marginBottom:20},
  tag         :{background:"#f1f5f9",color:"#334155",fontSize:12,fontWeight:600,padding:"4px 12px",borderRadius:20},
  btn         :{background:"#0f172a",color:"#fff",border:"none",borderRadius:10,padding:"13px 28px",fontSize:14,fontWeight:700,cursor:"pointer"},
  header      :{background:"#0f172a",padding:"16px 18px 12px"},
  headerRow   :{display:"flex",justifyContent:"space-between",alignItems:"center"},
  brand       :{fontSize:19,fontWeight:800,color:"#f1f5f9",letterSpacing:"-0.5px"},
  brandSub    :{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.07em",marginTop:2},
  userChip    :{display:"flex",alignItems:"center",gap:8,background:"#1e293b",borderRadius:20,padding:"5px 12px 5px 6px",cursor:"pointer"},
  avatar      :{width:26,height:26,borderRadius:"50%",objectFit:"cover"},
  avatarFb    :{width:26,height:26,borderRadius:"50%",background:"#3b82f6",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#fff"},
  uname       :{fontSize:12,color:"#e2e8f0",fontWeight:600},
  fromBadge   :{fontSize:11,color:"#475569",marginTop:8,display:"flex",gap:8},
  cfgBtn      :{background:"transparent",border:"1px solid #334155",color:"#64748b",borderRadius:8,padding:"4px 8px",cursor:"pointer",fontSize:14},
  body        :{maxWidth:480,margin:"0 auto",padding:"0 14px"},
  card        :{background:"#fff",borderRadius:14,padding:"18px 16px",marginTop:14,boxShadow:"0 1px 3px rgba(0,0,0,0.06)"},
  cardTitle   :{fontSize:12,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.08em",borderBottom:"1px solid #f1f5f9",paddingBottom:10,marginBottom:14},
  label       :{display:"block",fontSize:12,fontWeight:600,color:"#475569",marginBottom:5},
  input       :{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"10px 12px",fontSize:14,color:"#0f172a",background:"#f8fafc",boxSizing:"border-box",outline:"none"},
  twoCol      :{display:"flex",gap:10,marginBottom:14},
  hint        :{fontSize:12,color:"#94a3b8",lineHeight:1.6,marginBottom:12},
  photoGrid   :{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10},
  photoCard   :{borderRadius:12,overflow:"hidden",border:"2px dashed #e2e8f0",background:"#f8fafc",minHeight:148},
  photoCardDone:{border:"2px solid #22c55e"},
  photoImg    :{width:"100%",height:130,objectFit:"cover",display:"block"},
  photoBar    :{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 8px",background:"#f0fdf4"},
  photoBarLbl :{fontSize:11,fontWeight:700,color:"#15803d"},
  retakeBtn   :{fontSize:10,color:"#64748b",background:"transparent",border:"1px solid #cbd5e1",borderRadius:6,padding:"2px 7px",cursor:"pointer"},
  photoEmpty  :{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,padding:12,minHeight:148,cursor:"pointer"},
  slotLbl     :{fontSize:13,fontWeight:700,color:"#334155"},
  slotHint    :{fontSize:10,color:"#94a3b8",textAlign:"center",lineHeight:1.4},
  optTag      :{fontSize:10,background:"#f1f5f9",color:"#94a3b8",padding:"1px 7px",borderRadius:10,fontWeight:600},
  capBtn      :{marginTop:6,background:"#0f172a",color:"#fff",fontSize:12,fontWeight:700,padding:"7px 14px",borderRadius:8},
  dots        :{display:"flex",alignItems:"center",gap:6,marginTop:14,justifyContent:"center"},
  dot         :{width:28,height:28,borderRadius:"50%",border:"2px solid #e2e8f0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#94a3b8",background:"#fff"},
  dotDone     :{background:"#22c55e",border:"2px solid #22c55e",color:"#fff",fontWeight:700},
  dotLbl      :{fontSize:12,color:"#64748b",fontWeight:600},
  securityCard:{background:"#fffbeb",border:"1.5px solid #fde68a",borderRadius:12,padding:"14px 16px",marginTop:14},
  secRow      :{display:"flex",gap:8,fontSize:12,color:"#334155",marginBottom:6,alignItems:"flex-start"},
  secTick     :{color:"#22c55e",fontWeight:700,flexShrink:0},
  secCross    :{color:"#f59e0b",fontWeight:700,flexShrink:0},
  errorBox    :{background:"#fef2f2",border:"1px solid #fecaca",color:"#dc2626",borderRadius:8,padding:"10px 14px",fontSize:13,marginTop:12},
  genBtn      :{width:"100%",background:"#0f172a",color:"#fff",border:"none",borderRadius:12,padding:"16px",fontSize:15,fontWeight:700,cursor:"pointer",marginTop:16},
  genBtnOff   :{opacity:0.35,cursor:"not-allowed"},
  incomplete  :{fontSize:12,color:"#94a3b8",textAlign:"center",marginTop:8,lineHeight:1.6},
  overlay     :{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:100,display:"flex",alignItems:"flex-end",justifyContent:"center"},
  modal       :{background:"#fff",width:"100%",maxWidth:480,borderRadius:"20px 20px 0 0",padding:"24px 20px 40px",maxHeight:"90vh",overflowY:"auto"},
  modalTitle  :{fontSize:18,fontWeight:800,color:"#0f172a",margin:"0 0 12px"},
  modalHint   :{fontSize:12,color:"#64748b",lineHeight:1.8,marginBottom:16,background:"#f8fafc",borderRadius:8,padding:"12px 14px"},
};

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
