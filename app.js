(function(){
  "use strict";

  // ---------- Element refs ----------
  const screens = {
    landing: document.getElementById('screen-landing'),
    editor: document.getElementById('screen-editor'),
    result: document.getElementById('screen-result'),
  };
  const btnAddPhoto = document.getElementById('btnAddPhoto');
  const btnBackToLanding = document.getElementById('btnBackToLanding');
  const btnChangePhoto = document.getElementById('btnChangePhoto');
  const btnGenerate = document.getElementById('btnGenerate');
  const btnRedo = document.getElementById('btnRedo');
  const btnDownload = document.getElementById('btnDownload');
  const btnShare = document.getElementById('btnShare');
  const fileInput = document.getElementById('fileInput');
  const stageWrap = document.getElementById('stageWrap');
  const photoCanvasArea = document.getElementById('photoCanvasArea');
  const userPhoto = document.getElementById('userPhoto');
  const placeholderMsg = document.getElementById('placeholderMsg');
  const ovalGuide = document.getElementById('ovalGuide');
  const zoomSlider = document.getElementById('zoomSlider');
  const kidNameInput = document.getElementById('kidName');
  const finalCanvas = document.getElementById('finalCanvas');
  const confettiCanvas = document.getElementById('confettiCanvas');

  // ---------- Template geometry (source image is 941 x 1672) ----------
  const TEMPLATE_W = 941;
  const TEMPLATE_H = 1672;
  // Oval bounds detected from the artwork (in source pixel space)
  const OVAL = {
    cx: 442.5,
    cy: 840.5,
    rx: 200.5,
    ry: 295.5
  };

  function showScreen(name){
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
    history.pushState({screen:name}, '', '#'+name);
  }
  window.addEventListener('popstate', (e) => {
    const target = (e.state && e.state.screen) || 'landing';
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[target].classList.add('active');
  });
  // ---------- Step 1: pick photo ----------
  btnAddPhoto.addEventListener('click', () => {
    fileInput.value = '';
    fileInput.click();
  });
  btnChangePhoto.addEventListener('click', () => {
    fileInput.value = '';
    fileInput.click();
  });

  let photoState = {
    naturalW: 0,
    naturalH: 0,
    scale: 1,
    minScale: 1,
    x: 0,    // top-left position in stage px (CSS px, relative to stage at TEMPLATE aspect)
    y: 0,
  };

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      placeholderMsg.style.display = 'flex';
      userPhoto.style.opacity = '0';
      userPhoto.src = ev.target.result;
      showScreen('editor');
    };
    reader.readAsDataURL(file);
  });

  userPhoto.addEventListener('load', () => {
    if(!userPhoto.naturalWidth) return;
    placeholderMsg.style.display = 'none';
    userPhoto.style.opacity = '1';
    initPhotoTransform();
  });

  userPhoto.addEventListener('error', () => {
    placeholderMsg.innerHTML = '<div>Could not load this photo.<br>Try a JPG/PNG (HEIC photos from iPhone are not supported in-browser).</div>';
  });
  // ---------- Stage sizing helpers ----------
  // We work in "stage px" = the rendered CSS pixel size of stageWrap, which always
  // has the same aspect ratio as the template (941:1672), so a single scale factor
  // converts template px <-> stage px.
  function stageScaleFactor(){
    const rect = stageWrap.getBoundingClientRect();
    return rect.width / TEMPLATE_W; // stage px per template px
  }

  function ovalInStagePx(){
    const f = stageScaleFactor();
    return {
      cx: OVAL.cx * f,
      cy: OVAL.cy * f,
      rx: OVAL.rx * f,
      ry: OVAL.ry * f
    };
  }

  function layoutOvalGuide(){
    const o = ovalInStagePx();
    ovalGuide.style.width = (o.rx*2) + 'px';
    ovalGuide.style.height = (o.ry*2) + 'px';
    ovalGuide.style.left = (o.cx - o.rx) + 'px';
    ovalGuide.style.top = (o.cy - o.ry) + 'px';
  }

  function initPhotoTransform(){
    const o = ovalInStagePx();
    const iw = userPhoto.naturalWidth;
    const ih = userPhoto.naturalHeight;
    photoState.naturalW = iw;
    photoState.naturalH = ih;

    // The oval's bounding box (in stage px) that the image must always fully cover.
    const boxW = o.rx * 2;
    const boxH = o.ry * 2;

    // Minimum scale so that the image covers the oval bounding box (cover-fit).
    const minScale = Math.max(boxW / iw, boxH / ih);
    photoState.minScale = minScale;
    photoState.scale = minScale;

    // Center the image on the oval center.
    const dispW = iw * minScale;
    const dispH = ih * minScale;
    photoState.x = o.cx - dispW/2;
    photoState.y = o.cy - dispH/2;

    zoomSlider.value = 100;
    applyPhotoTransform();
  }

  function applyPhotoTransform(){
    userPhoto.style.width = photoState.naturalW + 'px';
    userPhoto.style.height = photoState.naturalH + 'px';
    userPhoto.style.transform =
      `translate(${photoState.x}px, ${photoState.y}px) scale(${photoState.scale})`;
  }

  // Clamp photo position so the oval bounding box is always fully covered by the image.
  function clampPhotoPosition(){
    const o = ovalInStagePx();
    const dispW = photoState.naturalW * photoState.scale;
    const dispH = photoState.naturalH * photoState.scale;

    const boxLeft = o.cx - o.rx;
    const boxRight = o.cx + o.rx;
    const boxTop = o.cy - o.ry;
    const boxBottom = o.cy + o.ry;

    // x must satisfy: x <= boxLeft AND x + dispW >= boxRight
    const maxX = boxLeft;
    const minX = boxRight - dispW;
    if(minX <= maxX){
      photoState.x = Math.min(maxX, Math.max(minX, photoState.x));
    } else {
      photoState.x = boxLeft - (dispW - (boxRight-boxLeft))/2;
    }

    const maxY = boxTop;
    const minY = boxBottom - dispH;
    if(minY <= maxY){
      photoState.y = Math.min(maxY, Math.max(minY, photoState.y));
    } else {
      photoState.y = boxTop - (dispH - (boxBottom-boxTop))/2;
    }
  }

  // ---------- Drag + Pinch zoom ----------
  let pointers = new Map();
  let dragStart = null; // {x,y, photoX, photoY}
  let pinchStart = null; // {dist, scale, cx, cy}

  function getOvalScaleBounds(){
    const o = ovalInStagePx();
    const boxW = o.rx*2, boxH = o.ry*2;
    const minScale = Math.max(boxW / photoState.naturalW, boxH / photoState.naturalH);
    return { min: minScale, max: minScale * 4 };
  }

  stageWrap.addEventListener('pointerdown', (e) => {
    if(!userPhoto.naturalWidth) return;
    stageWrap.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});

    if(pointers.size === 1){
      dragStart = {
        x: e.clientX, y: e.clientY,
        photoX: photoState.x, photoY: photoState.y
      };
    } else if(pointers.size === 2){
      const pts = Array.from(pointers.values());
      const dist = Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y);
      pinchStart = {
        dist: dist,
        scale: photoState.scale,
        photoX: photoState.x,
        photoY: photoState.y,
        midX: (pts[0].x+pts[1].x)/2,
        midY: (pts[0].y+pts[1].y)/2
      };
      dragStart = null;
    }
  });

  stageWrap.addEventListener('pointermove', (e) => {
    if(!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});

    if(pointers.size === 1 && dragStart){
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      photoState.x = dragStart.photoX + dx;
      photoState.y = dragStart.photoY + dy;
      clampPhotoPosition();
      applyPhotoTransform();
    } else if(pointers.size === 2 && pinchStart){
      const pts = Array.from(pointers.values());
      const dist = Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y);
      const bounds = getOvalScaleBounds();
      let newScale = pinchStart.scale * (dist / pinchStart.dist);
      newScale = Math.max(bounds.min, Math.min(bounds.max, newScale));

      // keep the pinch midpoint anchored
      const ratio = newScale / pinchStart.scale;
      photoState.x = pinchStart.midX - (pinchStart.midX - pinchStart.photoX) * ratio;
      photoState.y = pinchStart.midY - (pinchStart.midY - pinchStart.photoY) * ratio;
      photoState.scale = newScale;

      clampPhotoPosition();
      applyPhotoTransform();

      const minS = bounds.min;
      const maxS = bounds.max;
      const pct = 100 + ((newScale - minS) / (maxS - minS)) * 300;
      zoomSlider.value = Math.max(100, Math.min(400, pct));
    }
  });

  function endPointer(e){
    pointers.delete(e.pointerId);
    if(pointers.size < 2) pinchStart = null;
    if(pointers.size < 1) dragStart = null;
    if(pointers.size === 1){
      const pt = Array.from(pointers.values())[0];
      dragStart = { x: pt.x, y: pt.y, photoX: photoState.x, photoY: photoState.y };
    }
  }
  stageWrap.addEventListener('pointerup', endPointer);
  stageWrap.addEventListener('pointercancel', endPointer);
  stageWrap.addEventListener('pointerleave', (e) => {
    if(pointers.has(e.pointerId)) endPointer(e);
  });

  // Slider zoom (also works for desktop / accessibility)
  zoomSlider.addEventListener('input', () => {
    if(!userPhoto.naturalWidth) return;
    const bounds = getOvalScaleBounds();
    const pct = parseFloat(zoomSlider.value);
    const newScale = bounds.min + ((pct - 100)/300) * (bounds.max - bounds.min);

    const o = ovalInStagePx();
    const ratio = newScale / photoState.scale;
    photoState.x = o.cx - (o.cx - photoState.x) * ratio;
    photoState.y = o.cy - (o.cy - photoState.y) * ratio;
    photoState.scale = newScale;

    clampPhotoPosition();
    applyPhotoTransform();
  });

  // Re-layout on resize/orientation change
  window.addEventListener('resize', () => {
    layoutOvalGuide();
    if(userPhoto.naturalWidth){
      clampPhotoPosition();
      applyPhotoTransform();
    }
  });
  layoutOvalGuide();

  // ---------- Pre-fill name from URL (?name=Aarav%20Shah) ----------
  // When VSDHAM app links here after registration, it can pass the child's
  // name so the user doesn't have to retype it: .../index.html?name=Aarav+Shah
  (function prefillFromQuery(){
    try{
      const params = new URLSearchParams(window.location.search);
      const nameParam = params.get('name');
      if(nameParam){
        kidNameInput.value = nameParam.slice(0, 22);
      }
    } catch(e){ /* ignore */ }
  })();

  // ---------- Navigation ----------
  btnBackToLanding.addEventListener('click', () => showScreen('landing'));
  btnRedo.addEventListener('click', () => showScreen('editor'));

  // ---------- Generate final image ----------
  const templateImg = new Image();
  templateImg.src = "template-overlay.png";

  function loadImageFromSrc(src){
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function wrapText(ctx, text, maxWidth){
    const words = text.split(' ');
    const lines = [];
    let current = '';
    for(const w of words){
      const test = current ? current + ' ' + w : w;
      if(ctx.measureText(test).width > maxWidth && current){
        lines.push(current);
        current = w;
      } else {
        current = test;
      }
    }
    if(current) lines.push(current);
    return lines;
  }

  function drawNameSign(ctx, name){
    if(!name) return;
    name = name.trim();
    if(!name) return;

    // Sign geometry in template px — sits in the grass gap just below the oval.
    const signCx = TEMPLATE_W/2;
    const signCy = OVAL.cy + OVAL.ry + 58;
    const signW = 360;
    const signH = 70;

    ctx.save();
    ctx.translate(signCx, signCy);

    // Wood plank background
    const grad = ctx.createLinearGradient(0, -signH/2, 0, signH/2);
    grad.addColorStop(0, '#a9712f');
    grad.addColorStop(0.5, '#8a5a2b');
    grad.addColorStop(1, '#6b3f1d');

    function roundRect(x,y,w,h,r){
      ctx.beginPath();
      ctx.moveTo(x+r,y);
      ctx.arcTo(x+w,y,x+w,y+h,r);
      ctx.arcTo(x+w,y+h,x,y+h,r);
      ctx.arcTo(x,y+h,x,y,r);
      ctx.arcTo(x,y,x+w,y,r);
      ctx.closePath();
    }

    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 6;
    roundRect(-signW/2, -signH/2, signW, signH, signH/2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // wood grain lines
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 2;
    for(let i=-1;i<=1;i++){
      ctx.beginPath();
      ctx.moveTo(-signW/2+14, i*16);
      ctx.bezierCurveTo(-signW/4, i*16+5, signW/4, i*16-5, signW/2-14, i*16);
      ctx.stroke();
    }

    // border
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#5a3414';
    roundRect(-signW/2, -signH/2, signW, signH, signH/2);
    ctx.stroke();

    // little leaf accents
    ctx.font = '22px sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('🌿', -signW/2+6, 0);
    ctx.save();
    ctx.scale(-1,1);
    ctx.fillText('🌿', -signW/2+6, 0);
    ctx.restore();

    // Name text, auto-fit
    let fontSize = 32;
    ctx.font = `800 ${fontSize}px Poppins, Arial, sans-serif`;
    const maxTextWidth = signW - 90;
    while(ctx.measureText(name.toUpperCase()).width > maxTextWidth && fontSize > 16){
      fontSize -= 2;
      ctx.font = `800 ${fontSize}px Poppins, Arial, sans-serif`;
    }
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#ffffff';
    ctx.lineJoin = 'round';
    ctx.fillStyle = '#5b1f8a';
    const label = name.toUpperCase();
    ctx.strokeText(label, 4, 3);
    ctx.fillText(label, 4, 3);

    ctx.restore();
  }

  async function generateFinalImage(){
    finalCanvas.width = TEMPLATE_W;
    finalCanvas.height = TEMPLATE_H;
    const ctx = finalCanvas.getContext('2d');

    // 1. Draw user's photo, transformed exactly as shown in the editor,
    //    converted from stage-px space to template-px space.
    const f = stageScaleFactor();
    const photoImg = await loadImageFromSrc(userPhoto.src);

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(OVAL.cx, OVAL.cy, OVAL.rx, OVAL.ry, 0, 0, Math.PI*2);
    ctx.clip();

    const tplX = photoState.x / f;
    const tplY = photoState.y / f;
    const tplScale = photoState.scale / f;
    const dw = photoState.naturalW * tplScale;
    const dh = photoState.naturalH * tplScale;
    ctx.drawImage(photoImg, tplX, tplY, dw, dh);
    ctx.restore();

    // 2. Draw the decorative template on top (oval area is transparent in this asset).
    await new Promise(res => {
      if(templateImg.complete && templateImg.naturalWidth){ res(); }
      else templateImg.onload = res;
    });
    ctx.drawImage(templateImg, 0, 0, TEMPLATE_W, TEMPLATE_H);

    // 3. Draw the name sign.
    drawNameSign(ctx, kidNameInput.value);
  }

  btnGenerate.addEventListener('click', async () => {
    if(!userPhoto.naturalWidth){
      alert('Please add a photo first!');
      return;
    }
    if(!kidNameInput.value.trim()){
      const proceed = confirm("You haven't entered the child's name. Generate without a name on the sign?");
      if(!proceed){
        kidNameInput.focus();
        return;
      }
    }
    btnGenerate.disabled = true;
    btnGenerate.textContent = 'Generating…';
    try{
      await generateFinalImage();
      const dataUrl = finalCanvas.toDataURL('image/png');
      btnDownload.href = dataUrl;
      window.__lastImageDataUrl = dataUrl;
      showScreen('result');
      launchConfetti();
    } catch(err){
      console.error(err);
      if(err && err.name === 'SecurityError'){
        alert("Couldn't export the image because it's being opened directly as a local file. Please run this from a local/real web server (http:// or https://) instead of double-clicking the HTML file — see README.md.");
      } else {
        alert('Something went wrong generating the image. Please try again.');
      }
    } finally {
      btnGenerate.disabled = false;
      btnGenerate.textContent = '✨ Generate My Card';
    }
  });

  // ---------- Share ----------
  btnShare.addEventListener('click', async () => {
    try{
      if(navigator.share && navigator.canShare){
        const res = await fetch(window.__lastImageDataUrl);
        const blob = await res.blob();
        const file = new File([blob], 'chaturmasik-chovihar-2026.png', {type:'image/png'});
        if(navigator.canShare({files:[file]})){
          await navigator.share({
            files:[file],
            title:'Chaturmasik Chovihar Scheme 2026',
            text:'I have registered for the Chaturmasik Chovihar Scheme 2026! 🌻'
          });
          return;
        }
      }
      // fallback
      const a = document.createElement('a');
      a.href = window.__lastImageDataUrl;
      a.download = 'chaturmasik-chovihar-2026.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch(err){
      console.warn('share cancelled or failed', err);
    }
  });

  // ====================================================================
  // Confetti / popper burst
  // ====================================================================
  const cctx = confettiCanvas.getContext('2d');
  let confettiParticles = [];
  let confettiAnimId = null;

  function resizeConfettiCanvas(){
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeConfettiCanvas);
  resizeConfettiCanvas();

  const CONFETTI_COLORS = ['#ffd23f','#f5a623','#e0457a','#6b1fa2','#34c759','#4fb3e8','#ff7a3d','#ffffff'];

  function launchConfetti(){
    resizeConfettiCanvas();
    confettiParticles = [];
    const originX = confettiCanvas.width/2;
    const originY = confettiCanvas.height*0.35;
    const count = 140;

    for(let i=0;i<count;i++){
      const angle = (Math.random()*Math.PI*2);
      const speed = 6 + Math.random()*14;
      confettiParticles.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle)*speed*(0.4+Math.random()*0.6),
        vy: Math.sin(angle)*speed - 6 - Math.random()*8,
        gravity: 0.32 + Math.random()*0.12,
        size: 5 + Math.random()*7,
        color: CONFETTI_COLORS[Math.floor(Math.random()*CONFETTI_COLORS.length)],
        rot: Math.random()*Math.PI*2,
        vrot: (Math.random()-0.5)*0.35,
        shape: Math.random() < 0.5 ? 'rect' : 'circle',
        life: 0,
        maxLife: 90 + Math.random()*40,
        drag: 0.985
      });
    }
    if(confettiAnimId) cancelAnimationFrame(confettiAnimId);
    animateConfetti();
  }

  function animateConfetti(){
    cctx.clearRect(0,0,confettiCanvas.width, confettiCanvas.height);
    let alive = false;
    for(const p of confettiParticles){
      p.life++;
      if(p.life > p.maxLife) continue;
      alive = true;
      p.vx *= p.drag;
      p.vy = p.vy*p.drag + p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;

      const lifeRatio = p.life / p.maxLife;
      const alpha = lifeRatio > 0.8 ? (1-lifeRatio)/0.2 : 1;

      cctx.save();
      cctx.globalAlpha = Math.max(0, alpha);
      cctx.translate(p.x, p.y);
      cctx.rotate(p.rot);
      cctx.fillStyle = p.color;
      if(p.shape === 'rect'){
        cctx.fillRect(-p.size/2, -p.size/3, p.size, p.size*0.66);
      } else {
        cctx.beginPath();
        cctx.arc(0,0,p.size/2,0,Math.PI*2);
        cctx.fill();
      }
      cctx.restore();
    }
    if(alive){
      confettiAnimId = requestAnimationFrame(animateConfetti);
    } else {
      cctx.clearRect(0,0,confettiCanvas.width, confettiCanvas.height);
      confettiAnimId = null;
    }
  }

})();
