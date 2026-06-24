const { useState, useRef, useCallback, useEffect } = React;

const CLIENT_ID = "168804904830-5jf5intu3blp96u5sr5oro78jufrrjs8.apps.googleusercontent.com";

const PHOTO_SLOTS = [
  { id:"front",    label:"Front",         icon:"⬆️", required:true,  hint:"Full front of the vehicle" },
  { id:"rear",     label:"Rear",          icon:"⬇️", required:true,  hint:"Full rear / boot area" },
  { id:"right",    label:"Right Side",    icon:"➡️", required:true,  hint:"Passenger side, full length" },
  { id:"left",     label:"Left Side",     icon:"⬅️", required:true,  hint:"Driver side, full length" },
  { id:"odometer", label:"Odometer",      icon:"🔢", required:true,  hint:"Dashboard reading clearly visible" },
  { id:"chassis",  label:"Chassis / VIN", icon:"🔡", required:false, hint:"VIN plate on dash or door frame" },
];

function formatTs(date) {
  return date.toLocaleString("en-GB",{
    day:"2-digit",month:"short",year:"numeric",
    hour:"2-digit",minute:"2-digit",second:"2-digit"
  });
}

function generateReportId(reg) {
  var d    = new Date();
  var dt   = d.getFullYear().toString() + String(d.getMonth()+1).padStart(2,"0") + String(d.getDate()).padStart(2,"0");
  var rand = Math.random().toString(36).substring(2,6).toUpperCase();
  return "UI-" + dt + "-" + (reg||"XX") + "-" + rand;
}

async function hashPhotos(photos) {
  try {
    var combined = PHOTO_SLOTS
      .filter(function(s){ return photos[s.id]; })
      .map(function(s){ return photos[s.id].url.substring(0,200) + formatTs(photos[s.id].ts); })
      .join("|");
    var msgBuffer  = new TextEncoder().encode(combined);
    var hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
    var hashArray  = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(function(b){ return b.toString(16).padStart(2,"0"); }).join("").substring(0,32).toUpperCase();
  } catch(e) {
    return "HASH-UNAVAILABLE";
  }
}

function getGPS() {
  return new Promise(function(resolve) {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      function(pos) {
        resolve({
          lat:      pos.coords.latitude.toFixed(6),
          lng:      pos.coords.longitude.toFixed(6),
          accuracy: Math.round(pos.coords.accuracy)
        });
      },
      function() { resolve(null); },
      { timeout:8000, enableHighAccuracy:true }
    );
  });
}

function stampImage(dataUrl, label, timestamp, gps) {
  return new Promise(function(res) {
    var img = new Image();
    img.onload = function() {
      var c   = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      var ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      var fh  = Math.max(14, Math.round(img.height * 0.030));
      var pad = 10;
      var gpsText = gps ? ("GPS: "+gps.lat+", "+gps.lng+" (+-"+gps.accuracy+"m)") : "GPS: Unavailable";
      var lines = [label.toUpperCase(), timestamp, gpsText];
      ctx.font = "bold " + fh + "px monospace";
      var maxW = Math.max(ctx.measureText(lines[0]).width, ctx.measureText(lines[1]).width, ctx.measureText(lines[2]).width);
      var boxW = maxW + pad*2;
      var boxH = fh * 3 + pad * 4;
      var bx   = pad;
      var by   = img.height - boxH - pad;
      ctx.fillStyle = "rgba(0,0,0,0.70)";
      ctx.beginPath(); ctx.roundRect(bx,by,boxW,boxH,6); ctx.fill();
      var colors = ["#ffffff","#fbbf24","#86efac"];
      lines.forEach(function(line,i) {
        ctx.fillStyle = colors[i];
        ctx.fillText(line, bx+pad, by+pad*(i+1)+fh*(i+1));
      });
      res(c.toDataURL("image/jpeg",0.85));
    };
    img.src = dataUrl;
  });
}

