const $ = (id) => document.getElementById(id);
const fileInput = $("file"), drop = $("drop"), conf = $("conf");
const items = []; // {id, file, url, card, state, data, error}
let nextId = 1;
let running = false;

function showWarn(msg) {
  $("warn").textContent = msg;
  $("warn").hidden = !msg;
}

fetch("/api/status")
  .then((r) => r.json())
  .then((s) => {
    $("model-text").textContent = s.trained ? `${s.model} · ${s.classes} classes` : "Demo model (not trained)";
    if (!s.trained) {
      $("model-badge").classList.add("warn-pill");
      showWarn("Using a generic demo model, so results are not crop diseases. Place best.pt in app/models/.");
    }
  })
  .catch(() => {
    $("model-text").textContent = "Server unreachable";
    $("model-badge").classList.add("warn-pill");
  });

// ---- input ----
fileInput.onchange = () => { addFiles(fileInput.files); fileInput.value = ""; };
drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); } });
["dragover", "dragenter"].forEach((e) =>
  drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((e) => drop.addEventListener(e, () => drop.classList.remove("over")));
drop.addEventListener("drop", (ev) => { ev.preventDefault(); addFiles(ev.dataTransfer.files); });

conf.oninput = () => ($("conf-val").textContent = Number(conf.value).toFixed(2));
conf.onchange = () => rerunAll();
$("rerun").onclick = () => rerunAll();
$("clear").onclick = () => {
  items.splice(0).forEach((it) => URL.revokeObjectURL(it.url));
  $("results").replaceChildren();
  refresh();
};

function addFiles(fileList) {
  const imgs = [...fileList].filter((f) => f.type.startsWith("image/"));
  if (!imgs.length) return showWarn("Please choose image files.");
  showWarn("");
  for (const file of imgs) {
    const it = { id: nextId++, file, url: URL.createObjectURL(file), state: "queued", data: null };
    it.card = el("article", "card");
    renderCard(it);
    items.push(it);
    $("results").prepend(it.card);
  }
  refresh();
  processQueue();
}

function rerunAll() {
  for (const it of items) it.state = "queued";
  items.forEach((it) => renderCard(it));
  refresh();
  processQueue();
}

// ---- processing: one image at a time ----
async function processQueue() {
  if (running) return;
  running = true;
  try {
    let it;
    while ((it = items.find((x) => x.state === "queued"))) {
      it.state = "working";
      renderCard(it);
      refresh();
      try {
        const fd = new FormData();
        fd.append("file", it.file);
        const res = await fetch(`/api/predict/image?conf=${conf.value}`, { method: "POST", body: fd });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
        it.data = await res.json();
        it.state = "done";
      } catch (err) {
        it.error = err.message;
        it.state = "error";
      }
      renderCard(it);
      refresh();
    }
  } finally {
    running = false;
  }
}

// ---- rendering ----
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function confClass(c) { return c >= 0.7 ? "high" : c >= 0.45 ? "mid" : "low"; }
function confWord(c) { return c >= 0.7 ? "High" : c >= 0.45 ? "Medium" : "Low"; }

function renderCard(it) {
  const img = el("img");
  img.alt = it.file.name;
  img.src = it.state === "done" && it.data.annotated ? "data:image/jpeg;base64," + it.data.annotated : it.url;
  img.onclick = () => openZoom(img.src);

  const wrap = el("div", "card-img");
  const rm = el("button", "remove", "×");
  rm.title = "Remove image";
  rm.setAttribute("aria-label", "Remove " + it.file.name);
  rm.onclick = () => removeItem(it);
  wrap.append(img, rm);

  const body = el("div", "card-body");
  body.append(el("div", "fname", it.file.name));

  if (it.state === "queued") body.append(el("div", "muted", "Waiting in queue…"));
  else if (it.state === "working") body.append(el("div", "spinner"), el("div", "muted", "Analyzing…"));
  else if (it.state === "error") {
    const row = el("div", "result-row");
    row.append(el("div", "result-title", it.error), el("span", "badge err", "Error"));
    body.append(row);
  } else {
    const dets = it.data.detections;
    const row = el("div", "result-row");
    if (!dets.length) {
      row.append(el("div", "result-title", "No disease detected"), el("span", "badge none", "Clear"));
      body.append(row);
    } else {
      const top = dets[0];
      row.append(
        el("div", "result-title", top.label),
        el("span", `badge ${confClass(top.confidence)}`, `${Math.round(top.confidence * 100)}% · ${confWord(top.confidence)}`)
      );
      body.append(row);
      if (dets.length > 1) {
        body.append(el("div", "also", "Other detections"));
        const list = el("div", "det");
        for (const d of dets.slice(1, 6)) {
          const pct = Math.round(d.confidence * 100);
          const bar = el("div", "bar");
          const fill = el("i");
          fill.style.width = pct + "%";
          bar.append(fill);
          list.append(el("span", null, d.label), el("span", "pct", pct + "%"), bar);
        }
        body.append(list);
      }
    }
  }
  it.card.replaceChildren(wrap, body);
}

function removeItem(it) {
  items.splice(items.indexOf(it), 1);
  URL.revokeObjectURL(it.url);
  it.card.remove();
  refresh();
}

function refresh() {
  const done = items.filter((i) => i.state === "done");
  const pending = items.filter((i) => i.state === "queued" || i.state === "working").length;
  $("rerun").disabled = items.length === 0 || pending > 0;
  $("clear").disabled = items.length === 0;
  $("count").textContent = items.length;
  $("empty").hidden = items.length > 0;

  const prog = $("progress");
  prog.hidden = pending === 0;
  prog.textContent = `Analyzing ${items.length - pending + 1} of ${items.length}…`;

  $("summary").hidden = done.length === 0;
  if (!done.length) return;
  const withDisease = done.filter((i) => i.data.detections.length);
  const counts = {};
  for (const i of withDisease) {
    const l = i.data.detections[0].label;
    counts[l] = (counts[l] || 0) + 1;
  }
  const common = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const rows = [
    ["Images analyzed", done.length],
    ["With detections", withDisease.length],
    ["No detection", done.length - withDisease.length],
  ];
  if (common) rows.push(["Most common", `${common[0]} (${common[1]})`]);
  $("stats").replaceChildren(
    ...rows.map(([k, v]) => {
      const d = el("div");
      d.append(el("dt", null, k), el("dd", null, String(v)));
      return d;
    })
  );
}

// ---- zoom ----
const dlg = document.createElement("dialog");
const zoomImg = el("img");
dlg.append(zoomImg);
dlg.onclick = () => dlg.close();
document.body.append(dlg);
function openZoom(src) { zoomImg.src = src; dlg.showModal(); }

refresh();
