// CrochetNoteCard Figma Generator
// Recreates the CrochetNoteCard.jsx layout as a Figma design

const C = {
  colorway:  { r: 0.486, g: 0.604, b: 0.557 }, // #7C9A8E
  white:     { r: 1,     g: 1,     b: 1     },
  gray900:   { r: 0.11,  g: 0.11,  b: 0.11  },
  gray600:   { r: 0.30,  g: 0.33,  b: 0.38  },
  gray500:   { r: 0.42,  g: 0.45,  b: 0.50  },
  gray400:   { r: 0.60,  g: 0.64,  b: 0.69  },
  gray100:   { r: 0.95,  g: 0.96,  b: 0.97  },
  purple600: { r: 0.58,  g: 0.18,  b: 0.95  },
  blue100:   { r: 0.82,  g: 0.91,  b: 0.99  },
  blue600:   { r: 0.22,  g: 0.53,  b: 0.89  },
  red500:    { r: 0.94,  g: 0.26,  b: 0.21  },
  green100:  { r: 0.82,  g: 0.97,  b: 0.87  },
  green600:  { r: 0.13,  g: 0.68,  b: 0.34  },
};

async function font(style = "Regular") {
  await figma.loadFontAsync({ family: "Inter", style });
}

async function txt(content, size, color, style = "Regular") {
  await font(style);
  const t = figma.createText();
  t.fontName = { family: "Inter", style };
  t.fontSize = size;
  t.fills = [{ type: "SOLID", color }];
  t.characters = String(content);
  return t;
}

function rect(w, h, color, radius = 0) {
  const r = figma.createRectangle();
  r.resize(w, h);
  r.fills = [{ type: "SOLID", color }];
  r.cornerRadius = radius;
  return r;
}

function hline(w = 310) {
  const d = rect(w, 1, C.gray100);
  d.name = "Divider";
  return d;
}

function hframe(name, w, h) {
  const f = figma.createFrame();
  f.name = name;
  f.layoutMode = "HORIZONTAL";
  f.counterAxisAlignItems = "CENTER";
  f.fills = [];
  if (w && h) f.resize(w, h);
  return f;
}

function vframe(name, w, h) {
  const f = figma.createFrame();
  f.name = name;
  f.layoutMode = "VERTICAL";
  f.fills = [];
  if (w && h) f.resize(w, h);
  return f;
}

