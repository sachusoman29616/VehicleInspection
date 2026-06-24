// VeriDrive — Vehicle Inspection App
// No login required. Works offline.
// Open on phone via GitHub Pages or any web server.

const { useState, useRef, useCallback } = React;

const PHOTO_SLOTS = [
  { id: "front",    label: "Front",         icon: "⬆️", required: true,  hint: "Full front of the vehicle" },
  { id: "rear",     label: "Rear",          icon: "⬇️", required: true,  hint: "Full rear / boot area" },
  { id: "right",    label: "Right Side",    icon: "➡️", required: true,  hint: "Passenger side, full length" },
  { id: "left",     label: "Left Side",     icon: "⬅️", required: true,  hint: "Driver side, full length" },
  { id: "odometer", label: "Odometer",      icon: "🔢", required: true,  hint: "Dashboard reading clearly visible" },
  { id: "chassis",  label: "Chassis / VIN", icon: "🔡", required: false, hint: "VIN plate on dash or door frame" },
];

function formatTs(date) {
  return date.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function stampImage(dataUrl, label, timestamp) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const fh = Math.max(16, Math.round(img.height * 0.034));
      const pad = 12;
      ctx.font = `bold ${fh}px monospace`;
      const w = Math.max(ctx.measureText(label.toUpperCase()).width, ctx.measureText(timestamp).width) + pad * 2;
      const bh = fh * 2 + pad * 3;
      const bx = pad, by = img.height - bh - pad;
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.beginPath(); ctx.roundRect(bx, by, w, bh, 6); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(label.toUpperCase(), bx + pad, by + pad + fh);
      ctx.fillStyle = "#fbbf24";
      ctx.fillText(timestamp, bx + pad, by + pad * 2 + fh * 2);
      res(c.toDataURL("image/jpeg", 0.85));
    };
    img.src = dataUrl;
  });
}

function resizeImage(dataUrl, maxW = 1100) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL("image/jpeg", 0.82));
    };
    img.src = dataUrl;
  });
}

