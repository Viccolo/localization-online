// Online version of the 2007 study. URL parameters: soa (ms, may be a comma list for experiment 2), reps, debug.
const params = new URLSearchParams(window.location.search);
const CONFIG = {
  soas: (params.get("soa") || "200").split(",").map(Number),
  reps: Number(params.get("reps") || 10),          // 20 conditions x reps (2007: 10)
  practice: 10,
  restEvery: 40,
  completionCode: "XXXX",                           // set per crowdsourcing job
  datapipeId: params.get("pipe") === "off" ? null : "iUmElGvM1Ott",   // DataPipe (Google Drive); ?pipe=off saves a local CSV instead
  needHalfDeg: 10.8,                                // cue frame edge: (170 + 120) px of 2007 = 10.8 deg from fixation
};
const DEBUG = params.has("debug");
const subjectId = Math.random().toString(36).slice(2, 12);
const filename = `localization_${subjectId}.csv`;
let completed = false;   // false when the experiment was aborted (screen too small)
const showEnd = (failed) => {
  const body = completed ? TEXT.end(CONFIG.completionCode) + (failed ? TEXT.save_failed : "") : TEXT.too_small;
  jsPsych.getDisplayElement().innerHTML =
    `<div class="jspsych-content-wrapper"><div class="jspsych-content">${body}</div></div>`;
};
// the pipe extension stages each trial on DataPipe and submits the whole CSV when the timeline ends;
// a participant who quits midway still leaves a .partial.json
const jsPsych = initJsPsych({
  on_finish: () => {
    if (!CONFIG.datapipeId) { jsPsych.data.get().localSave("csv", filename); showEnd(false); }
  },
  extensions: [{
    type: jsPsychExtensionPipe,
    params: {
      experiment_id: CONFIG.datapipeId || "none",
      filename,
      enabled: Boolean(CONFIG.datapipeId),
      wait_message: TEXT.saving,
      on_save: (result) => showEnd(!result.ok),
    },
  }],
});
jsPsych.data.addProperties({ subject_id: subjectId, soa_list: CONFIG.soas.join(",") });

let frameMs = 1000 / 60, px2deg = null;
const lockTarget = () => jsPsych.getDisplayElement();
const requestLock = () => { const el = lockTarget(); if (el.requestPointerLock) el.requestPointerLock(); };

const timeline = [];
timeline.push({ type: jsPsychHtmlButtonResponse, stimulus: TEXT.consent, choices: [TEXT.consent_button] });

timeline.push({
  type: jsPsychBrowserCheck,
  features: ["width", "height", "browser", "browser_version", "mobile", "os", "fullscreen", "vsync_rate"],   // no microphone or webcam check
  minimum_width: DEBUG ? 0 : 1024,
  minimum_height: DEBUG ? 0 : 700,
  inclusion_function: (d) =>
    !d.mobile && window.matchMedia("(pointer: fine)").matches && window.matchMedia("(hover: hover)").matches &&
    !(navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform)),   // iPad that reports a desktop browser
  exclusion_message: () => TEXT.device_fail,
  window_resize_message: "<p>ブラウザの窓を大きくしてください。</p><p>幅：<span id='browser-check-min-width'></span>，高さ：<span id='browser-check-min-height'></span></p><p>いまの幅：<span id='browser-check-actual-width'></span>，高さ：<span id='browser-check-actual-height'></span></p>",
  resize_fail_button_text: "大きくできない",
  on_finish: (d) => { if (d.vsync_rate) frameMs = 1000 / d.vsync_rate; },
});

timeline.push({ type: jsPsychFullscreen, fullscreen_mode: true, message: TEXT.fullscreen, button_label: TEXT.fullscreen_button });

// for testing only: ?px2deg=30 skips the card and blind-spot measurements
if (params.get("px2deg")) px2deg = Number(params.get("px2deg"));
else timeline.push({
  type: jsPsychVirtualChinrest,
  blindspot_reps: DEBUG ? 1 : 5,
  resize_units: "none",
  adjustment_prompt: TEXT.chinrest_adjust,
  adjustment_button_prompt: TEXT.chinrest_adjust_button,
  blindspot_prompt: TEXT.chinrest_blindspot,
  blindspot_measurements_prompt: TEXT.chinrest_remaining,
  viewing_distance_report: TEXT.chinrest_report,
  redo_measurement_button_label: TEXT.chinrest_redo,
  blindspot_done_prompt: TEXT.chinrest_ok,
  on_finish: (d) => { px2deg = d.px2deg; },
});

// stop if the cue frames do not fit on the screen
timeline.push({
  timeline: [{ type: jsPsychHtmlKeyboardResponse, stimulus: TEXT.too_small, choices: "NO_KEYS",
    on_load: () => jsPsych.abortExperiment(TEXT.too_small) }],
  conditional_function: () => {
    const fits = DEBUG || Math.min(window.innerWidth, window.innerHeight) / 2 >= CONFIG.needHalfDeg * px2deg;
    jsPsych.data.addProperties({ fits_screen: fits });
    return !fits;
  },
});

const trialOf = (cue, tgt, soa, phase) => ({
  type: jsPsychLocalization,
  cue_pos: cue, target_pos: tgt, soa_ms: soa,
  px2deg: () => px2deg, frame_ms: () => frameMs,
  data: { phase },
  on_start: () => { if (!document.pointerLockElement) requestLock(); },
});
const conditions = [];
for (const soa of CONFIG.soas) for (let c = 0; c < 5; c++) for (let t = 0; t < 4; t++) conditions.push([c, t, soa]);

timeline.push({ type: jsPsychHtmlButtonResponse, stimulus: TEXT.instructions, choices: [TEXT.start_button], on_finish: requestLock });
for (const [c, t, s] of jsPsych.randomization.sampleWithoutReplacement(conditions, CONFIG.practice)) timeline.push(trialOf(c, t, s, "practice"));
timeline.push({ type: jsPsychHtmlButtonResponse, stimulus: TEXT.practice_end, choices: [TEXT.main_button], on_finish: requestLock });

// each repetition: all conditions in a new random order (as in the 2007 program)
const main = [];
for (let r = 0; r < CONFIG.reps; r++) for (const [c, t, s] of jsPsych.randomization.shuffle(conditions)) main.push(trialOf(c, t, s, "main"));
const total = main.length;
main.forEach((tr, i) => {
  tr.data.trial_index_main = i;
  timeline.push(tr);
  if ((i + 1) % CONFIG.restEvery === 0 && i + 1 < total) {
    timeline.push({ type: jsPsychHtmlButtonResponse, stimulus: TEXT.rest(total, i + 1), choices: [TEXT.rest_button], on_finish: requestLock });
  }
});

timeline.push({ type: jsPsychFullscreen, fullscreen_mode: false, on_finish: () => { completed = true; } });
// the completion code is shown by showEnd after the data are saved

jsPsych.run(timeline);
