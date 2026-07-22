/* ─── Knit Tint Cache ──────────────────────────────────────────────────────── */
const _knitTintCache={};
function _tintKnitSvg(id,W,H,color){
  const key=`knt|${id}|${W}x${H}|${color}`;
  if(_knitTintCache[key])return _knitTintCache[key];
  const src=KNIT_SYM_SRC[id];
  if(!src)return null;
  const img=getCachedImg(src);
  const isSvg=src.startsWith('data:image/svg');
  if(!img.complete||(!img.naturalWidth&&!isSvg))return null;
  const oc=document.createElement('canvas');
  oc.width=Math.ceil(W);oc.height=Math.ceil(H);
  const ox=oc.getContext('2d');
  ox.drawImage(img,0,0,oc.width,oc.height);
  ox.globalCompositeOperation='source-in';
  ox.fillStyle=color;
  ox.fillRect(0,0,oc.width,oc.height);
  _knitTintCache[key]=oc;
  return oc;
}

/* ─── Knit Symbol Icon (for toolbar) ──────────────────────────────────────── */
function KnitSymIcon({id,size=28,color="#1C160E",style={}}){
  const src=KNIT_SYM_SRC[id];
  const meta=KNIT_SYM_BY_ID[id];
  if(!src||!meta)return React.createElement('div',{style:{width:size*meta?.w||size,height:size,...style}});
  const filter=getColorFilter(color);
  return React.createElement('img',{src,width:size*meta.w,height:size*meta.h,style:{filter,display:'block',maxWidth:'100%',...style},alt:meta.abbrev});
}

/* ─── Knit Symbol Button (toolbar chip) ────────────────────────────────────── */
function KnitSymBtn({id,active,activeColor,onClick}){
  const meta=KNIT_SYM_BY_ID[id];
  if(!meta)return null;
  const btnColor=active?activeColor:'#6B7280';
  return(
    <button type="button" onClick={onClick}
      title={meta.name}
      style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:1,
        padding:'3px 5px',borderRadius:8,border:`1.5px solid ${active?activeColor:'#E5E7EB'}`,
        background:active?`${activeColor}22`:'white',cursor:'pointer',flexShrink:0,minWidth:36}}>
      <KnitSymIcon id={id} size={22} color={btnColor}/>
      <span style={{fontSize:8,fontWeight:700,color:btnColor,letterSpacing:'0.02em'}}>{meta.abbrev}</span>
    </button>
  );
}

/* ─── Knit Pattern Maker ─────────────────────────────────────────────────────
   Stitch data: [{key, id, color, col, row}]
   col/row are integer grid coordinates (0-based, row increases downward).
   Multi-cell symbols occupy [col..col+w-1] × [row..row+h-1].
   ─────────────────────────────────────────────────────────────────────────── */