function resizeImage(dataUrl, maxW) {
  maxW = maxW || 1100;
  return new Promise(function(res) {
    var img = new Image();
    img.onload = function() {
      var scale = Math.min(1, maxW/img.width);
      var c = document.createElement("canvas");
      c.width  = Math.round(img.width*scale);
      c.height = Math.round(img.height*scale);
      c.getContext("2d").drawImage(img,0,0,c.width,c.height);
      res(c.toDataURL("image/jpeg",0.82));
    };
    img.src = dataUrl;
  });
}

async function buildPDF(opts) {
  var vehicle=opts.vehicle, photos=opts.photos, inspectorName=opts.inspectorName;
  var inspectorEmail=opts.inspectorEmail, generatedAt=opts.generatedAt;
  var reportId=opts.reportId, gps=opts.gps, photoHash=opts.photoHash;

  var jsPDF = window.jspdf.jsPDF;
  var doc   = new jsPDF({orientation:"portrait",unit:"mm",format:"a4"});
  var W=210, H=297, margin=14;

  // Header
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

  // Vehicle details
  var bx=margin,by=70,bw=W-margin*2,bh=68;
  doc.setFillColor(248,250,252); doc.roundedRect(bx,by,bw,bh,4,4,"F");
  doc.setDrawColor(226,232,240); doc.roundedRect(bx,by,bw,bh,4,4,"S");
  doc.setFontSize(7); doc.setFont("helvetica","bold"); doc.setTextColor(100,116,139);
  doc.text("VEHICLE DETAILS",bx+6,by+9);
  var fields=[["Registration",vehicle.reg||"—"],["Make & Model",vehicle.make||"—"],["Owner",vehicle.owner||"—"],["Expired Policy",vehicle.policy||"—"]];
  fields.forEach(function(pair,i){
    var fy=by+18+i*12;
    doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setTextColor(71,85,105);
    doc.text(pair[0],bx+6,fy);
    doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(15,23,42);
    doc.text(pair[1],bx+54,fy);
  });

  // Inspector & GPS
  var iy=by+bh+6;
  doc.setFillColor(239,246,255); doc.roundedRect(bx,iy,bw,30,4,4,"F");
  doc.setFontSize(7); doc.setFont("helvetica","bold"); doc.setTextColor(100,116,139);
  doc.text("INSPECTOR & LOCATION",bx+6,iy+8);
  doc.setFontSize(9); doc.setFont("helvetica","bold"); doc.setTextColor(15,23,42);
  doc.text(inspectorName,bx+6,iy+16);
  doc.setFontSize(8); doc.setFont("helvetica","normal"); doc.setTextColor(71,85,105);
  doc.text(inspectorEmail,bx+6,iy+22);
  doc.setFontSize(7); doc.setTextColor(100,116,139);
  var gpsText = gps ? ("GPS: "+gps.lat+", "+gps.lng+" (+-"+gps.accuracy+"m)") : "GPS: Not available";
  doc.text(gpsText,bx+6,iy+28);

  // Hash box
  var hx=bx, hy=iy+36, hw=bw, hh=16;
  doc.setFillColor(254,243,199); doc.roundedRect(hx,hy,hw,hh,4,4,"F");
  doc.setDrawColor(251,191,36); doc.roundedRect(hx,hy,hw,hh,4,4,"S");
  doc.setFontSize(7); doc.setFont("helvetica","bold"); doc.setTextColor(146,64,14);
  doc.text("PHOTO INTEGRITY HASH (SHA-256)",hx+6,hy+6);
  doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(15,23,42);
  doc.text(photoHash,hx+6,hy+12);

  // Photo summary
  var ty=hy+hh+8;
  doc.setFontSize(7); doc.setFont("helvetica","bold"); doc.setTextColor(100,116,139);
  doc.text("PHOTOS CAPTURED",bx+6,ty);
  PHOTO_SLOTS.forEach(function(slot,i){
    var captured=photos[slot.id]; var ry=ty+7+i*9;
    doc.setFillColor(captured?240:254, captured?253:242, captured?244:242);
    doc.roundedRect(bx,ry,bw,8,2,2,"F");
    doc.setFontSize(8); doc.setFont("helvetica","bold");
    doc.setTextColor(captured?21:185, captured?128:28, captured?61:26);
    doc.text(captured?"✓":"—",bx+5,ry+5.5);
    doc.setFont("helvetica","normal"); doc.setTextColor(51,65,85);
    doc.text(slot.label,bx+12,ry+5.5);
    doc.setTextColor(100,116,139); doc.setFontSize(7);
    doc.text(captured?formatTs(photos[slot.id].ts):"Not captured",bx+56,ry+5.5);
  });

  // Footer
  doc.setFillColor(15,23,42); doc.rect(0,H-12,W,12,"F");
  doc.setFontSize(7); doc.setFont("helvetica","normal"); doc.setTextColor(100,116,139);
  doc.text("UniInspect | "+reportId, margin, H-4.5);
  doc.text("Page 1", W-margin-8, H-4.5);

  // Photo pages
  var capturedSlots = PHOTO_SLOTS.filter(function(s){ return photos[s.id]; });
  for(var i=0; i<capturedSlots.length; i++){
    var slot=capturedSlots[i]; var ph=photos[slot.id];
    doc.addPage();
    doc.setFillColor(15,23,42); doc.rect(0,0,W,22,"F");
    doc.setFontSize(11); doc.setFont("helvetica","bold"); doc.setTextColor(241,245,249);
    doc.text(slot.label.toUpperCase(),margin,14);
    doc.setFontSize(7); doc.setFont("helvetica","normal"); doc.setTextColor(100,116,139);
    doc.text(reportId, W-margin-doc.getTextWidth(reportId), 14);
    var px=margin, py=28, pw=W-margin*2;
    await new Promise(function(resolve){
      var tmp=new Image();
      tmp.onload=function(){
        var ar=tmp.height/tmp.width;
        var ph_h=Math.min(pw*ar, H-py-36);
        try{ doc.addImage(ph.url,"JPEG",px,py,pw,ph_h); }catch(e){}
        var sy=py+ph_h+4;
        doc.setFillColor(248,250,252); doc.roundedRect(px,sy,pw,20,3,3,"F");
        doc.setDrawColor(226,232,240); doc.roundedRect(px,sy,pw,20,3,3,"S");
        doc.setFontSize(7); doc.setFont("helvetica","bold"); doc.setTextColor(100,116,139);
        doc.text("CAPTURED AT",px+5,sy+6);
        doc.setFontSize(9); doc.setFont("helvetica","bold"); doc.setTextColor(15,23,42);
        doc.text(formatTs(ph.ts),px+5,sy+12);
        doc.setFontSize(7); doc.setFont("helvetica","normal"); doc.setTextColor(34,197,94);
        var pGps = ph.gps ? ("GPS: "+ph.gps.lat+", "+ph.gps.lng+" (+-"+ph.gps.accuracy+"m)") : "GPS: Not available";
        doc.text(pGps,px+5,sy+18);
        doc.setTextColor(100,116,139);
        doc.text("Photo "+(i+1)+" of "+capturedSlots.length, W-margin-20, sy+12);
        resolve();
      };
      tmp.src=ph.url;
    });
    doc.setFillColor(15,23,42); doc.rect(0,H-12,W,12,"F");
    doc.setFontSize(7); doc.setFont("helvetica","normal"); doc.setTextColor(100,116,139);
    doc.text("UniInspect | "+reportId, margin, H-4.5);
    doc.text("Page "+(i+2), W-margin-8, H-4.5);
  }
  return doc;
}

