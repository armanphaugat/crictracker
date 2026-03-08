import { useState, useEffect } from "react";
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, RadarChart,
  Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, Cell
} from "recharts";

/* ═══════════════════════════════════════════════
   DESIGN TOKENS — WHITE / RED / BLUE
═══════════════════════════════════════════════ */
const T = {
  blue:    "#1741C6",
  blueDark:"#0E2F9F",
  blueLight:"#E8EEFF",
  blueMid: "#4166E8",
  red:     "#D42B2B",
  redDark: "#A81E1E",
  redLight:"#FFF0F0",
  white:   "#FFFFFF",
  offWhite:"#F7F8FC",
  border:  "#E0E6F5",
  text:    "#0D1B4B",
  textMid: "#4A5580",
  textSoft:"#8892B0",
  shadow:  "rgba(23,65,198,0.12)",
};

/* ═══════════════════════════════════════════════
   STORAGE
═══════════════════════════════════════════════ */
const STORE_KEY   = "gully-v9";
const PLAYERS_KEY = "gully-players-v3";

const loadData = async (key) => {
  try { const r = await window.storage.get(key); return r ? JSON.parse(r.value) : null; }
  catch { return null; }
};
const saveData = async (key, val) => {
  try { await window.storage.set(key, JSON.stringify(val)); } catch {}
};

/* ═══════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════ */
const RULES = [
  { icon:"🏏", t:"Batting",    d:"Score runs by hitting the ball. 4 = rolls to boundary. 6 = clears boundary in air." },
  { icon:"❌", t:"Wide Ball",  d:"+1 extra run, re-bowled. NOT a legal delivery. Batsman cannot be dismissed off a wide." },
  { icon:"🔴", t:"No Ball",    d:"+1 extra run. NOT legal. Next ball is a FREE HIT — only run-out dismissal valid." },
  { icon:"⚡", t:"Free Hit",   d:"After every No Ball the next delivery is a Free Hit. Batsman safe except run-out." },
  { icon:"🎯", t:"Dismissals", d:"Bowled · Caught · LBW · Run-Out · Stumped · Hit Wicket · Obstructing field." },
  { icon:"🔄", t:"Overs",      d:"1 over = 6 legal deliveries. Wides and No Balls don't count as legal." },
  { icon:"🏆", t:"Winning",    d:"Team batting second wins by passing the target. Equal = Tie." },
  { icon:"🌟", t:"Gully Rules",d:"Agree local rules BEFORE the match: one-pitch catches, tip-and-run, underarm, etc." },
];

const EMOJIS = ["😎","🔥","💪","⚡","🦁","🐯","🦅","🌟","💥","🎯","👑","🏆"];

const mkBatter = (name, isCaptain=false, isWK=false, emoji="😎") =>
  ({ name, isCaptain, isWK, emoji, runs:0, balls:0, fours:0, sixes:0, dots:0, out:false, outHow:"", isDuck:false, isGoldenDuck:false, retired:false, retiredHurt:false });

const mkBowler = (name, isCaptain=false) =>
  ({ name, isCaptain, overs:0, balls:0, runs:0, wkts:0, wides:0, noBalls:0, dots:0 });

const fmtOvers  = b => { const ov=Math.floor(b/6),bl=b%6; return bl===0&&ov>0?`${ov}.0`:`${ov}.${bl}`; };
const SR        = (r,b) => b>0 ? ((r/b)*100).toFixed(1) : "—";
const ECO       = (r,b) => b>0 ? ((r/b)*6).toFixed(2)  : "—";
const vib       = p => { try { navigator.vibrate?.(p); } catch {} };
const pick      = arr => arr[Math.floor(Math.random()*arr.length)];

/* ═══════════════════════════════════════════════
   COMMENTARY
═══════════════════════════════════════════════ */
const COMM = {
  0:    ["Dot ball! Excellent line and length.","Beaten outside off! No run.","Defended solidly back down the pitch.","Played and missed!"],
  1:    ["Quick single taken!","Pushed into the off-side for one.","Nudged fine leg for a single."],
  2:    ["Two runs! Placed beautifully through covers.","Driven hard, two runs.","Sprinting back for two!"],
  3:    ["THREE! Excellent running!","Placed in the gap, they run three!"],
  4:    ["FOUR! Cracked through the covers!","FOUR! Pulls it fine, races to the rope!","FOUR! Drives magnificently!","FOUR! Cuts hard, beats point!"],
  6:    ["SIX! ENORMOUS HIT! Into orbit!","SIX! MAXIMUM! Pure power!","SIX! COLOSSAL! Crowd goes wild!","SIX! LAUNCHES it!"],
  wide: ["Wide! Radar well off today.","Wasted delivery — straying too far.","Wide ball!"],
  nb:   ["NO BALL! Front foot over the crease!","NO BALL! Free Hit coming!","No Ball! Nightmare for the bowler!"],
  out:  ["OUT! Plumb in front! Stone dead LBW!","WICKET! Caught behind!","OUT! Bowled 'im! Stump cartwheeling!","OUT! Caught at cover!","DISMISSED! Big blow!"],
  dead: ["Dead ball called by the umpire.","Delivery called dead — no runs, no ball counted."],
  retired: ["The batsman has retired hurt — tough luck! Hope they're okay.","Retired hurt — a new batsman comes in.","The physio is on. Retired hurt — innings paused."],
};
const genComm = (type,batter,bowler) => {
  if (type==="out")     return `🔴 ${pick(COMM.out)} ${batter} departs!`;
  if (type==="wide")    return `🟡 ${pick(COMM.wide)}`;
  if (type==="nb")      return `🟣 ${pick(COMM.nb)}`;
  if (type==="dead")    return `⬛ ${pick(COMM.dead)}`;
  if (type==="retired") return `🟠 ${pick(COMM.retired)} ${batter} retires!`;
  if (type===6)         return `🟢 ${pick(COMM[6])} ${batter} hits ${bowler} for a SIX!`;
  if (type===4)         return `🔵 ${pick(COMM[4])} ${batter} off ${bowler}!`;
  return `⚫ ${pick(COMM[type]||COMM[0])}`;
};

/* ═══════════════════════════════════════════════
   MOM SCORING
═══════════════════════════════════════════════ */
const calcMOM = (bat,bowl) => {
  const hasBat  = bat  && bat.balls  > 0;
  const hasBowl = bowl && bowl.balls > 0;
  const bScore  = (() => {
    if (!hasBat) return 0;
    const sr = (bat.runs/bat.balls)*100;
    const srB = sr>100?(sr-100)/10:sr<60?-(60-sr)/15:0;
    return bat.runs + srB + bat.fours*1.5 + bat.sixes*3 - (bat.dots/bat.balls)*8;
  })();
  const wScore  = (() => {
    if (!hasBowl) return 0;
    const eco = (bowl.runs/bowl.balls)*6;
    const ecoB = eco<6?(6-eco)*5:eco>10?-(eco-10)*3:0;
    return bowl.wkts*25 + ecoB;
  })();
  if (hasBat && !hasBowl) return { score:bScore, role:"bat", bScore, wScore:0 };
  if (!hasBat && hasBowl) return { score:wScore, role:"bowl", bScore:0, wScore };
  if (hasBat  && hasBowl) {
    const syn   = bat.runs>=20 && bowl.wkts>=1 ? 15 : 0;
    return { score:bScore*0.55+wScore*0.45+syn, role:"all", bScore, wScore, syn };
  }
  return { score:-999, role:"none", bScore:0, wScore:0 };
};

/* ═══════════════════════════════════════════════
   CANVAS SCORECARD GENERATOR  (feature 23)
═══════════════════════════════════════════════ */
const generateScorecardImage = (G, battingTeam, bowlingTeam) => {
  const W = 800, H = 960;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#F7F8FC";
  ctx.fillRect(0,0,W,H);

  // Top banner
  const grad = ctx.createLinearGradient(0,0,W,120);
  grad.addColorStop(0, "#1741C6");
  grad.addColorStop(1, "#0E2F9F");
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,W,130);

  // Red accent stripe
  ctx.fillStyle = "#D42B2B";
  ctx.fillRect(0,130,W,6);

  // Bat emoji
  ctx.font = "52px serif";
  ctx.fillText("🏏",32,90);

  // Title
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 28px 'Arial Black', sans-serif";
  ctx.fillText("GULLY CRICKET", 105, 65);
  ctx.font = "16px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.fillText("Full Scorecard", 108, 92);

  // Date
  ctx.font = "13px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.textAlign = "right";
  ctx.fillText(new Date().toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}), W-30, 78);
  ctx.textAlign = "left";

  const inn1 = G.inn1Snapshot || null;
  const inn1Batters = inn1 ? inn1.batters : G.batters;
  const inn1Score   = inn1 ? inn1.score   : G.score;
  const inn1Extras  = inn1 ? inn1.extras  : G.extras;
  const inn2Batters = G.inn===2 ? G.batters : [];
  const inn2Score   = G.inn===2 ? G.score   : 0;
  const inn2Extras  = G.inn===2 ? G.extras  : {wides:0,noBalls:0};

  // VS badge
  const midX = W/2;
  ctx.fillStyle = "#E8EEFF";
  ctx.beginPath(); ctx.roundRect(midX-64,148,128,52,12); ctx.fill();
  ctx.fillStyle = "#1741C6";
  ctx.font = "bold 20px 'Arial Black', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${inn1Score}  vs  ${inn2Score}`, midX, 181);
  ctx.font = "11px Arial"; ctx.fillStyle = "#8892B0";
  ctx.fillText(`${battingTeam.name} vs ${bowlingTeam.name}`, midX, 196);
  ctx.textAlign = "left";

  const drawSection = (title, color, rows, startY, extras, innScore) => {
    // Section header
    ctx.fillStyle = color;
    ctx.fillRect(30, startY, W-60, 34);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 14px Arial";
    ctx.fillText(title, 46, startY+22);

    // Column headers
    const cols = [["BATSMAN",180],["R",60],["B",50],["4s",44],["6s",44],["SR",60]];
    let cx = 46;
    ctx.fillStyle = "#8892B0"; ctx.font = "11px Arial";
    cols.forEach(([label,w])=>{ ctx.fillText(label,cx,startY+52); cx+=w; });

    // Rows
    let y = startY + 62;
    rows.filter(b=>b.balls>0||b.out).forEach((b,i)=>{
      if(i%2===0){ ctx.fillStyle="#F0F4FF"; ctx.fillRect(30,y-14,W-60,22); }
      ctx.fillStyle = b.out ? "#B0B8D0" : "#0D1B4B";
      ctx.font = b.out ? "12px Arial" : "bold 12px Arial";
      cx=46;
      const nm = (b.out?"✕ ":"")+b.name+(b.isCaptain?" ©":"")+(b.isWK?" 🧤":"");
      ctx.fillText(nm.slice(0,22),cx,y); cx+=180;
      ctx.fillStyle=b.runs>=50?"#D42B2B":b.runs>=25?"#1741C6":"#0D1B4B";
      ctx.font="bold 13px Arial"; ctx.fillText(b.runs,cx,y); cx+=60;
      ctx.fillStyle="#4A5580"; ctx.font="12px Arial";
      [b.balls,b.fours,b.sixes,SR(b.runs,b.balls)].forEach(v=>{ ctx.fillText(v,cx,y); cx+=44+(cx-46>290?6:0); });
      y+=24;
    });
    // Extras
    ctx.fillStyle="#4A5580"; ctx.font="italic 12px Arial";
    ctx.fillText(`Extras: Wd ${extras.wides} · NB ${extras.noBalls}  |  Total: ${innScore}`, 46, y+6);
    return y+28;
  };

  let y = 220;
  y = drawSection(`🏏 ${battingTeam.name} — Innings 1`, "#1741C6", inn1Batters, y, inn1Extras, inn1Score);
  if(inn2Batters.length>0) drawSection(`🏏 ${bowlingTeam.name} — Innings 2`, "#D42B2B", inn2Batters, y+10, inn2Extras, inn2Score);

  // Footer
  ctx.fillStyle = "#1741C6";
  ctx.fillRect(0, H-44, W, 44);
  ctx.fillStyle="rgba(255,255,255,0.6)"; ctx.font="12px Arial"; ctx.textAlign="center";
  ctx.fillText("Gully Cricket · Street Score Tracker", midX, H-18);
  ctx.textAlign="left";

  return canvas.toDataURL("image/png");
};

/* ═══════════════════════════════════════════════
   WHATSAPP SHARE  (feature 24)
═══════════════════════════════════════════════ */
const buildWAMessage = (G, battingTeam, bowlingTeam, matchResult) => {
  const inn1 = G.inn1Snapshot;
  const inn1Score = inn1 ? inn1.score : G.score;
  const inn2Score = G.inn===2 ? G.score : 0;

  const topBat = [...(inn1?.batters||G.batters)].sort((a,b)=>b.runs-a.runs)[0];
  const topBowl = [...(G.inn===2?G.bowlers:(inn1?.bowlers||[]))].sort((a,b)=>b.wkts-a.wkts||a.runs-b.runs)[0];

  const lines = [
    `🏏 *GULLY CRICKET MATCH RESULT*`,
    ``,
    `*${battingTeam.name}* vs *${bowlingTeam.name}*`,
    `📅 ${new Date().toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}`,
    ``,
    `📊 *SCORES*`,
    `${battingTeam.name}: *${inn1Score}*`,
    inn2Score>0 ? `${bowlingTeam.name}: *${inn2Score}*` : "",
    ``,
    matchResult ? `🏆 *${matchResult.winner}* won${matchResult.margin ? ` by ${matchResult.margin}` : ""}!` : `🎮 Match in progress`,
    ``,
    topBat ? `🏅 Top Scorer: *${topBat.name}* — ${topBat.runs} runs (${topBat.balls}b)` : "",
    topBowl && topBowl.wkts>0 ? `🎯 Top Bowler: *${topBowl.name}* — ${topBowl.wkts}w/${fmtOvers(topBowl.balls)}ov` : "",
    ``,
    `_Tracked with Gully Cricket App_ 🌟`,
  ].filter(Boolean).join("\n");

  return encodeURIComponent(lines);
};

/* ═══════════════════════════════════════════════
   TOAST
═══════════════════════════════════════════════ */
function Toast({ msg, onDone }) {
  useEffect(()=>{ const t=setTimeout(onDone,2800); return ()=>clearTimeout(t); },[onDone]);
  return (
    <div style={{
      position:"fixed",top:70,left:"50%",transform:"translateX(-50%)",
      zIndex:9999,background:T.blue,
      borderRadius:20,padding:"10px 22px",color:"#fff",
      fontWeight:800,fontSize:14,boxShadow:`0 8px 32px ${T.shadow}`,
      whiteSpace:"nowrap",animation:"toastIn .3s cubic-bezier(.34,1.56,.64,1)",
      fontFamily:"'Barlow Condensed', sans-serif",letterSpacing:0.5,border:`2px solid ${T.blueMid}`
    }}>{msg}</div>
  );
}

