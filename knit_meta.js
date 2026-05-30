/* ── Knit Symbol Metadata ─────────────────────────────────────────────────── */
const KNIT_CELL_W=32,KNIT_CELL_H=24; // px per grid cell (32:24 ≈ 29:22 SVG ratio)
const KNIT_DEFAULT_PINS=["k","p","yo","k2tog","ssk","m1l","m1r","sl1","bo","ktbl","c4f","c4b"];
const KNIT_SYMS=[
  // ── Basic ──────────────────────────────────────────────────────────────────
  {id:"k",     name:"Knit",              abbrev:"K",      file:"knit",                 w:1,h:1,cat:"basic"},
  {id:"p",     name:"Purl",              abbrev:"P",      file:"purl",                 w:1,h:1,cat:"basic"},
  {id:"ktbl",  name:"Knit TBL",          abbrev:"ktbl",   file:"twist",                w:1,h:1,cat:"basic"},
  {id:"ptbl",  name:"Purl TBL",          abbrev:"ptbl",   file:"twist_purl",           w:1,h:1,cat:"basic"},
  {id:"bo",    name:"Bind Off",          abbrev:"BO",     file:"bindoff",              w:1,h:1,cat:"basic"},
  {id:"nostitch",name:"No Stitch",       abbrev:"—",      file:"nostitch",             w:1,h:1,cat:"basic"},
  {id:"ktbls", name:"Knit TBL Straight", abbrev:"ktbl2",  file:"twist.straight",       w:1,h:1,cat:"more"},
  // ── Yarn Over ──────────────────────────────────────────────────────────────
  {id:"yo",    name:"Yarn Over",         abbrev:"YO",     file:"yarnover",             w:1,h:1,cat:"yo"},
  {id:"yotw",  name:"YO Twisted",        abbrev:"YOT",    file:"yarnovertwist",        w:1,h:1,cat:"yo"},
  // ── Increase ───────────────────────────────────────────────────────────────
  {id:"m1l",   name:"Make 1 Left",       abbrev:"M1L",    file:"increaseleft",         w:1,h:1,cat:"increase"},
  {id:"m1r",   name:"Make 1 Right",      abbrev:"M1R",    file:"increaseright",        w:1,h:1,cat:"increase"},
  {id:"inc1to3",name:"1 into 3",         abbrev:"kyk",    file:"increase1to3",         w:1,h:1,cat:"increase"},
  // ── Decrease ───────────────────────────────────────────────────────────────
  {id:"ssk",   name:"SSK",               abbrev:"ssk",    file:"decreaseleft",         w:1,h:1,cat:"decrease"},
  {id:"ssp",   name:"SSP",               abbrev:"ssp",    file:"decreaseleft_purl",    w:1,h:1,cat:"decrease"},
  {id:"k2tog", name:"K2tog",             abbrev:"k2tog",  file:"decreaseright",        w:1,h:1,cat:"decrease"},
  {id:"p2tog", name:"P2tog",             abbrev:"p2tog",  file:"decreaseright_purl",   w:1,h:1,cat:"decrease"},
  {id:"sk2p",  name:"SK2P",              abbrev:"sk2p",   file:"decrease3to1centered", w:1,h:1,cat:"decrease"},
  {id:"sssk",  name:"SSSK",              abbrev:"sssk",   file:"decrease3to1left",     w:1,h:1,cat:"decrease"},
  {id:"k3tog", name:"K3tog",             abbrev:"k3tog",  file:"decrease3to1right",    w:1,h:1,cat:"decrease"},
  {id:"dec4l", name:"Dec 4→1 L",         abbrev:"dec4l",  file:"decrease4to1left",     w:1,h:1,cat:"decrease"},
  {id:"dec4r", name:"Dec 4→1 R",         abbrev:"dec4r",  file:"decrease4to1right",    w:1,h:1,cat:"decrease"},
  {id:"dec5c", name:"Dec 5→1 C",         abbrev:"dec5c",  file:"decrease5to1centered", w:1,h:1,cat:"decrease"},
  {id:"dec5l", name:"Dec 5→1 L",         abbrev:"dec5l",  file:"decrease5to1left",     w:1,h:1,cat:"decrease"},
  {id:"dec5r", name:"Dec 5→1 R",         abbrev:"dec5r",  file:"decrease5to1right",    w:1,h:1,cat:"decrease"},
  {id:"dec7",  name:"Dec 7→1",           abbrev:"dec7",   file:"decrease7to1",         w:1,h:1,cat:"decrease"},
  {id:"dec7l", name:"Dec 7→1 L",         abbrev:"dec7l",  file:"decrease7to1left",     w:1,h:1,cat:"decrease"},
  {id:"dec7r", name:"Dec 7→1 R",         abbrev:"dec7r",  file:"decrease7to1right",    w:1,h:1,cat:"decrease"},
  {id:"ssk2w", name:"SSK (wide)",        abbrev:"ssk",    file:"decreaseleft.2w",      w:2,h:1,cat:"more"},
  {id:"k2tog2w",name:"K2tog (wide)",     abbrev:"k2tog",  file:"decreaseright.2w",     w:2,h:1,cat:"more"},
  // ── Slip ───────────────────────────────────────────────────────────────────
  {id:"sl1",   name:"Slip 1",            abbrev:"sl1",    file:"slip",                 w:1,h:2,cat:"slip"},
  {id:"sl1wyif",name:"Slip wyif",        abbrev:"sl1wyif",file:"slipwyif",             w:1,h:2,cat:"slip"},
  {id:"passL", name:"Pass Left",         abbrev:"passL",  file:"passleft",             w:2,h:1,cat:"slip"},
  {id:"passR", name:"Pass Right",        abbrev:"passR",  file:"passright",            w:2,h:1,cat:"slip"},
  {id:"slL",   name:"Slant Left",        abbrev:"slL",    file:"slantleft",            w:1,h:1,cat:"more"},
  {id:"slR",   name:"Slant Right",       abbrev:"slR",    file:"slantright",           w:1,h:1,cat:"more"},
  // ── Dip Stitch ─────────────────────────────────────────────────────────────
  {id:"dip",   name:"Dip Stitch",        abbrev:"dip",    file:"dip",                  w:1,h:2,cat:"dip"},
  {id:"dipp",  name:"Dip Purl",          abbrev:"dipP",   file:"dip_purl",             w:1,h:2,cat:"dip"},
  {id:"dipTw", name:"Dip Twist",         abbrev:"dipTw",  file:"diptwist",             w:1,h:2,cat:"dip"},
  // ── Cross / Twist ──────────────────────────────────────────────────────────
  {id:"crossL",name:"Cross Left (RT)",   abbrev:"RT",     file:"crossleft",            w:2,h:1,cat:"twist"},
  {id:"crossLp",name:"Cross Left Purl",  abbrev:"RTP",    file:"crossleft_purl",       w:2,h:1,cat:"twist"},
  {id:"crossR",name:"Cross Right (LT)",  abbrev:"LT",     file:"crossright",           w:2,h:1,cat:"twist"},
  {id:"crossRp",name:"Cross Right Purl", abbrev:"LTP",    file:"crossright_purl",      w:2,h:1,cat:"twist"},
  {id:"twL",   name:"Twist Left",        abbrev:"T2L",    file:"twistleft",            w:2,h:1,cat:"twist"},
  {id:"twLp",  name:"Twist Left Purl",   abbrev:"T2LP",   file:"twistleft_purl",       w:2,h:1,cat:"twist"},
  {id:"twR",   name:"Twist Right",       abbrev:"T2R",    file:"twistright",           w:2,h:1,cat:"twist"},
  {id:"twRp",  name:"Twist Right Purl",  abbrev:"T2RP",   file:"twistright_purl",      w:2,h:1,cat:"twist"},
  // ── Cable (2/1) ────────────────────────────────────────────────────────────
  {id:"c2o1l", name:"2/1 LC",            abbrev:"2/1LC",  file:"c2over1left",          w:3,h:1,cat:"cable"},
  {id:"c2o1lp",name:"2/1 LPC",           abbrev:"2/1LPC", file:"c2over1left-purl",     w:3,h:1,cat:"cable"},
  {id:"c2o1r", name:"2/1 RC",            abbrev:"2/1RC",  file:"c2over1right",         w:3,h:1,cat:"cable"},
  {id:"c2o1rp",name:"2/1 RPC",           abbrev:"2/1RPC", file:"c2over1right-purl",    w:3,h:1,cat:"cable"},
  // ── Cable (2/2) ────────────────────────────────────────────────────────────
  {id:"c4f",   name:"C4 Front",          abbrev:"C4F",    file:"c2over2left",          w:4,h:1,cat:"cable"},
  {id:"c4fp",  name:"C4 Front Purl",     abbrev:"C4FP",   file:"c2over2left-purl",     w:4,h:1,cat:"cable"},
  {id:"c4b",   name:"C4 Back",           abbrev:"C4B",    file:"c2over2right",         w:4,h:1,cat:"cable"},
  {id:"c4bp",  name:"C4 Back Purl",      abbrev:"C4BP",   file:"c2over2right-purl",    w:4,h:1,cat:"cable"},
];
const KNIT_SYM_BY_ID=Object.fromEntries(KNIT_SYMS.map(s=>[s.id,s]));
const KNIT_SYM_SRC={};
KNIT_SYMS.forEach(s=>{KNIT_SYM_SRC[s.id]=KNIT_SYM_B64[s.file];});