import { useState, useRef, useEffect } from "react";

const YARN_BALL_STYLES = `
  @keyframes yarnKick {
    0%   { transform: translate(0, 0) rotate(0deg); }
    15%  { transform: translate(-12px, -18px) rotate(-20deg); }
    35%  { transform: translate(28px, -10px) rotate(15deg); }
    55%  { transform: translate(-8px, 6px) rotate(-8deg); }
    75%  { transform: translate(4px, -3px) rotate(4deg); }
    90%  { transform: translate(-2px, 1px) rotate(-2deg); }
    100% { transform: translate(0, 0) rotate(0deg); }
  }
  .yarn-ball-kick {
    animation: yarnKick 0.55s cubic-bezier(0.36, 0.07, 0.19, 0.97) forwards;
  }
`;

// ─── Pattern Modal ────────────────────────────────────────────────────────────

function PatternModal({ type, data, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0, bottom: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 99999,
        backgroundColor: "rgba(0,0,0,0.80)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        boxSizing: "border-box",
      }}
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        style={{
          position: "absolute",
          top: "16px",
          right: "16px",
          width: "36px",
          height: "36px",
          borderRadius: "50%",
          background: "rgba(255,255,255,0.2)",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontSize: "18px",
          lineHeight: 1,
        }}
      >
        ✕
      </button>

      {/* Content — stop click from closing when clicking inside */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#1a1a2e",
          borderRadius: "20px",
          maxWidth: "min(92vw, 720px)",
          maxHeight: "85vh",
          width: "100%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "11px", fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {type === "grid" ? "Knit Grid" : "Crochet Pattern"}
          </span>
        </div>
        <div style={{ overflowY: "auto", padding: "20px" }}>
          {type === "grid" ? <KnitGridFull grid={data} /> : <CrochetPatternFull rows={data} />}
        </div>
      </div>
    </div>
  );
}

// ─── Knit Grid (full size) ────────────────────────────────────────────────────

const DEFAULT_GRID = [
  ["#7C9A8E","#7C9A8E","#c084fc","#c084fc","#7C9A8E","#7C9A8E","#c084fc","#c084fc","#7C9A8E","#7C9A8E","#c084fc","#c084fc"],
  ["#c084fc","#7C9A8E","#7C9A8E","#c084fc","#c084fc","#7C9A8E","#7C9A8E","#c084fc","#c084fc","#7C9A8E","#7C9A8E","#c084fc"],
  ["#f9a8d4","#f9a8d4","#7C9A8E","#7C9A8E","#f9a8d4","#f9a8d4","#7C9A8E","#7C9A8E","#f9a8d4","#f9a8d4","#7C9A8E","#7C9A8E"],
  ["#7C9A8E","#f9a8d4","#f9a8d4","#7C9A8E","#7C9A8E","#f9a8d4","#f9a8d4","#7C9A8E","#7C9A8E","#f9a8d4","#f9a8d4","#7C9A8E"],
  ["#c084fc","#c084fc","#f9a8d4","#f9a8d4","#c084fc","#c084fc","#f9a8d4","#f9a8d4","#c084fc","#c084fc","#f9a8d4","#f9a8d4"],
  ["#f9a8d4","#c084fc","#c084fc","#f9a8d4","#f9a8d4","#c084fc","#c084fc","#f9a8d4","#f9a8d4","#c084fc","#c084fc","#f9a8d4"],
  ["#7C9A8E","#7C9A8E","#c084fc","#c084fc","#7C9A8E","#7C9A8E","#c084fc","#c084fc","#7C9A8E","#7C9A8E","#c084fc","#c084fc"],
  ["#c084fc","#7C9A8E","#7C9A8E","#c084fc","#c084fc","#7C9A8E","#7C9A8E","#c084fc","#c084fc","#7C9A8E","#7C9A8E","#c084fc"],
];

function KnitGridFull({ grid = DEFAULT_GRID }) {
  const cellSize = Math.min(40, Math.floor((Math.min(window.innerWidth * 0.82, 680) - 32) / grid[0].length));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
      {grid.map((row, r) => (
        <div key={r} style={{ display: "flex", gap: "2px" }}>
          {row.map((color, c) => (
            <div
              key={c}
              style={{
                width: cellSize,
                height: cellSize,
                backgroundColor: color,
                borderRadius: "4px",
                flexShrink: 0,
              }}
            />
          ))}
          <span style={{ color: "rgba(255,255,255,0.25)", fontSize: "11px", alignSelf: "center", marginLeft: "8px" }}>
            {grid.length - r}
          </span>
        </div>
      ))}
    </div>
  );
}

