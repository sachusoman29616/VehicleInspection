const { useState, useRef, useCallback, useEffect } = React;

const CLIENT_ID      = "168804904830-5jf5intu3blp96u5sr5oro78jufrrjs8.apps.googleusercontent.com";
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzphBEqR6ibSCVo6dc70N7h5Cj2jrh_Cay2TkaT8x0XAX5wzcxoaYP3AmgMzgmN0mhgQA/exec"; // Paste your deployed Apps Script URL here

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
  var dt   = d.getFullYear().toString()+String(d.getMonth()+1).padStart(2,"0")+String(d.getDate()).padStart(2,"0");
  var rand = Math.random().toString(36).substring(2,6).toUpperCase();
  return "UI-"+dt+"-"+(reg||"XX").replace(/\s/g,"")+"-"+rand;
}

function getDeviceFingerprint() {
  try {
    return btoa([
      navigator.userAgent,
      screen.width+"x"+screen.height,
      navigator.language,
      new Date().getTimezoneOffset()
    ].join("|")).substring(0,20);
  } catch(e) { return "UNKNOWN"; }
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
      { timeout:10000, enableHighAccuracy:true }
    );
  });
}

async function getPlaceName(lat, lng) {
  try {
    var url  = "https://nominatim.openstreetmap.org/reverse?format=json&lat="+lat+"&lon="+lng+"&zoom=14&addressdetails=1";
    var resp = await fetch(url, { headers: { "Accept-Language": "en" } });
    var data = await resp.json();
    if (data && data.address) {
      var a = data.address;
      var parts = [];
      if (a.suburb||a.neighbourhood||a.village) parts.push(a.suburb||a.neighbourhood||a.village);
      if (a.city||a.town||a.county) parts.push(a.city||a.town||a.county);
      if (a.state) parts.push(a.state);
      return parts.join(", ") || data.display_name.split(",").slice(0,3).join(",");
    }
    return null;
  } catch(e) { return null; }
}

async function validateOfficeCode(code) {
  try {
    var url  = APPS_SCRIPT_URL+"?action=validateOffice&code="+encodeURIComponent(code);
    var resp = await fetch(url);
    var data = await resp.json();
    return data;
  } catch(e) {
    return { success: false, error: "Cannot connect to server. Check internet connection." };
  }
}

async function submitToSheets(payload) {
  try {
    payload.action = "submitReport";
    await fetch(APPS_SCRIPT_URL, {
      method  : "POST",
      body    : JSON.stringify(payload),
    });
  } catch(e) { /* non-fatal */ }
}