async function buildAndDownloadPDF({ vehicle, photos, generatedAt }) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, H = 297, margin = 14;

  // Cover page
  doc.setFillColor(15, 23, 42); doc.rect(0, 0, W, 52, "F");
  doc.setFillColor(29, 78, 216); doc.roundedRect(margin, 10, 24, 24, 4, 4, "F");
  doc.setFontSize(14); doc.setTextColor(255,255,255); doc.setFont("helvetica","bold");
  doc.text("V", margin + 7, 26);
  doc.setTextColor(241,245,249); doc.setFontSize(22); doc.setFont("helvetica","bold");
  doc.text("VeriDrive", margin + 30, 22);
  doc.setFontSize(10); doc.setFont("helvetica","normal"); doc.setTextColor(100,116,139);
  doc.text("VEHICLE INSPECTION REPORT", margin + 30, 30);
  doc.setFillColor(127,29,29); doc.roundedRect(W-margin-44,14,44,10,3,3,"F");
  doc.setTextColor(252,165,165); doc.setFontSize(7); doc.setFont("helvetica","bold");
  doc.text("POLICY EXPIRED", W-margin-42, 20.5);
  doc.setTextColor(100,116,139); doc.setFontSize(8); doc.setFont("helvetica","normal");
  doc.text("Generated: " + generatedAt, margin + 30, 38);

  // Vehicle details box
  const bx=margin, by=62, bw=W-margin*2, bh=68;
  doc.setFillColor(248,250,252); doc.roundedRect(bx,by,bw,bh,4,4,"F");
  doc.setDrawColor(226,232,240); doc.roundedRect(bx,by,bw,bh,4,4,"S");
  doc.setFontSize(7); doc.setFont("helvetica","bold"); doc.setTextColor(100,116,139);
  doc.text("VEHICLE DETAILS", bx+6, by+9);
  [
    ["Registration",   vehicle.reg    || "—"],
    ["Make & Model",   vehicle.make   || "—"],
    ["Owner",          vehicle.owner  || "—"],
    ["Expired Policy", vehicle.policy || "—"],
  ].forEach(([k,v],i) => {
    const fy = by+18+i*12;
    doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setTextColor(71,85,105);
    doc.text(k, bx+6, fy);
    doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(15,23,42);
    doc.text(v, bx+54, fy);
  });

  // Photo summary
  const ty = by+bh+16;
  doc.setFontSize(7); doc.setFont("helvetica","bold"); doc.setTextColor(100,116,139);
  doc.text("PHOTOS CAPTURED", bx+6, ty);
  PHOTO_SLOTS.forEach((slot,i) => {
    const captured = photos[slot.id];
    const ry = ty+7+i*9;
    doc.setFillColor(captured?240:254, captured?253:242, captured?244:242);
    doc.roundedRect(bx,ry,bw,8,2,2,"F");
    doc.setFontSize(8); doc.setFont("helvetica","bold");
    doc.setTextColor(captured?21:185, captured?128:28, captured?61:26);
    doc.text(captured?"✓":"—", bx+5, ry+5.5);
    doc.setFont("helvetica","normal"); doc.setTextColor(51,65,85);
    doc.text(slot.label, bx+12, ry+5.5);
    doc.setTextColor(100,116,139); doc.setFontSize(7);
    doc.text(captured ? formatTs(photos[slot.id].ts) : "Not captured", bx+56, ry+5.5);
  });

  // Cover footer
  doc.setFillColor(15,23,42); doc.rect(0,H-12,W,12,"F");
  doc.setFontSize(7); doc.setFont("helvetica","normal"); doc.setTextColor(100,116,139);
  doc.text("VeriDrive — Vehicle Inspection Report", margin, H-4.5);
  doc.text("Page 1", W-margin-8, H-4.5);

  // Photo pages
  const capturedSlots = PHOTO_SLOTS.filter(s => photos[s.id]);
  for (let i = 0; i < capturedSlots.length; i++) {
    const slot = capturedSlots[i];
    const ph   = photos[slot.id];
    doc.addPage();
    doc.setFillColor(15,23,42); doc.rect(0,0,W,22,"F");
    doc.setFontSize(11); doc.setFont("helvetica","bold"); doc.setTextColor(241,245,249);
    doc.text(slot.label.toUpperCase(), margin, 14);
    doc.setFontSize(8); doc.setFont("helvetica","normal"); doc.setTextColor(100,116,139);
    const regText = vehicle.reg || "";
    doc.text(regText, W-margin-doc.getTextWidth(regText), 14);
    const px=margin, py=28, pw=W-margin*2;
    await new Promise((resolve) => {
      const tmp = new Image();
      tmp.onload = () => {
        const ar   = tmp.height/tmp.width;
        const ph_h = Math.min(pw*ar, H-py-30);
        try { doc.addImage(ph.url,"JPEG",px,py,pw,ph_h); } catch(e){}
        const sy = py+ph_h+4;
        doc.setFillColor(248,250,252); doc.roundedRect(px,sy,pw,14,3,3,"F");
        doc.setDrawColor(226,232,240); doc.roundedRect(px,sy,pw,14,3,3,"S");
        doc.setFontSize(7); doc.setFont("helvetica","bold"); doc.setTextColor(100,116,139);
        doc.text("CAPTURED AT", px+5, sy+6);
        doc.setFontSize(9); doc.setFont("helvetica","bold"); doc.setTextColor(15,23,42);
        doc.text(formatTs(ph.ts), px+5, sy+12);
        doc.setFontSize(7); doc.setFont("helvetica","normal"); doc.setTextColor(100,116,139);
        doc.text("Photo "+(i+1)+" of "+capturedSlots.length, W-margin-24, sy+12);
        resolve();
      };
      tmp.src = ph.url;
    });
    doc.setFillColor(15,23,42); doc.rect(0,H-12,W,12,"F");
    doc.setFontSize(7); doc.setFont("helvetica","normal"); doc.setTextColor(100,116,139);
    doc.text("VeriDrive — Vehicle Inspection Report", margin, H-4.5);
    doc.text("Page "+(i+2), W-margin-8, H-4.5);
  }

  const fname = "VeriDrive_"+(vehicle.reg||"inspection").replace(/\s+/g,"_")+"_"+new Date().toISOString().slice(0,10)+".pdf";
  doc.save(fname);
  return fname;
}

const SCREEN = { FORM:"form", GENERATING:"generating", DONE:"done" };