function KnitPatternMaker({initialStitches,onStitchesChange,yarnColors,onSave}){
  const canvasRef=useRef(null);
  const containerRef=useRef(null);
  const[stitches,setStitches]=useState(()=>initialStitches||[]);
  const[pan,setPan]=useState({x:32,y:32});
  const[activeTool,setActiveTool]=useState('place');
  const[activeSymId,setActiveSymId]=useState(KNIT_DEFAULT_PINS[0]||'k');
  const[activeColor,setActiveColor]=useState(yarnColors?.[0]?.color||'#778EE3');
  const[latestPlacedKey,setLatestPlacedKey]=useState(null);
  const[selectedKey,setSelectedKey]=useState(null);
  const[hoverCell,setHoverCell]=useState(null); // {col,row}
  const[showMore,setShowMore]=useState(false);
  const[_imgTick,_setImgTick]=useState(0);
  const[history,setHistory]=useState([]);
  const[future,setFuture]=useState([]);
  const ir=useRef({});
  const stRef=useRef(stitches);
  stRef.current=stitches;
  const{pinnedIds,pin,unpin,isPinned,isFull}=useToolbarPins('knt_pins',KNIT_DEFAULT_PINS);

  useEffect(()=>_onSvgLoad(()=>_setImgTick(t=>t+1)),[]);

  // Notify parent on change
  useEffect(()=>{if(onStitchesChange)onStitchesChange(stitches);},[stitches]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const CW=KNIT_CELL_W,CH=KNIT_CELL_H;

  function canvasToCell(mx,my,p){
    return{col:Math.floor((mx-(p||pan).x)/CW),row:Math.floor((my-(p||pan).y)/CH)};
  }

  function cellToCanvas(col,row,p){
    return{sx:(p||pan).x+col*CW,sy:(p||pan).y+row*CH};
  }

  function isOccupied(col,row,excludeKey){
    return stRef.current.some(s=>{
      if(s.key===excludeKey)return false;
      const m=KNIT_SYM_BY_ID[s.id];if(!m)return false;
      return col>=s.col&&col<s.col+m.w&&row>=s.row&&row<s.row+m.h;
    });
  }

  function stAt(mx,my){
    const cx=(mx-pan.x)/CW,cy=(my-pan.y)/CH;
    for(let i=stRef.current.length-1;i>=0;i--){
      const s=stRef.current[i];
      const m=KNIT_SYM_BY_ID[s.id];if(!m)continue;
      if(cx>=s.col&&cx<s.col+m.w&&cy>=s.row&&cy<s.row+m.h)return s;
    }
    return null;
  }

  function commitStitches(next){
    setHistory(h=>[...h.slice(-39),stRef.current]);
    setFuture([]);
    setStitches(next);
  }

  const undo=()=>{
    if(!history.length)return;
    const prev=history[history.length-1];
    setFuture(f=>[stRef.current,...f.slice(0,39)]);
    setStitches(prev);
    setHistory(h=>h.slice(0,-1));
  };
  const redo=()=>{
    if(!future.length)return;
    const next=future[0];
    setHistory(h=>[...h,stRef.current]);
    setStitches(next);
    setFuture(f=>f.slice(1));
  };

  // ── Canvas render ─────────────────────────────────────────────────────────
  useEffect(()=>{
    const canvas=canvasRef.current;
    if(!canvas)return;
    const dpr=window.devicePixelRatio||1;
    const W=canvas.offsetWidth||320;
    const H=canvas.offsetHeight||480;
    if(canvas.width!==W*dpr||canvas.height!==H*dpr){
      canvas.width=W*dpr;canvas.height=H*dpr;
    }
    const ctx=canvas.getContext('2d');
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,W,H);

    // Grid lines
    const c0=Math.floor(-pan.x/CW)-1,c1=Math.ceil((W-pan.x)/CW)+1;
    const r0=Math.floor(-pan.y/CH)-1,r1=Math.ceil((H-pan.y)/CH)+1;
    ctx.strokeStyle='#E5E7EB';ctx.lineWidth=0.5;
    for(let c=c0;c<=c1;c++){const x=pan.x+c*CW;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(let r=r0;r<=r1;r++){const y=pan.y+r*CH;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}

    // Draw stitches
    stitches.forEach(s=>{
      const m=KNIT_SYM_BY_ID[s.id];if(!m)return;
      const sw=m.w*CW,sh=m.h*CH;
      const sx=pan.x+s.col*CW,sy=pan.y+s.row*CH;
      const tinted=_tintKnitSvg(s.id,sw,sh,s.color);
      if(tinted){ctx.drawImage(tinted,sx,sy);}
      else{
        // Fallback: grey rect with abbrev
        ctx.fillStyle=s.color+'33';ctx.fillRect(sx+1,sy+1,sw-2,sh-2);
        ctx.fillStyle=s.color;ctx.font=`bold ${Math.min(sh*0.55,10)}px sans-serif`;
        ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillText(m.abbrev,sx+sw/2,sy+sh/2);
      }
    });

    // Hover ghost (place tool)
    if(hoverCell&&activeTool==='place'){
      const m=KNIT_SYM_BY_ID[activeSymId];
      if(m){
        const sw=m.w*CW,sh=m.h*CH;
        const sx=pan.x+hoverCell.col*CW,sy=pan.y+hoverCell.row*CH;
        // Check if all cells are free
        let canPlace=true;
        for(let dc=0;dc<m.w;dc++)for(let dr=0;dr<m.h;dr++)
          if(isOccupied(hoverCell.col+dc,hoverCell.row+dr,null)){canPlace=false;break;}
        ctx.globalAlpha=0.45;
        const tinted=_tintKnitSvg(activeSymId,sw,sh,activeColor);
        if(tinted)ctx.drawImage(tinted,sx,sy);
        ctx.globalAlpha=1;
        if(!canPlace){ctx.fillStyle='rgba(239,68,68,0.18)';ctx.fillRect(sx,sy,sw,sh);}
      }
    }

    // Selection highlight
    stitches.forEach(s=>{
      if(s.key!==selectedKey)return;
      const m=KNIT_SYM_BY_ID[s.id];if(!m)return;
      const sw=m.w*CW,sh=m.h*CH;
      const sx=pan.x+s.col*CW,sy=pan.y+s.row*CH;
      ctx.strokeStyle='#778EE3';ctx.lineWidth=2;ctx.setLineDash([]);
      ctx.strokeRect(sx+1,sy+1,sw-2,sh-2);
      ctx.fillStyle='rgba(119,142,227,0.12)';ctx.fillRect(sx+1,sy+1,sw-2,sh-2);
    });

  },[stitches,pan,activeSymId,activeColor,activeTool,hoverCell,selectedKey,_imgTick]);

  // ── Resize observer ───────────────────────────────────────────────────────
  useEffect(()=>{
    if(!containerRef.current)return;
    const ro=new ResizeObserver(()=>_setImgTick(t=>t+1));
    ro.observe(containerRef.current);
    return()=>ro.disconnect();
  },[]);

  // ── Pointer events ────────────────────────────────────────────────────────
  const onMouseDown=useCallback((e)=>{
    if(e.button!==0)return;
    const rect=canvasRef.current.getBoundingClientRect();
    const mx=e.clientX-rect.left,my=e.clientY-rect.top;
    const hit=stAt(mx,my);
    if(hit){
      const canDrag=activeTool==='select'||hit.key===latestPlacedKey;
      console.log('[drag permission]',{activeTool,stitchKey:hit.key,latestPlacedKey,canDrag});
      if(activeTool==='eraser'){
        commitStitches(stRef.current.filter(s=>s.key!==hit.key));
        setSelectedKey(null);setLatestPlacedKey(null);
        ir.current={op:'erased'};return;
      }
      if(canDrag){
        ir.current={op:'drag',key:hit.key,startMX:mx,startMY:my,
          origCol:hit.col,origRow:hit.row,moved:false};
        setSelectedKey(hit.key);
      } else {
        ir.current={op:'pan',startMX:mx,startMY:my,origPan:{...pan},moved:false};
      }
    } else {
      if(activeTool==='place'){
        const{col,row}=canvasToCell(mx,my);
        const m=KNIT_SYM_BY_ID[activeSymId];
        if(!m)return;
        let free=true;
        for(let dc=0;dc<m.w&&free;dc++)for(let dr=0;dr<m.h&&free;dr++)
          if(isOccupied(col+dc,row+dr,null))free=false;
        if(!free)return;
        const newKey=uid();
        commitStitches([...stRef.current,{key:newKey,id:activeSymId,color:activeColor,col,row}]);
        setLatestPlacedKey(newKey);
        setSelectedKey(null);
        console.log('[place symbol]',newKey,activeSymId,activeColor);
        ir.current={op:'placed'};
      } else {
        setSelectedKey(null);
        ir.current={op:'pan',startMX:mx,startMY:my,origPan:{...pan},moved:false};
      }
    }
  },[activeTool,activeSymId,activeColor,pan,latestPlacedKey]);

  const onMouseMove=useCallback((e)=>{
    const rect=canvasRef.current?.getBoundingClientRect();if(!rect)return;
    const mx=e.clientX-rect.left,my=e.clientY-rect.top;
    const d=ir.current;

    // Update hover cell
    if(activeTool==='place'){
      const{col,row}=canvasToCell(mx,my);
      setHoverCell(hc=>hc?.col===col&&hc?.row===row?hc:{col,row});
    }else{setHoverCell(null);}

    if(d.op==='pan'){
      const dx=mx-d.startMX,dy=my-d.startMY;
      if(Math.abs(dx)>2||Math.abs(dy)>2)d.moved=true;
      if(d.moved)setPan({x:d.origPan.x+dx,y:d.origPan.y+dy});
    } else if(d.op==='drag'){
      const dx=mx-d.startMX,dy=my-d.startMY;
      if(Math.abs(dx)>3||Math.abs(dy)>3)d.moved=true;
      if(d.moved){
        const newCol=d.origCol+Math.round(dx/CW);
        const newRow=d.origRow+Math.round(dy/CH);
        const m=KNIT_SYM_BY_ID[stRef.current.find(s=>s.key===d.key)?.id];
        if(!m)return;
        let free=true;
        for(let dc=0;dc<m.w&&free;dc++)for(let dr=0;dr<m.h&&free;dr++)
          if(isOccupied(newCol+dc,newRow+dr,d.key))free=false;
        if(free){
          setStitches(prev=>prev.map(s=>s.key===d.key?{...s,col:newCol,row:newRow}:s));
        }
      }
    }
  },[activeTool,pan]);

  const onMouseUp=useCallback((e)=>{
    const d=ir.current;
    if(d.op==='drag'&&d.moved){
      // Commit final position to history
      setHistory(h=>[...h.slice(-39),history[history.length-1]??stRef.current]);
    }
    ir.current={};
  },[]);

  const onMouseLeave=useCallback(()=>{setHoverCell(null);ir.current={};},[]);

  const onContextMenu=useCallback((e)=>{
    e.preventDefault();
    const rect=canvasRef.current?.getBoundingClientRect();if(!rect)return;
    const mx=e.clientX-rect.left,my=e.clientY-rect.top;
    const hit=stAt(mx,my);
    if(hit){commitStitches(stRef.current.filter(s=>s.key!==hit.key));setSelectedKey(null);}
  },[]);

  // Keyboard shortcuts
  useEffect(()=>{
    const onKey=(e)=>{
      if(e.key==='Delete'||e.key==='Backspace'){
        if(selectedKey){commitStitches(stRef.current.filter(s=>s.key!==selectedKey));setSelectedKey(null);}
      }
      if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();if(e.shiftKey)redo();else undo();}
      if((e.ctrlKey||e.metaKey)&&e.key==='y'){e.preventDefault();redo();}
    };
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  },[selectedKey,undo,redo]);

  // ── Toolbar categories for More panel ────────────────────────────────────
  const moreGroups=[
    {label:'Basic',items:KNIT_SYMS.filter(s=>s.cat==='basic')},
    {label:'Yarn Over',items:KNIT_SYMS.filter(s=>s.cat==='yo')},
    {label:'Increases',items:KNIT_SYMS.filter(s=>s.cat==='increase')},
    {label:'Decreases',items:KNIT_SYMS.filter(s=>s.cat==='decrease')},
    {label:'Slip',items:KNIT_SYMS.filter(s=>s.cat==='slip')},
    {label:'Dip',items:KNIT_SYMS.filter(s=>s.cat==='dip')},
    {label:'Twists',items:KNIT_SYMS.filter(s=>s.cat==='twist')},
    {label:'Cables',items:KNIT_SYMS.filter(s=>s.cat==='cable')},
    {label:'More',items:KNIT_SYMS.filter(s=>s.cat==='more')},
  ].filter(g=>g.items.length>0);

  const btnSt={display:'flex',alignItems:'center',justifyContent:'center',width:30,height:30,
    borderRadius:8,border:'1.5px solid #E5E7EB',background:'white',cursor:'pointer',flexShrink:0};

  return(
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden',background:'#FAFAFA',position:'relative'}}>
      {/* Top bar: tools + undo/redo + save */}
      <div style={{background:'white',borderBottom:'1px solid #EFEFEF',padding:'6px 10px',flexShrink:0,display:'flex',alignItems:'center',gap:4}}>
        <button type="button" title="Select / Move" onClick={()=>{setActiveTool('select');setSelectedKey(null);setHoverCell(null);}}
          style={{...btnSt,border:`1.5px solid ${activeTool==='select'?'#778EE3':'#E5E7EB'}`,background:activeTool==='select'?'#DDE3F8':'white'}}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={activeTool==='select'?'#778EE3':'#6B7280'} strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5"/></svg>
        </button>
        <button type="button" title="Place Symbol" onClick={()=>setActiveTool('place')}
          style={{...btnSt,border:`1.5px solid ${activeTool==='place'?'#778EE3':'#E5E7EB'}`,background:activeTool==='place'?'#DDE3F8':'white'}}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={activeTool==='place'?'#778EE3':'#6B7280'} strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14"/></svg>
        </button>
        <button type="button" title="Eraser" onClick={()=>{setActiveTool('eraser');setSelectedKey(null);setHoverCell(null);}}
          style={{...btnSt,border:`1.5px solid ${activeTool==='eraser'?'#EF4444':'#E5E7EB'}`,background:activeTool==='eraser'?'#FEF2F2':'white'}}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={activeTool==='eraser'?'#EF4444':'#6B7280'} strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M20 20H7L3 16l10-10 7 7-3.5 3.5"/><path strokeLinecap="round" strokeLinejoin="round" d="M6.5 17.5l4-4"/></svg>
        </button>
        <div style={{width:1,height:16,background:'#E5E7EB',margin:'0 2px'}}/>
        <button type="button" title="Undo" onClick={undo} disabled={!history.length}
          style={{...btnSt,opacity:history.length?1:0.3,cursor:history.length?'pointer':'default'}}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.84"/></svg>
        </button>
        <button type="button" title="Redo" onClick={redo} disabled={!future.length}
          style={{...btnSt,opacity:future.length?1:0.3,cursor:future.length?'pointer':'default'}}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-3.84"/></svg>
        </button>
        <div style={{marginLeft:'auto',display:'flex',gap:4,alignItems:'center'}}>
          {onSave&&<button type="button" onClick={onSave}
            style={{padding:'4px 12px',borderRadius:7,border:'none',background:'#778EE3',color:'white',cursor:'pointer',fontSize:10,fontWeight:700}}>✓ Save</button>}
        </div>
      </div>

      {/* Symbol palette */}
      <div style={{background:'white',borderBottom:'1px solid #EFEFEF',flexShrink:0,display:'flex',alignItems:'stretch',position:'relative',zIndex:100}}>
        <div style={{display:'flex',gap:3,overflowX:'auto',flex:1,padding:'4px 4px 4px 10px',alignItems:'center'}}>
          {pinnedIds.map(id=>(
            <KnitSymBtn key={id} id={id}
              active={activeSymId===id&&activeTool==='place'}
              activeColor={activeColor}
              onClick={()=>{setActiveSymId(id);setActiveTool('place');console.log('[select symbol]',id);}}/>
          ))}
        </div>
        {/* More button */}
        <div style={{flexShrink:0,display:'flex',padding:'4px 6px 4px 2px',borderLeft:'1px solid #EFEFEF',position:'relative'}}>
          <button type="button" onClick={()=>setShowMore(v=>!v)}
            style={{...btnSt,border:`1.5px solid ${showMore?'#778EE3':'#E5E7EB'}`,background:showMore?'#DDE3F8':'white',width:'auto',padding:'0 8px',fontSize:11,fontWeight:700,gap:4,color:showMore?'#778EE3':'#6B7280'}}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            More
          </button>
          {/* More panel */}
          {showMore&&(
            <div style={{position:'fixed',bottom:0,left:0,right:0,maxHeight:'55vh',background:'white',
              borderTop:'1px solid #E5E7EB',overflowY:'auto',zIndex:200,padding:'10px 12px 20px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                <span style={{fontSize:11,fontWeight:700,color:'#374151',letterSpacing:'0.05em'}}>ALL KNIT SYMBOLS</span>
                <button onClick={()=>setShowMore(false)} style={{border:'none',background:'none',cursor:'pointer',fontSize:16,color:'#6B7280',lineHeight:1}}>×</button>
              </div>
              {moreGroups.map(g=>(
                <div key={g.label} style={{marginBottom:12}}>
                  <div style={{fontSize:9,fontWeight:700,color:'#9CA3AF',letterSpacing:'0.08em',marginBottom:5}}>{g.label.toUpperCase()}</div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                    {g.items.map(sym=>{
                      const pinned=isPinned(sym.id);
                      return(
                        <div key={sym.id} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:1,position:'relative'}}>
                          <KnitSymBtn id={sym.id}
                            active={activeSymId===sym.id&&activeTool==='place'}
                            activeColor={activeColor}
                            onClick={()=>{setActiveSymId(sym.id);setActiveTool('place');setShowMore(false);}}/>
                          <button type="button"
                            onClick={(e)=>{e.stopPropagation();pinned?unpin(sym.id):pin(sym.id);}}
                            style={{fontSize:8,color:pinned?'#778EE3':'#CCC',background:'none',border:'none',cursor:'pointer',padding:'1px 2px',fontWeight:700}}>
                            {pinned?'★ pinned':'☆ pin'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Color swatches */}
      {yarnColors?.length>0&&(
        <div style={{background:'white',borderBottom:'1px solid #EFEFEF',flexShrink:0,display:'flex',gap:5,padding:'5px 10px',overflowX:'auto',alignItems:'center'}}>
          {yarnColors.map((y,i)=>(
            <button key={i} type="button" title={y.name||y.color} onClick={()=>setActiveColor(y.color)}
              style={{width:22,height:22,borderRadius:999,background:y.color,flexShrink:0,cursor:'pointer',
                border:`2.5px solid ${activeColor===y.color?'#1C160E':'transparent'}`,outline:'none'}}>
            </button>
          ))}
        </div>
      )}

      {/* Canvas */}
      <div ref={containerRef} style={{flex:1,minHeight:0,overflow:'hidden',position:'relative',cursor:activeTool==='eraser'?'crosshair':'crosshair'}}>
        <canvas ref={canvasRef} style={{display:'block',width:'100%',height:'100%'}}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
          onContextMenu={onContextMenu}/>
        {/* Overlay: click to dismiss More panel */}
        {showMore&&<div style={{position:'absolute',inset:0,zIndex:199}} onClick={()=>setShowMore(false)}/>}
      </div>
    </div>
  );
}