function stampImage(dataUrl, label, timestamp, gps, placeName) {
  return new Promise(function(res) {
    var img = new Image();
    img.onload = function() {
      var c   = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      var ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      var fh  = Math.max(14, Math.round(img.height * 0.028));
      var pad = 10;
      var locationLine = placeName ? placeName : (gps ? ("GPS: "+gps.lat+", "+gps.lng) : "GPS: Unavailable");
      var lines = [label.toUpperCase(), timestamp, locationLine];
      ctx.font = "bold "+fh+"px monospace";
      var maxW = 0;
      lines.forEach(function(l){ var w=ctx.measureText(l).width; if(w>maxW) maxW=w; });
      var boxW = maxW+pad*2;
      var boxH = fh*lines.length+pad*(lines.length+1);
      var bx   = pad;
      var by   = img.height-boxH-pad;
      ctx.fillStyle = "rgba(0,0,0,0.72)";
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
  maxW = maxW||1100;
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

function generateQRDataURL(text) {
  try {
    if (window.qrcode) {
      var qr = window.qrcode(0,"L");
      qr.addData(text.substring(0,200));
      qr.make();
      var moduleCount = qr.getModuleCount();
      var cellSize    = 5;
      var size        = moduleCount*cellSize;
      var canvas      = document.createElement("canvas");
      canvas.width    = size; canvas.height = size;
      var ctx         = canvas.getContext("2d");
      ctx.fillStyle   = "#ffffff"; ctx.fillRect(0,0,size,size);
      ctx.fillStyle   = "#000000";
      for (var row=0; row<moduleCount; row++) {
        for (var col=0; col<moduleCount; col++) {
          if (qr.isDark(row,col)) ctx.fillRect(col*cellSize,row*cellSize,cellSize,cellSize);
        }
      }
      return canvas.toDataURL("image/png");
    }
    return null;
  } catch(e) { return null; }
}

async function generateQR(text) {
  var local = generateQRDataURL(text);
  if (local) return local;
  try {
    var url  = "https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl="+encodeURIComponent(text.substring(0,200))+"&choe=UTF-8";
    var resp = await fetch(url);
    var blob = await resp.blob();
    return await new Promise(function(resolve) {
      var reader = new FileReader();
      reader.onload = function(e) { resolve(e.target.result); };
      reader.readAsDataURL(blob);
    });
  } catch(e) { return null; }
}

async function buildPDF(opts) {
  var vehicle=opts.vehicle, photos=opts.photos, inspectorName=opts.inspectorName;
  var inspectorEmail=opts.inspectorEmail, generatedAt=opts.generatedAt;
  var reportId=opts.reportId, gps=opts.gps, placeName=opts.placeName;
  var qrDataUrl=opts.qrDataUrl, officeName=opts.officeName;

  var jsPDF = window.jspdf.jsPDF;
  var doc   = new jsPDF({orientation:"portrait",unit:"mm",format:"a4"});
  var W=210, H=297, margin=14;

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

  // Report ID + Office banner
  doc.setFillColor(29,78,216); doc.rect(0,52,W,14,"F");
  doc.setFontSize(8); doc.setFont("helvetica","bold"); doc.setTextColor(255,255,255);
  doc.text("REPORT ID: "+reportId, margin, 60);
  doc.setFontSize(7); doc.setFont("helvetica","normal"); doc.setTextColor(191,219,254);
  doc.text("Office: "+officeName, margin, 64);

  // QR code
  if (qrDataUrl) {
    try { doc.addImage(qrDataUrl,"PNG",W-margin-30,55,26,26); } catch(e){}
    doc.setFontSize(6); doc.setFont("helvetica","normal"); doc.setTextColor(191,219,254);
    doc.text("Scan to verify",W-margin-28,83);
  }

  // Vehicle details
  var bx=margin,by=74,bw=W-margin*2-(qrDataUrl?30:0),bh=56;
  doc.setFillColor(248,250,252); doc.roundedRect(bx,by,bw,bh,4,4,"F");
  doc.setDrawColor(226,232,240); doc.roundedRect(bx,by,bw,bh,4,4,"S");
  doc.setFontSize(7); doc.setFont("helvetica","bold"); doc.setTextColor(100,116,139);
  doc.text("VEHICLE DETAILS",bx+6,by+9);
  [["Registration",vehicle.reg||"—"],["Make & Model",vehicle.make||"—"],["Owner",vehicle.owner||"—"],["Expired Policy",vehicle.policy||"—"]].forEach(function(pair,i){
    var fy=by+18+i*11;
    doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setTextColor(71,85,105);
    doc.text(pair[0],bx+6,fy);
    doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(15,23,42);
    doc.text(pair[1],bx+50,fy);
  });

  // Inspector
  var iy=by+bh+6;
  doc.setFillColor(239,246,255); doc.roundedRect(margin,iy,W-margin*2,24,4,4,"F");
  doc.setFontSize(7); doc.setFont("helvetica","bold"); doc.setTextColor(100,116,139);
  doc.text("INSPECTOR",margin+6,iy+8);
  doc.setFontSize(9); doc.setFont("helvetica","bold"); doc.setTextColor(15,23,42);
  doc.text(inspectorName,margin+6,iy+14);
  doc.setFontSize(8); doc.setFont("helvetica","normal"); doc.setTextColor(100,116,139);
  doc.text(inspectorEmail,margin+6,iy+20);

  // GPS Location
  var ly=iy+24;
  doc.setFillColor(240,253,244); doc.roundedRect(margin,ly,W-margin*2,18,4,4,"F");
  doc.setDrawColor(134,239,172); doc.roundedRect(margin,ly,W-margin*2,18,4,4,"S");
  doc.setFontSize(7); doc.setFont("helvetica","bold"); doc.setTextColor(21,128,61);
  doc.text("GPS LOCATION",margin+6,ly+7);
  doc.setFontSize(9); doc.setFont("helvetica","bold"); doc.setTextColor(15,23,42);
  doc.text(placeName||"Not available",margin+6,ly+14);
  if(gps){
    doc.setFontSize(7); doc.setFont("helvetica","normal"); doc.setTextColor(100,116,139);
    // put coordinates on same line after place name
    var placeW = doc.getTextWidth(placeName||"Not available");
    doc.text("("+gps.lat+", "+gps.lng+" +/-"+gps.accuracy+"m)",margin+8+placeW,ly+14);
  }

  // Photo summary
  var ty=ly+24;
  doc.setFontSize(7); doc.setFont("helvetica","bold"); doc.setTextColor(100,116,139);
  doc.text("PHOTOS CAPTURED",margin+6,ty);
  PHOTO_SLOTS.forEach(function(slot,i){
    var captured=photos[slot.id]; var ry=ty+7+i*9;
    doc.setFillColor(captured?240:254,captured?253:242,captured?244:242);
    doc.roundedRect(margin,ry,W-margin*2,8,2,2,"F");
    doc.setFontSize(8); doc.setFont("helvetica","bold");
    doc.setTextColor(captured?21:185,captured?128:28,captured?61:26);
    doc.text(captured?"✓":"—",margin+5,ry+5.5);
    doc.setFont("helvetica","normal"); doc.setTextColor(51,65,85);
    doc.text(slot.label,margin+12,ry+5.5);
    doc.setTextColor(100,116,139); doc.setFontSize(7);
    doc.text(captured?formatTs(photos[slot.id].ts):"Not captured",margin+56,ry+5.5);
    if(captured&&photos[slot.id].placeName){
      doc.setTextColor(21,128,61);
      doc.text(photos[slot.id].placeName,margin+110,ry+5.5);
    }
  });

  // Footer
  doc.setFillColor(15,23,42); doc.rect(0,H-12,W,12,"F");
  doc.setFontSize(7); doc.setFont("helvetica","normal"); doc.setTextColor(100,116,139);
  doc.text("UniInspect | "+reportId+" | "+officeName, margin, H-4.5);
  doc.text("Page 1", W-margin-8, H-4.5);

  // Photo pages
  var capturedSlots=PHOTO_SLOTS.filter(function(s){return photos[s.id];});
  for(var i=0;i<capturedSlots.length;i++){
    var slot=capturedSlots[i]; var ph=photos[slot.id];
    doc.addPage();
    doc.setFillColor(15,23,42); doc.rect(0,0,W,22,"F");
    doc.setFontSize(11); doc.setFont("helvetica","bold"); doc.setTextColor(241,245,249);
    doc.text(slot.label.toUpperCase(),margin,14);
    doc.setFontSize(7); doc.setFont("helvetica","normal"); doc.setTextColor(100,116,139);
    doc.text(reportId,W-margin-doc.getTextWidth(reportId),14);
    var px=margin,py=28,pw=W-margin*2;
    await new Promise(function(resolve){
      var tmp=new Image();
      tmp.onload=function(){
        var ar=tmp.height/tmp.width;
        var ph_h=Math.min(pw*ar,H-py-40);
        try{doc.addImage(ph.url,"JPEG",px,py,pw,ph_h);}catch(e){}
        var sy=py+ph_h+4;
        doc.setFillColor(248,250,252); doc.roundedRect(px,sy,pw,24,3,3,"F");
        doc.setDrawColor(226,232,240); doc.roundedRect(px,sy,pw,24,3,3,"S");
        doc.setFontSize(7); doc.setFont("helvetica","bold"); doc.setTextColor(100,116,139);
        doc.text("CAPTURED AT",px+5,sy+7);
        doc.setFontSize(9); doc.setFont("helvetica","bold"); doc.setTextColor(15,23,42);
        doc.text(formatTs(ph.ts),px+5,sy+14);
        doc.setFontSize(7); doc.setFont("helvetica","bold"); doc.setTextColor(21,128,61);
        doc.text("LOCATION:",px+5,sy+21);
        doc.setFont("helvetica","normal"); doc.setTextColor(15,23,42);
        var locText=ph.placeName||(ph.gps?(ph.gps.lat+", "+ph.gps.lng):"Not available");
        doc.text(locText,px+24,sy+21);
        if(qrDataUrl){try{doc.addImage(qrDataUrl,"PNG",W-margin-18,sy+2,16,16);}catch(e){}}
        doc.setFontSize(7); doc.setFont("helvetica","normal"); doc.setTextColor(100,116,139);
        doc.text("Photo "+(i+1)+" of "+capturedSlots.length,W-margin-20,sy+14);
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

function buildMimeEmail(opts){
  var boundary="bnd_ui_"+Date.now();
  var lines=[
    "From: "+opts.from,"To: "+opts.to,"Subject: "+opts.subject,
    "MIME-Version: 1.0","Content-Type: multipart/mixed; boundary=\""+boundary+"\"","",
    "--"+boundary,"Content-Type: text/plain; charset=\"UTF-8\"","",opts.bodyText,"",
    "--"+boundary,"Content-Type: application/pdf",
    "Content-Transfer-Encoding: base64",
    "Content-Disposition: attachment; filename=\""+opts.pdfFilename+"\"","",
  ];
  for(var i=0;i<opts.pdfBase64.length;i+=76) lines.push(opts.pdfBase64.slice(i,i+76));
  lines.push("","--"+boundary+"--");
  return btoa(unescape(encodeURIComponent(lines.join("\r\n"))))
    .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}

var SCREEN={CONNECT:"connect",OFFICE:"office",INSPECT:"inspect",SENDING:"sending",DONE:"done"};

function App(){
  var userInit=null;
  try{ userInit=JSON.parse(localStorage.getItem("ui_user")||"null"); }catch(e){}
  var officeInit=null;
  try{ officeInit=JSON.parse(localStorage.getItem("ui_office")||"null"); }catch(e){}

  var us=useState(userInit?SCREEN.INSPECT:SCREEN.CONNECT);
  var screen=us[0], setScreen=us[1];

  var ug=useState(userInit);           var gmailUser=ug[0],    setGmailUser=ug[1];
  var uat=useState(null);              var accessToken=uat[0], setAccessToken=uat[1];
  var uof=useState(officeInit);        var office=uof[0],      setOffice=uof[1];
  var uoc=useState("");                var officeCode=uoc[0],  setOfficeCode=uoc[1];
  var uv=useState({reg:"",make:"",owner:"",policy:""}); var vehicle=uv[0],setVehicle=uv[1];
  var uph=useState({});                var photos=uph[0],      setPhotos=uph[1];
  var ugp=useState(null);              var gps=ugp[0],         setGps=ugp[1];
  var upl=useState(null);              var placeName=upl[0],   setPlaceName=upl[1];
  var uer=useState("");                var error=uer[0],       setError=uer[1];
  var uss=useState("");                var sendStatus=uss[0],  setSendStatus=uss[1];
  var ulr=useState("");                var lastReportId=ulr[0],setLastReportId=ulr[1];
  var uov=useState(false);             var validating=uov[0],  setValidating=uov[1];
  var fileRefs=useRef({});
  var videoRef=useRef(null);
  var streamRef=useRef(null);
  var ucs=useState(null);  var activeSlot=ucs[0],  setActiveSlot=ucs[1];
  var ucf=useState("environment"); var camFacing=ucf[0], setCamFacing=ucf[1];
  var ucp=useState(false); var camOpen=ucp[0],   setCamOpen=ucp[1];

  useEffect(function(){
    if(!window.google){
      var s=document.createElement("script");
      s.src="https://accounts.google.com/gsi/client";
      s.async=true; s.defer=true;
      document.head.appendChild(s);
    }
  },[]);

  async function handleValidateOffice(){
    if(!officeCode.trim()){ setError("Please enter your office code."); return; }
    setValidating(true); setError("");
    var result = await validateOfficeCode(officeCode.trim().toUpperCase());
    setValidating(false);
    if(result.success){
      var officeData={ code:result.officeCode, name:result.officeName, email:result.email };
      setOffice(officeData);
      localStorage.setItem("ui_office",JSON.stringify(officeData));
      setScreen(SCREEN.INSPECT);
    } else {
      setError(result.error||"Please contact your Parent office for office code mapping.");
    }
  }

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
          // Check if office code already saved
          var savedOffice=null;
          try{savedOffice=JSON.parse(localStorage.getItem("ui_office")||"null");}catch(e2){}
          if(savedOffice) setOffice(savedOffice);
          setScreen(SCREEN.INSPECT);
        }catch(e){ setError("Could not fetch profile."); }
      },
    });
    tc.requestAccessToken();
  }

  // Refresh token silently if needed
  function refreshToken() {
    return new Promise(function(resolve) {
      if (!window.google) { resolve(false); return; }
      try {
        var tc = window.google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: "https://www.googleapis.com/auth/gmail.send email profile",
          prompt: "", // silent refresh - no popup
          callback: function(resp) {
            if (resp.error) { resolve(false); return; }
            setAccessToken(resp.access_token);
            resolve(true);
          },
        });
        tc.requestAccessToken();
      } catch(e) { resolve(false); }
    });
  }

  function signOut(){
    if(!window.confirm("Sign out?")) return;
    setGmailUser(null); setAccessToken(null);
    localStorage.removeItem("ui_user");
    setScreen(SCREEN.CONNECT);
  }

  // Open in-app camera
  async function openCamera(slotId) {
    setActiveSlot(slotId);
    setCamOpen(true);
    await startCamera("environment");
  }

  async function startCamera(facing) {
    // Stop existing stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(function(t){ t.stop(); });
    }
    try {
      var constraints = {
        video: {
          facingMode: { ideal: facing },
          width:  { ideal: 1920 },
          height: { ideal: 1080 }
        }
      };
      var stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCamFacing(facing);
    } catch(e) {
      // Fallback to any camera
      try {
        var stream2 = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = stream2;
        if (videoRef.current) {
          videoRef.current.srcObject = stream2;
          videoRef.current.play();
        }
      } catch(e2) {
        alert("Camera not available. Please allow camera access.");
        setCamOpen(false);
      }
    }
  }

  function switchCamera() {
    var newFacing = camFacing === "environment" ? "user" : "environment";
    startCamera(newFacing);
  }

  function closeCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(function(t){ t.stop(); });
      streamRef.current = null;
    }
    setCamOpen(false);
    setActiveSlot(null);
  }

  async function captureFromCamera() {
    if (!videoRef.current || !activeSlot) return;
    var video  = videoRef.current;
    var canvas = document.createElement("canvas");
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    var ctx = canvas.getContext("2d");
    // Mirror if front camera
    if (camFacing === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    var dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    closeCamera();
    // Process photo
    var slot = PHOTO_SLOTS.find(function(s){ return s.id === activeSlot; });
    var ts   = new Date();
    setPhotos(function(p){
      var n = Object.assign({},p);
      n[activeSlot] = { url:dataUrl, ts:ts, gps:null, placeName:null, processing:true };
      return n;
    });
    var resized    = await resizeImage(dataUrl);
    var photoGps   = await getGPS();
    var photoPlace = photoGps ? (await getPlaceName(photoGps.lat, photoGps.lng)) : null;
    var stamped    = await stampImage(resized, slot.label, formatTs(ts), photoGps, photoPlace);
    setPhotos(function(p){
      var n = Object.assign({},p);
      n[activeSlot] = { url:stamped, ts:ts, gps:photoGps, placeName:photoPlace, processing:false };
      return n;
    });
    if (photoGps)   setGps(photoGps);
    if (photoPlace) setPlaceName(photoPlace);
  }

  var capturePhoto=useCallback(async function(slotId,file){
    if(!file) return;
    var slot = PHOTO_SLOTS.find(function(s){return s.id===slotId;});
    var ts   = new Date();

    // Show preview immediately without waiting for GPS
    var reader = new FileReader();
    reader.onload = async function(e) {
      // Show unstamped preview first for instant feedback
      setPhotos(function(p){
        var n=Object.assign({},p);
        n[slotId]={url:e.target.result, ts:ts, gps:null, placeName:null, processing:true};
        return n;
      });

      // Process in background
      var resized    = await resizeImage(e.target.result);
      var photoGps   = await getGPS();
      var photoPlace = photoGps ? (await getPlaceName(photoGps.lat, photoGps.lng)) : null;
      var stamped    = await stampImage(resized, slot.label, formatTs(ts), photoGps, photoPlace);

      // Update with stamped version
      setPhotos(function(p){
        var n=Object.assign({},p);
        n[slotId]={url:stamped, ts:ts, gps:photoGps, placeName:photoPlace, processing:false};
        return n;
      });
      if(photoGps)   setGps(photoGps);
      if(photoPlace) setPlaceName(photoPlace);
    };
    reader.readAsDataURL(file);
  },[]);

  var requiredDone=PHOTO_SLOTS.filter(function(s){return s.required;}).every(function(s){return photos[s.id];});
  var canSubmit=requiredDone&&vehicle.reg.trim()&&accessToken&&office&&office.email;

  async function handleSubmit(){
    setScreen(SCREEN.SENDING); setError("");
    try{
      // Refresh token silently first
      if(!accessToken) {
        setSendStatus("Refreshing session...");
        await refreshToken();
      }
      setSendStatus("Getting GPS location...");
      var currentGps  =gps||(await getGPS());
      var currentPlace=placeName||(currentGps?(await getPlaceName(currentGps.lat,currentGps.lng)):null);

      var reportId   =generateReportId(vehicle.reg);
      var generatedAt=formatTs(new Date());
      var deviceFp   =getDeviceFingerprint();

      setSendStatus("Saving to database...");
      await submitToSheets({
        reportId      : reportId,
        submittedAt   : generatedAt,
        inspectorEmail: gmailUser.email,
        inspectorName : gmailUser.name,
        officeCode    : office.code,
        officeName    : office.name,
        recipientEmail: office.email,
        registration  : vehicle.reg,
        makeModel     : vehicle.make||"—",
        owner         : vehicle.owner||"—",
        expiredPolicy : vehicle.policy||"—",
        gpsLat        : currentGps?currentGps.lat:"—",
        gpsLng        : currentGps?currentGps.lng:"—",
        gpsAccuracy   : currentGps?currentGps.accuracy:"—",
        placeName     : currentPlace||"—",
        photosCaptured: PHOTO_SLOTS.filter(function(s){return photos[s.id];}).map(function(s){return s.label;}).join(", "),
        deviceFingerprint: deviceFp,
      });

      setSendStatus("Generating QR code...");
      var qrContent=[
        "UNINSPECT VERIFICATION",
        "Report ID: "+reportId,
        "Inspector: "+gmailUser.email,
        "Office: "+office.name,
        "Submitted: "+generatedAt,
        "Registration: "+vehicle.reg,
        "Location: "+(currentPlace||"—"),
        "GPS: "+(currentGps?(currentGps.lat+", "+currentGps.lng):"—"),
      ].join("\n");
      var qrDataUrl=await generateQR(qrContent);

      setSendStatus("Generating PDF...");
      var doc=await buildPDF({
        vehicle:vehicle, photos:photos,
        inspectorName:gmailUser.name, inspectorEmail:gmailUser.email,
        generatedAt:generatedAt, reportId:reportId,
        gps:currentGps, placeName:currentPlace,
        qrDataUrl:qrDataUrl, officeName:office.name
      });

      setSendStatus("Sending via Gmail...");
      var pdfFilename="UniInspect_"+(vehicle.reg||"inspection").replace(/\s+/g,"_")+"_"+new Date().toISOString().slice(0,10)+".pdf";
      var pdfBase64=doc.output("datauristring").split(",")[1];
      var gpsLine=currentGps?(currentGps.lat+", "+currentGps.lng+" (+-"+currentGps.accuracy+"m)"):"Not available";

      var bodyLines=[
        "UNINSPECT VEHICLE INSPECTION REPORT",
        "Report ID  : "+reportId,
        "Generated  : "+generatedAt,
        "Inspector  : "+gmailUser.name+" <"+gmailUser.email+">",
        "Office     : "+office.name+" ("+office.code+")",
        "Location   : "+(currentPlace||"Not available"),
        "GPS        : "+gpsLine,
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
        bodyLines.push(photos[s.id]
          ?("✓  "+s.label+"  "+formatTs(photos[s.id].ts)+(photos[s.id].placeName?"  [GPS] "+photos[s.id].placeName:""))
          :("—  "+s.label+"  Not captured"));
      });
      bodyLines.push("","NOTE: Verify this report in Google Sheets using Report ID: "+reportId,"","---","Sent via UniInspect");

      var raw=buildMimeEmail({
        from       : gmailUser.name+" <"+gmailUser.email+">",
        to         : office.email,
        subject    : "Vehicle Inspection Report - "+vehicle.reg+" - "+new Date().toLocaleDateString("en-GB"),
        bodyText   : bodyLines.join("\n"),
        pdfBase64  : pdfBase64,
        pdfFilename: pdfFilename
      });

      var resp=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send",{
        method :"POST",
        headers:{Authorization:"Bearer "+accessToken,"Content-Type":"application/json"},
        body   :JSON.stringify({raw:raw})
      });
      if(!resp.ok){
        var errData=await resp.json();
        throw new Error(errData&&errData.error&&errData.error.message?errData.error.message:"Send failed");
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

  // ── OFFICE SCREEN (shown after login if no office saved) ──────
  if(screen===SCREEN.OFFICE) return React.createElement("div",{style:S.page},
    React.createElement("div",{style:S.center},
      React.createElement("div",{style:S.centerCard},
        // User profile strip
        React.createElement("div",{style:S.profileStrip},
          gmailUser&&gmailUser.picture
            ?React.createElement("img",{src:gmailUser.picture,alt:"",style:S.profilePic})
            :React.createElement("div",{style:S.avatarFb},gmailUser&&gmailUser.name?gmailUser.name[0]:"?"),
          React.createElement("div",null,
            React.createElement("div",{style:{fontSize:13,fontWeight:700,color:"#0f172a"}},gmailUser?gmailUser.name:""),
            React.createElement("div",{style:{fontSize:11,color:"#64748b"}},gmailUser?gmailUser.email:"")
          )
        ),
        React.createElement("div",{style:S.divider}),
        React.createElement("div",{style:{fontSize:22,marginBottom:8}},"🏢"),
        React.createElement("h2",{style:{fontSize:18,fontWeight:800,color:"#0f172a",marginBottom:6}},"Enter Office Code"),
        React.createElement("p",{style:{fontSize:12,color:"#64748b",marginBottom:20,lineHeight:1.6}},
          "Get this code from your branch manager. It will be saved automatically."
        ),
        React.createElement("input",{
          style:{
            width:"100%",border:"2px solid #e2e8f0",borderRadius:10,
            padding:"14px",fontSize:20,fontWeight:800,
            letterSpacing:6,textAlign:"center",textTransform:"uppercase",
            color:"#0f172a",background:"#f8fafc",boxSizing:"border-box",outline:"none"
          },
          placeholder:"OFFICE001",
          value:officeCode,
          onChange:function(e){setOfficeCode(e.target.value.toUpperCase()); setError("");},
          onKeyDown:function(e){if(e.key==="Enter") handleValidateOffice();}
        }),
        error&&React.createElement("div",{style:Object.assign({},S.errorBox,{marginTop:12})},error),
        React.createElement("button",{
          style:Object.assign({},S.genBtn,{marginTop:16,opacity:validating?0.6:1}),
          onClick:handleValidateOffice,
          disabled:validating||!officeCode.trim()
        },validating
          ?React.createElement("span",null,"Validating...")
          :"Confirm Office Code"
        ),
        React.createElement("button",{
          style:{background:"transparent",border:"none",color:"#94a3b8",fontSize:12,cursor:"pointer",marginTop:12,textDecoration:"underline"},
          onClick:function(){
            localStorage.removeItem("ui_user");
            setGmailUser(null); setAccessToken(null);
            setScreen(SCREEN.CONNECT);
          }
        },"Sign out")
      )
    )
  );

  // ── CONNECT SCREEN ────────────────────────────────────────────
  if(screen===SCREEN.CONNECT) return React.createElement("div",{style:S.page},
    React.createElement("div",{style:S.center},
      React.createElement("div",{style:S.centerCard},
        React.createElement("div",{style:{fontSize:52,marginBottom:8}},"🛡️"),
        React.createElement("h1",{style:S.bigTitle},"UniInspect"),
        React.createElement("p",{style:S.subTitle},"Sign in to start inspection"),
        React.createElement("div",{style:S.featureBox},
          ["GPS with actual place name on every photo",
           "QR code on PDF for verification",
           "Report saved to office database",
           "Sent directly to office email"].map(function(f){
            return React.createElement("div",{key:f,style:S.featureRow},
              React.createElement("span",{style:S.tick},"✓"),
              React.createElement("span",null,f)
            );
          })
        ),
        error&&React.createElement("div",{style:S.errorBox},error),
        React.createElement("button",{style:S.googleBtn,onClick:signIn},
          React.createElement(GoogleIcon,null)," Sign in with Google"
        ),

      )
    )
  );

  // ── SENDING SCREEN ────────────────────────────────────────────
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

  // ── DONE SCREEN ───────────────────────────────────────────────
  if(screen===SCREEN.DONE) return React.createElement("div",{style:S.page},
    React.createElement("div",{style:S.center},
      React.createElement("div",{style:S.centerCard},
        React.createElement("div",{style:{fontSize:52,marginBottom:10}},"✅"),
        React.createElement("h2",{style:S.bigTitle},"Report Sent!"),
        React.createElement("p",{style:S.subTitle},"Delivered to "+office.name),
        React.createElement("div",{style:S.reportIdBox},
          React.createElement("div",{style:{fontSize:10,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}},"Report ID"),
          React.createElement("div",{style:{fontSize:14,fontWeight:800,color:"#0f172a"}},lastReportId)
        ),
        placeName&&React.createElement("div",{style:S.locationBox},placeName),
        React.createElement("div",{style:S.tags},
          React.createElement("span",{style:S.tag},vehicle.reg),
          React.createElement("span",{style:S.tag},PHOTO_SLOTS.filter(function(s){return photos[s.id];}).length+" photos"),
          React.createElement("span",{style:S.tag},gps?"GPS Active":"No GPS")
        ),
        React.createElement("p",{style:{fontSize:12,color:"#64748b",marginBottom:20}},"PDF downloaded. Report saved to database."),
        React.createElement("button",{style:S.btn,onClick:function(){
          setPhotos({}); setVehicle({reg:"",make:"",owner:"",policy:""});
          setSendStatus(""); setGps(null); setPlaceName(null);
          setLastReportId(""); setScreen(SCREEN.INSPECT);
        }},"Start New Inspection")
      )
    )
  );

  // ── INSPECT SCREEN ────────────────────────────────────────────
  return React.createElement("div",{style:S.page},
    // In-app camera overlay
    camOpen&&React.createElement("div",{style:S.camOverlay},
      React.createElement("div",{style:S.camContainer},
        // Header
        React.createElement("div",{style:S.camHeader},
          React.createElement("button",{style:S.camCloseBtn,onClick:closeCamera},"✕"),
          React.createElement("div",{style:S.camTitle},
            activeSlot&&PHOTO_SLOTS.find(function(s){return s.id===activeSlot;})?
            PHOTO_SLOTS.find(function(s){return s.id===activeSlot;}).label+" Photo":"Camera"
          ),
          React.createElement("button",{style:S.camSwitchBtn,onClick:switchCamera},"🔄")
        ),
        // Video preview
        React.createElement("video",{
          ref:videoRef,
          style:S.camVideo,
          autoPlay:true,
          playsInline:true,
          muted:true
        }),
        // Capture hint
        React.createElement("div",{style:S.camHint},
          camFacing==="user"?"Front camera — tap 🔄 to switch to rear":"Rear camera"
        ),
        // Capture button
        React.createElement("div",{style:S.camCaptureRow},
          React.createElement("button",{style:S.camCaptureBtn,onClick:captureFromCamera},
            React.createElement("div",{style:S.camCaptureInner})
          )
        )
      )
    ),

    React.createElement("div",{style:S.header},
      React.createElement("div",{style:S.headerRow},
        React.createElement("div",null,
          React.createElement("div",{style:S.brand},"🛡️ UniInspect"),
          React.createElement("div",{style:S.brandSub},office?office.name:"")
        ),
        React.createElement("div",{style:S.userChip,onClick:signOut},
          gmailUser&&gmailUser.picture
            ?React.createElement("img",{src:gmailUser.picture,alt:"",style:S.avatar})
            :React.createElement("div",{style:S.avatarFb},gmailUser&&gmailUser.name?gmailUser.name[0]:"?"),
          React.createElement("span",{style:S.uname},gmailUser&&gmailUser.name?gmailUser.name.split(" ")[0]:"")
        )
      ),
      React.createElement("div",{style:S.fromBadge},
        React.createElement("span",null,"Inspector: "+(gmailUser?gmailUser.name:"")),
        placeName&&React.createElement("span",{style:{color:"#86efac"}},placeName)
      )
    ),

    React.createElement("div",{style:S.body},

      // Vehicle Details
      React.createElement("div",{style:S.card},
        React.createElement("div",{style:S.cardTitle},"Vehicle Details"),
        React.createElement("div",{style:{marginBottom:14}},
          React.createElement("label",{style:S.label},"Registration Number *"),
          React.createElement("input",{style:S.input,placeholder:"e.g. KL03AA0006",value:vehicle.reg,
            onChange:function(e){setVehicle(function(v){return Object.assign({},v,{reg:e.target.value.toUpperCase()});})}})
        ),
        React.createElement("div",{style:S.twoCol},
          React.createElement("div",{style:{flex:1}},
            React.createElement("label",{style:S.label},"Make & Model"),
            React.createElement("input",{style:S.input,placeholder:"e.g. Maruti Swift",value:vehicle.make,
              onChange:function(e){setVehicle(function(v){return Object.assign({},v,{make:e.target.value});})}})
          ),
          React.createElement("div",{style:{flex:1}},
            React.createElement("label",{style:S.label},"Owner Name"),
            React.createElement("input",{style:S.input,placeholder:"Full name",value:vehicle.owner,
              onChange:function(e){setVehicle(function(v){return Object.assign({},v,{owner:e.target.value});})}})
          )
        ),
        React.createElement("div",null,
          React.createElement("label",{style:S.label},"Expired Policy Number"),
          React.createElement("input",{style:S.input,placeholder:"e.g. POL/2023/00123",value:vehicle.policy,
            onChange:function(e){setVehicle(function(v){return Object.assign({},v,{policy:e.target.value});})}})
        )
      ),

      // Office Code card
      React.createElement("div",{style:S.card},
        React.createElement("div",{style:S.cardTitle},"Office Details"),
        office&&office.email
          // Office already validated — show info + change option
          ? React.createElement("div",null,
              React.createElement("div",{style:S.officeValidated},
                React.createElement("div",null,
                  React.createElement("div",{style:{fontSize:13,fontWeight:700,color:"#0f172a"}},"🏢 "+office.name)
                ),
                React.createElement("button",{
                  style:S.changeBtn,
                  onClick:function(){
                    setOffice(null); setOfficeCode("");
                    localStorage.removeItem("ui_office");
                  }
                },"Change")
              )
            )
          // No office yet — show input
          : React.createElement("div",null,
              React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}},
                React.createElement("label",{style:Object.assign({},S.label,{marginBottom:0})},"Office Code *"),
                validating&&React.createElement("span",{style:{fontSize:11,color:"#3b82f6"}},"Validating...")
              ),
              React.createElement("div",{style:{display:"flex",gap:8}},
                React.createElement("input",{
                  style:Object.assign({},S.input,{textTransform:"uppercase",letterSpacing:2,fontWeight:700,flex:1}),
                  placeholder:"e.g. OFFICE001",
                  value:officeCode,
                  onChange:function(e){setOfficeCode(e.target.value.toUpperCase()); setError("");},
                  onKeyDown:function(e){if(e.key==="Enter") handleValidateOffice();}
                }),
                React.createElement("button",{
                  style:{background:"#0f172a",color:"#fff",border:"none",borderRadius:8,padding:"0 16px",fontSize:13,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"},
                  onClick:handleValidateOffice,
                  disabled:validating||!officeCode.trim()
                },"Confirm")
              ),
              error&&React.createElement("div",{style:Object.assign({},S.errorBox,{marginTop:8,fontSize:12})},error),
              React.createElement("p",{style:{fontSize:11,color:"#94a3b8",marginTop:6}},"Saved automatically once confirmed")
            )
      ),

      // Photos
      React.createElement("div",{style:S.card},
        React.createElement("div",{style:S.cardTitle},"Capture Photos"),
        React.createElement("p",{style:S.hint},"Each photo is stamped with label, timestamp and GPS place name automatically."),
        React.createElement("div",{style:S.photoGrid},
          PHOTO_SLOTS.map(function(slot){
            var cap=photos[slot.id];
            return React.createElement("div",{key:slot.id,style:Object.assign({},S.photoCard,cap?S.photoCardDone:{})},
              React.createElement("input",{type:"file",accept:"image/*",capture:"environment",style:{display:"none"},
                ref:function(el){fileRefs.current[slot.id]=el;},
                onChange:function(e){capturePhoto(slot.id,e.target.files[0]);}}),
              cap
                ?React.createElement(React.Fragment,null,
                    React.createElement("img",{src:cap.url,alt:slot.label,style:Object.assign({},S.photoImg,cap.processing?{opacity:0.6}:{})}),
              cap.processing&&React.createElement("div",{style:S.processingBadge},"Processing..."),
                    React.createElement("div",{style:S.photoBar},
                      React.createElement("span",{style:S.photoBarLbl},slot.icon+" "+slot.label),
                      cap.placeName&&React.createElement("span",{style:{fontSize:9,color:"#22c55e"}},"GPS"),
                      React.createElement("button",{style:S.retakeBtn,
                        onClick:function(){setPhotos(function(p){var n=Object.assign({},p);delete n[slot.id];return n;});}
                      },"Retake")
                    )
                  )
                :React.createElement("div",{style:S.photoEmpty,onClick:function(){fileRefs.current[slot.id]&&fileRefs.current[slot.id].click();}},
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
        React.createElement("div",{style:{fontSize:12,fontWeight:700,color:"#92400e",marginBottom:10}},"Security Layers Active"),
        [
          ["✓","Inspector: "+(gmailUser?gmailUser.email:""),true],
          [office&&office.email?"✓":"!","Office: "+(office?office.name:"Not set — enter office code above"),!!(office&&office.email)],
          ["✓","Unique Report ID will be generated",true],
          [gps?"✓":"!","GPS: "+(placeName||"Will capture on submit"),!!gps],
          ["✓","QR code on every PDF page",true],
          ["✓","Saved to office database on submit",true],
        ].map(function(row,i){
          return React.createElement("div",{key:i,style:S.secRow},
            React.createElement("span",{style:row[2]?S.secTick:S.secWarn},row[0]),
            React.createElement("span",null,row[1])
          );
        })
      ),

      error&&React.createElement("div",{style:S.errorBox},error),
      sendStatus&&React.createElement("div",{style:S.statusBox},sendStatus),

      React.createElement("button",{
        style  :Object.assign({},S.genBtn,!canSubmit?S.genBtnOff:{}),
        disabled:!canSubmit,
        onClick:handleSubmit
      },"Send Secure Inspection Report"),

      !canSubmit&&React.createElement("p",{style:S.incomplete},
        (!vehicle.reg.trim()?"Enter registration · ":"")+
        (!requiredDone?"Capture all 5 photos · ":"")+
        (!accessToken?"Sign in to continue":"")
      )
    )
  );
}

function GoogleIcon(){
  return React.createElement("svg",{width:18,height:18,viewBox:"0 0 48 48",style:{flexShrink:0,marginRight:4}},
    React.createElement("path",{fill:"#EA4335",d:"M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"}),
    React.createElement("path",{fill:"#4285F4",d:"M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"}),
    React.createElement("path",{fill:"#FBBC05",d:"M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"}),
    React.createElement("path",{fill:"#34A853",d:"M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"})
  );
}

var S={
  profileStrip  :{display:"flex",alignItems:"center",gap:12,background:"#f8fafc",borderRadius:12,padding:"12px 14px",marginBottom:16,textAlign:"left"},
  profilePic    :{width:40,height:40,borderRadius:"50%",objectFit:"cover"},
  divider       :{height:1,background:"#f1f5f9",margin:"0 0 20px"},
  camOverlay    :{position:"fixed",inset:0,background:"#000",zIndex:200,display:"flex",flexDirection:"column"},
  camContainer  :{display:"flex",flexDirection:"column",height:"100vh",width:"100%"},
  camHeader     :{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",background:"rgba(0,0,0,0.8)",position:"absolute",top:0,left:0,right:0,zIndex:10},
  camCloseBtn   :{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",width:36,height:36,borderRadius:"50%",fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"},
  camTitle      :{fontSize:16,fontWeight:700,color:"#fff"},
  camSwitchBtn  :{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",width:36,height:36,borderRadius:"50%",fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"},
  camVideo      :{width:"100%",height:"100%",objectFit:"cover",flex:1},
  camHint       :{position:"absolute",top:72,left:0,right:0,textAlign:"center",fontSize:12,color:"rgba(255,255,255,0.7)",padding:"6px"},
  camCaptureRow :{position:"absolute",bottom:40,left:0,right:0,display:"flex",justifyContent:"center",alignItems:"center"},
  camCaptureBtn :{width:72,height:72,borderRadius:"50%",background:"rgba(255,255,255,0.3)",border:"4px solid #fff",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"},
  camCaptureInner:{width:54,height:54,borderRadius:"50%",background:"#fff"},
  page          :{minHeight:"100vh",background:"#f1f5f9",fontFamily:"'Inter','Segoe UI',sans-serif",paddingBottom:48},
  center        :{display:"flex",justifyContent:"center",alignItems:"center",minHeight:"100vh",padding:"24px 16px"},
  centerCard    :{background:"#fff",borderRadius:20,padding:"36px 26px",maxWidth:400,width:"100%",textAlign:"center",boxShadow:"0 4px 32px rgba(0,0,0,0.10)"},
  bigTitle      :{fontSize:26,fontWeight:800,color:"#0f172a",margin:"0 0 6px",letterSpacing:"-0.5px"},
  subTitle      :{fontSize:13,color:"#64748b",margin:"0 0 22px"},
  officeBadge   :{background:"#eff6ff",color:"#1d4ed8",fontSize:13,fontWeight:700,padding:"6px 14px",borderRadius:20,display:"inline-block",marginBottom:16},
  officeBox     :{background:"#f8fafc",borderRadius:14,padding:"20px 16px",marginBottom:8,textAlign:"left"},
  officeTitle   :{fontSize:15,fontWeight:800,color:"#0f172a",marginBottom:6},
  officeHint    :{fontSize:12,color:"#64748b",marginBottom:14,lineHeight:1.6},
  featureBox    :{background:"#f8fafc",borderRadius:12,padding:"14px 16px",marginBottom:24,textAlign:"left"},
  featureRow    :{display:"flex",gap:8,fontSize:13,color:"#334155",marginBottom:8,alignItems:"flex-start"},
  tick          :{color:"#22c55e",fontWeight:700,flexShrink:0},
  googleBtn     :{display:"flex",alignItems:"center",justifyContent:"center",gap:8,width:"100%",background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"13px 20px",fontSize:14,fontWeight:600,color:"#0f172a",cursor:"pointer",boxShadow:"0 1px 3px rgba(0,0,0,0.08)"},
  changeOfficeBtn:{background:"transparent",border:"none",color:"#94a3b8",fontSize:12,cursor:"pointer",marginTop:12,textDecoration:"underline"},
  loaderWrap    :{height:6,background:"#f1f5f9",borderRadius:6,overflow:"hidden",margin:"20px 0 0"},
  loaderBar     :{height:"100%",background:"linear-gradient(90deg,#3b82f6,#06b6d4)",borderRadius:6,animation:"load 1.4s ease-in-out infinite"},
  doneEmail     :{fontSize:15,fontWeight:700,color:"#1d4ed8",margin:"4px 0 14px"},
  reportIdBox   :{background:"#f0fdf4",border:"1.5px solid #bbf7d0",borderRadius:10,padding:"12px 16px",marginBottom:12,textAlign:"center"},
  locationBox   :{background:"#f0fdf4",borderRadius:10,padding:"8px 14px",marginBottom:14,fontSize:13,color:"#15803d",fontWeight:600},
  tags          :{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap",marginBottom:14},
  tag           :{background:"#f1f5f9",color:"#334155",fontSize:12,fontWeight:600,padding:"4px 12px",borderRadius:20},
  btn           :{background:"#0f172a",color:"#fff",border:"none",borderRadius:10,padding:"13px 28px",fontSize:14,fontWeight:700,cursor:"pointer"},
  header        :{background:"#0f172a",padding:"16px 18px 12px"},
  headerRow     :{display:"flex",justifyContent:"space-between",alignItems:"center"},
  brand         :{fontSize:19,fontWeight:800,color:"#f1f5f9",letterSpacing:"-0.5px"},
  brandSub      :{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.07em",marginTop:2},
  userChip      :{display:"flex",alignItems:"center",gap:8,background:"#1e293b",borderRadius:20,padding:"5px 12px 5px 6px",cursor:"pointer"},
  avatar        :{width:26,height:26,borderRadius:"50%",objectFit:"cover"},
  avatarFb      :{width:26,height:26,borderRadius:"50%",background:"#3b82f6",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#fff"},
  uname         :{fontSize:12,color:"#e2e8f0",fontWeight:600},
  fromBadge     :{fontSize:11,color:"#475569",marginTop:8,display:"flex",gap:12,flexWrap:"wrap"},
  body          :{maxWidth:480,margin:"0 auto",padding:"0 14px"},
  card          :{background:"#fff",borderRadius:14,padding:"18px 16px",marginTop:14,boxShadow:"0 1px 3px rgba(0,0,0,0.06)"},
  cardTitle     :{fontSize:12,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.08em",borderBottom:"1px solid #f1f5f9",paddingBottom:10,marginBottom:14},
  recipientCard  :{background:"#eff6ff",border:"1.5px solid #bfdbfe",borderRadius:12,padding:"12px 16px",marginTop:14},
  officeValidated:{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#f0fdf4",border:"1.5px solid #bbf7d0",borderRadius:10,padding:"12px 14px"},
  changeBtn      :{background:"transparent",border:"1px solid #cbd5e1",color:"#64748b",borderRadius:8,padding:"4px 10px",fontSize:11,cursor:"pointer",whiteSpace:"nowrap"},
  label         :{display:"block",fontSize:12,fontWeight:600,color:"#475569",marginBottom:5},
  input         :{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"10px 12px",fontSize:14,color:"#0f172a",background:"#f8fafc",boxSizing:"border-box",outline:"none"},
  twoCol        :{display:"flex",gap:10,marginBottom:14},
  hint          :{fontSize:12,color:"#94a3b8",lineHeight:1.6,marginBottom:12},
  photoGrid     :{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10},
  photoCard     :{borderRadius:12,overflow:"hidden",border:"2px dashed #e2e8f0",background:"#f8fafc",minHeight:148,position:"relative"},
  photoCardDone :{border:"2px solid #22c55e"},
  photoImg      :{width:"100%",height:130,objectFit:"cover",display:"block"},
  photoBar      :{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 8px",background:"#f0fdf4"},
  photoBarLbl   :{fontSize:11,fontWeight:700,color:"#15803d"},
  retakeBtn     :{fontSize:10,color:"#64748b",background:"transparent",border:"1px solid #cbd5e1",borderRadius:6,padding:"2px 7px",cursor:"pointer"},
  photoEmpty    :{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,padding:12,minHeight:148,cursor:"pointer"},
  slotLbl       :{fontSize:13,fontWeight:700,color:"#334155"},
  slotHint      :{fontSize:10,color:"#94a3b8",textAlign:"center",lineHeight:1.4},
  optTag        :{fontSize:10,background:"#f1f5f9",color:"#94a3b8",padding:"1px 7px",borderRadius:10,fontWeight:600},
  capBtn        :{marginTop:6,background:"#0f172a",color:"#fff",fontSize:12,fontWeight:700,padding:"7px 14px",borderRadius:8},
  dots          :{display:"flex",alignItems:"center",gap:6,marginTop:14,justifyContent:"center"},
  dot           :{width:28,height:28,borderRadius:"50%",border:"2px solid #e2e8f0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#94a3b8",background:"#fff"},
  dotDone       :{background:"#22c55e",border:"2px solid #22c55e",color:"#fff",fontWeight:700},
  dotLbl        :{fontSize:12,color:"#64748b",fontWeight:600},
  processingBadge:{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",background:"rgba(0,0,0,0.7)",color:"#fff",fontSize:11,padding:"4px 10px",borderRadius:20,pointerEvents:"none"},
  securityCard  :{background:"#fffbeb",border:"1.5px solid #fde68a",borderRadius:12,padding:"14px 16px",marginTop:14},
  secRow        :{display:"flex",gap:8,fontSize:12,color:"#334155",marginBottom:6,alignItems:"flex-start"},
  secTick       :{color:"#22c55e",fontWeight:700,flexShrink:0},
  secWarn       :{color:"#f59e0b",fontWeight:700,flexShrink:0},
  statusBox     :{background:"#eff6ff",border:"1px solid #bfdbfe",color:"#1d4ed8",borderRadius:8,padding:"10px 14px",fontSize:13,marginTop:12,textAlign:"center"},
  errorBox      :{background:"#fef2f2",border:"1px solid #fecaca",color:"#dc2626",borderRadius:8,padding:"10px 14px",fontSize:13,marginTop:12},
  genBtn        :{width:"100%",background:"#0f172a",color:"#fff",border:"none",borderRadius:12,padding:"16px",fontSize:15,fontWeight:700,cursor:"pointer",marginTop:16},
  genBtnOff     :{opacity:0.35,cursor:"not-allowed"},
  incomplete    :{fontSize:12,color:"#94a3b8",textAlign:"center",marginTop:8,lineHeight:1.6},
};

ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App,null));
