(function () {
  var script = document.getElementById("script");
  var wordCount = document.getElementById("wordCount");
  var charCount = document.getElementById("charCount");
  var stage = document.getElementById("stage");
  var meta = document.getElementById("meta");
  var statusBox = document.getElementById("status");
  var generateBtn = document.getElementById("generateBtn");
  var cancelBtn = document.getElementById("cancelBtn");
  var downloadBtn = document.getElementById("downloadBtn");

  var state = { url: null, ext: "webm", busy: false, cancelled: false, raf: 0, recorder: null };

  var palettes = [
    ["#6d4aff", "#ff4a9e"],
    ["#0ea5e9", "#6d4aff"],
    ["#f97316", "#ef4444"],
    ["#10b981", "#0ea5e9"],
    ["#8b5cf6", "#ec4899"]
  ];

  function selected(name) {
    return document.querySelector('input[name="' + name + '"]:checked');
  }

  function updateCounts() {
    var text = script.value.trim();
    var words = text ? text.split(/\s+/).length : 0;
    wordCount.textContent = words + (words === 1 ? " word" : " words");
    charCount.textContent = script.value.length + " / 2000 characters";
  }

  function ratioSize() {
    var label = selected("ratio").dataset.label;
    if (label === "9:16") return { w: 720, h: 1280 };
    if (label === "1:1") return { w: 720, h: 720 };
    return { w: 1280, h: 720 };
  }

  function updateMeta() {
    var ratio = selected("ratio");
    var duration = selected("duration");
    var size = ratioSize();
    stage.style.setProperty("--ratio", ratio.value);
    meta.textContent = "Format: " + ratio.dataset.label + " · Length: " + duration.value + " sec · " + size.w + "×" + size.h;
  }

  function showStatus(message, type) {
    statusBox.textContent = message;
    statusBox.className = "status show " + type;
  }

  function setBusy(busy) {
    state.busy = busy;
    generateBtn.disabled = busy;
    cancelBtn.hidden = !busy;
    script.disabled = busy;
    document.querySelectorAll('input[name="ratio"], input[name="duration"]').forEach(function (el) {
      el.disabled = busy;
    });
  }

  function resetStage() {
    stage.className = "stage";
    stage.innerHTML = "<div><strong>No video yet</strong>Press “Create video” and your video will appear here.</div>";
  }

  function splitSentences(text) {
    var parts = text.replace(/\r/g, "").match(/[^.!?؟۔\n]+[.!?؟۔]*/g) || [];
    return parts.map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
  }

  function wrapLines(ctx, text, maxW) {
    var words = text.split(/\s+/);
    var lines = [];
    var line = "";
    words.forEach(function (word) {
      var test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  function layoutScene(ctx, text, W, H, rtl) {
    var maxW = W * 0.84;
    var maxH = H * 0.62;
    var base = Math.min(W, H);
    var size = Math.round(base * 0.085);
    var minSize = Math.round(base * 0.035);
    var font, lines, lineH;
    ctx.direction = rtl ? "rtl" : "ltr";
    while (true) {
      font = "700 " + size + 'px system-ui, "Segoe UI", Roboto, Arial, sans-serif';
      ctx.font = font;
      lines = wrapLines(ctx, text, maxW);
      lineH = size * 1.3;
      if (lines.length * lineH <= maxH || size <= minSize) break;
      size -= 2;
    }
    return { text: text, lines: lines, lineH: lineH, size: size, font: font, rtl: rtl };
  }

  function buildScenes(ctx, text, total, W, H) {
    var sentences = splitSentences(text);
    if (!sentences.length) sentences = [text];
    var maxScenes = Math.max(1, Math.floor(total / 3));
    var count = Math.min(sentences.length, maxScenes);
    var rtl = /[\u0600-\u06FF]/.test(text);
    var scenes = [];
    for (var i = 0; i < count; i++) {
      var start = Math.round(i * sentences.length / count);
      var end = Math.round((i + 1) * sentences.length / count);
      var chunk = sentences.slice(start, end).join(" ");
      scenes.push(layoutScene(ctx, chunk, W, H, rtl));
    }
    return scenes;
  }

  function draw(ctx, W, H, scene, idx, t, total, sceneDur) {
    var local = Math.max(0, Math.min(sceneDur, t - idx * sceneDur));
    var pal = palettes[idx % palettes.length];
    var a = t * 0.2 + idx;
    var x1 = W / 2 - Math.cos(a) * W / 2;
    var y1 = H / 2 - Math.sin(a) * H / 2;
    var g = ctx.createLinearGradient(x1, y1, W - x1, H - y1);
    g.addColorStop(0, pal[0]);
    g.addColorStop(1, pal[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(0, 0, W, H);

    var fadeIn = Math.min(1, local / 0.5);
    var fadeOut = Math.min(1, (sceneDur - local) / 0.3);
    var alpha = Math.max(0, Math.min(fadeIn, fadeOut));
    var eased = 1 - Math.pow(1 - fadeIn, 3);
    var offset = (1 - eased) * H * 0.03;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.direction = scene.rtl ? "rtl" : "ltr";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = scene.font;
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = scene.size * 0.12;
    var startY = H * 0.47 - (scene.lines.length - 1) * scene.lineH / 2 + offset;
    for (var i = 0; i < scene.lines.length; i++) {
      ctx.fillText(scene.lines[i], W / 2, startY + i * scene.lineH);
    }
    ctx.restore();

    var barH = Math.max(4, H * 0.012);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(0, H - barH, W * Math.min(1, t / total), barH);

    ctx.save();
    ctx.direction = "ltr";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 " + Math.round(Math.min(W, H) * 0.03) + "px system-ui, Arial, sans-serif";
    ctx.fillText("VidSpark AI", W * 0.04, H - H * 0.03);
    ctx.restore();
  }

  function pickMime() {
    var list = [
      "video/mp4;codecs=avc1.42E01E",
      "video/mp4",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm"
    ];
    for (var i = 0; i < list.length; i++) {
      if (MediaRecorder.isTypeSupported(list[i])) return list[i];
    }
    return "";
  }

  function showResult(blob, type, fastNote) {
    if (state.url) URL.revokeObjectURL(state.url);
    state.url = URL.createObjectURL(blob);
    state.ext = /mp4/.test(type) ? "mp4" : "webm";
    stage.innerHTML = "";
    stage.className = "stage has-media";
    var video = document.createElement("video");
    video.controls = true;
    video.playsInline = true;
    video.src = state.url;
    stage.appendChild(video);
    downloadBtn.disabled = false;
    downloadBtn.textContent = "Download video (." + state.ext + ")";
    var mb = (blob.size / 1048576).toFixed(1);
    var msg = "Done! Your video is ready (" + state.ext.toUpperCase() + ", " + mb + " MB). It was created on your device and not uploaded anywhere.";
    if (fastNote) msg += " " + fastNote;
    showStatus(msg, "ok");
  }

  function startRender() {
    if (state.busy) return;
    var text = script.value.trim();
    if (!text) {
      showStatus("Please write a script first.", "warn");
      script.focus();
      return;
    }
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
      showStatus("This browser cannot record video. Please open this page in Google Chrome.", "warn");
      return;
    }

    var total = parseInt(selected("duration").value, 10);
    var size = ratioSize();
    var W = size.w;
    var H = size.h;
    var canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext("2d");
    var scenes = buildScenes(ctx, text, total, W, H);
    var sceneDur = total / scenes.length;

    var words = text.split(/\s+/).length;
    var fastNote = (words / total > 3.5)
      ? "Tip: your script is long for this length, so text changes quickly. Choose a longer length for easier reading."
      : "";

    var stream = canvas.captureStream(30);
    var mime = pickMime();
    var rec;
    try {
      rec = mime ? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2500000 }) : new MediaRecorder(stream);
    } catch (err) {
      showStatus("Could not start the recorder: " + err.message, "warn");
      return;
    }

    var chunks = [];
    rec.ondataavailable = function (e) {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = function () {
      cancelAnimationFrame(state.raf);
      setBusy(false);
      if (state.cancelled) {
        resetStage();
        showStatus("Cancelled. No video was created.", "warn");
        return;
      }
      var type = (rec.mimeType || mime || "video/webm").split(";")[0];
      var blob = new Blob(chunks, { type: type });
      if (!blob.size) {
        resetStage();
        showStatus("The recording came out empty. Please try again.", "warn");
        return;
      }
      showResult(blob, type, fastNote);
    };

    state.recorder = rec;
    state.cancelled = false;
    downloadBtn.disabled = true;
    downloadBtn.textContent = "Download video (create one first)";
    setBusy(true);

    stage.innerHTML = "";
    stage.className = "stage has-media";
    stage.appendChild(canvas);
    showStatus("Creating your video… 0%. Keep this screen open until it finishes.", "warn");

    rec.start(500);
    var t0 = performance.now();
    var lastPct = -1;

    function frame(now) {
      var t = Math.max(0, (now - t0) / 1000);
      if (t >= total) {
        var last = scenes.length - 1;
        draw(ctx, W, H, scenes[last], last, total, total, sceneDur);
        setTimeout(function () {
          if (rec.state !== "inactive") rec.stop();
        }, 300);
        return;
      }
      var idx = Math.min(scenes.length - 1, Math.floor(t / sceneDur));
      draw(ctx, W, H, scenes[idx], idx, t, total, sceneDur);
      var pct = Math.floor(t / total * 100);
      if (pct !== lastPct) {
        lastPct = pct;
        showStatus("Creating your video… " + pct + "%. Keep this screen open until it finishes.", "warn");
      }
      state.raf = requestAnimationFrame(frame);
    }
    state.raf = requestAnimationFrame(frame);
  }

  script.addEventListener("input", updateCounts);
  document.querySelectorAll('input[name="ratio"], input[name="duration"]').forEach(function (el) {
    el.addEventListener("change", updateMeta);
  });
  generateBtn.addEventListener("click", startRender);
  cancelBtn.addEventListener("click", function () {
    if (!state.busy) return;
    state.cancelled = true;
    cancelAnimationFrame(state.raf);
    if (state.recorder && state.recorder.state !== "inactive") state.recorder.stop();
  });
  downloadBtn.addEventListener("click", function () {
    if (!state.url) return;
    var a = document.createElement("a");
    a.href = state.url;
    a.download = "vidspark-video." + state.ext;
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  updateCounts();
  updateMeta();
})();