function buildMimeEmail(opts){
  var from=opts.from, to=opts.to, subject=opts.subject;
  var bodyText=opts.bodyText, pdfBase64=opts.pdfBase64, pdfFilename=opts.pdfFilename;
  var boundary = "bnd_ui_"+Date.now();
  var lines = [
    "From: "+from, "To: "+to, "Subject: "+subject,
    "MIME-Version: 1.0", "Content-Type: multipart/mixed; boundary=\""+boundary+"\"", "",
    "--"+boundary, "Content-Type: text/plain; charset=\"UTF-8\"", "", bodyText, "",
    "--"+boundary, "Content-Type: application/pdf",
    "Content-Transfer-Encoding: base64",
    "Content-Disposition: attachment; filename=\""+pdfFilename+"\"", "",
  ];
  for(var i=0; i<pdfBase64.length; i+=76) lines.push(pdfBase64.slice(i,i+76));
  lines.push("", "--"+boundary+"--");
  return btoa(unescape(encodeURIComponent(lines.join("\r\n"))))
    .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}

var SCREEN = {CONNECT:"connect", INSPECT:"inspect", SENDING:"sending", DONE:"done"};

function App(){
  var userInit = null;
  try { userInit = JSON.parse(localStorage.getItem("ui_user")||"null"); } catch(e){}
  var recipInit = localStorage.getItem("ui_recipient")||"";

  var us  = useState(SCREEN.CONNECT);     var screen=us[0],      setScreen=us[1];
  var ug  = useState(userInit);           var gmailUser=ug[0],   setGmailUser=ug[1];
  var uat = useState(null);               var accessToken=uat[0],setAccessToken=uat[1];
  var uv  = useState({reg:"",make:"",owner:"",policy:""}); var vehicle=uv[0],setVehicle=uv[1];
  var ue  = useState(recipInit);          var toEmail=ue[0],     setToEmail=ue[1];
  var uph = useState({});                 var photos=uph[0],     setPhotos=uph[1];
  var ugp = useState(null);               var gps=ugp[0],        setGps=ugp[1];
  var uer = useState("");                 var error=uer[0],      setError=uer[1];
  var uss = useState("");                 var sendStatus=uss[0], setSendStatus=uss[1];
  var ulr = useState("");                 var lastReportId=ulr[0],setLastReportId=ulr[1];

  var fileRefs = useRef({});

  useEffect(function(){
    if(gmailUser) setScreen(SCREEN.INSPECT);
    if(!window.google){
      var s=document.createElement("script");
      s.src="https://accounts.google.com/gsi/client";
      s.async=true; s.defer=true;
      document.head.appendChild(s);
    }
  },[]);

  function signIn(){
    if(!window.google){ setError("Loading Google... wait 2 seconds and try again."); return; }
    var tc=window.google.accounts.oauth2.initTokenClient({
      client_id:CLIENT_ID,
      scope:"https://www.googleapis.com/auth/gmail.send email profile",
      callback:async function(resp){
        if(resp.error){ setError("Sign-in failed. Please try again."); return; }
        setAccessToken(resp.access_token);
        try{
          var r=await fetch("https://www.googleapis.com/oauth2/v3/userinfo",{headers:{Authorization:"Bearer "+resp.access_token}});
          var u=await r.json();
          var user={name:u.name,email:u.email,picture:u.picture};
          setGmailUser(user);
          localStorage.setItem("ui_user",JSON.stringify(user));
          setScreen(SCREEN.INSPECT);
        }catch(e){ setError("Could not fetch profile."); }
      },
    });
    tc.requestAccessToken();
  }

  function signOut(){
    if(!window.confirm("Sign out?")) return;
    setGmailUser(null); setAccessToken(null);
    localStorage.removeItem("ui_user");
    setScreen(SCREEN.CONNECT);
  }

  var capturePhoto = useCallback(async function(slotId, file){
    if(!file) return;
    var photoGps = await getGPS();
    var reader   = new FileReader();
    reader.onload = async function(e){
      var slot    = PHOTO_SLOTS.find(function(s){ return s.id===slotId; });
      var ts      = new Date();
      var resized = await resizeImage(e.target.result);
      var stamped = await stampImage(resized, slot.label, formatTs(ts), photoGps);
      setPhotos(function(p){ var n=Object.assign({},p); n[slotId]={url:stamped,ts:ts,gps:photoGps}; return n; });
      if(photoGps) setGps(photoGps);
    };
    reader.readAsDataURL(file);
  },[]);

  var requiredDone = PHOTO_SLOTS.filter(function(s){ return s.required; }).every(function(s){ return photos[s.id]; });
  var canSubmit    = requiredDone && toEmail.includes("@") && vehicle.reg.trim() && accessToken;

  async function handleSubmit(){
    setScreen(SCREEN.SENDING); setError("");
    try{
      setSendStatus("Getting GPS location...");
      var currentGps = gps || (await getGPS());

      setSendStatus("Creating photo fingerprint...");
      var photoHash  = await hashPhotos(photos);
      var reportId   = generateReportId(vehicle.reg);
      var generatedAt= formatTs(new Date());

      setSendStatus("Generating PDF...");
      var doc = await buildPDF({
        vehicle:vehicle, photos:photos,
        inspectorName:gmailUser.name, inspectorEmail:gmailUser.email,
        generatedAt:generatedAt, reportId:reportId,
        gps:currentGps, photoHash:photoHash
      });

      setSendStatus("Sending via Gmail...");
      var pdfFilename = "UniInspect_"+(vehicle.reg||"inspection").replace(/\s+/g,"_")+"_"+new Date().toISOString().slice(0,10)+".pdf";
      var pdfBase64   = doc.output("datauristring").split(",")[1];

      var gpsLine = currentGps ? (currentGps.lat+", "+currentGps.lng+" (+-"+currentGps.accuracy+"m)") : "Not available";
      var bodyLines = [
        "VEHICLE INSPECTION REPORT",
        "Report ID  : "+reportId,
        "Generated  : "+generatedAt,
        "Inspector  : "+gmailUser.name+" <"+gmailUser.email+">",
        "GPS        : "+gpsLine,
        "Photo Hash : "+photoHash,
        "",
        "VEHICLE DETAILS",
        "Registration  : "+(vehicle.reg||"—"),
        "Make / Model  : "+(vehicle.make||"—"),
        "Owner         : "+(vehicle.owner||"—"),
        "Expired Policy: "+(vehicle.policy||"—"),
        "",
        "PHOTOS CAPTURED",
      ];
      PHOTO_SLOTS.forEach(function(s){
        bodyLines.push(photos[s.id] ? ("✓  "+s.label+"  "+formatTs(photos[s.id].ts)) : ("—  "+s.label+"  Not captured"));
      });
      bodyLines.push("","PDF attached: "+pdfFilename,"","---","Sent via UniInspect");
      var bodyText = bodyLines.join("\n");

      var raw = buildMimeEmail({
        from: gmailUser.name+" <"+gmailUser.email+">",
        to:   toEmail,
        subject: "Vehicle Inspection Report - "+vehicle.reg+" - "+new Date().toLocaleDateString("en-GB"),
        bodyText:bodyText, pdfBase64:pdfBase64, pdfFilename:pdfFilename
      });

      var resp = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send",{
        method:"POST",
        headers:{Authorization:"Bearer "+accessToken,"Content-Type":"application/json"},
        body:JSON.stringify({raw:raw})
      });
      if(!resp.ok){
        var errData = await resp.json();
        throw new Error(errData&&errData.error&&errData.error.message ? errData.error.message : "Send failed");
      }
      doc.save(pdfFilename);
      setLastReportId(reportId);
      setScreen(SCREEN.DONE);
    }catch(e){
      setError(e.message||"Something went wrong.");
      setScreen(SCREEN.INSPECT);
      setSendStatus("");
    }
  }

  // CONNECT SCREEN
  if(screen===SCREEN.CONNECT) return React.createElement("div",{style:S.page},
    React.createElement("div",{style:S.center},
      React.createElement("div",{style:S.centerCard},
        React.createElement("div",{style:{fontSize:52,marginBottom:8}},"🛡️"),
        React.createElement("h1",{style:S.bigTitle},"UniInspect"),
        React.createElement("p",{style:S.subTitle},"Vehicle Inspection · Policy Renewal"),
        React.createElement("div",{style:S.featureBox},
          ["GPS coordinates stamped on every photo","SHA-256 photo fingerprint","Unique Report ID on every report","Inspector Gmail identity"].map(function(f){
            return React.createElement("div",{key:f,style:S.featureRow},
              React.createElement("span",{style:S.tick},"✓"),
              React.createElement("span",null,f)
            );
          })
        ),
        error&&React.createElement("div",{style:S.errorBox},error),
        React.createElement("button",{style:S.googleBtn,onClick:signIn},
          React.createElement(GoogleIcon,null),
          "Sign in with Google"
        ),
        React.createElement("p",{style:{fontSize:11,color:"#94a3b8",marginTop:12}},"Your Gmail is used to send inspection reports")
      )
    )
  );

  // SENDING SCREEN
  if(screen===SCREEN.SENDING) return React.createElement("div",{style:S.page},
    React.createElement("div",{style:S.center},
      React.createElement("div",{style:S.centerCard},
        React.createElement("div",{style:{fontSize:48,marginBottom:14}},"🔐"),
        React.createElement("h2",{style:S.bigTitle},"Securing Report..."),
        React.createElement("p",{style:S.subTitle},sendStatus),
        React.createElement("div",{style:S.loaderWrap},React.createElement("div",{style:S.loaderBar}))
      )
    )
  );

  // DONE SCREEN
  if(screen===SCREEN.DONE) return React.createElement("div",{style:S.page},
    React.createElement("div",{style:S.center},
      React.createElement("div",{style:S.centerCard},
        React.createElement("div",{style:{fontSize:52,marginBottom:10}},"✅"),
        React.createElement("h2",{style:S.bigTitle},"Report Sent!"),
        React.createElement("p",{style:S.subTitle},"Secured & delivered to"),
        React.createElement("div",{style:S.doneEmail},toEmail),
        React.createElement("div",{style:S.reportIdBox},
          React.createElement("div",{style:{fontSize:10,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}},"Report ID"),
          React.createElement("div",{style:{fontSize:14,fontWeight:800,color:"#0f172a"}},lastReportId)
        ),
        React.createElement("div",{style:S.tags},
          React.createElement("span",{style:S.tag},vehicle.reg),
          React.createElement("span",{style:S.tag},PHOTO_SLOTS.filter(function(s){return photos[s.id];}).length+" photos"),
          React.createElement("span",{style:S.tag},gps?"GPS ✓":"No GPS")
        ),
        React.createElement("p",{style:{fontSize:12,color:"#64748b",marginBottom:20}},"PDF also downloaded to your device."),
        React.createElement("button",{style:S.btn,onClick:function(){
          setPhotos({}); setVehicle({reg:"",make:"",owner:"",policy:""});
          setSendStatus(""); setGps(null); setLastReportId(""); setScreen(SCREEN.INSPECT);
        }},"Start New Inspection")
      )
    )
  );

  // INSPECT SCREEN
  return React.createElement("div",{style:S.page},
    React.createElement("div",{style:S.header},
      React.createElement("div",{style:S.headerRow},
        React.createElement("div",null,
          React.createElement("div",{style:S.brand},"🛡️ UniInspect"),
          React.createElement("div",{style:S.brandSub},"Policy Renewal Inspection")
        ),
        React.createElement("div",{style:S.userChip,onClick:signOut},
          gmailUser&&gmailUser.picture
            ? React.createElement("img",{src:gmailUser.picture,alt:"",style:S.avatar})
            : React.createElement("div",{style:S.avatarFb},gmailUser&&gmailUser.name?gmailUser.name[0]:"?"),
          React.createElement("span",{style:S.uname},gmailUser&&gmailUser.name?gmailUser.name.split(" ")[0]:"")
        )
      ),
      React.createElement("div",{style:S.fromBadge},
        "Sending from: "+(gmailUser?gmailUser.email:""),
        gps&&React.createElement("span",{style:{color:"#86efac",marginLeft:8}},"📍 GPS Active")
      )
    ),

    React.createElement("div",{style:S.body},

      // Vehicle Details
      React.createElement("div",{style:S.card},
        React.createElement("div",{style:S.cardTitle},"Vehicle Details"),
        React.createElement("div",{style:{marginBottom:14}},
          React.createElement("label",{style:S.label},"Registration Number *"),
          React.createElement("input",{style:S.input,placeholder:"e.g. MH02AB1234",value:vehicle.reg,
            onChange:function(e){setVehicle(function(v){return Object.assign({},v,{reg:e.target.value.toUpperCase()});});}})
        ),
        React.createElement("div",{style:S.twoCol},
          React.createElement("div",{style:{flex:1}},
            React.createElement("label",{style:S.label},"Make & Model"),
            React.createElement("input",{style:S.input,placeholder:"e.g. Maruti Swift",value:vehicle.make,
              onChange:function(e){setVehicle(function(v){return Object.assign({},v,{make:e.target.value});});}})
          ),
          React.createElement("div",{style:{flex:1}},
            React.createElement("label",{style:S.label},"Owner Name"),
            React.createElement("input",{style:S.input,placeholder:"Full name",value:vehicle.owner,
              onChange:function(e){setVehicle(function(v){return Object.assign({},v,{owner:e.target.value});});}})
          )
        ),
        React.createElement("div",null,
          React.createElement("label",{style:S.label},"Expired Policy Number"),
          React.createElement("input",{style:S.input,placeholder:"e.g. POL/2023/00123",value:vehicle.policy,
            onChange:function(e){setVehicle(function(v){return Object.assign({},v,{policy:e.target.value});});}})
        )
      ),

      // Recipient Email
      React.createElement("div",{style:S.card},
        React.createElement("div",{style:S.cardTitle},"Send Report To"),
        React.createElement("div",null,
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}},
            React.createElement("label",{style:Object.assign({},S.label,{marginBottom:0})},"Recipient Email *"),
            toEmail&&React.createElement("span",{style:{fontSize:10,color:"#22c55e",fontWeight:700}},"✓ Saved")
          ),
          React.createElement("input",{style:S.input,type:"email",placeholder:"underwriter@insuranceco.com",value:toEmail,
            onChange:function(e){setToEmail(e.target.value);localStorage.setItem("ui_recipient",e.target.value);}}),
          React.createElement("p",{style:{fontSize:11,color:"#94a3b8",marginTop:4}},"Saved on this device automatically")
        )
      ),

      // Capture Photos
      React.createElement("div",{style:S.card},
        React.createElement("div",{style:S.cardTitle},"Capture Photos"),
        React.createElement("p",{style:S.hint},"Each photo is stamped with label, timestamp and GPS automatically."),
        React.createElement("div",{style:S.photoGrid},
          PHOTO_SLOTS.map(function(slot){
            var cap=photos[slot.id];
            return React.createElement("div",{key:slot.id,style:Object.assign({},S.photoCard,cap?S.photoCardDone:{})},
              React.createElement("input",{type:"file",accept:"image/*",capture:"environment",style:{display:"none"},
                ref:function(el){fileRefs.current[slot.id]=el;},
                onChange:function(e){capturePhoto(slot.id,e.target.files[0]);}}),
              cap
                ? React.createElement(React.Fragment,null,
                    React.createElement("img",{src:cap.url,alt:slot.label,style:S.photoImg}),
                    React.createElement("div",{style:S.photoBar},
                      React.createElement("span",{style:S.photoBarLbl},slot.icon+" "+slot.label),
                      React.createElement("span",{style:{fontSize:9,color:cap.gps?"#22c55e":"#94a3b8"}},cap.gps?"📍":"—"),
                      React.createElement("button",{style:S.retakeBtn,onClick:function(){
                        setPhotos(function(p){var n=Object.assign({},p);delete n[slot.id];return n;});
                      }},"Retake")
                    )
                  )
                : React.createElement("div",{style:S.photoEmpty,onClick:function(){fileRefs.current[slot.id]&&fileRefs.current[slot.id].click();}},
                    React.createElement("span",{style:{fontSize:28}},slot.icon),
                    React.createElement("span",{style:S.slotLbl},slot.label),
                    !slot.required&&React.createElement("span",{style:S.optTag},"Optional"),
                    React.createElement("span",{style:S.slotHint},slot.hint),
                    React.createElement("div",{style:S.capBtn},"📷 Capture")
                  )
            );
          })
        ),
        React.createElement("div",{style:S.dots},
          PHOTO_SLOTS.filter(function(s){return s.required;}).map(function(s){
            return React.createElement("div",{key:s.id,style:Object.assign({},S.dot,photos[s.id]?S.dotDone:{})},photos[s.id]?"✓":"");
          }),
          React.createElement("span",{style:S.dotLbl},
            PHOTO_SLOTS.filter(function(s){return s.required&&photos[s.id];}).length+
            " / "+PHOTO_SLOTS.filter(function(s){return s.required;}).length+" captured"
          )
        )
      ),

      // Security summary
      requiredDone&&React.createElement("div",{style:S.securityCard},
        React.createElement("div",{style:{fontSize:12,fontWeight:700,color:"#92400e",marginBottom:8}},"🔐 Security Layers Active"),
        React.createElement("div",{style:S.secRow},React.createElement("span",{style:S.secTick},"✓"),React.createElement("span",null,"Inspector Gmail: "+(gmailUser?gmailUser.email:""))),
        React.createElement("div",{style:S.secRow},React.createElement("span",{style:S.secTick},"✓"),React.createElement("span",null,"Unique Report ID will be generated")),
        React.createElement("div",{style:S.secRow},React.createElement("span",{style:gps?S.secTick:S.secWarn},gps?"✓":"!"),React.createElement("span",null,"GPS: "+(gps?(gps.lat+", "+gps.lng):"Will be captured on submit"))),
        React.createElement("div",{style:S.secRow},React.createElement("span",{style:S.secTick},"✓"),React.createElement("span",null,"SHA-256 photo hash will be computed"))
      ),

      error&&React.createElement("div",{style:S.errorBox},error),

      React.createElement("button",{
        style:Object.assign({},S.genBtn,!canSubmit?S.genBtnOff:{}),
        disabled:!canSubmit,
        onClick:handleSubmit
      },"🔐 Send Secure Inspection Report"),

      !canSubmit&&React.createElement("p",{style:S.incomplete},
        (!vehicle.reg.trim()?"Enter registration · ":"")+
        (!requiredDone?"Capture all 5 photos · ":"")+
        (!toEmail.includes("@")?"Enter recipient email · ":"")+
        (!accessToken?"Sign in to continue":"")
      )
    )
  );
}