/* ═══════════════════════════════════════════════
   RADIO MODAL
═══════════════════════════════════════════════ */
function RadioModal({ title, subtitle, options, onSelect, onClose, confirmLabel="Confirm" }) {
  const [sel, setSel] = useState(null);
  const avail = options.filter(o=>!o.disabled);
  useEffect(()=>{ if(avail.length===1) setSel(avail[0].value); },[options]);
  return (
    <div style={S.overlay}>
      <div style={S.sheet}>
        <div style={S.sheetHead}>
          <div>
            <div style={S.sheetTitle}>{title}</div>
            {subtitle && <div style={S.sheetSub}>{subtitle}</div>}
          </div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={{marginTop:14}}>
          {options.map((o,i)=>(
            <label key={i} style={{
              display:"flex",alignItems:"center",gap:12,
              padding:"12px 14px",marginBottom:6,
              background:sel===o.value?T.blueLight:T.white,
              border:`2px solid ${sel===o.value?T.blue:T.border}`,
              borderRadius:14,cursor:o.disabled?"not-allowed":"pointer",
              opacity:o.disabled?0.4:1,transition:"all .15s"
            }}>
              <input type="radio" name="sel" checked={sel===o.value} disabled={o.disabled}
                onChange={()=>!o.disabled&&setSel(o.value)}
                style={{accentColor:T.blue,width:18,height:18,flexShrink:0}} />
              <div style={{flex:1}}>
                <div style={{color:T.text,fontWeight:700,fontSize:15}}>
                  {o.label}
                  {o.badge&&<span style={{marginLeft:8,color:T.blue,fontSize:10,background:T.blueLight,padding:"2px 7px",borderRadius:6,fontWeight:800}}>{o.badge}</span>}
                  {o.disabled&&o.why&&<span style={{marginLeft:8,color:T.textSoft,fontSize:11}}>({o.why})</span>}
                </div>
                {o.sub&&<div style={{color:T.textMid,fontSize:12,marginTop:2}}>{o.sub}</div>}
              </div>
            </label>
          ))}
        </div>
        <button style={{...S.primaryBtn,marginTop:10,opacity:sel===null?0.5:1}}
          disabled={sel===null} onClick={()=>sel!==null&&onSelect(sel)}>
          ✅ {confirmLabel}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   HOME SCREEN
═══════════════════════════════════════════════ */
function HomeScreen({ onStart, onSeries, onPlayers, sessions }) {
  const [overs, setOvers] = useState(6);
  const [showRules, setShowRules] = useState(false);
  const recent = [...(sessions||[])].reverse().slice(0,4);

  return (
    <div style={{minHeight:"100vh",background:T.offWhite,paddingBottom:48}}>
      {/* HERO */}
      <div style={{
        background:`linear-gradient(150deg,${T.blue} 0%,${T.blueDark} 100%)`,
        padding:"52px 24px 40px",position:"relative",overflow:"hidden"
      }}>
        {/* decorative circles */}
        {[{w:220,h:220,t:-60,r:-60,o:0.07},{w:120,h:120,t:30,r:80,o:0.05},{w:80,h:80,b:-20,l:20,o:0.06}].map((c,i)=>(
          <div key={i} style={{
            position:"absolute",width:c.w,height:c.h,
            borderRadius:"50%",border:"2px solid rgba(255,255,255,0.1)",
            top:c.t,right:c.r,bottom:c.b,left:c.l,opacity:c.o,
            background:"rgba(255,255,255,0.04)"
          }}/>
        ))}
        {/* Red underline accent */}
        <div style={{position:"absolute",bottom:0,left:0,right:0,height:5,background:T.red}}/>

        <div style={{position:"relative",zIndex:2,textAlign:"center"}}>
          <div style={{fontSize:60,marginBottom:10,filter:"drop-shadow(0 4px 12px rgba(0,0,0,0.3))",display:"inline-block",animation:"float 3s ease-in-out infinite"}}>🏏</div>
          <div style={{color:"#fff",fontSize:38,fontWeight:900,letterSpacing:3,fontFamily:"'Barlow Condensed', sans-serif",lineHeight:1}}>GULLY CRICKET</div>
          <div style={{color:"rgba(255,255,255,0.55)",fontSize:11,letterSpacing:4,marginTop:6,textTransform:"uppercase",fontWeight:600}}>Street Score Tracker</div>
        </div>
      </div>

      <div style={{padding:"20px 16px 0"}}>
        {/* Format presets */}
        <div style={S.card}>
          <div style={S.cardLabel}>⚡ QUICK FORMAT</div>
          <div style={{display:"flex",gap:8,marginTop:10}}>
            {[[5,"T5"],[6,"T6"],[10,"T10"],[20,"T20"]].map(([o,l])=>(
              <button key={o} onClick={()=>setOvers(o)} style={{
                flex:1,padding:"11px 0",
                background:overs===o?T.blue:T.white,
                color:overs===o?"#fff":T.textMid,
                border:`2px solid ${overs===o?T.blue:T.border}`,
                borderRadius:12,fontWeight:900,fontSize:14,
                fontFamily:"'Barlow Condensed', sans-serif",cursor:"pointer",
                letterSpacing:1,boxShadow:overs===o?`0 4px 16px ${T.shadow}`:"none",
                transition:"all .2s"
              }}>{l}</button>
            ))}
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:14}}>
            <span style={{color:T.textMid,fontSize:13,fontWeight:600}}>Custom overs</span>
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <button style={S.cntBtn} onClick={()=>setOvers(v=>Math.max(1,v-1))}>−</button>
              <span style={{color:T.text,fontWeight:900,fontSize:30,minWidth:32,textAlign:"center",fontFamily:"'Barlow Condensed', sans-serif"}}>{overs}</span>
              <button style={S.cntBtn} onClick={()=>setOvers(v=>Math.min(50,v+1))}>+</button>
            </div>
          </div>
        </div>

        {/* CTA */}
        <button style={{...S.primaryBtn,marginTop:14}} onClick={()=>onStart(overs)}>
          🏏 &nbsp;Start New Match
        </button>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:10}}>
          <button style={S.outlineBtn} onClick={onSeries}>🏆 Series</button>
          <button style={S.outlineBtn} onClick={onPlayers}>👤 Players</button>
        </div>
        <button style={{...S.ghostBtn,marginTop:10}} onClick={()=>setShowRules(true)}>📋 Cricket Rules</button>

        {/* Recent matches */}
        {recent.length>0 && (
          <div style={{...S.card,marginTop:20}}>
            <div style={S.cardLabel}>📜 RECENT MATCHES</div>
            {recent.map((s,i)=>(
              <div key={i} style={{
                display:"flex",justifyContent:"space-between",alignItems:"center",
                padding:"11px 0",borderBottom:i<recent.length-1?`1px solid ${T.border}`:"none"
              }}>
                <div>
                  <div style={{color:T.text,fontWeight:800,fontSize:13}}>{s.batName} <span style={{color:T.textSoft,fontWeight:400}}>vs</span> {s.bowlName}</div>
                  <div style={{color:T.textSoft,fontSize:11,marginTop:2}}>{new Date(s.date).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{color:T.blue,fontSize:11,fontWeight:700}}>{s.overs} overs</div>
                  {s.winner && <div style={{color:s.winner==="Match TIED"?"#B45309":T.red,fontSize:11,fontWeight:800}}>{s.winner==="Match TIED"?"🤝 Tie":`${s.winner} won`}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showRules && <RulesModal onClose={()=>setShowRules(false)} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TEAM SETUP
═══════════════════════════════════════════════ */
function TeamSetup({ label, accent, onDone, onBack }) {
  const [teamName, setTeamName] = useState("");
  const [players, setPlayers]   = useState([]);
  const [emojis, setEmojis]     = useState([]);
  const [inp, setInp]           = useState("");
  const [captain, setCaptain]   = useState(0);
  const [wk, setWk]             = useState(-1);

  const addPlayer = () => {
    const name = inp.trim();
    if (!name || players.length>=11) return;
    setPlayers(p=>[...p,name]);
    setEmojis(e=>[...e,EMOJIS[players.length%EMOJIS.length]]);
    setInp("");
  };
  const removePlayer = idx => {
    setPlayers(p=>p.filter((_,i)=>i!==idx));
    setEmojis(e=>e.filter((_,i)=>i!==idx));
    if(captain>=idx&&captain>0) setCaptain(c=>c-1);
    if(wk===idx) setWk(-1); else if(wk>idx) setWk(w=>w-1);
  };
  const confirm = () => {
    if(!teamName.trim()||players.length<2) return;
    onDone({
      name:teamName.trim(),
      players:players.map((n,i)=>mkBatter(n,i===captain,i===wk,emojis[i]||"😎")),
      bowlers:players.map((n,i)=>mkBowler(n,i===captain)),
    });
  };

  return (
    <div style={{minHeight:"100vh",background:T.offWhite,paddingBottom:48}}>
      <div style={S.topBar}>
        <button style={S.backBtn} onClick={onBack}>‹ Back</button>
        <span style={{color:accent,fontWeight:900,fontSize:17,fontFamily:"'Barlow Condensed', sans-serif",letterSpacing:1}}>{label} SETUP</span>
        <div style={{width:60}}/>
      </div>
      <div style={{padding:"16px 16px 48px"}}>
        <div style={S.card}>
          <div style={S.cardLabel}>TEAM NAME</div>
          <input style={{...S.inp,marginTop:10}} placeholder="e.g. Street Lions, Colony XI"
            value={teamName} onChange={e=>setTeamName(e.target.value)} />
        </div>

        <div style={{...S.card,marginTop:12}}>
          <div style={S.cardLabel}>👥 PLAYERS — MIN 2, MAX 11</div>
          <div style={{display:"flex",gap:8,marginTop:10}}>
            <input style={{...S.inp,flex:1}} placeholder={`Player ${players.length+1}`}
              value={inp} onChange={e=>setInp(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&addPlayer()} />
            <button style={{...S.cntBtn,width:48,height:48,fontSize:22,flexShrink:0,borderRadius:12}} onClick={addPlayer}>+</button>
          </div>

          {players.length>0 && (
            <div style={{marginTop:14}}>
              <div style={{color:T.textSoft,fontSize:10,fontWeight:700,letterSpacing:1,marginBottom:8,textTransform:"uppercase"}}>© = Captain · 🧤 = Keeper</div>
              {players.map((p,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 0",borderBottom:i<players.length-1?`1px solid ${T.border}`:"none"}}>
                  <span style={{fontSize:20}}>{emojis[i]||"😎"}</span>
                  <span style={{color:T.text,flex:1,fontWeight:700,fontSize:14}}>{p}</span>
                  <button onClick={()=>setCaptain(i)} style={{background:captain===i?"#FEF3C7":"#F7F8FC",border:`2px solid ${captain===i?"#F59E0B":T.border}`,borderRadius:8,padding:"3px 8px",fontSize:11,fontWeight:900,cursor:"pointer",color:captain===i?"#78350F":T.textSoft}}>©</button>
                  <button onClick={()=>setWk(wk===i?-1:i)} style={{background:wk===i?T.blueLight:T.offWhite,border:`2px solid ${wk===i?T.blue:T.border}`,borderRadius:8,padding:"3px 8px",fontSize:12,cursor:"pointer"}}>🧤</button>
                  <button onClick={()=>removePlayer(i)} style={{background:"none",border:"none",color:T.red,fontSize:18,cursor:"pointer"}}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {players.length>=2 && (
          <button style={{...S.primaryBtn,marginTop:16,opacity:teamName.trim()?1:0.5}} onClick={confirm}>
            ✅ Confirm {label}
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   COIN TOSS
═══════════════════════════════════════════════ */
function CoinToss({ teamA, teamB, onResult, onBack }) {
  const [phase, setPhase]         = useState("choose");
  const [calledBy, setCalledBy]   = useState(null);
  const [result, setResult]       = useState(null);
  const [winner, setWinner]       = useState(null);
  const [countdown, setCountdown] = useState(3);

  const flip = choice => {
    setPhase("flip"); vib(50);
    setTimeout(()=>{
      const r=Math.random()<0.5?"H":"T";
      const won=r===choice;
      setResult(r);
      setWinner(won?calledBy:(calledBy===teamA.name?teamB.name:teamA.name));
      setPhase("decide"); vib([60,30,80]);
    },1800);
  };

  const autoToss = () => {
    setPhase("auto"); vib(30);
    let cd=3;
    const iv=setInterval(()=>{
      cd--; setCountdown(cd);
      if(cd<=0){
        clearInterval(iv);
        const r=Math.random()<0.5?"H":"T";
        const w=Math.random()<0.5?teamA.name:teamB.name;
        setResult(r); setWinner(w); setPhase("decide"); vib([60,30,80]);
      }
    },700);
  };

  const decide = batFirst => {
    const bat  = winner===teamA.name?(batFirst?teamA:teamB):(batFirst?teamB:teamA);
    const bowl = bat===teamA?teamB:teamA;
    onResult(bat,bowl);
  };

  return (
    <div style={{minHeight:"100vh",background:T.offWhite,paddingBottom:48}}>
      <div style={S.topBar}>
        <button style={S.backBtn} onClick={onBack}>‹ Back</button>
        <span style={{color:T.blue,fontWeight:900,fontSize:17,fontFamily:"'Barlow Condensed', sans-serif",letterSpacing:1}}>COIN TOSS</span>
        <div style={{width:60}}/>
      </div>
      <div style={{padding:"32px 20px",textAlign:"center"}}>
        <div style={{...S.card,padding:"28px 20px"}}>

          {phase==="choose" && <>
            <p style={{color:T.textMid,fontSize:14,marginBottom:20,fontWeight:600}}>Who calls the toss?</p>
            <div style={{display:"flex",gap:10,marginBottom:20}}>
              <button style={{...S.outlineBtn,flex:1}} onClick={()=>{setCalledBy(teamA.name);setPhase("call");}}>
                {teamA.name}
              </button>
              <button style={{...S.outlineBtnRed,flex:1}} onClick={()=>{setCalledBy(teamB.name);setPhase("call");}}>
                {teamB.name}
              </button>
            </div>
            <div style={{color:T.textSoft,fontSize:12,margin:"12px 0"}}>— or —</div>
            <button style={S.ghostBtn} onClick={autoToss}>🎲 Auto-Random Toss</button>
          </>}

          {phase==="call" && <>
            <div style={{fontSize:72,margin:"16px 0",display:"inline-block",animation:"float 2s ease-in-out infinite"}}>🪙</div>
            <p style={{color:T.text,fontWeight:800,marginBottom:20,fontSize:16,fontFamily:"'Barlow Condensed', sans-serif",letterSpacing:1}}>{calledBy} CALLS:</p>
            <div style={{display:"flex",gap:12}}>
              <button style={{...S.primaryBtn,flex:1}} onClick={()=>flip("H")}>👑 Heads</button>
              <button style={{...S.dangerBtn,flex:1}} onClick={()=>flip("T")}>🦅 Tails</button>
            </div>
          </>}

          {phase==="auto" && <>
            <div style={{fontSize:80,margin:"24px 0",display:"inline-block",animation:"spin .3s linear infinite"}}>🪙</div>
            <p style={{color:T.blue,fontWeight:900,fontSize:22,fontFamily:"'Barlow Condensed', sans-serif"}}>Auto Toss in {countdown}…</p>
          </>}

          {phase==="flip" && <>
            <div style={{fontSize:80,margin:"24px 0",display:"inline-block",animation:"spin .3s linear infinite"}}>🪙</div>
            <p style={{color:T.blue,fontWeight:800,fontSize:18}}>Flipping…</p>
          </>}

          {phase==="decide" && <>
            <div style={{fontSize:72,margin:"12px 0",animation:"bounceIn .5s cubic-bezier(.34,1.56,.64,1)"}}>{result==="H"?"👑":"🦅"}</div>
            <p style={{color:T.blue,fontSize:26,fontWeight:900,fontFamily:"'Barlow Condensed', sans-serif",letterSpacing:2}}>{result==="H"?"HEADS!":"TAILS!"}</p>
            <div style={{background:T.blueLight,borderRadius:14,padding:"14px",margin:"12px 0 20px",border:`1px solid ${T.border}`}}>
              <p style={{color:T.text,fontWeight:900,margin:"0 0 4px",fontSize:18,fontFamily:"'Barlow Condensed', sans-serif"}}>🏆 {winner} won!</p>
              <p style={{color:T.textMid,fontSize:13,margin:0}}>Choose your preference:</p>
            </div>
            <div style={{display:"flex",gap:12}}>
              <button style={{...S.primaryBtn,flex:1}} onClick={()=>decide(true)}>🏏 Bat First</button>
              <button style={{...S.dangerBtn,flex:1}} onClick={()=>decide(false)}>⚾ Bowl First</button>
            </div>
          </>}
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotateY(0)}to{transform:rotateY(720deg)}}@keyframes bounceIn{from{transform:scale(.3);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   GAME SCREEN
═══════════════════════════════════════════════ */
function GameScreen({ match, onEnd, onBack }) {
  const { battingTeam, bowlingTeam, overs:maxOvers } = match;
  const TOTAL = maxOvers * 6;

  const init = () => ({
    inn:1,target:null,
    score:0,wickets:0,legalBalls:0,totalDeliveries:0,
    extras:{wides:0,noBalls:0},
    batters:JSON.parse(JSON.stringify(battingTeam.players)),
    strikerIdx:0,nonStrikerIdx:1,
    bowlers:JSON.parse(JSON.stringify(bowlingTeam.bowlers||bowlingTeam.players.map(p=>mkBowler(p.name,p.isCaptain)))),
    bowlerIdx:0,
    currentOverBalls:[],completedOvers:[],deliveryLog:[],
    freeHit:false,
    partnerships:[{bat1:0,bat2:1,runs:0,balls:0}],
    commentary:[],
    inn1Snapshot:null,
  });

  const [G, setG]               = useState(init);
  const [modal, setModal]       = useState(null);
  const [toast, setToast]       = useState(null);
  const [matchResult, setResult]= useState(null);
  const [activeTab, setTab]     = useState("live");
  // Fix #5: pending innings-2 transition stored in state so it uses fresh G
  const [pendingInn2, setPendingInn2] = useState(null);
  const [pendingFinalG, setPendingFinalG] = useState(null);

  const showToast = msg => { setToast(msg); vib(40); };

  // Fix #5: handle innings 2 transition outside of setG updater to avoid stale closure
  useEffect(()=>{
    if(!pendingInn2) return;
    startInnings2(pendingInn2.score, pendingInn2.snap);
    setPendingInn2(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[pendingInn2]);

  const inningsBatTeam  = G.inn===1?battingTeam.name:bowlingTeam.name;
  const inningsBowlTeam = G.inn===1?bowlingTeam.name:battingTeam.name;
  const striker    = G.batters[G.strikerIdx];
  const nonStriker = G.batters[G.nonStrikerIdx];
  const bowler     = G.bowlers[G.bowlerIdx];
  const crr        = G.legalBalls>0?((G.score/G.legalBalls)*6).toFixed(2):"0.00";
  const rrr        = G.target!==null&&G.inn===2&&TOTAL-G.legalBalls>0?(((G.target+1-G.score)/((TOTAL-G.legalBalls)/6))).toFixed(2):null;

  const triggerEnd = (winner, margin, finalG) => {
    const res={winner,margin};
    setResult(res);
    setPendingFinalG(finalG);
    setModal("result");
  };

  const saveMatchData = (finalG, winner, margin) => {
    loadData(STORE_KEY).then(sessions=>{
      const arr=sessions||[];
      arr.push({id:Date.now().toString(),batName:battingTeam.name,bowlName:bowlingTeam.name,overs:maxOvers,date:new Date().toISOString(),winner,margin});
      saveData(STORE_KEY,arr);
    });
    updatePlayerStats(finalG,winner,battingTeam,bowlingTeam);
  };

  const updatePlayerStats = async (finalG,winner,bt,bwt) => {
    const existing=await loadData(PLAYERS_KEY)||{};
    const inn1Bat  = finalG.inn1Snapshot?.batters||(finalG.inn===1?finalG.batters:[]);
    const inn1Bowl = finalG.inn1Snapshot?.bowlers||(finalG.inn===1?finalG.bowlers:[]);
    const inn2Bat  = finalG.inn===2?finalG.batters:[];
    const inn2Bowl = finalG.inn===2?finalG.bowlers:[];

    const upsert=(name,team,bat,bowl)=>{
      if(!existing[name]) existing[name]={name,team,matches:0,runs:0,balls:0,fours:0,sixes:0,wkts:0,bowlBalls:0,bowlRuns:0,highScore:0,bestFigures:{wkts:0,runs:999},wins:0,ducks:0,goldenDucks:0};
      const p=existing[name];
      p.matches++;
      if(bat&&bat.balls>0){
        p.runs+=bat.runs;p.balls+=bat.balls;p.fours+=bat.fours;p.sixes+=bat.sixes;
        if(bat.runs>p.highScore)p.highScore=bat.runs;
        // Duck tracking — feature 10
        if(bat.out&&bat.runs===0){
          p.ducks++;
          // Golden duck: dismissed on first ball (balls===1 after increment, meaning 0 faced before)
          if(bat.balls===1) p.goldenDucks++;
        }
      }
      if(bowl&&bowl.balls>0){
        p.wkts+=bowl.wkts;p.bowlBalls+=bowl.balls;p.bowlRuns+=bowl.runs;
        if(bowl.wkts>p.bestFigures.wkts||(bowl.wkts===p.bestFigures.wkts&&bowl.runs<p.bestFigures.runs))
          p.bestFigures={wkts:bowl.wkts,runs:bowl.runs};
      }
      if(team===winner) p.wins++;
    };
    bt.players.forEach(p=>{ upsert(p.name,bt.name,inn1Bat.find(b=>b.name===p.name)||null,inn2Bowl.find(b=>b.name===p.name)||null); });
    bwt.players.forEach(p=>{ upsert(p.name,bwt.name,inn2Bat.find(b=>b.name===p.name)||null,inn1Bowl.find(b=>b.name===p.name)||null); });
    await saveData(PLAYERS_KEY,existing);
  };

  const startInnings2 = (inn1Score,prevG) => {
    setG({
      inn:2,target:inn1Score,score:0,wickets:0,legalBalls:0,totalDeliveries:0,
      extras:{wides:0,noBalls:0},
      batters:JSON.parse(JSON.stringify(bowlingTeam.players)),
      strikerIdx:0,nonStrikerIdx:1,
      bowlers:JSON.parse(JSON.stringify(battingTeam.bowlers||battingTeam.players.map(p=>mkBowler(p.name,p.isCaptain)))),
      bowlerIdx:0,
      currentOverBalls:[],completedOvers:[],deliveryLog:[],
      freeHit:false,
      partnerships:[{bat1:0,bat2:1,runs:0,balls:0}],
      commentary:[],
      inn1Snapshot:{batters:prevG.batters,bowlers:prevG.bowlers,score:inn1Score,extras:prevG.extras,completedOvers:prevG.completedOvers,deliveryLog:prevG.deliveryLog},
    });
    showToast(`🔔 Innings 2 · Target: ${inn1Score+1}`);
    setTimeout(()=>setModal("selectBowler"),400);
  };

  const deliver = type => {
    if(modal==="result") return;
    setG(prev=>{
      const G2=JSON.parse(JSON.stringify(prev));
      const s2=G2.batters[G2.strikerIdx];
      const b2=G2.bowlers[G2.bowlerIdx];
      const legal=(type!=="wide"&&type!=="nb"&&type!=="dead");

      if(type==="dead"){ G2.commentary.unshift(genComm("dead",s2?.name,b2?.name)); G2.totalDeliveries+=1; return G2; }

      if(type==="wide"){      G2.score+=1;G2.extras.wides+=1;b2.runs+=1;b2.wides+=1;G2.currentOverBalls.push("Wd");G2.freeHit=false; }
      else if(type==="nb"){   G2.score+=1;G2.extras.noBalls+=1;b2.runs+=1;b2.noBalls+=1;G2.currentOverBalls.push("NB");G2.freeHit=true; }
      else {
        G2.legalBalls+=1;s2.balls+=1;b2.balls+=1;G2.freeHit=false;
        if(type==="out"){
          G2.wickets+=1;s2.out=true;b2.wkts+=1;
          // Fix #1: check balls BEFORE increment — golden duck = dismissed on first ball (was 0)
          if(s2.runs===0){ s2.isDuck=true; if(s2.balls===1) s2.isGoldenDuck=true; }
          G2.currentOverBalls.push("W");
          const pp=G2.partnerships; if(pp.length>0) pp[pp.length-1].balls+=1;
        } else {
          const r=type;
          G2.score+=r;s2.runs+=r;b2.runs+=r;
          if(r===0){s2.dots+=1;b2.dots=(b2.dots||0)+1;}
          if(r===4) s2.fours+=1;
          if(r===6) s2.sixes+=1;
          G2.currentOverBalls.push(r===0?"·":String(r));
          const pp=G2.partnerships; if(pp.length>0){pp[pp.length-1].runs+=r;pp[pp.length-1].balls+=1;}
          if(r%2===1){const t=G2.strikerIdx;G2.strikerIdx=G2.nonStrikerIdx;G2.nonStrikerIdx=t;}
        }
      }

      G2.totalDeliveries+=1;
      G2.deliveryLog.push({n:G2.totalDeliveries,type,scoreAfter:G2.score,isLegal:legal,freeHitBefore:prev.freeHit});
      G2.commentary.unshift(genComm(type,s2?.name,b2?.name));

      // Milestones
      if(legal&&type!=="out"&&typeof type==="number"){
        [25,50,75,100].forEach(m=>{ if(s2.runs>=m&&(s2.runs-type)<m) setTimeout(()=>showToast(`🎉 ${s2.name} ${m===50?"FIFTY! 🏅":m===100?"CENTURY! 🏆":m+" up!"}`),80); });
      }
      // Duck milestones — feature 10
      if(type==="out"&&s2.runs===0) setTimeout(()=>showToast(`🦆 ${s2.name} — ${s2.balls===1?"GOLDEN ":""}Duck!`),80);

      const overDone=legal&&G2.legalBalls%6===0&&G2.legalBalls>0;
      // Fix #8: archive the over even when the last ball is a wicket
      if(overDone){ G2.completedOvers.push([...G2.currentOverBalls]);G2.currentOverBalls=[];b2.overs+=1; if(type!=="out"){const t=G2.strikerIdx;G2.strikerIdx=G2.nonStrikerIdx;G2.nonStrikerIdx=t;} }

      const allOut=G2.wickets>=(G2.batters.filter(b=>!b.retired).length);
      const over=G2.legalBalls>=TOTAL;
      const chased=G2.target!==null&&G2.score>G2.target;

      if(G2.inn===1&&(allOut||over)){ const snap=JSON.parse(JSON.stringify(G2)); setTimeout(()=>setPendingInn2({score:G2.score,snap}),100); return G2; }
      if(G2.inn===2){
        if(chased){const wl=G2.batters.filter(b=>!b.out).length;const snap=JSON.parse(JSON.stringify(G2));setTimeout(()=>triggerEnd(inningsBatTeam,`${wl} wicket${wl!==1?"s":""}`,snap),100);return G2;}
        if(allOut||over){
          const snap=JSON.parse(JSON.stringify(G2));
          if(G2.score<G2.target)setTimeout(()=>triggerEnd(battingTeam.name,`${G2.target-G2.score} run${G2.target-G2.score!==1?"s":""}`,snap),100);
          else setTimeout(()=>triggerEnd("Match TIED","",snap),100);
          return G2;
        }
      }

      if(type==="out"){
        // Fix: last remaining batter auto-advances without modal prompt
        const available=G2.batters.filter((b,i)=>!b.out&&!b.retired&&i!==G2.nonStrikerIdx&&i!==G2.strikerIdx);
        if(available.length===1){
          const autoIdx=G2.batters.findIndex((b,i)=>!b.out&&!b.retired&&i!==G2.nonStrikerIdx&&i!==G2.strikerIdx);
          G2.strikerIdx=autoIdx;
          G2.partnerships.push({bat1:autoIdx,bat2:G2.nonStrikerIdx,runs:0,balls:0});
        } else if(available.length>1){
          setTimeout(()=>setModal("selectBatter"),200);
        }
      }
      if(overDone) setTimeout(()=>setModal("selectBowler"),200);
      return G2;
    });
  };

  const undoDelivery = () => {
    setG(prev=>{
      if(prev.deliveryLog.length===0) return prev;
      const G2=JSON.parse(JSON.stringify(prev));
      const last=G2.deliveryLog.pop();
      const s2=G2.batters[G2.strikerIdx];
      const b2=G2.bowlers[G2.bowlerIdx];
      if(last.type==="wide"){G2.score-=1;G2.extras.wides-=1;b2.runs-=1;b2.wides-=1;G2.currentOverBalls.pop();}
      else if(last.type==="nb"){G2.score-=1;G2.extras.noBalls-=1;b2.runs-=1;b2.noBalls-=1;G2.currentOverBalls.pop();}
      else if(last.type!=="dead"){
        G2.legalBalls-=1;s2.balls-=1;b2.balls-=1;
        if(last.type==="out"){G2.wickets-=1;s2.out=false;b2.wkts-=1;s2.isDuck=false;s2.isGoldenDuck=false;}
        else{const r=last.type;G2.score-=r;s2.runs-=r;b2.runs-=r;if(r===0){s2.dots-=1;b2.dots=(b2.dots||1)-1;}if(r===4)s2.fours-=1;if(r===6)s2.sixes-=1;if(r%2===1){const t=G2.strikerIdx;G2.strikerIdx=G2.nonStrikerIdx;G2.nonStrikerIdx=t;}}
        if(G2.currentOverBalls.length>0)G2.currentOverBalls.pop();
      }
      // Fix #4: restore freeHit state from before this delivery
      if(last.freeHitBefore!==undefined) G2.freeHit=last.freeHitBefore;
      return G2;
    });
    showToast("↩ Undone");
  };

  /* Retire the current striker — marks as retired hurt, brings in next batter */
  const retireStriker = () => {
    setG(prev => {
      const G2 = JSON.parse(JSON.stringify(prev));
      const s2 = G2.batters[G2.strikerIdx];
      s2.retired     = true;
      s2.retiredHurt = true;
      G2.commentary.unshift(`🟠 ${s2.name} has retired hurt. New batter coming in.`);
      return G2;
    });
    showToast("🏥 Retired hurt — choose next batter");
    vib([40, 30, 60]);
    setTimeout(() => setModal("selectBatterRetired"), 200);
  };

  const chip = label => {
    const bg=label==="W"?T.red:label==="NB"?"#9333ea":label==="Wd"?"#D97706":label==="6"?"#16a34a":label==="4"?T.blue:label==="·"?"#CBD5E1":"#64748b";
    return {display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:28,height:28,borderRadius:8,fontSize:11,fontWeight:900,background:bg,color:"#fff",flexShrink:0};
  };

  const pct = (G.legalBalls/TOTAL)*100;

  return (
    <div style={{minHeight:"100vh",background:T.offWhite,paddingBottom:80}}>
      {/* STICKY HEADER */}
      <div style={{
        background:`linear-gradient(90deg,${T.blue},${T.blueDark})`,
        padding:"10px 14px",display:"flex",alignItems:"center",gap:8,
        position:"sticky",top:0,zIndex:40,
        boxShadow:`0 2px 16px ${T.shadow}`
      }}>
        <button style={{background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.2)",color:"#fff",borderRadius:10,padding:"6px 12px",fontWeight:900,cursor:"pointer",fontSize:15}} onClick={()=>setModal("exitConfirm")}>‹</button>
        <div style={{flex:1,textAlign:"center"}}>
          <div style={{color:"#fff",fontWeight:900,fontSize:14,fontFamily:"'Barlow Condensed', sans-serif",letterSpacing:0.5}}>{inningsBatTeam} <span style={{color:"rgba(255,255,255,0.4)",fontWeight:400,fontSize:12}}>vs</span> {inningsBowlTeam}</div>
          <div style={{color:"rgba(255,255,255,0.5)",fontSize:10}}>
            {maxOvers} overs{G.target!==null&&<span style={{color:"#FFD700",fontWeight:800}}> · Target: {G.target+1}</span>}
          </div>
        </div>
        <button style={{background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.2)",color:"#fff",borderRadius:10,padding:"6px 10px",fontSize:14,cursor:"pointer"}} onClick={()=>setModal("rules")}>📋</button>
      </div>

      {/* FREE HIT */}
      {G.freeHit && <div style={{background:T.red,padding:"9px",textAlign:"center",color:"#fff",fontWeight:900,fontSize:13,fontFamily:"'Barlow Condensed', sans-serif",letterSpacing:1,animation:"pulse 1s ease-in-out infinite"}}>⚡ FREE HIT — Cannot be dismissed except Run-Out!</div>}

      {/* SCOREBOARD */}
      <div style={{background:`linear-gradient(160deg,${T.blue} 0%,${T.blueDark} 100%)`,padding:"20px 16px 24px",textAlign:"center",borderBottom:`4px solid ${T.red}`}}>
        <div style={{display:"flex",alignItems:"flex-end",justifyContent:"center",gap:6,marginBottom:4}}>
          <span style={{fontSize:76,fontWeight:900,color:"#fff",lineHeight:1,fontFamily:"'Barlow Condensed', sans-serif",textShadow:"0 2px 20px rgba(0,0,0,0.3)"}}>{G.score}</span>
          <span style={{fontSize:34,color:"rgba(255,255,255,0.5)",fontWeight:700,marginBottom:10}}>/{G.wickets}</span>
        </div>
        <div style={{display:"flex",justifyContent:"center",gap:20,color:"rgba(255,255,255,0.7)",fontSize:13,fontWeight:600,marginBottom:12}}>
          <span>🕐 {fmtOvers(G.legalBalls)}/{maxOvers}</span>
          <span>CRR <b style={{color:"#93C5FD"}}>{crr}</b></span>
          {rrr&&<span>RRR <b style={{color:parseFloat(rrr)>12?"#FCA5A5":"#86EFAC"}}>{rrr}</b></span>}
        </div>
        {/* Progress bar */}
        <div style={{background:"rgba(255,255,255,0.15)",borderRadius:6,height:5,overflow:"hidden",margin:"0 0 8px"}}>
          <div style={{height:"100%",width:`${pct}%`,background:"linear-gradient(90deg,#fff,rgba(255,255,255,0.7))",borderRadius:6,transition:"width .3s"}}/>
        </div>
        {(G.extras.wides>0||G.extras.noBalls>0)&&(
          <div style={{display:"flex",justifyContent:"center",gap:12}}>
            {G.extras.wides>0&&<span style={{color:"#FCD34D",fontSize:11,fontWeight:800,background:"rgba(253,211,77,0.12)",padding:"2px 8px",borderRadius:6}}>Wd: {G.extras.wides}</span>}
            {G.extras.noBalls>0&&<span style={{color:"#C4B5FD",fontSize:11,fontWeight:800,background:"rgba(196,181,253,0.12)",padding:"2px 8px",borderRadius:6}}>NB: {G.extras.noBalls}</span>}
          </div>
        )}
      </div>

      {/* CURRENT OVER */}
      <div style={{background:T.white,borderBottom:`1px solid ${T.border}`,padding:"8px 14px",display:"flex",alignItems:"center",flexWrap:"wrap",gap:5}}>
        <span style={{color:T.textSoft,fontSize:10,fontWeight:800,flexShrink:0,letterSpacing:1,textTransform:"uppercase"}}>Over {Math.floor(G.legalBalls/6)+1}:</span>
        {G.currentOverBalls.length===0&&<span style={{color:T.border,fontSize:12}}>—</span>}
        {G.currentOverBalls.map((b,i)=><span key={i} style={chip(b)}>{b}</span>)}
      </div>

      {/* TABS */}
      <div style={{display:"flex",background:T.white,borderBottom:`1px solid ${T.border}`}}>
        {[["live","⚡ Live"],["bat","🏏 Bat"],["bowl","⚾ Bowl"]].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} style={{
            flex:1,padding:"10px 0",border:"none",cursor:"pointer",background:"transparent",
            color:activeTab===t?T.blue:T.textSoft,
            fontWeight:activeTab===t?900:600,fontSize:12,
            borderBottom:activeTab===t?`3px solid ${T.red}`:`3px solid transparent`,
            fontFamily:"'Barlow Condensed', sans-serif",letterSpacing:0.5
          }}>{l}</button>
        ))}
      </div>

      {/* LIVE TAB */}
      {activeTab==="live" && (
        <div style={{padding:"12px 12px 0"}}>
          {/* Batters */}
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            {[[G.strikerIdx,true],[G.nonStrikerIdx,false]].map(([idx,isStr])=>{
              const b=G.batters[idx]; if(!b) return null;
              return (
                <div key={idx} style={{
                  flex:1,background:T.white,
                  border:`2px solid ${isStr?T.blue:T.border}`,
                  borderRadius:16,padding:"12px 14px",
                  boxShadow:isStr?`0 4px 16px ${T.shadow}`:`0 1px 4px rgba(0,0,0,0.04)`
                }}>
                  <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:4}}>
                    <span style={{fontSize:18}}>{b.emoji||"😎"}</span>
                    {isStr&&<span style={{color:T.blue,fontSize:11,fontWeight:900}}>▶</span>}
                    {b.isCaptain&&<span style={{color:"#F59E0B",fontSize:10}}>©</span>}
                    {b.isWK&&<span style={{fontSize:10}}>🧤</span>}
                    <span style={{color:T.text,fontWeight:800,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.name}</span>
                  </div>
                  <div style={{color:isStr?T.blue:T.text,fontWeight:900,fontSize:32,lineHeight:1,fontFamily:"'Barlow Condensed', sans-serif"}}>{b.runs}</div>
                  <div style={{color:T.textSoft,fontSize:11,marginTop:2}}>{b.balls}b · SR {SR(b.runs,b.balls)}</div>
                  <div style={{display:"flex",gap:6,marginTop:4}}>
                    {b.fours>0&&<span style={{color:T.blue,fontSize:11,fontWeight:800,background:T.blueLight,padding:"1px 6px",borderRadius:5}}>{b.fours}×4</span>}
                    {b.sixes>0&&<span style={{color:"#16a34a",fontSize:11,fontWeight:800,background:"#F0FDF4",padding:"1px 6px",borderRadius:5}}>{b.sixes}×6</span>}
                    {/* Duck badge — feature 10 */}
                    {b.isDuck&&<span style={{color:T.red,fontSize:11,fontWeight:900,background:T.redLight,padding:"1px 6px",borderRadius:5}}>{b.isGoldenDuck?"🥇":""}🦆</span>}
                    {/* Retired badge */}
                    {b.retired&&<span style={{color:"#D97706",fontSize:11,fontWeight:900,background:"#FFFBEB",padding:"1px 6px",borderRadius:5}}>🏥 RET</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bowler strip */}
          <div style={{background:T.white,border:`1px solid ${T.border}`,borderRadius:12,padding:"9px 14px",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{color:T.textMid,fontSize:12}}>⚾ <b style={{color:T.text}}>{bowler?.name||"—"}</b></span>
            {bowler&&bowler.balls>0&&<span style={{color:T.textSoft,fontSize:11}}>{fmtOvers(bowler.balls)} · {bowler.wkts}w · Eco {ECO(bowler.runs,bowler.balls)}</span>}
          </div>

          {/* RUN BUTTONS */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:6,marginBottom:6}}>
            {[0,1,2,3,4,6].map(r=>(
              <button key={r} onClick={()=>deliver(r)} style={{
                border:`2px solid ${r===4?T.blue:r===6?"#16a34a":T.border}`,
                borderRadius:14,
                background:r===6?"#F0FDF4":r===4?T.blueLight:T.white,
                color:r===4?T.blue:r===6?"#16a34a":r===0?T.textSoft:T.text,
                fontSize:r>=4?24:20,fontWeight:900,padding:"18px 0",cursor:"pointer",
                fontFamily:"'Barlow Condensed', sans-serif",
                boxShadow:r===6?"0 2px 8px rgba(22,163,74,0.2)":r===4?`0 2px 8px ${T.shadow}`:"none",
                transition:"all .1s"
              }}>{r===0?"·":r}</button>
            ))}
          </div>

          {/* EXTRAS */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:6}}>
            {[
              ["WIDE","+1","#D97706","#FFFBEB","wide"],
              ["NO BALL","+1 🔒","#9333ea","#FAF5FF","nb"],
              ["OUT","wicket ✕","#D42B2B",T.redLight,"out"],
            ].map(([label,sub,color,bg,type])=>(
              <button key={type} onClick={()=>deliver(type)} style={{
                border:`2px solid ${color}22`,borderRadius:12,
                background:bg,fontSize:12,fontWeight:900,padding:"12px 4px",
                cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,
                fontFamily:"'Barlow Condensed', sans-serif"
              }}>
                <span style={{color,fontSize:type==="out"?16:12,letterSpacing:0.5}}>{label}</span>
                <span style={{color:T.textSoft,fontSize:9}}>{sub}</span>
              </button>
            ))}
          </div>

          {/* RETIRED + DEAD row */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
            {/* RETIRED HURT — main new button */}
            <button onClick={retireStriker} style={{
              border:`2px solid #D9770644`,borderRadius:12,
              background:"#FFFBEB",fontSize:12,fontWeight:900,padding:"12px 8px",
              cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,
              fontFamily:"'Barlow Condensed', sans-serif",
              boxShadow:"0 2px 8px rgba(217,119,6,0.12)"
            }}>
              <span style={{color:"#D97706",fontSize:13,letterSpacing:0.5}}>🏥 RETIRED HURT</span>
              <span style={{color:T.textSoft,fontSize:9}}>batter steps off</span>
            </button>
            {/* Dead ball */}
            <button onClick={()=>deliver("dead")} style={{
              border:`2px solid ${T.textSoft}22`,borderRadius:12,
              background:T.offWhite,fontSize:12,fontWeight:900,padding:"12px 8px",
              cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,
              fontFamily:"'Barlow Condensed', sans-serif"
            }}>
              <span style={{color:T.textSoft,fontSize:12,letterSpacing:0.5}}>⬛ DEAD BALL</span>
              <span style={{color:T.textSoft,fontSize:9}}>no runs, no ball</span>
            </button>
          </div>

          {/* ACTION BUTTONS */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:5,marginBottom:5}}>
            {[["🔄","striker"],["⚾","selectBowler"],["📊","scorecard"],["📈","graph"],["↩","undo"]].map(([icon,action])=>(
              <button key={action} onClick={()=>action==="undo"?undoDelivery():setModal(action)} style={S.actBtn}>{icon}</button>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5}}>
            {[["💬","comm"],["🤝","partner"],["📜","overlog"],["🏅","mom"]].map(([icon,m])=>(
              <button key={m} onClick={()=>setModal(m)} style={S.actBtn}>{icon}</button>
            ))}
          </div>
        </div>
      )}

      {/* BAT TAB */}
      {activeTab==="bat" && (
        <div style={{padding:"10px 12px"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr>{["Batsman","R","B","4","6","SR"].map(h=><th key={h} style={{padding:"7px 5px",textAlign:h==="Batsman"?"left":"center",color:T.textSoft,fontWeight:800,borderBottom:`1px solid ${T.border}`,fontSize:10,letterSpacing:1,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
            <tbody>
              {G.batters.map((b,i)=>{
                // Only show batters who have batted or are currently at crease; hide out batters who are neither striker nor non-striker
                const atCrease = i===G.strikerIdx||i===G.nonStrikerIdx;
                if(!atCrease && b.balls===0 && !b.out) return null; // yet to bat, not at crease
                if(b.out && !atCrease) return ( // out and off field — show in scorecard style
                  <tr key={i} style={{borderBottom:`1px solid ${T.border}`,background:T.white}}>
                    <td style={{padding:"9px 5px",color:T.textSoft,fontWeight:700}}>
                      <span style={{marginRight:4}}>{b.emoji||"😎"}</span>
                      <span style={{color:T.red}}>✕ </span>
                      {b.name}{b.isCaptain&&<span style={{color:"#F59E0B",fontSize:9}}> ©</span>}
                      {b.isDuck&&<span style={{marginLeft:4,fontSize:9}}>{b.isGoldenDuck?"🥇🦆":"🦆"}</span>}
                    </td>
                    <td style={{textAlign:"center",fontWeight:900,color:T.textSoft,fontFamily:"'Barlow Condensed', sans-serif",fontSize:14}}>{b.runs}</td>
                    <td style={{textAlign:"center",color:T.textSoft,fontSize:11}}>{b.balls}</td>
                    <td style={{textAlign:"center",color:T.textSoft,fontWeight:800}}>{b.fours}</td>
                    <td style={{textAlign:"center",color:T.textSoft,fontWeight:800}}>{b.sixes}</td>
                    <td style={{textAlign:"center",color:T.textSoft,fontSize:10}}>{SR(b.runs,b.balls)}</td>
                  </tr>
                );
                return (
                <tr key={i} style={{borderBottom:`1px solid ${T.border}`,background:i===G.strikerIdx?T.blueLight:T.white}}>
                  <td style={{padding:"9px 5px",color:b.out?T.textSoft:T.text,fontWeight:700}}>
                    <span style={{marginRight:4}}>{b.emoji||"😎"}</span>
                    {b.out&&<span style={{color:T.red}}>✕ </span>}
                    {b.retired&&<span style={{color:"#D97706"}}>🏥 </span>}
                    {b.name}{b.isCaptain&&<span style={{color:"#F59E0B",fontSize:9}}> ©</span>}
                    {i===G.strikerIdx&&<span style={{color:T.blue,fontSize:9}}> ▶</span>}
                    {b.isDuck&&<span style={{marginLeft:4,fontSize:9}}>{b.isGoldenDuck?"🥇🦆":"🦆"}</span>}
                  </td>
                  <td style={{textAlign:"center",fontWeight:900,color:b.runs>=50?"#D97706":b.runs>=25?T.blue:T.text,fontFamily:"'Barlow Condensed', sans-serif",fontSize:14}}>{b.runs}</td>
                  <td style={{textAlign:"center",color:T.textMid,fontSize:11}}>{b.balls}</td>
                  <td style={{textAlign:"center",color:T.blue,fontWeight:800}}>{b.fours}</td>
                  <td style={{textAlign:"center",color:"#16a34a",fontWeight:800}}>{b.sixes}</td>
                  <td style={{textAlign:"center",color:T.textSoft,fontSize:10}}>{SR(b.runs,b.balls)}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* BOWL TAB */}
      {activeTab==="bowl" && (
        <div style={{padding:"10px 12px"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr>{["Bowler","O","R","W","Eco"].map(h=><th key={h} style={{padding:"7px 5px",textAlign:h==="Bowler"?"left":"center",color:T.textSoft,fontWeight:800,borderBottom:`1px solid ${T.border}`,fontSize:10,letterSpacing:1,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
            <tbody>
              {G.bowlers.filter(b=>b.balls>0).map((b,i)=>(
                <tr key={i} style={{borderBottom:`1px solid ${T.border}`,background:i===G.bowlerIdx?T.redLight:T.white}}>
                  <td style={{padding:"9px 5px",color:T.text,fontWeight:700}}>{b.name}{b.isCaptain&&<span style={{color:"#F59E0B",fontSize:9}}> ©</span>}{i===G.bowlerIdx&&<span style={{color:T.red,fontSize:9}}> ●</span>}</td>
                  <td style={{textAlign:"center",color:T.textMid,fontSize:11}}>{fmtOvers(b.balls)}</td>
                  <td style={{textAlign:"center",fontWeight:900,color:T.text,fontFamily:"'Barlow Condensed', sans-serif",fontSize:13}}>{b.runs}</td>
                  <td style={{textAlign:"center",color:"#16a34a",fontWeight:900,fontFamily:"'Barlow Condensed', sans-serif",fontSize:14}}>{b.wkts}</td>
                  <td style={{textAlign:"center",color:parseFloat(ECO(b.runs,b.balls))>9?T.red:T.textMid,fontWeight:700}}>{ECO(b.runs,b.balls)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* MODALS */}
      {modal==="selectBatter"&&<RadioModal title="🏏 Next Batsman" subtitle="Who comes to the crease?"
        options={G.batters.map((b,i)=>({label:`${b.emoji||"😎"} ${b.name}`,value:i,disabled:b.out||b.retired||i===G.nonStrikerIdx||i===G.strikerIdx,badge:b.isCaptain?"C":b.isWK?"WK":null,sub:b.balls>0?`${b.runs}(${b.balls})`:"Yet to bat",why:b.out?"Out":b.retired?"Ret. Hurt":(i===G.nonStrikerIdx||i===G.strikerIdx)?"At crease":null})).filter(o=>!o.disabled)}
        onSelect={idx=>{setG(p=>{const G2=JSON.parse(JSON.stringify(p));G2.strikerIdx=idx;G2.partnerships.push({bat1:idx,bat2:G2.nonStrikerIdx,runs:0,balls:0});return G2;});setModal(null);}}
        onClose={()=>setModal(null)} confirmLabel="Send In"/>}

      {modal==="selectBatterRetired"&&<RadioModal title="🏥 Batter Retired — Who's Next?" subtitle="Pick fresh batter or recall retired-hurt player"
        options={G.batters.map((b,i)=>{
          const isRetired=b.retired;
          const atCrease=i===G.nonStrikerIdx||i===G.strikerIdx;
          return {
            label:`${b.emoji||"😎"} ${b.name}`,
            value:i,
            disabled:b.out||atCrease,
            badge:isRetired?"🏥 Ret. Hurt":b.isCaptain?"C":b.isWK?"WK":null,
            sub:isRetired?`${b.runs}(${b.balls}) · Can return`:b.balls>0?`${b.runs}(${b.balls})`:"Yet to bat",
            why:b.out?"Out":atCrease?"At crease":null,
          };
        }).filter(o=>!o.disabled)}
        onSelect={idx=>{
          setG(p=>{
            const G2=JSON.parse(JSON.stringify(p));
            if(G2.batters[idx].retired){ G2.batters[idx].retired=false; G2.batters[idx].retiredHurt=false; }
            G2.strikerIdx=idx;
            G2.partnerships.push({bat1:idx,bat2:G2.nonStrikerIdx,runs:0,balls:0});
            return G2;
          });
          setModal(null);
          showToast("✅ Batter in!");
        }}
        onClose={()=>setModal(null)} confirmLabel="Send In"/>}

      {modal==="selectBowler"&&<RadioModal title="⚾ Select Bowler" subtitle="Who bowls this over?"
        options={G.bowlers.map((b,i)=>({label:b.name,value:i,disabled:false,badge:b.isCaptain?"C":null,sub:b.balls>0?`${fmtOvers(b.balls)} · ${b.wkts}w · Eco ${ECO(b.runs,b.balls)}`:"Yet to bowl"}))}
        onSelect={idx=>{setG(p=>({...p,bowlerIdx:idx}));setModal(null);}}
        onClose={()=>setModal(null)} confirmLabel="Bowl"/>}

      {modal==="striker"&&<RadioModal title="🔄 Change Striker" subtitle="Who faces next?"
        options={G.batters.map((b,i)=>({label:`${b.emoji||"😎"} ${b.name}`,value:i,disabled:b.out,badge:i===G.strikerIdx?"Striker ▶":i===G.nonStrikerIdx?"Non-striker":null,sub:`${b.runs}(${b.balls})`}))}
        onSelect={idx=>{setG(p=>{const G2={...p};if(idx===p.nonStrikerIdx){G2.strikerIdx=p.nonStrikerIdx;G2.nonStrikerIdx=p.strikerIdx;}else G2.strikerIdx=idx;return G2;});setModal(null);}}
        onClose={()=>setModal(null)} confirmLabel="Set Striker"/>}

      {modal==="scorecard"&&<ScorecardModal G={G} battingTeam={battingTeam} bowlingTeam={bowlingTeam} matchResult={matchResult} onClose={()=>setModal(null)}/>}
      {modal==="graph"&&<GraphModal G={G} battingTeam={battingTeam} bowlingTeam={bowlingTeam} onClose={()=>setModal(null)}/>}
      {modal==="rules"&&<RulesModal onClose={()=>setModal(null)}/>}
      {modal==="comm"&&<CommModal log={G.commentary} onClose={()=>setModal(null)}/>}
      {modal==="partner"&&<PartnerModal data={G.partnerships} batters={G.batters} onClose={()=>setModal(null)}/>}
      {modal==="mom"&&<MOMModal G={G} battingTeam={battingTeam} bowlingTeam={bowlingTeam} onClose={()=>setModal(null)}/>}
      {modal==="overlog"&&<OverLogModal log={G.completedOvers} current={G.currentOverBalls} onClose={()=>setModal(null)}/>}
      {modal==="result"&&matchResult&&<ResultModal result={matchResult} G={G} battingTeam={battingTeam} bowlingTeam={bowlingTeam}
        onHome={shouldSave=>{
          if(shouldSave&&pendingFinalG) saveMatchData(pendingFinalG,matchResult.winner,matchResult.margin);
          onEnd();
        }}
        onScorecard={()=>setModal("scorecard")}/>}

      {modal==="exitConfirm"&&(
        <div style={S.overlay}>
          <div style={{...S.sheet,padding:"28px 20px"}}>
            <div style={S.sheetHead}>
              <div style={S.sheetTitle}>⚠️ Leave Match?</div>
              <button style={S.closeBtn} onClick={()=>setModal(null)}>✕</button>
            </div>
            <p style={{color:T.textMid,fontSize:14,margin:"14px 0 20px",lineHeight:1.6}}>The match is in progress. Going back will lose all current progress.</p>
            <button style={{...S.dangerBtn,marginBottom:10}} onClick={()=>{setModal(null);onBack();}}>⬅ Yes, Go Back</button>
            <button style={S.ghostBtn} onClick={()=>setModal(null)}>Continue Match</button>
          </div>
        </div>
      )}

      {toast&&<Toast msg={toast} onDone={()=>setToast(null)}/>}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   SCORECARD MODAL + SHARE (feature 23 & 24)
═══════════════════════════════════════════════ */
function ScorecardModal({ G, battingTeam, bowlingTeam, matchResult, onClose }) {
  const [tab, setTab]       = useState("inn1");
  const [sharing, setSharing] = useState(false);
  const [imgUrl, setImgUrl]   = useState(null);

  const inn1 = G.inn1Snapshot;
  const inn1Batters = inn1?inn1.batters:(G.inn===1?G.batters:[]);
  const inn1Bowlers = inn1?inn1.bowlers:(G.inn===1?G.bowlers:[]);
  const inn1Extras  = inn1?inn1.extras:(G.inn===1?G.extras:{wides:0,noBalls:0});
  const inn1Score   = inn1?inn1.score:(G.inn===1?G.score:0);
  const inn2Started = G.inn===2||inn1!==null;
  const inn2Batters = G.inn===2?G.batters:[];
  const inn2Bowlers = G.inn===2?G.bowlers:[];
  const inn2Extras  = G.inn===2?G.extras:{wides:0,noBalls:0};
  const inn2Score   = G.inn===2?G.score:0;

  // Feature 23 — generate scorecard image
  const handleGenerateImage = () => {
    setSharing(true);
    setTimeout(()=>{
      try {
        const url = generateScorecardImage(G, battingTeam, bowlingTeam);
        setImgUrl(url);
      } catch(e) { console.error(e); }
      setSharing(false);
    }, 100);
  };

  // Feature 24 — WhatsApp share
  const handleWhatsApp = () => {
    const msg = buildWAMessage(G, battingTeam, bowlingTeam, matchResult);
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  };

  const BatRow = ({ b, isStr }) => (
    <tr style={{borderBottom:`1px solid ${T.border}`,background:isStr?T.blueLight:T.white}}>
      <td style={{padding:"8px 5px",color:b.out?T.textSoft:T.text,fontWeight:700,fontSize:12}}>
        <span style={{marginRight:4}}>{b.emoji||"😎"}</span>
        {b.out&&<span style={{color:T.red}}>✕ </span>}
        {b.retired&&<span style={{color:"#D97706"}}>🏥 </span>}
        {b.name}{b.isCaptain&&<span style={{color:"#F59E0B",fontSize:9}}> ©</span>}
        {b.isDuck&&<span style={{marginLeft:4,fontSize:9,color:T.red}}>{b.isGoldenDuck?"🥇🦆":"🦆"}</span>}
      </td>
      <td style={{textAlign:"center",fontWeight:900,color:b.runs>=50?"#D97706":b.runs>=25?T.blue:T.text,fontFamily:"'Barlow Condensed', sans-serif",fontSize:13}}>{b.runs}</td>
      <td style={{textAlign:"center",color:T.textMid,fontSize:11}}>{b.balls}</td>
      <td style={{textAlign:"center",color:T.blue,fontWeight:800,fontSize:11}}>{b.fours}</td>
      <td style={{textAlign:"center",color:"#16a34a",fontWeight:800,fontSize:11}}>{b.sixes}</td>
      <td style={{textAlign:"center",color:T.textSoft,fontSize:10}}>{SR(b.runs,b.balls)}</td>
    </tr>
  );

  const BatSection = ({batters,extras,teamName,innScore,accent}) => (
    <div style={{marginBottom:16}}>
      <div style={{background:accent,borderRadius:"8px 8px 0 0",padding:"7px 12px",display:"flex",justifyContent:"space-between"}}>
        <span style={{color:"#fff",fontWeight:900,fontSize:13,fontFamily:"'Barlow Condensed', sans-serif",letterSpacing:0.5}}>🏏 {teamName}</span>
        <span style={{color:"rgba(255,255,255,0.7)",fontWeight:700,fontSize:12}}>{innScore} runs</span>
      </div>
      <div style={{border:`1px solid ${T.border}`,borderTop:"none",borderRadius:"0 0 10px 10px",overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr style={{background:T.offWhite}}>{["Batsman","R","B","4","6","SR"].map(h=><th key={h} style={{padding:"6px 5px",textAlign:h==="Batsman"?"left":"center",color:T.textSoft,fontWeight:800,borderBottom:`1px solid ${T.border}`,fontSize:10,textTransform:"uppercase",letterSpacing:0.5}}>{h}</th>)}</tr></thead>
          <tbody>{batters.filter(b=>b.balls>0||b.out||b.retired).map((b,i)=><BatRow key={i} b={b} isStr={false}/>)}</tbody>
        </table>
        <div style={{padding:"6px 10px",color:T.textSoft,fontSize:11,borderTop:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between"}}>
          <span>Extras: Wd {extras.wides} · NB {extras.noBalls}</span>
          <span style={{fontWeight:900,color:T.text}}>{innScore}</span>
        </div>
      </div>
    </div>
  );

  const BowlSection = ({bowlers,teamName,accent}) => (
    <div style={{marginBottom:16}}>
      <div style={{background:accent,borderRadius:"8px 8px 0 0",padding:"7px 12px"}}>
        <span style={{color:"#fff",fontWeight:900,fontSize:13,fontFamily:"'Barlow Condensed', sans-serif",letterSpacing:0.5}}>⚾ {teamName}</span>
      </div>
      <div style={{border:`1px solid ${T.border}`,borderTop:"none",borderRadius:"0 0 10px 10px",overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr style={{background:T.offWhite}}>{["Bowler","O","R","W","Eco"].map(h=><th key={h} style={{padding:"6px 5px",textAlign:h==="Bowler"?"left":"center",color:T.textSoft,fontWeight:800,borderBottom:`1px solid ${T.border}`,fontSize:10,textTransform:"uppercase",letterSpacing:0.5}}>{h}</th>)}</tr></thead>
          <tbody>
            {bowlers.filter(b=>b.balls>0).map((b,i)=>(
              <tr key={i} style={{borderBottom:`1px solid ${T.border}`,background:i%2===0?T.white:T.offWhite}}>
                <td style={{padding:"8px 5px",color:T.text,fontWeight:700,fontSize:12}}>{b.name}{b.isCaptain&&<span style={{color:"#F59E0B",fontSize:9}}> ©</span>}</td>
                <td style={{textAlign:"center",color:T.textMid,fontSize:11}}>{fmtOvers(b.balls)}</td>
                <td style={{textAlign:"center",fontWeight:900,color:T.text,fontFamily:"'Barlow Condensed', sans-serif",fontSize:13}}>{b.runs}</td>
                <td style={{textAlign:"center",color:"#16a34a",fontWeight:900,fontFamily:"'Barlow Condensed', sans-serif",fontSize:14}}>{b.wkts}</td>
                <td style={{textAlign:"center",color:parseFloat(ECO(b.runs,b.balls))>9?T.red:T.textMid,fontWeight:700}}>{ECO(b.runs,b.balls)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div style={S.overlay}>
      <div style={{...S.sheet,maxHeight:"88vh",overflowY:"auto"}}>
        <div style={S.sheetHead}>
          <div style={S.sheetTitle}>📊 Scorecard</div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* VS summary */}
        {inn2Started && (
          <div style={{display:"flex",justifyContent:"space-around",background:T.blueLight,border:`1px solid ${T.border}`,borderRadius:14,padding:"14px",margin:"12px 0"}}>
            <div style={{textAlign:"center"}}>
              <div style={{color:T.text,fontWeight:900,fontSize:24,fontFamily:"'Barlow Condensed', sans-serif"}}>{inn1Score}</div>
              <div style={{color:T.textSoft,fontSize:11}}>{battingTeam.name}</div>
            </div>
            <div style={{color:T.border,fontWeight:800,fontSize:18,alignSelf:"center"}}>vs</div>
            <div style={{textAlign:"center"}}>
              <div style={{color:T.text,fontWeight:900,fontSize:24,fontFamily:"'Barlow Condensed', sans-serif"}}>{inn2Score}</div>
              <div style={{color:T.textSoft,fontSize:11}}>{bowlingTeam.name}</div>
            </div>
          </div>
        )}

        {/* SHARE BUTTONS — features 23 & 24 */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
          {/* Feature 23 — Scorecard Image */}
          <button onClick={handleGenerateImage} disabled={sharing} style={{
            display:"flex",alignItems:"center",justifyContent:"center",gap:6,
            padding:"11px",border:`2px solid ${T.blue}`,borderRadius:12,
            background:T.blueLight,color:T.blue,fontWeight:800,fontSize:12,
            cursor:"pointer",fontFamily:"'Barlow Condensed', sans-serif",letterSpacing:0.5
          }}>
            {sharing ? "⏳ Generating…" : "🖼️ Save Image"}
          </button>
          {/* Feature 24 — WhatsApp */}
          <button onClick={handleWhatsApp} style={{
            display:"flex",alignItems:"center",justifyContent:"center",gap:6,
            padding:"11px",border:"2px solid #25D366",borderRadius:12,
            background:"#F0FFF4",color:"#16a34a",fontWeight:800,fontSize:12,
            cursor:"pointer",fontFamily:"'Barlow Condensed', sans-serif",letterSpacing:0.5
          }}>📲 WhatsApp</button>
        </div>

        {/* Generated image preview — feature 23 */}
        {imgUrl && (
          <div style={{marginBottom:14,border:`2px solid ${T.border}`,borderRadius:12,overflow:"hidden",textAlign:"center"}}>
            <img src={imgUrl} alt="Scorecard" style={{width:"100%",display:"block"}}/>
            <a href={imgUrl} download="gully-cricket-scorecard.png" style={{
              display:"block",padding:"10px",background:T.blue,color:"#fff",
              fontWeight:800,fontSize:13,textDecoration:"none",fontFamily:"'Barlow Condensed', sans-serif",letterSpacing:0.5
            }}>⬇ Download Scorecard PNG</a>
          </div>
        )}

        {/* Innings tabs */}
        <div style={{display:"flex",gap:6,marginBottom:14}}>
          {[["inn1",`Inn 1 · ${battingTeam.name}`],...(inn2Started?[["inn2",`Inn 2 · ${bowlingTeam.name}`]]:[])].map(([t,l])=>(
            <button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:"9px",borderRadius:10,border:`2px solid ${tab===t?T.blue:T.border}`,background:tab===t?T.blue:"#fff",color:tab===t?"#fff":T.textMid,fontWeight:800,fontSize:11,cursor:"pointer",fontFamily:"'Barlow Condensed', sans-serif",letterSpacing:0.5,transition:"all .15s"}}>{l}</button>
          ))}
        </div>

        {tab==="inn1"&&<><BatSection batters={inn1Batters} extras={inn1Extras} teamName={battingTeam.name} innScore={inn1Score} accent={T.blue}/><BowlSection bowlers={inn1Bowlers} teamName={bowlingTeam.name} accent={T.textMid}/></>}
        {tab==="inn2"&&inn2Started&&(inn2Batters.length===0?<p style={{color:T.textSoft,textAlign:"center",padding:16}}>Not started yet</p>:<><BatSection batters={inn2Batters} extras={inn2Extras} teamName={bowlingTeam.name} innScore={inn2Score} accent={T.red}/><BowlSection bowlers={inn2Bowlers} teamName={battingTeam.name} accent={T.textMid}/></>)}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   GRAPH MODAL
═══════════════════════════════════════════════ */
function GraphModal({ G, battingTeam, bowlingTeam, onClose }) {
  const inn1Log = G.inn1Snapshot?G.inn1Snapshot.deliveryLog:G.deliveryLog;
  const inn2Log = G.inn1Snapshot?G.deliveryLog:[];
  const maxLen  = Math.max(inn1Log.length,inn2Log.length);
  const merged  = Array.from({length:maxLen},(_,i)=>({
    x:i+1,
    inn1:inn1Log[i]?.scoreAfter??null,
    inn2:inn2Log[i]?.scoreAfter??null,
    i1Six:inn1Log[i]?.type===6,i1Four:inn1Log[i]?.type===4,i1Out:inn1Log[i]?.type==="out",
    i2Six:inn2Log[i]?.type===6,i2Four:inn2Log[i]?.type===4,i2Out:inn2Log[i]?.type==="out",
  }));
  const D1=({cx,cy,payload:p})=>{ if(!cx||!cy||p.inn1==null)return null; if(p.i1Six)return<circle cx={cx} cy={cy} r={6} fill="#16a34a" stroke="#fff" strokeWidth={1}/>; if(p.i1Four)return<circle cx={cx} cy={cy} r={5} fill={T.blue} stroke="#fff" strokeWidth={1}/>; if(p.i1Out)return<circle cx={cx} cy={cy} r={5} fill={T.red} stroke="#fff" strokeWidth={1}/>; return null; };
  const D2=({cx,cy,payload:p})=>{ if(!cx||!cy||p.inn2==null)return null; if(p.i2Six)return<circle cx={cx} cy={cy} r={6} fill="#15803d" stroke="#fff" strokeWidth={1}/>; if(p.i2Four)return<circle cx={cx} cy={cy} r={5} fill="#1d4ed8" stroke="#fff" strokeWidth={1}/>; if(p.i2Out)return<circle cx={cx} cy={cy} r={5} fill={T.redDark} stroke="#fff" strokeWidth={1}/>; return null; };
  const target=G.inn1Snapshot?G.inn1Snapshot.score:G.target;
  const hasInn2=inn2Log.length>0;
  return (
    <div style={S.overlay}>
      <div style={{...S.sheet,width:"97%"}}>
        <div style={S.sheetHead}><div style={S.sheetTitle}>📈 Run Progression</div><button style={S.closeBtn} onClick={onClose}>✕</button></div>
        <div style={{display:"flex",gap:16,margin:"10px 0 6px"}}>
          {[[battingTeam.name,T.blue],[hasInn2?bowlingTeam.name:null,T.red]].filter(([n])=>n).map(([name,color])=>(
            <div key={name} style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:20,height:3,background:color,borderRadius:2}}/><span style={{color:T.textMid,fontSize:11,fontWeight:700}}>{name}</span></div>
          ))}
        </div>
        {merged.length<2?<p style={{color:T.textSoft,textAlign:"center",padding:"20px 0"}}>Bowl more deliveries…</p>:(
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={merged} margin={{top:8,right:8,left:-20,bottom:4}}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border}/>
              <XAxis dataKey="x" tick={{fill:T.textSoft,fontSize:9}}/>
              <YAxis tick={{fill:T.textSoft,fontSize:9}}/>
              <Tooltip contentStyle={{background:T.white,border:`1px solid ${T.border}`,borderRadius:8,fontSize:11}}/>
              {target!=null&&<ReferenceLine y={target} stroke={T.textSoft} strokeDasharray="4 4" label={{value:`${target}`,fill:T.textSoft,fontSize:9,position:"insideTopRight"}}/>}
              <Line type="monotone" dataKey="inn1" name={battingTeam.name} stroke={T.blue} strokeWidth={2.5} dot={<D1/>} activeDot={{r:5}} connectNulls/>
              {hasInn2&&<Line type="monotone" dataKey="inn2" name={bowlingTeam.name} stroke={T.red} strokeWidth={2.5} strokeDasharray="6 3" dot={<D2/>} activeDot={{r:5}} connectNulls/>}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MOM MODAL
═══════════════════════════════════════════════ */
function MOMModal({ G, battingTeam, bowlingTeam, onClose }) {
  const inn1Bat  = G.inn1Snapshot?.batters||(G.inn===1?G.batters:[]);
  const inn1Bowl = G.inn1Snapshot?.bowlers||(G.inn===1?G.bowlers:[]);
  const inn2Bat  = G.inn===2?G.batters:[];
  const inn2Bowl = G.inn===2?G.bowlers:[];

  const players=[];
  battingTeam.players.forEach(p=>players.push({...p,team:battingTeam.name,bat:inn1Bat.find(b=>b.name===p.name)||null,bowl:inn2Bowl.find(b=>b.name===p.name)||null}));
  bowlingTeam.players.forEach(p=>players.push({...p,team:bowlingTeam.name,bat:inn2Bat.find(b=>b.name===p.name)||null,bowl:inn1Bowl.find(b=>b.name===p.name)||null}));

  const scored=players.map(p=>({...p,...calcMOM(p.bat,p.bowl)})).filter(p=>p.role!=="none").sort((a,b)=>b.score-a.score);
  const winner=scored[0]||null;
  const maxScore=scored.length>0?Math.max(...scored.map(p=>p.score)):1;
  const roleLabel=r=>r==="bat"?"🏏 Batter":r==="bowl"?"⚾ Bowler":"⭐ All-Rounder";
  const roleColor=r=>r==="bat"?T.blue:r==="bowl"?"#16a34a":T.red;

  return (
    <div style={S.overlay}>
      <div style={{...S.sheet,maxHeight:"88vh",overflowY:"auto"}}>
        <div style={S.sheetHead}><div style={S.sheetTitle}>🏅 Player of the Match</div><button style={S.closeBtn} onClick={onClose}>✕</button></div>
        {winner&&(
          <div style={{background:`linear-gradient(135deg,${T.blue},${T.blueDark})`,borderRadius:18,padding:"20px",marginTop:14,textAlign:"center",borderBottom:`4px solid ${T.red}`}}>
            <div style={{fontSize:44,marginBottom:4}}>{winner.emoji||"🏅"}</div>
            <div style={{color:"#fff",fontWeight:900,fontSize:22,fontFamily:"'Barlow Condensed', sans-serif",letterSpacing:1}}>{winner.name}</div>
            <div style={{color:"rgba(255,255,255,0.6)",fontSize:12,marginBottom:8}}>{winner.team} · {roleLabel(winner.role)}</div>
            <div style={{color:"#FFD700",fontWeight:900,fontSize:32,fontFamily:"'Barlow Condensed', sans-serif"}}>{winner.score.toFixed(1)} pts</div>
          </div>
        )}
        <div style={{color:T.textSoft,fontSize:10,fontWeight:800,letterSpacing:1,textTransform:"uppercase",margin:"16px 0 8px"}}>RANKINGS</div>
        {scored.map((p,i)=>(
          <div key={i} style={{background:i===0?"#FFFBEB":T.white,border:`1.5px solid ${i===0?"#F59E0B":T.border}`,borderRadius:14,padding:"13px",marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
              <span style={{fontSize:20}}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`}</span>
              <div style={{flex:1}}>
                <div style={{color:T.text,fontWeight:800,fontSize:14,fontFamily:"'Barlow Condensed', sans-serif"}}>{p.emoji||"😎"} {p.name}</div>
                <div style={{display:"flex",gap:6,marginTop:2}}>
                  <span style={{color:roleColor(p.role),fontSize:10,fontWeight:800,background:`${roleColor(p.role)}15`,padding:"1px 6px",borderRadius:5}}>{roleLabel(p.role)}</span>
                  <span style={{color:T.textSoft,fontSize:10}}>{p.team}</span>
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{color:i===0?"#D97706":T.text,fontWeight:900,fontSize:20,fontFamily:"'Barlow Condensed', sans-serif"}}>{p.score.toFixed(1)}</div>
              </div>
            </div>
            <div style={{background:T.offWhite,borderRadius:6,height:5,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${(p.score/maxScore)*100}%`,background:roleColor(p.role),borderRadius:6}}/>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PLAYER DASHBOARD (with duck stats — feature 10)
═══════════════════════════════════════════════ */
function PlayerDashboard({ onBack }) {
  const [players, setPlayers] = useState({});
  const [selected, setSel]    = useState(null);
  const [loading, setLoad]    = useState(true);

  useEffect(()=>{ loadData(PLAYERS_KEY).then(d=>{ setPlayers(d||{}); setLoad(false); }); },[]);

  // Fix #9: stable emoji based on name hash, not leaderboard position
  const playerEmoji = name => EMOJIS[name.split("").reduce((acc,c)=>acc+c.charCodeAt(0),0)%EMOJIS.length];

  const list = Object.values(players).sort((a,b)=>b.runs-a.runs);

  if(loading) return <div style={{minHeight:"100vh",background:T.offWhite,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{color:T.textSoft,fontSize:16}}>Loading…</div></div>;

  if(selected){
    const p=players[selected];
    const avg    = p.balls>0?(p.runs/p.matches).toFixed(1):"—";
    const bowlAvg= p.wkts>0?(p.bowlRuns/p.wkts).toFixed(1):"—";
    const bowlEco= p.bowlBalls>0?((p.bowlRuns/p.bowlBalls)*6).toFixed(2):"—";
    const sr     = p.balls>0?((p.runs/p.balls)*100).toFixed(1):"—";
    const winPct = p.matches>0?Math.round((p.wins/p.matches)*100):0;
    const radarData=[
      {subject:"Batting", A:Math.min(100,p.runs/5)},
      {subject:"SR",      A:sr!=="—"?Math.min(100,parseFloat(sr)/2):0},
      {subject:"Sixes",   A:Math.min(100,p.sixes*10)},
      {subject:"Wickets", A:Math.min(100,p.wkts*15)},
      {subject:"Economy", A:bowlEco!=="—"?Math.max(0,100-(parseFloat(bowlEco)-4)*10):0},
      {subject:"Win%",    A:winPct},
    ];

    return (
      <div style={{minHeight:"100vh",background:T.offWhite,paddingBottom:60}}>
        <div style={S.topBar}>
          <button style={S.backBtn} onClick={()=>setSel(null)}>‹ Back</button>
          <span style={{color:T.blue,fontWeight:900,fontSize:16,fontFamily:"'Barlow Condensed', sans-serif",letterSpacing:1}}>{p.name.toUpperCase()}</span>
          <div style={{width:60}}/>
        </div>
        <div style={{padding:"16px 16px 48px"}}>
          {/* Hero */}
          <div style={{background:`linear-gradient(150deg,${T.blue},${T.blueDark})`,borderRadius:20,padding:"24px 20px",textAlign:"center",marginBottom:16,borderBottom:`4px solid ${T.red}`}}>
            <div style={{fontSize:52,marginBottom:6}}>{playerEmoji(p.name)}</div>
            <div style={{color:"#fff",fontWeight:900,fontSize:26,fontFamily:"'Barlow Condensed', sans-serif",letterSpacing:1}}>{p.name}</div>
            <div style={{color:"rgba(255,255,255,0.55)",fontSize:12,marginBottom:16}}>{p.team||"—"} · {p.matches} matches</div>
            <div style={{display:"flex",justifyContent:"space-around"}}>
              {[[p.runs,"Runs"],[p.wkts,"Wickets"],[winPct+"%","Win Rate"]].map(([v,l])=>(
                <div key={l} style={{textAlign:"center"}}>
                  <div style={{color:"#FFD700",fontWeight:900,fontSize:26,fontFamily:"'Barlow Condensed', sans-serif"}}>{v}</div>
                  <div style={{color:"rgba(255,255,255,0.5)",fontSize:11}}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Radar */}
          <div style={{...S.card,marginBottom:14}}>
            <div style={S.cardLabel}>📊 PERFORMANCE RADAR</div>
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={radarData} margin={{top:10,right:10,left:10,bottom:10}}>
                <PolarGrid stroke={T.border}/>
                <PolarAngleAxis dataKey="subject" tick={{fill:T.textMid,fontSize:10}}/>
                <PolarRadiusAxis domain={[0,100]} tick={false} axisLine={false}/>
                <Radar name="Stats" dataKey="A" stroke={T.blue} fill={T.blue} fillOpacity={0.2} strokeWidth={2}/>
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Batting */}
          <div style={{...S.card,marginBottom:14}}>
            <div style={S.cardLabel}>🏏 BATTING</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:12}}>
              {[
                ["Runs",p.runs],["Balls Faced",p.balls],
                ["High Score",p.highScore],["Avg/Match",avg],
                ["Strike Rate",sr],["Fours",p.fours],
                ["Sixes",p.sixes],
                // Feature 10 — Duck stats
                ["Ducks 🦆",p.ducks||0],
                ["Golden Ducks 🥇🦆",p.goldenDucks||0],
              ].map(([label,val])=>(
                <div key={label} style={{background:T.offWhite,borderRadius:12,padding:"11px 13px",border:`1px solid ${T.border}`}}>
                  <div style={{color:T.textSoft,fontSize:10,fontWeight:700,letterSpacing:0.5,textTransform:"uppercase",marginBottom:3}}>{label}</div>
                  <div style={{color:label.includes("Duck")?T.red:T.blue,fontWeight:900,fontSize:22,fontFamily:"'Barlow Condensed', sans-serif"}}>{val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Bowling */}
          {p.bowlBalls>0&&(
            <div style={{...S.card,marginBottom:14}}>
              <div style={S.cardLabel}>⚾ BOWLING</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:12}}>
                {[["Wickets",p.wkts],["Overs",fmtOvers(p.bowlBalls)],["Runs Given",p.bowlRuns],["Economy",bowlEco],["Average",bowlAvg],["Best",`${p.bestFigures.wkts}/${p.bestFigures.runs}`]].map(([label,val])=>(
                  <div key={label} style={{background:T.offWhite,borderRadius:12,padding:"11px 13px",border:`1px solid ${T.border}`}}>
                    <div style={{color:T.textSoft,fontSize:10,fontWeight:700,letterSpacing:0.5,textTransform:"uppercase",marginBottom:3}}>{label}</div>
                    <div style={{color:T.red,fontWeight:900,fontSize:22,fontFamily:"'Barlow Condensed', sans-serif"}}>{val}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{minHeight:"100vh",background:T.offWhite,paddingBottom:60}}>
      <div style={S.topBar}>
        <button style={S.backBtn} onClick={onBack}>‹ Back</button>
        <span style={{color:T.blue,fontWeight:900,fontSize:17,fontFamily:"'Barlow Condensed', sans-serif",letterSpacing:1}}>PLAYER STATS</span>
        <div style={{width:60}}/>
      </div>
      <div style={{padding:"16px 16px 48px"}}>
        {list.length===0?(
          <div style={{textAlign:"center",padding:"60px 20px"}}>
            <div style={{fontSize:56,marginBottom:16}}>📊</div>
            <div style={{color:T.textMid,fontSize:16,fontWeight:700}}>No stats yet</div>
            <div style={{color:T.textSoft,fontSize:13,marginTop:8}}>Play matches to see stats here</div>
          </div>
        ):list.map((p,i)=>(
          <button key={p.name} onClick={()=>setSel(p.name)} style={{
            width:"100%",display:"flex",alignItems:"center",gap:14,
            background:T.white,border:`1px solid ${T.border}`,
            borderRadius:16,padding:"14px",marginBottom:8,cursor:"pointer",textAlign:"left",
            boxShadow:`0 1px 4px ${T.shadow}`
          }}>
            <div style={{width:46,height:46,borderRadius:14,background:`linear-gradient(135deg,${T.blue},${T.blueDark})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{playerEmoji(p.name)}</div>
            <div style={{flex:1}}>
              <div style={{color:T.text,fontWeight:800,fontSize:15,fontFamily:"'Barlow Condensed', sans-serif",letterSpacing:0.3}}>{p.name}</div>
              <div style={{color:T.textSoft,fontSize:11,marginTop:2}}>{p.matches} matches · {p.wins} wins{(p.ducks||0)>0?` · 🦆 ${p.ducks}`:""}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{color:T.blue,fontWeight:900,fontSize:22,fontFamily:"'Barlow Condensed', sans-serif"}}>{p.runs}</div>
              <div style={{color:T.textSoft,fontSize:10}}>runs</div>
            </div>
            <div style={{color:T.border,fontSize:18}}>›</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   SERIES SCREEN
═══════════════════════════════════════════════ */
function SeriesScreen({ onBack, onRematch }) {
  const [tab, setTab]       = useState("h2h");
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(()=>{ loadData(STORE_KEY).then(d=>{ setSessions(d||[]); setLoading(false); }); },[]);

  const h2h={};
  sessions.forEach(s=>{
    const key=[s.batName,s.bowlName].sort().join("__VS__");
    if(!h2h[key]) h2h[key]={t1:[s.batName,s.bowlName].sort()[0],t2:[s.batName,s.bowlName].sort()[1],wins:{},matches:0};
    h2h[key].matches++;
    if(s.winner&&s.winner!=="Match TIED") h2h[key].wins[s.winner]=(h2h[key].wins[s.winner]||0)+1;
  });
  const h2hList=Object.values(h2h).sort((a,b)=>b.matches-a.matches);
  const recent=[...sessions].reverse().slice(0,20);

  if(loading) return <div style={{minHeight:"100vh",background:T.offWhite,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{color:T.textSoft,fontSize:16}}>Loading…</div></div>;

  return (
    <div style={{minHeight:"100vh",background:T.offWhite,paddingBottom:60}}>
      <div style={S.topBar}>
        <button style={S.backBtn} onClick={onBack}>‹ Back</button>
        <span style={{color:T.blue,fontWeight:900,fontSize:17,fontFamily:"'Barlow Condensed', sans-serif",letterSpacing:1}}>SERIES & RECORDS</span>
        <div style={{width:60}}/>
      </div>
      <div style={{display:"flex",background:T.white,borderBottom:`1px solid ${T.border}`}}>
        {[["h2h","🏆 Head-to-Head"],["history","📜 All Matches"]].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:"11px 0",border:"none",background:"transparent",cursor:"pointer",color:tab===t?T.blue:T.textSoft,fontWeight:tab===t?900:600,fontSize:13,borderBottom:tab===t?`3px solid ${T.red}`:"3px solid transparent",fontFamily:"'Barlow Condensed', sans-serif",letterSpacing:0.5}}>{l}</button>
        ))}
      </div>
      <div style={{padding:"16px 16px 48px"}}>
        {tab==="h2h"&&(h2hList.length===0?(
          <div style={{textAlign:"center",padding:"60px 20px"}}>
            <div style={{fontSize:56,marginBottom:16}}>🏆</div>
            <div style={{color:T.textMid,fontSize:16,fontWeight:700}}>No matchups yet</div>
          </div>
        ):h2hList.map((m,i)=>{
          const t1w=m.wins[m.t1]||0,t2w=m.wins[m.t2]||0;
          const t1pct=m.matches>0?(t1w/m.matches)*100:50;
          return(
            <div key={i} style={{...S.card,marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{color:T.blue,fontWeight:900,fontSize:14,fontFamily:"'Barlow Condensed', sans-serif"}}>{m.t1}</div>
                <div style={{textAlign:"center"}}>
                  <div style={{color:T.textSoft,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>{m.matches} played</div>
                </div>
                <div style={{color:T.red,fontWeight:900,fontSize:14,fontFamily:"'Barlow Condensed', sans-serif",textAlign:"right"}}>{m.t2}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{color:T.blue,fontWeight:900,fontSize:24,fontFamily:"'Barlow Condensed', sans-serif",minWidth:24}}>{t1w}</span>
                <div style={{flex:1,height:8,background:T.offWhite,borderRadius:6,overflow:"hidden",border:`1px solid ${T.border}`}}>
                  <div style={{height:"100%",width:`${t1pct}%`,background:`linear-gradient(90deg,${T.blue},${T.blueMid})`,borderRadius:6}}/>
                </div>
                <span style={{color:T.red,fontWeight:900,fontSize:24,fontFamily:"'Barlow Condensed', sans-serif",minWidth:24,textAlign:"right"}}>{t2w}</span>
              </div>
            </div>
          );
        }))}
        {tab==="history"&&(recent.length===0?(
          <div style={{textAlign:"center",padding:"60px 20px"}}>
            <div style={{fontSize:56,marginBottom:16}}>📜</div>
            <div style={{color:T.textMid,fontSize:16,fontWeight:700}}>No matches yet</div>
          </div>
        ):recent.map((s,i)=>(
          <div key={i} style={{...S.card,marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:s.batName?10:0}}>
              <div>
                <div style={{color:T.text,fontWeight:800,fontSize:13,fontFamily:"'Barlow Condensed', sans-serif"}}>{s.batName} <span style={{color:T.textSoft,fontWeight:400}}>vs</span> {s.bowlName}</div>
                <div style={{color:T.textSoft,fontSize:11,marginTop:2}}>{new Date(s.date).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"2-digit"})} · {s.overs} ov</div>
              </div>
              <div style={{textAlign:"right"}}>
                {s.winner&&<div style={{color:s.winner==="Match TIED"?"#B45309":T.red,fontSize:12,fontWeight:800}}>{s.winner==="Match TIED"?"🤝 Tie":`${s.winner} won`}</div>}
                {s.margin&&<div style={{color:T.textSoft,fontSize:10}}>by {s.margin}</div>}
              </div>
            </div>
            <button onClick={()=>onRematch(s)} style={{
              width:"100%",padding:"9px",background:T.blueLight,border:`1.5px solid ${T.blue}`,
              borderRadius:10,color:T.blue,fontWeight:900,fontSize:12,cursor:"pointer",
              fontFamily:"'Barlow Condensed', sans-serif",letterSpacing:0.5
            }}>🔁 Rematch — Go to Toss</button>
          </div>
        )))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   SMALL MODALS
═══════════════════════════════════════════════ */
function OverLogModal({ log, current, onClose }) {
  const chip=b=>{ const bg=b==="W"?T.red:b==="NB"?"#9333ea":b==="Wd"?"#D97706":b==="6"?"#16a34a":b==="4"?T.blue:b==="·"?T.border:T.textSoft; return {display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:28,height:28,borderRadius:8,fontSize:11,fontWeight:900,background:bg,color:bg===T.border?T.textSoft:"#fff",flexShrink:0}; };
  const calcRuns=over=>over.reduce((s,b)=>{ const n=parseInt(b); return s+(isNaN(n)?((b==="Wd"||b==="NB")?1:0):n); },0);
  return (
    <div style={S.overlay}>
      <div style={{...S.sheet,maxHeight:"75vh",overflowY:"auto"}}>
        <div style={S.sheetHead}><div style={S.sheetTitle}>📜 Over Log</div><button style={S.closeBtn} onClick={onClose}>✕</button></div>
        {current.length>0&&<div style={{background:T.blueLight,border:`1px solid ${T.border}`,borderRadius:12,padding:"12px",marginTop:12,marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><span style={{color:T.blue,fontWeight:800}}>Current Over</span><span style={{color:T.text,fontWeight:900}}>{calcRuns(current)} runs</span></div><div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{current.map((b,i)=><span key={i} style={chip(b)}>{b}</span>)}</div></div>}
        {log.map((over,i)=>(<div key={i} style={{background:T.white,border:`1px solid ${T.border}`,borderRadius:12,padding:"12px",marginTop:8}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><span style={{color:T.blue,fontWeight:800}}>Over {i+1}</span><span style={{color:T.text,fontWeight:900}}>{calcRuns(over)} runs</span></div><div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{over.map((b,j)=><span key={j} style={chip(b)}>{b}</span>)}</div></div>))}
      </div>
    </div>
  );
}
function CommModal({ log, onClose }) {
  return (
    <div style={S.overlay}>
      <div style={{...S.sheet,maxHeight:"75vh",overflowY:"auto"}}>
        <div style={S.sheetHead}><div style={S.sheetTitle}>💬 Commentary</div><button style={S.closeBtn} onClick={onClose}>✕</button></div>
        {log.length===0&&<p style={{color:T.textSoft,textAlign:"center",padding:16}}>No deliveries yet</p>}
        {log.map((c,i)=>(<div key={i} style={{padding:"9px 0",borderBottom:`1px solid ${T.border}`,color:i===0?T.text:T.textMid,fontSize:i===0?13:12,lineHeight:1.6,fontWeight:i===0?700:400}}>{c}</div>))}
      </div>
    </div>
  );
}
function PartnerModal({ data, batters, onClose }) {
  return (
    <div style={S.overlay}>
      <div style={{...S.sheet,maxHeight:"70vh",overflowY:"auto"}}>
        <div style={S.sheetHead}><div style={S.sheetTitle}>🤝 Partnerships</div><button style={S.closeBtn} onClick={onClose}>✕</button></div>
        {data.length===0&&<p style={{color:T.textSoft,textAlign:"center",padding:16}}>No data yet</p>}
        {data.map((p,i)=>{
          const n1=batters[p.bat1]?.name||"?",n2=batters[p.bat2]?.name||"?";
          return(<div key={i} style={{background:T.white,border:`1px solid ${T.border}`,borderRadius:12,padding:"14px",marginTop:8}}><div style={{color:T.blue,fontWeight:900,fontSize:14,fontFamily:"'Barlow Condensed', sans-serif",marginBottom:8}}>{n1} & {n2}</div><div style={{display:"flex",gap:20}}><div><span style={{color:T.textSoft,fontSize:11}}>Runs </span><span style={{color:T.text,fontWeight:900,fontSize:24,fontFamily:"'Barlow Condensed', sans-serif"}}>{p.runs}</span></div><div><span style={{color:T.textSoft,fontSize:11}}>Balls </span><span style={{color:T.textMid,fontWeight:700,fontSize:18}}>{p.balls}</span></div>{p.balls>0&&<div><span style={{color:T.textSoft,fontSize:11}}>RR </span><span style={{color:"#16a34a",fontWeight:700}}>{((p.runs/p.balls)*6).toFixed(1)}</span></div>}</div></div>);
        })}
      </div>
    </div>
  );
}
function RulesModal({ onClose }) {
  return (
    <div style={S.overlay}>
      <div style={{...S.sheet,maxHeight:"82vh",overflowY:"auto"}}>
        <div style={S.sheetHead}><div style={S.sheetTitle}>📋 Cricket Rules</div><button style={S.closeBtn} onClick={onClose}>✕</button></div>
        {RULES.map((r,i)=>(<div key={i} style={{background:T.offWhite,border:`1px solid ${T.border}`,borderRadius:12,padding:"13px",marginTop:8}}><div style={{color:T.blue,fontWeight:800,marginBottom:5,fontFamily:"'Barlow Condensed', sans-serif",letterSpacing:0.3}}>{r.icon} {r.t}</div><p style={{color:T.textMid,fontSize:13,margin:0,lineHeight:1.6}}>{r.d}</p></div>))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   RESULT MODAL (with share buttons — feature 24)
═══════════════════════════════════════════════ */
function ResultModal({ result, G, battingTeam, bowlingTeam, onHome, onScorecard }) {
  const isTie = result.winner==="Match TIED";
  const [askedSave, setAskedSave] = useState(false);
  const handleWA = () => {
    const msg = buildWAMessage(G, battingTeam, bowlingTeam, result);
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  };
  return (
    <div style={{...S.overlay,background:"rgba(13,27,75,0.92)"}}>
      <div style={{background:T.white,borderRadius:28,padding:"36px 24px",textAlign:"center",maxWidth:340,width:"92%",boxShadow:"0 24px 80px rgba(0,0,0,0.4)",borderTop:`6px solid ${T.red}`}}>
        <div style={{fontSize:64,marginBottom:8,animation:"bounceIn .6s cubic-bezier(.34,1.56,.64,1)"}}>{isTie?"🤝":"🏆"}</div>
        {isTie?(
          <h2 style={{color:T.text,margin:"0 0 20px",fontSize:26,fontFamily:"'Barlow Condensed', sans-serif",letterSpacing:1}}>MATCH TIED!</h2>
        ):(
          <>
            <div style={{color:T.blue,fontWeight:900,fontSize:28,fontFamily:"'Barlow Condensed', sans-serif",letterSpacing:1,marginBottom:4}}>{result.winner}</div>
            <div style={{color:T.red,fontWeight:900,fontSize:22,fontFamily:"'Barlow Condensed', sans-serif",letterSpacing:2,marginBottom:4}}>WON! 🎉</div>
            <div style={{color:T.textSoft,fontSize:14,marginBottom:16}}>by {result.margin}</div>
          </>
        )}
        <button style={{...S.primaryBtn,marginBottom:10}} onClick={onScorecard}>📊 Full Scorecard</button>
        <button onClick={handleWA} style={{
          width:"100%",display:"block",padding:"13px",border:"2px solid #25D366",borderRadius:14,
          background:"#F0FFF4",color:"#16a34a",fontWeight:900,fontSize:14,
          cursor:"pointer",fontFamily:"'Barlow Condensed', sans-serif",letterSpacing:0.5,marginBottom:10
        }}>📲 Share on WhatsApp</button>

        {/* Save stats prompt */}
        {!askedSave ? (
          <div style={{background:T.blueLight,border:`1px solid ${T.border}`,borderRadius:14,padding:"14px",marginBottom:10}}>
            <div style={{color:T.text,fontWeight:800,fontSize:13,marginBottom:10}}>💾 Save match to history & player stats?</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <button onClick={()=>{setAskedSave(true);onHome(true);}} style={{padding:"11px",background:`linear-gradient(135deg,${T.blue},${T.blueDark})`,color:"#fff",border:"none",borderRadius:12,fontWeight:900,fontSize:13,cursor:"pointer",fontFamily:"'Barlow Condensed', sans-serif"}}>✅ Save</button>
              <button onClick={()=>{setAskedSave(true);onHome(false);}} style={{padding:"11px",background:T.offWhite,color:T.textMid,border:`1.5px solid ${T.border}`,borderRadius:12,fontWeight:900,fontSize:13,cursor:"pointer",fontFamily:"'Barlow Condensed', sans-serif"}}>🚫 Skip</button>
            </div>
          </div>
        ) : (
          <button style={S.ghostBtn} onClick={()=>onHome(true)}>🏠 Back to Home</button>
        )}
      </div>
      <style>{`@keyframes bounceIn{from{transform:scale(.3);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   APP ROOT
═══════════════════════════════════════════════ */
export default function App() {
  const [phase, setPhase]     = useState("home");
  const [hist, setHist]       = useState([]);
  const [teamA, setTeamA]     = useState(null);
  const [teamB, setTeamB]     = useState(null);
  const [overs, setOvers]     = useState(6);
  const [match, setMatch]     = useState(null);
  const [sessions, setSessions] = useState([]);

  useEffect(()=>{ loadData(STORE_KEY).then(d=>setSessions(d||[])); },[]);

  const go   = p => { setHist(h=>[...h,phase]); setPhase(p); };
  const back = () => { setHist(h=>{ const n=[...h]; const prev=n.pop(); setPhase(prev||"home"); return n; }); };
  const resetMatch = () => { setPhase("home"); setHist([]); setTeamA(null); setTeamB(null); setMatch(null); loadData(STORE_KEY).then(d=>setSessions(d||[])); };

  // Rematch: reuse same overs, go straight to TeamA setup with name pre-filled
  const handleRematch = (session) => {
    setOvers(session.overs||6);
    setTeamA(null); setTeamB(null); setMatch(null);
    setHist(["home","series"]);
    setPhase("teamA");
  };

  return (
    <div style={{maxWidth:480,margin:"0 auto",minHeight:"100vh",background:T.offWhite,fontFamily:"'Barlow Condensed','Segoe UI',sans-serif"}}>
      <style>{GLOBAL_CSS}</style>
      {phase==="home"    && <HomeScreen onStart={ov=>{setOvers(ov);go("teamA");}} onSeries={()=>go("series")} onPlayers={()=>go("players")} sessions={sessions}/>}
      {phase==="teamA"   && <TeamSetup label="Team A" accent={T.blue}  onDone={t=>{setTeamA(t);go("teamB");}} onBack={back}/>}
      {phase==="teamB"   && <TeamSetup label="Team B" accent={T.red}   onDone={t=>{setTeamB(t);go("toss");}} onBack={back}/>}
      {phase==="toss"    && teamA&&teamB && <CoinToss teamA={teamA} teamB={teamB} onResult={(bat,bowl)=>{setMatch({battingTeam:bat,bowlingTeam:bowl,overs});go("game");}} onBack={back}/>}
      {phase==="game"    && match && <GameScreen match={match} onEnd={resetMatch} onBack={back}/>}
      {phase==="players" && <PlayerDashboard onBack={back}/>}
      {phase==="series"  && <SeriesScreen onBack={back} onRematch={handleRematch}/>}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   STYLE SYSTEM — WHITE / RED / BLUE
═══════════════════════════════════════════════ */
const S = {
  topBar:   { display:"flex",alignItems:"center",justifyContent:"space-between",padding:"13px 16px",background:T.white,borderBottom:`2px solid ${T.red}`,position:"sticky",top:0,zIndex:30,boxShadow:`0 2px 8px ${T.shadow}` },
  card:     { background:T.white,border:`1px solid ${T.border}`,borderRadius:18,padding:"16px",boxShadow:`0 2px 10px ${T.shadow}` },
  cardLabel:{ color:T.blue,fontWeight:900,fontSize:11,letterSpacing:2,textTransform:"uppercase",fontFamily:"'Barlow Condensed', sans-serif" },
  inp:      { width:"100%",background:T.offWhite,border:`1.5px solid ${T.border}`,borderRadius:12,padding:"12px 14px",color:T.text,fontSize:15,outline:"none",boxSizing:"border-box",display:"block" },
  primaryBtn:{ background:`linear-gradient(135deg,${T.blue},${T.blueDark})`,color:"#fff",border:"none",borderRadius:14,padding:"15px 20px",fontSize:16,fontWeight:900,cursor:"pointer",width:"100%",display:"block",fontFamily:"'Barlow Condensed', sans-serif",boxShadow:`0 4px 20px ${T.shadow}`,letterSpacing:0.5,transition:"all .2s" },
  outlineBtn:{ background:T.white,color:T.blue,border:`2px solid ${T.blue}`,borderRadius:14,padding:"13px 20px",fontSize:14,fontWeight:900,cursor:"pointer",width:"100%",display:"block",fontFamily:"'Barlow Condensed', sans-serif",letterSpacing:0.5 },
  outlineBtnRed:{ background:T.white,color:T.red,border:`2px solid ${T.red}`,borderRadius:14,padding:"13px 20px",fontSize:14,fontWeight:900,cursor:"pointer",width:"100%",display:"block",fontFamily:"'Barlow Condensed', sans-serif",letterSpacing:0.5 },
  ghostBtn: { background:"transparent",color:T.textMid,border:`1.5px solid ${T.border}`,borderRadius:14,padding:"12px 20px",fontSize:13,fontWeight:700,cursor:"pointer",width:"100%",display:"block" },
  dangerBtn:{ background:`linear-gradient(135deg,${T.red},${T.redDark})`,color:"#fff",border:"none",borderRadius:14,padding:"15px 20px",fontSize:15,fontWeight:900,cursor:"pointer",width:"100%",display:"block",fontFamily:"'Barlow Condensed', sans-serif",boxShadow:"0 4px 16px rgba(212,43,43,0.25)" },
  cntBtn:   { background:T.blueLight,border:`1.5px solid ${T.border}`,color:T.blue,borderRadius:10,width:38,height:38,fontSize:22,fontWeight:900,cursor:"pointer" },
  backBtn:  { background:T.blueLight,border:`1.5px solid ${T.border}`,color:T.blue,borderRadius:10,padding:"7px 14px",fontSize:15,cursor:"pointer",fontWeight:900,fontFamily:"'Barlow Condensed', sans-serif" },
  actBtn:   { background:T.white,border:`1.5px solid ${T.border}`,borderRadius:12,color:T.blue,fontSize:18,fontWeight:700,padding:"11px 4px",cursor:"pointer",boxShadow:`0 1px 3px ${T.shadow}` },
  overlay:  { position:"fixed",inset:0,background:"rgba(13,27,75,0.55)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:200 },
  sheet:    { background:T.white,borderRadius:"24px 24px 0 0",padding:"20px 16px 36px",width:"100%",maxWidth:480,maxHeight:"85vh",overflowY:"auto",boxShadow:"0 -8px 40px rgba(0,0,0,0.15)",borderTop:`4px solid ${T.red}` },
  sheetHead:{ display:"flex",justifyContent:"space-between",alignItems:"center" },
  sheetTitle:{ color:T.text,fontWeight:900,fontSize:20,fontFamily:"'Barlow Condensed', sans-serif",letterSpacing:0.5 },
  sheetSub: { color:T.textSoft,fontSize:12,marginTop:2 },
  closeBtn: { background:T.offWhite,border:`1px solid ${T.border}`,color:T.textMid,borderRadius:10,width:34,height:34,fontSize:16,cursor:"pointer",fontWeight:800 },
};

const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;900&display=swap');
  * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  body { margin:0; background:${T.offWhite}; }
  ::-webkit-scrollbar { width:4px; }
  ::-webkit-scrollbar-track { background:${T.offWhite}; }
  ::-webkit-scrollbar-thumb { background:${T.border}; border-radius:4px; }
  input::placeholder { color:${T.textSoft}; }
  input:focus { border-color:${T.blue} !important; box-shadow:0 0 0 3px ${T.blueLight} !important; outline:none; }
  button:active { transform:scale(0.95); }
  @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
  @keyframes pulse { 0%,100%{opacity:0.8} 50%{opacity:1;transform:scale(1.01)} }
  @keyframes toastIn { from{opacity:0;transform:translateX(-50%) translateY(-10px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
  @keyframes bounceIn { from{transform:scale(.3);opacity:0} to{transform:scale(1);opacity:1} }
`;