function App() {
  const [screen,   setScreen]   = useState(SCREEN.FORM);
  const [vehicle,  setVehicle]  = useState({ reg:"", make:"", owner:"", policy:"" });
  const [photos,   setPhotos]   = useState({});
  const [filename, setFilename] = useState("");
  const [error,    setError]    = useState("");
  const fileRefs = useRef({});

  const requiredDone = PHOTO_SLOTS.filter(s => s.required).every(s => photos[s.id]);
  const canGenerate  = requiredDone && vehicle.reg.trim();

  const capturePhoto = useCallback(async (slotId, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const slot    = PHOTO_SLOTS.find(s => s.id === slotId);
      const ts      = new Date();
      const resized = await resizeImage(e.target.result);
      const stamped = await stampImage(resized, slot.label, formatTs(ts));
      setPhotos(p => ({ ...p, [slotId]: { url: stamped, ts } }));
    };
    reader.readAsDataURL(file);
  }, []);

  const handleGenerate = async () => {
    setScreen(SCREEN.GENERATING); setError("");
    try {
      const fname = await buildAndDownloadPDF({ vehicle, photos, generatedAt: formatTs(new Date()) });
      setFilename(fname);
      setScreen(SCREEN.DONE);
    } catch(e) {
      setError("PDF generation failed. Please try again.");
      setScreen(SCREEN.FORM);
    }
  };

  // GENERATING
  if (screen === SCREEN.GENERATING) return (
    <div style={S.page}>
      <div style={S.center}>
        <div style={S.centerCard}>
          <div style={{fontSize:48,marginBottom:14}}>📄</div>
          <h2 style={S.bigTitle}>Generating PDF…</h2>
          <p style={S.subTitle}>Please wait</p>
          <div style={S.loaderWrap}><div style={S.loaderBar}/></div>
        </div>
      </div>
    </div>
  );

  // DONE
  if (screen === SCREEN.DONE) return (
    <div style={S.page}>
      <div style={S.center}>
        <div style={S.centerCard}>
          <div style={{fontSize:56,marginBottom:10}}>✅</div>
          <h2 style={S.bigTitle}>PDF Ready!</h2>
          <p style={S.subTitle}>Downloaded to your device</p>
          <div style={S.fileBox}>
            <span style={{fontSize:26}}>📄</span>
            <div style={{textAlign:"left"}}>
              <div style={{fontSize:12,fontWeight:700,color:"#0f172a",wordBreak:"break-all"}}>{filename}</div>
              <div style={{fontSize:11,color:"#64748b",marginTop:2}}>Saved in Downloads folder</div>
            </div>
          </div>
          <div style={S.shareBox}>
            <div style={S.shareTitle}>Now share via</div>
            <div style={S.shareRow}>
              {[["📧","Email"],["💬","WhatsApp"],["📁","Drive"],["🖨️","Print"]].map(([ic,lb])=>(
                <div key={lb} style={S.shareOpt}><span style={{fontSize:24}}>{ic}</span><span style={{fontSize:11,color:"#64748b"}}>{lb}</span></div>
              ))}
            </div>
            <p style={S.shareHint}>Open the PDF from Downloads and share using any app on your phone</p>
          </div>
          <div style={S.tags}>
            <span style={S.tag}>{vehicle.reg}</span>
            <span style={S.tag}>{PHOTO_SLOTS.filter(s=>photos[s.id]).length} photos</span>
            <span style={S.tag}>{new Date().toLocaleDateString("en-GB")}</span>
          </div>
          <button style={S.btn} onClick={()=>{setPhotos({});setVehicle({reg:"",make:"",owner:"",policy:""});setFilename("");setScreen(SCREEN.FORM);}}>
            Start New Inspection
          </button>
        </div>
      </div>
    </div>
  );

  // FORM
  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={S.brand}>🛡️ VeriDrive</div>
        <div style={S.brandSub}>Vehicle Inspection · Policy Renewal</div>
      </div>

      <div style={S.body}>

        <div style={S.card}>
          <div style={S.cardTitle}>Vehicle Details</div>
          <div style={{marginBottom:14}}>
            <label style={S.label}>Registration Number *</label>
            <input style={S.input} placeholder="e.g. MH02AB1234" value={vehicle.reg}
              onChange={e=>setVehicle(v=>({...v,reg:e.target.value.toUpperCase()}))} />
          </div>
          <div style={S.twoCol}>
            <div style={{flex:1}}>
              <label style={S.label}>Make & Model</label>
              <input style={S.input} placeholder="e.g. Maruti Swift" value={vehicle.make}
                onChange={e=>setVehicle(v=>({...v,make:e.target.value}))} />
            </div>
            <div style={{flex:1}}>
              <label style={S.label}>Owner Name</label>
              <input style={S.input} placeholder="Full name" value={vehicle.owner}
                onChange={e=>setVehicle(v=>({...v,owner:e.target.value}))} />
            </div>
          </div>
          <div style={{marginBottom:14}}>
            <label style={S.label}>Expired Policy Number</label>
            <input style={S.input} placeholder="e.g. POL/2023/00123" value={vehicle.policy}
              onChange={e=>setVehicle(v=>({...v,policy:e.target.value}))} />
          </div>
        </div>

        <div style={S.card}>
          <div style={S.cardTitle}>Capture Photos</div>
          <p style={S.hint}>Tap each box to open camera. Photos are stamped with label and time automatically.</p>
          <div style={S.photoGrid}>
            {PHOTO_SLOTS.map(slot => {
              const cap = photos[slot.id];
              return (
                <div key={slot.id} style={{...S.photoCard,...(cap?S.photoCardDone:{})}}>
                  <input type="file" accept="image/*" capture="environment" style={{display:"none"}}
                    ref={el=>fileRefs.current[slot.id]=el}
                    onChange={e=>capturePhoto(slot.id,e.target.files[0])} />
                  {cap ? (
                    <>
                      <img src={cap.url} alt={slot.label} style={S.photoImg}/>
                      <div style={S.photoBar}>
                        <span style={S.photoBarLbl}>{slot.icon} {slot.label}</span>
                        <button style={S.retakeBtn} onClick={()=>setPhotos(p=>{const n={...p};delete n[slot.id];return n;})}>Retake</button>
                      </div>
                    </>
                  ) : (
                    <div style={S.photoEmpty} onClick={()=>fileRefs.current[slot.id]?.click()}>
                      <span style={{fontSize:28}}>{slot.icon}</span>
                      <span style={S.slotLbl}>{slot.label}</span>
                      {!slot.required && <span style={S.optTag}>Optional</span>}
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

        {error && <div style={S.errorBox}>{error}</div>}

        <button style={{...S.genBtn,...(!canGenerate?S.genBtnOff:{})}} disabled={!canGenerate} onClick={handleGenerate}>
          📄 Generate & Download PDF
        </button>

        {!canGenerate && (
          <p style={S.incomplete}>
            {!vehicle.reg.trim()?"Enter registration number":""}
            {!vehicle.reg.trim()&&!requiredDone?" · ":""}
            {!requiredDone?"Capture all 5 required photos":""}
          </p>
        )}

      </div>
    </div>
  );
}

const S = {
  page        : {minHeight:"100vh",background:"#f1f5f9",fontFamily:"'Inter','Segoe UI',sans-serif",paddingBottom:48},
  center      : {display:"flex",justifyContent:"center",alignItems:"center",minHeight:"100vh",padding:"24px 16px"},
  centerCard  : {background:"#fff",borderRadius:20,padding:"36px 26px",maxWidth:400,width:"100%",textAlign:"center",boxShadow:"0 4px 32px rgba(0,0,0,0.10)"},
  bigTitle    : {fontSize:24,fontWeight:800,color:"#0f172a",margin:"0 0 6px",letterSpacing:"-0.5px"},
  subTitle    : {fontSize:13,color:"#64748b",margin:"0 0 20px"},
  loaderWrap  : {height:6,background:"#f1f5f9",borderRadius:6,overflow:"hidden",margin:"20px 0 0"},
  loaderBar   : {height:"100%",background:"linear-gradient(90deg,#3b82f6,#06b6d4)",borderRadius:6,animation:"load 1.4s ease-in-out infinite"},
  fileBox     : {display:"flex",alignItems:"center",gap:12,background:"#f0fdf4",border:"1.5px solid #bbf7d0",borderRadius:12,padding:"14px 16px",marginBottom:16,textAlign:"left"},
  shareBox    : {background:"#f8fafc",borderRadius:12,padding:"14px 16px",marginBottom:16},
  shareTitle  : {fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10},
  shareRow    : {display:"flex",justifyContent:"space-around",marginBottom:8},
  shareOpt    : {display:"flex",flexDirection:"column",alignItems:"center",gap:4},
  shareHint   : {fontSize:11,color:"#94a3b8",lineHeight:1.5},
  tags        : {display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap",marginBottom:20},
  tag         : {background:"#f1f5f9",color:"#334155",fontSize:12,fontWeight:600,padding:"4px 12px",borderRadius:20},
  btn         : {background:"#0f172a",color:"#fff",border:"none",borderRadius:10,padding:"13px 28px",fontSize:14,fontWeight:700,cursor:"pointer"},
  header      : {background:"#0f172a",padding:"20px 18px 16px",textAlign:"center"},
  brand       : {fontSize:22,fontWeight:800,color:"#f1f5f9",letterSpacing:"-0.5px"},
  brandSub    : {fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.08em",marginTop:4},
  body        : {maxWidth:480,margin:"0 auto",padding:"0 14px"},
  card        : {background:"#fff",borderRadius:14,padding:"18px 16px",marginTop:14,boxShadow:"0 1px 3px rgba(0,0,0,0.06)"},
  cardTitle   : {fontSize:12,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.08em",borderBottom:"1px solid #f1f5f9",paddingBottom:10,marginBottom:14},
  label       : {display:"block",fontSize:12,fontWeight:600,color:"#475569",marginBottom:5},
  input       : {width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"10px 12px",fontSize:14,color:"#0f172a",background:"#f8fafc",boxSizing:"border-box",outline:"none"},
  twoCol      : {display:"flex",gap:10,marginBottom:14},
  hint        : {fontSize:12,color:"#94a3b8",lineHeight:1.6,marginBottom:12},
  photoGrid   : {display:"grid",gridTemplateColumns:"1fr 1fr",gap:10},
  photoCard   : {borderRadius:12,overflow:"hidden",border:"2px dashed #e2e8f0",background:"#f8fafc",minHeight:148},
  photoCardDone:{border:"2px solid #22c55e"},
  photoImg    : {width:"100%",height:130,objectFit:"cover",display:"block"},
  photoBar    : {display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 8px",background:"#f0fdf4"},
  photoBarLbl : {fontSize:11,fontWeight:700,color:"#15803d"},
  retakeBtn   : {fontSize:10,color:"#64748b",background:"transparent",border:"1px solid #cbd5e1",borderRadius:6,padding:"2px 7px",cursor:"pointer"},
  photoEmpty  : {display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,padding:12,minHeight:148,cursor:"pointer"},
  slotLbl     : {fontSize:13,fontWeight:700,color:"#334155"},
  slotHint    : {fontSize:10,color:"#94a3b8",textAlign:"center",lineHeight:1.4},
  optTag      : {fontSize:10,background:"#f1f5f9",color:"#94a3b8",padding:"1px 7px",borderRadius:10,fontWeight:600},
  capBtn      : {marginTop:6,background:"#0f172a",color:"#fff",fontSize:12,fontWeight:700,padding:"7px 14px",borderRadius:8},
  dots        : {display:"flex",alignItems:"center",gap:6,marginTop:14,justifyContent:"center"},
  dot         : {width:28,height:28,borderRadius:"50%",border:"2px solid #e2e8f0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#94a3b8",background:"#fff"},
  dotDone     : {background:"#22c55e",border:"2px solid #22c55e",color:"#fff",fontWeight:700},
  dotLbl      : {fontSize:12,color:"#64748b",fontWeight:600},
  errorBox    : {background:"#fef2f2",border:"1px solid #fecaca",color:"#dc2626",borderRadius:8,padding:"10px 14px",fontSize:13,marginTop:12},
  genBtn      : {width:"100%",background:"#0f172a",color:"#fff",border:"none",borderRadius:12,padding:"16px",fontSize:15,fontWeight:700,cursor:"pointer",marginTop:16},
  genBtnOff   : {opacity:0.35,cursor:"not-allowed"},
  incomplete  : {fontSize:12,color:"#94a3b8",textAlign:"center",marginTop:8,lineHeight:1.6},
};

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