async function buildCard() {
  // ── Phone frame ──────────────────────────────────────
  const phone = figma.createFrame();
  phone.name = "iPhone 14 – CrochetNoteCard";
  phone.resize(390, 844);
  phone.fills = [{ type: "SOLID", color: { r: 0.95, g: 0.95, b: 0.95 } }];
  phone.clipsContent = false;

  // ── Card ─────────────────────────────────────────────
  const card = figma.createFrame();
  card.name = "Card";
  card.resize(350, 100); // height grows as we add children
  card.x = 20;
  card.y = 60;
  card.fills = [{ type: "SOLID", color: C.white }];
  card.cornerRadius = 24;
  card.clipsContent = true;
  card.effects = [{
    type: "DROP_SHADOW",
    color: { r: 0, g: 0, b: 0, a: 0.08 },
    offset: { x: 0, y: 2 },
    radius: 20,
    spread: 0,
    visible: true,
    blendMode: "NORMAL",
  }];

  let cy = 0; // cursor y inside card

  // ── HEADER ───────────────────────────────────────────
  {
    const header = figma.createFrame();
    header.name = "Header";
    header.resize(350, 88);
    header.fills = [{
      type: "GRADIENT_LINEAR",
      gradientTransform: [[0.866, 0.5, 0], [-0.5, 0.866, 0.067]],
      gradientStops: [
        { position: 0, color: { ...C.colorway, a: 0.09 } },
        { position: 1, color: { ...C.colorway, a: 0.03 } },
      ],
    }];

    // Title row
    const titleRow = hframe("TitleRow", 310, 40);
    titleRow.x = 20;
    titleRow.y = 18;
    titleRow.primaryAxisAlignItems = "SPACE_BETWEEN";

    const swatchGroup = hframe("SwatchGroup", 0, 40);
    swatchGroup.itemSpacing = 12;
    swatchGroup.layoutMode = "HORIZONTAL";

    const swatch = rect(40, 40, C.colorway, 14);
    swatch.name = "ColorSwatch";

    const titleCol = vframe("TitleCol");
    titleCol.itemSpacing = 3;
    titleCol.appendChild(await txt("Autumn Harvest Shawl", 17, C.gray900, "Semi Bold"));
    titleCol.appendChild(await txt("Hitchhiker Pattern", 13, C.gray400));

    swatchGroup.appendChild(swatch);
    swatchGroup.appendChild(titleCol);
    titleRow.appendChild(swatchGroup);

    // Bookmark icon placeholder
    const bm = rect(20, 20, { r: 0.85, g: 0.85, b: 0.85 }, 3);
    bm.name = "BookmarkIcon";
    titleRow.appendChild(bm);

    // Status row
    const statusRow = hframe("StatusRow", 310, 24);
    statusRow.x = 20;
    statusRow.y = 64;
    statusRow.itemSpacing = 8;

    const badge = hframe("StatusBadge");
    badge.fills = [{ type: "SOLID", color: C.blue100 }];
    badge.cornerRadius = 20;
    badge.paddingLeft = 10; badge.paddingRight = 10;
    badge.paddingTop = 4;   badge.paddingBottom = 4;
    badge.itemSpacing = 6;
    const dot = rect(6, 6, C.blue600, 3);
    badge.appendChild(dot);
    badge.appendChild(await txt("In Progress", 12, C.blue600, "Medium"));

    statusRow.appendChild(badge);
    statusRow.appendChild(await txt("High Priority", 12, C.red500, "Medium"));

    header.appendChild(titleRow);
    header.appendChild(statusRow);
    header.y = cy; card.appendChild(header); cy += 88;
  }

  // Divider
  { const d = hline(310); d.x = 20; d.y = cy; card.appendChild(d); cy += 1; }

  // ── STATS GRID ───────────────────────────────────────
  {
    const grid = hframe("StatsGrid", 350, 62);
    grid.primaryAxisAlignItems = "SPACE_BETWEEN";
    grid.fills = [];

    for (const [label, value] of [["Hook", "3.5mm"], ["Weight", "Fingering"], ["Skeins", "2"]]) {
      const col = vframe(`Stat_${label}`, 116, 62);
      col.counterAxisAlignItems = "CENTER";
      col.primaryAxisAlignItems = "CENTER";
      col.itemSpacing = 3;
      col.paddingTop = 12; col.paddingBottom = 12;
      col.appendChild(await txt(value, 15, C.gray900, "Semi Bold"));
      col.appendChild(await txt(label, 11, C.gray400));
      grid.appendChild(col);
    }

    grid.y = cy; card.appendChild(grid); cy += 62;
  }

  // Divider
  { const d = hline(310); d.x = 20; d.y = cy; card.appendChild(d); cy += 1; }

  // ── PROGRESS ─────────────────────────────────────────
  {
    const section = vframe("Progress", 350, 76);
    section.paddingLeft = 20; section.paddingRight = 20;
    section.paddingTop = 16;  section.paddingBottom = 8;
    section.itemSpacing = 8;

    const row = hframe("ProgressRow", 310, 16);
    row.primaryAxisAlignItems = "SPACE_BETWEEN";
    row.appendChild(await txt("Progress", 13, C.gray500, "Medium"));
    row.appendChild(await txt("128 / 200 rows", 13, C.purple600, "Semi Bold"));
    section.appendChild(row);

    // Track
    const track = rect(310, 6, C.gray100, 3);
    track.name = "ProgressTrack";
    section.appendChild(track);

    // Fill (64%)
    const fill = figma.createRectangle();
    fill.name = "ProgressFill";
    fill.resize(198, 6);
    fill.cornerRadius = 3;
    fill.fills = [{
      type: "GRADIENT_LINEAR",
      gradientTransform: [[1, 0, 0], [0, 1, 0]],
      gradientStops: [
        { position: 0, color: { r: 0.97, g: 0.45, b: 0.65, a: 1 } },
        { position: 1, color: { r: 0.58, g: 0.18, b: 0.95, a: 1 } },
      ],
    }];
    fill.x = 0; fill.y = 0;
    track.appendChild(fill);

    section.appendChild(await txt("64% complete", 11, C.gray400));

    section.y = cy; card.appendChild(section); cy += 76;
  }

  // Divider
  { const d = hline(310); d.x = 20; d.y = cy; card.appendChild(d); cy += 1; }

  // ── YARN + DUE DATE ──────────────────────────────────
  {
    const row = hframe("YarnRow", 350, 44);
    row.paddingLeft = 20; row.paddingRight = 20;
    row.primaryAxisAlignItems = "SPACE_BETWEEN";
    row.fills = [];

    const yarnGroup = hframe("Yarn", 0, 20);
    yarnGroup.itemSpacing = 8;
    const yarnIcon = rect(16, 16, { r: 0.97, g: 0.51, b: 0.67 }, 8);
    yarnIcon.name = "YarnIcon";
    yarnGroup.appendChild(yarnIcon);
    yarnGroup.appendChild(await txt("Malabrigo Sock — Aguas", 13, C.gray600));

    const dueBadge = hframe("DueBadge");
    dueBadge.fills = [{ type: "SOLID", color: { r: 0.95, g: 0.96, b: 0.97 } }];
    dueBadge.cornerRadius = 20;
    dueBadge.paddingLeft = 8; dueBadge.paddingRight = 8;
    dueBadge.paddingTop = 3;  dueBadge.paddingBottom = 3;
    dueBadge.appendChild(await txt("32d left", 12, C.gray400, "Medium"));

    row.appendChild(yarnGroup);
    row.appendChild(dueBadge);

    row.y = cy; card.appendChild(row); cy += 44;
  }

  // Divider
  { const d = hline(310); d.x = 20; d.y = cy; card.appendChild(d); cy += 1; }

  // ── NOTES (collapsed) ────────────────────────────────
  {
    const notes = hframe("Notes", 350, 40);
    notes.paddingLeft = 20; notes.paddingRight = 20;
    notes.primaryAxisAlignItems = "SPACE_BETWEEN";
    notes.fills = [];

    notes.appendChild(await txt("Notes", 13, C.gray500, "Medium"));
    const chevron = rect(16, 16, C.gray100, 3);
    chevron.name = "ChevronIcon";
    notes.appendChild(chevron);

    notes.y = cy; card.appendChild(notes); cy += 40;
  }

  // ── TAGS ─────────────────────────────────────────────
  {
    const tagsRow = hframe("Tags", 350, 36);
    tagsRow.paddingLeft = 20; tagsRow.paddingRight = 20;
    tagsRow.itemSpacing = 6;
    tagsRow.fills = [];

    for (const tag of ["# Shawl", "# Lace", "# Gift"]) {
      const pill = hframe(`Tag_${tag}`);
      pill.fills = [{ type: "SOLID", color: { r: 0.97, g: 0.94, b: 1.0 } }];
      pill.cornerRadius = 20;
      pill.paddingLeft = 8; pill.paddingRight = 8;
      pill.paddingTop = 3;  pill.paddingBottom = 3;
      pill.strokes = [{ type: "SOLID", color: { r: 0.91, g: 0.84, b: 1.0 } }];
      pill.strokeWeight = 1;
      pill.appendChild(await txt(tag, 12, C.purple600, "Medium"));
      tagsRow.appendChild(pill);
    }

    tagsRow.y = cy; card.appendChild(tagsRow); cy += 36;
  }

  // ── ACTION BAR ───────────────────────────────────────
  {
    const bar = figma.createFrame();
    bar.name = "ActionBar";
    bar.resize(350, 56);
    bar.layoutMode = "HORIZONTAL";
    bar.fills = [];
    bar.strokes = [{ type: "SOLID", color: C.gray100 }];
    bar.strokeWeight = 1;
    bar.strokeAlign = "INSIDE";

    for (const label of ["Edit", "Share", "More"]) {
      const btn = vframe(`Btn_${label}`, 116, 56);
      btn.counterAxisAlignItems = "CENTER";
      btn.primaryAxisAlignItems = "CENTER";
      btn.itemSpacing = 4;
      const icon = rect(20, 20, C.gray100, 4);
      icon.name = `${label}Icon`;
      btn.appendChild(icon);
      btn.appendChild(await txt(label, 11, C.gray400));
      bar.appendChild(btn);
    }

    bar.y = cy; card.appendChild(bar); cy += 56;
  }

  // Resize card to fit all content
  card.resize(350, cy);
  phone.appendChild(card);

  figma.currentPage.appendChild(phone);
  figma.viewport.scrollAndZoomIntoView([phone]);
  figma.closePlugin("✅ CrochetNoteCard generated!");
}

buildCard().catch(err => {
  figma.notify("Error: " + err.message, { error: true });
  figma.closePlugin();
});
