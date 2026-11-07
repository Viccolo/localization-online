// One trial of the 2007 cueing-localization task, drawn on a canvas in degrees of visual angle.
// Sequence (from Unit2.pas): fixation; space key; cue frame on (about 5 ms later) for CUE_MS;
// target dot from SOA to SOA + TARGET_MS; then a dot cursor appears DEG.cursorStart away from the target
// at a random angle and the participant clicks where the target was. Durations are counted in frames.
var jsPsychLocalization = (function () {
  const info = {
    name: "localization",
    version: "1.0.0",
    parameters: {
      cue_pos: { type: jsPsychModule.ParameterType.FLOAT, default: 4 },        // 0 UR, 1 UL, 2 LL, 3 LR, 4 no cue (codes of the 2007 program)
      target_pos: { type: jsPsychModule.ParameterType.FLOAT, default: 0 },
      soa_ms: { type: jsPsychModule.ParameterType.FLOAT, default: 200 },
      cue_ms: { type: jsPsychModule.ParameterType.FLOAT, default: 50 },
      target_ms: { type: jsPsychModule.ParameterType.FLOAT, default: 50 },
      px2deg: { type: jsPsychModule.ParameterType.FLOAT, default: 30 },
      frame_ms: { type: jsPsychModule.ParameterType.FLOAT, default: 1000 / 60 },
    },
    data: {},
  };
  // 2007 values in degrees: 1 px = atan(1 / 30.5 / 50.5) = .0372 deg
  const PX = Math.atan(1 / 30.5 / 50.5) * 180 / Math.PI;
  const DEG = {
    peri: 170 * PX, cueHalf: 120 * PX, cueLine: 15 * PX, targetRad: 6 * PX,
    fixLen: 40 * PX, fixW: 4 * PX, cursorStart: 100 * PX, jitterPx: 64,
  };
  const SIGN = { 0: [1, -1], 1: [-1, -1], 2: [-1, 1], 3: [1, 1] };
  const GRAY = "rgb(128,128,128)";

  class LocalizationPlugin {
    constructor(jsPsych) { this.jsPsych = jsPsych; }
    trial(display, trial) {
      const ppd = trial.px2deg;
      const W = window.innerWidth, H = window.innerHeight, cx = W / 2, cy = H / 2;
      const dpr = window.devicePixelRatio || 1;
      const canvas = document.createElement("canvas");
      canvas.id = "loc-canvas";
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      display.innerHTML = "";
      display.appendChild(canvas);
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);

      // target position: quadrant centre plus the 2007 jitter (Jit = random(64)*2 - 64 px, random angle)
      const jitPx = Math.floor(Math.random() * DEG.jitterPx) * 2 - DEG.jitterPx;
      const jitAng = Math.floor(Math.random() * 360);
      const tx = SIGN[trial.target_pos][0] * DEG.peri + jitPx * PX * Math.cos(jitAng * Math.PI / 180);
      const ty = SIGN[trial.target_pos][1] * DEG.peri + jitPx * PX * Math.sin(jitAng * Math.PI / 180);
      const toPx = (dx, dy) => [cx + dx * ppd, cy + dy * ppd];

      const clear = () => { ctx.fillStyle = GRAY; ctx.fillRect(0, 0, W, H); };
      const fixation = () => {
        ctx.fillStyle = "#000";
        const l = DEG.fixLen * ppd, w = DEG.fixW * ppd;
        ctx.fillRect(cx - l / 2, cy - w / 2, l, w);
        ctx.fillRect(cx - w / 2, cy - l / 2, w, l);
      };
      const cue = () => {
        if (trial.cue_pos === 4) return;
        const [x, y] = toPx(SIGN[trial.cue_pos][0] * DEG.peri, SIGN[trial.cue_pos][1] * DEG.peri);
        const h = DEG.cueHalf * ppd, lw = DEG.cueLine * ppd;
        ctx.strokeStyle = "#fff"; ctx.lineWidth = lw;
        ctx.strokeRect(x - h + lw / 2, y - h + lw / 2, 2 * h - lw, 2 * h - lw);
      };
      const dot = (x, y) => {
        ctx.fillStyle = "#000"; ctx.beginPath();
        ctx.arc(x, y, DEG.targetRad * ppd, 0, 2 * Math.PI); ctx.fill();
      };

      const fd = trial.frame_ms;
      const cueFrames = Math.max(1, Math.round(trial.cue_ms / fd));
      const soaFrames = Math.round(trial.soa_ms / fd);
      const targetFrames = Math.max(1, Math.round(trial.target_ms / fd));
      const lastFrame = Math.max(cueFrames, soaFrames + targetFrames);
      const stamps = {};
      const data = {
        cue_pos: trial.cue_pos, target_pos: trial.target_pos, soa_ms: trial.soa_ms,
        cue_ms: trial.cue_ms, target_ms: trial.target_ms, px2deg: ppd, frame_ms: fd,
        cue_frames: cueFrames, soa_frames: soaFrames, target_frames: targetFrames,
        jitter_px2007: jitPx, jitter_angle: jitAng, target_x_deg: tx, target_y_deg: ty,
        win_w: W, win_h: H,
      };

      clear(); fixation();

      const startStimulus = () => {
        let n = 0;
        const step = (ts) => {
          clear(); fixation();
          if (n < cueFrames) cue();
          if (n >= soaFrames && n < soaFrames + targetFrames) dot(...toPx(tx, ty));
          if (n === 0) stamps.cue_on = ts;
          if (n === cueFrames) stamps.cue_off = ts;
          if (n === soaFrames) stamps.target_on = ts;
          if (n === soaFrames + targetFrames) stamps.target_off = ts;
          n++;
          if (n <= lastFrame) requestAnimationFrame(step);
          else startResponse(ts);
        };
        requestAnimationFrame(step);
      };

      // response: a dot cursor driven by pointer-lock movements, starting cursorStart deg from the target
      const startResponse = (ts) => {
        const a = Math.random() * 2 * Math.PI;
        let [mx, my] = toPx(tx + DEG.cursorStart * Math.cos(a), ty + DEG.cursorStart * Math.sin(a));
        data.cursor_start_angle = a * 180 / Math.PI;
        const tResp = performance.now();
        const draw = () => { clear(); fixation(); dot(mx, my); };
        draw();
        const move = (e) => {
          mx = Math.min(W, Math.max(0, mx + e.movementX));
          my = Math.min(H, Math.max(0, my + e.movementY));
          draw();
        };
        const click = () => {
          document.removeEventListener("mousemove", move);
          document.removeEventListener("mousedown", click);
          data.resp_x_deg = (mx - cx) / ppd;
          data.resp_y_deg = (my - cy) / ppd;
          data.rt_ms = performance.now() - tResp;
          data.cue_dur_measured = stamps.cue_off - stamps.cue_on;
          data.soa_measured = stamps.target_on - stamps.cue_on;
          data.target_dur_measured = stamps.target_off - stamps.target_on;
          data.pointer_locked = document.pointerLockElement !== null;
          clear(); fixation();
          this.jsPsych.finishTrial(data);
        };
        document.addEventListener("mousemove", move);
        document.addEventListener("mousedown", click);
      };

      const key = (e) => {
        if (e.code !== "Space") return;
        e.preventDefault();
        document.removeEventListener("keydown", key);
        startStimulus();
      };
      document.addEventListener("keydown", key);
    }
  }
  LocalizationPlugin.info = info;
  return LocalizationPlugin;
})();