function GoogleIcon(){
  return React.createElement("svg",{width:18,height:18,viewBox:"0 0 48 48",style:{flexShrink:0}},
    React.createElement("path",{fill:"#EA4335",d:"M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"}),
    React.createElement("path",{fill:"#4285F4",d:"M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"}),
    React.createElement("path",{fill:"#FBBC05",d:"M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"}),
    React.createElement("path",{fill:"#34A853",d:"M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"})
  );
}

var S={
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
  tags        :{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap",marginBottom:14},
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
  fromBadge   :{fontSize:11,color:"#475569",marginTop:8,display:"flex",gap:8,flexWrap:"wrap"},
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
  secWarn     :{color:"#f59e0b",fontWeight:700,flexShrink:0},
  errorBox    :{background:"#fef2f2",border:"1px solid #fecaca",color:"#dc2626",borderRadius:8,padding:"10px 14px",fontSize:13,marginTop:12},
  genBtn      :{width:"100%",background:"#0f172a",color:"#fff",border:"none",borderRadius:12,padding:"16px",fontSize:15,fontWeight:700,cursor:"pointer",marginTop:16},
  genBtnOff   :{opacity:0.35,cursor:"not-allowed"},
  incomplete  :{fontSize:12,color:"#94a3b8",textAlign:"center",marginTop:8,lineHeight:1.6},
};

ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App,null));