// Mini thumbnail preview of the grid
function KnitGridThumb({ grid = DEFAULT_GRID }) {
  const cols = grid[0]?.length ?? 0;
  const rows = grid.length;
  const cell = 6;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
      {grid.slice(0, Math.min(rows, 8)).map((row, r) => (
        <div key={r} style={{ display: "flex", gap: "1px" }}>
          {row.slice(0, Math.min(cols, 12)).map((color, c) => (
            <divclaude
            
            ndColor: color, borderRadius: "1px" }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Crochet Pattern (full size) ──────────────────────────────────────────────

const DEFAULT_PATTERN_ROWS = [
  { n: 1,  text: "Ch 4, sl st to form ring." },
  { n: 2,  text: "Ch 3 (= 1 dc), 11 dc in ring, sl st to top of ch-3. (12 dc)" },
  { n: 3,  text: "*Dc in next st, 2 dc in next st; rep from * around. (18 dc)" },
  { n: 4,  text: "*Dc in next 2 sts, 2 dc in next st; rep from * around. (24 dc)" },
  { n: 5,  text: "*Dc in next 3 sts, 2 dc in next st; rep from * around. (30 dc)" },
  { n: 6,  text: "*Dc in next 4 sts, 2 dc in next st; rep from * around. (36 dc)" },
  { n: 7,  text: "Dc in each st around. (36 dc)" },
  { n: 8,  text: "*Dc in next 5 sts, 2 dc in next st; rep from * around. (42 dc)" },
  { n: 9,  text: "Dc in each st around. (42 dc)" },
  { n: 10, text: "*Dc in next 6 sts, 2 dc in next st; rep from * around. (48 dc)" },
  { n: 11, text: "Dc in each st around. (48 dc)" },
  { n: 12, text: "*Dc in next 7 sts, 2 dc in next st; rep from * around. (54 dc)" },
];

function CrochetPatternFull({ rows = DEFAULT_PATTERN_ROWS }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
      {rows.map((row, i) => (
        <div
          key={row.n}
          style={{
            display: "flex",
            gap: "12px",
            padding: "10px 0",
            borderBottom: i < rows.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
          }}
        >
          <span style={{
            color: "#c084fc",
            fontSize: "12px",
            fontWeight: 600,
            fontFamily: "monospace",
            minWidth: "28px",
            paddingTop: "1px",
          }}>
            R{row.n}
          </span>
          <span style={{ color: "rgba(255,255,255,0.85)", fontSize: "14px", lineHeight: 1.6, fontFamily: "monospace" }}>
            {row.text}
          </span>
        </div>
      ))}
    </div>
  );
}

// Mini symbol preview
function CrochetPatternThumb({ rows = DEFAULT_PATTERN_ROWS }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
      {rows.slice(0, 4).map((row) => (
        <div key={row.n} style={{ display: "flex", gap: "5px", alignItems: "center" }}>
          <span style={{ color: "#c084fc", fontSize: "9px", fontWeight: 700, fontFamily: "monospace", minWidth: "16px" }}>
            R{row.n}
          </span>
          <span style={{
            color: "#6b7280",
            fontSize: "9px",
            fontFamily: "monospace",
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
            maxWidth: "120px",
          }}>
            {row.text}
          </span>
        </div>
      ))}
      {rows.length > 4 && (
        <span style={{ color: "#9ca3af", fontSize: "9px" }}>+{rows.length - 4} more rows…</span>
      )}
    </div>
  );
}

// ─── Floating Yarn Ball ───────────────────────────────────────────────────────

function FloatingYarnBall({ color = "#c084fc" }) {
  const [kicking, setKicking] = useState(false);
  const timerRef = useRef(null);

  function triggerKick() {
    if (kicking) return;
    setKicking(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setKicking(false), 560);
  }

  return (
    <>
      <style>{YARN_BALL_STYLES}</style>
      <div
        style={{
          position: "fixed",
          bottom: "15%",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: -9999,
          opacity: 1,
          pointerEvents: "auto",
          cursor: "pointer",
          lineHeight: 0,
        }}
        onMouseEnter={triggerKick}
        onTouchStart={triggerKick}
      >
        <svg
          className={kicking ? "yarn-ball-kick" : ""}
          width="72"
          height="72"
          viewBox="0 0 72 72"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="36" cy="36" r="34" fill={color} />
          <ellipse cx="26" cy="22" rx="10" ry="6" fill="white" fillOpacity="0.25" transform="rotate(-25 26 22)" />
          <path d="M8 26C16 20 28 18 36 24C44 30 50 40 48 54" stroke="white" strokeOpacity="0.55" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          <path d="M20 8C24 16 26 28 22 36C18 44 10 50 4 52" stroke="white" strokeOpacity="0.4" strokeWidth="2" strokeLinecap="round" fill="none" />
          <path d="M44 6C46 14 48 26 44 36C40 46 30 54 18 58" stroke="white" strokeOpacity="0.3" strokeWidth="2" strokeLinecap="round" fill="none" />
          <path d="M48 14C52 10 60 8 64 12" stroke="white" strokeOpacity="0.7" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        </svg>
      </div>
    </>
  );
}

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  "In Progress": { bg: "bg-blue-100", text: "text-blue-600", dot: "bg-blue-500" },
  "Not Started": { bg: "bg-gray-100", text: "text-gray-500", dot: "bg-gray-400" },
  Completed:     { bg: "bg-green-100", text: "text-green-600", dot: "bg-green-500" },
  "On Hold":     { bg: "bg-yellow-100", text: "text-yellow-600", dot: "bg-yellow-500" },
};

const PRIORITY_CONFIG = {
  High:   "text-red-500",
  Medium: "text-orange-400",
  Low:    "text-gray-400",
};

function ProgressBar({ value }) {
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
      <div
        className="h-full rounded-full bg-gradient-to-r from-pink-400 to-purple-500 transition-all duration-500"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function Tag({ label }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-600 border border-purple-100">
      {label}
    </span>
  );
}

// ─── Main Card ────────────────────────────────────────────────────────────────

export default function CrochetNoteCard({
  project = {
    title: "Autumn Harvest Shawl",
    pattern: "Hitchhiker Pattern",
    yarn: "Malabrigo Sock — Aguas",
    weight: "Fingering",
    hookSize: "3.5mm",
    skeinCount: 2,
    colorway: "#7C9A8E",
    progress: 64,
    status: "In Progress",
    priority: "High",
    dueDate: "2026-04-15",
    notes: "Remember to block after finishing. Increase tension slightly on the wing repeats.",
    tags: ["Shawl", "Lace", "Gift"],
    rowsCompleted: 128,
    totalRows: 200,
    // Optional: pass `knitGrid` (2D color array) or `crochetPattern` (array of {n, text})
    // to override the defaults shown in the modal.
  },
}) {
  const [bookmarked, setBookmarked] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [modal, setModal] = useState(null); // null | "grid" | "pattern"

  const status = STATUS_CONFIG[project.status] ?? STATUS_CONFIG["In Progress"];
  const priorityColor = PRIORITY_CONFIG[project.priority] ?? PRIORITY_CONFIG["Medium"];

  const daysLeft = Math.ceil(
    (new Date(project.dueDate) - new Date()) / (1000 * 60 * 60 * 24)
  );
  const dueSoon = daysLeft <= 7 && daysLeft >= 0;
  const overdue = daysLeft < 0;

  return (
    <div className="font-sans w-full max-w-sm mx-auto">
      <FloatingYarnBall color={project.colorway} />

      {/* Fullscreen pattern modal — rendered at top level, outside card */}
      {modal !== null && (
        <PatternModal
          type={modal}
          data={modal === "grid" ? (project.knitGrid ?? DEFAULT_GRID) : (project.crochetPattern ?? DEFAULT_PATTERN_ROWS)}
          onClose={() => setModal(null)}
        />
      )}

      {/* iOS-style card */}
      <div className="bg-white rounded-3xl shadow-[0_2px_20px_rgba(0,0,0,0.08)] overflow-hidden border border-gray-100">

        {/* Color accent bar + header */}
        <div
          className="px-5 pt-5 pb-4"
          style={{ background: `linear-gradient(135deg, ${project.colorway}18, ${project.colorway}08)` }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-10 h-10 rounded-2xl flex-shrink-0 shadow-sm"
                style={{ backgroundColor: project.colorway }}
              />
              <div className="min-w-0">
                <h2 className="text-[17px] font-semibold text-gray-900 leading-snug truncate">
                  {project.title}
                </h2>
                <p className="text-[13px] text-gray-400 mt-0.5">{project.pattern}</p>
              </div>
            </div>
            <button
              onClick={() => setBookmarked((b) => !b)}
              className="flex-shrink-0 mt-0.5 text-gray-300 hover:text-purple-500 transition-colors"
              aria-label="Bookmark"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill={bookmarked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-2 mt-3">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${status.bg} ${status.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
              {project.status}
            </span>
            <span className={`text-xs font-medium ${priorityColor}`}>
              {project.priority} Priority
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-gray-100 mx-5" />

        {/* Stats grid */}
        <div className="grid grid-cols-3 divide-x divide-gray-100 px-0">
          {[
            { label: "Hook", value: project.hookSize },
            { label: "Weight", value: project.weight },
            { label: "Skeins", value: project.skeinCount },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col items-center py-3">
              <span className="text-[15px] font-semibold text-gray-800">{value}</span>
              <span className="text-[11px] text-gray-400 mt-0.5">{label}</span>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="h-px bg-gray-100 mx-5" />

        {/* Pattern thumbnails — click to open modal */}
        <div className="px-5 py-3 grid grid-cols-2 gap-3">
          {/* Knit grid thumbnail */}
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setModal("grid"); }}
            className="group relative flex flex-col items-start gap-1.5 p-2.5 rounded-2xl bg-gray-50 hover:bg-purple-50 border border-gray-100 hover:border-purple-200 transition-all text-left"
            aria-label="View knit grid"
          >
            <span className="text-[10px] font-semibold text-gray-400 group-hover:text-purple-500 uppercase tracking-wide">
              Knit Grid
            </span>
            <KnitGridThumb grid={project.knitGrid ?? DEFAULT_GRID} />
            <span className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <svg className="w-3.5 h-3.5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </span>
          </button>

          {/* Crochet pattern thumbnail */}
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setModal("pattern"); }}
            className="group relative flex flex-col items-start gap-1.5 p-2.5 rounded-2xl bg-gray-50 hover:bg-purple-50 border border-gray-100 hover:border-purple-200 transition-all text-left"
            aria-label="View crochet pattern"
          >
            <span className="text-[10px] font-semibold text-gray-400 group-hover:text-purple-500 uppercase tracking-wide">
              Pattern
            </span>
            <CrochetPatternThumb rows={project.crochetPattern ?? DEFAULT_PATTERN_ROWS} />
            <span className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <svg className="w-3.5 h-3.5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </span>
          </button>
        </div>

        {/* Divider */}
        <div className="h-px bg-gray-100 mx-5" />

        {/* Progress */}
        <div className="px-5 py-4 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[13px] font-medium text-gray-500">Progress</span>
            <span className="text-[13px] font-semibold text-purple-600">
              {project.rowsCompleted} / {project.totalRows} rows
            </span>
          </div>
          <ProgressBar value={project.progress} />
          <div className="text-right text-[11px] text-gray-400">{project.progress}% complete</div>
        </div>

        {/* Divider */}
        <div className="h-px bg-gray-100 mx-5" />

        {/* Yarn + due date */}
        <div className="px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-pink-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" d="M3.5 9.5C6 8 9 7.5 12 9s5.5 4.5 5 8" />
              <path strokeLinecap="round" d="M8 3.8C9 6 9.5 9 8.5 12s-4 5-5 8" />
            </svg>
            <span className="text-[13px] text-gray-600 truncate max-w-[160px]">{project.yarn}</span>
          </div>
          <span
            className={`text-[12px] font-medium px-2 py-0.5 rounded-full ${
              overdue   ? "bg-red-50 text-red-500"
              : dueSoon ? "bg-orange-50 text-orange-500"
                        : "bg-gray-50 text-gray-400"
            }`}
          >
            {overdue
              ? `${Math.abs(daysLeft)}d overdue`
              : daysLeft === 0
              ? "Due today"
              : `${daysLeft}d left`}
          </span>
        </div>

        {/* Expandable notes */}
        <div className="px-5 pb-4">
          <button
            onClick={() => setExpanded((e) => !e)}
            className="w-full flex items-center justify-between py-2 text-left"
          >
            <span className="text-[13px] font-medium text-gray-500">Notes</span>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {expanded && (
            <p className="text-[13px] text-gray-600 leading-relaxed pb-1">
              {project.notes}
            </p>
          )}
        </div>

        {/* Tags */}
        <div className="px-5 pb-5 flex flex-wrap gap-1.5">
          {project.tags.map((tag) => (
            <Tag key={tag} label={`# ${tag}`} />
          ))}
        </div>

        {/* iOS-style action bar */}
        <div className="border-t border-gray-100 grid grid-cols-3 divide-x divide-gray-100">
          {[
            {
              icon: <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />,
              label: "Edit",
            },
            {
              icon: <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />,
              label: "Share",
            },
            {
              icon: <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />,
              label: "More",
            },
          ].map(({ icon, label }) => (
            <button
              key={label}
              className="flex flex-col items-center gap-1 py-3 text-gray-400 hover:text-purple-500 hover:bg-purple-50 transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                {icon}
              </svg>
              <span className="text-[11px]">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
