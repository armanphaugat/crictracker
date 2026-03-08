import { useState, useEffect, useRef } from "react";
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell, RadarChart,
  Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, AreaChart, Area
} from "recharts";

/* ═══════════════════════════════════════════
   STORAGE
═══════════════════════════════════════════ */
const STORE_KEY = "gully-v8";
const SERIES_KEY = "gully-series-v2";
const PLAYERS_KEY = "gully-players-v2";

const loadData = async (key) => {
  try { const r = await window.storage.get(key); return r ? JSON.parse(r.value) : null; }
  catch { return null; }
};
const saveData = async (key, val) => {
  try { await window.storage.set(key, JSON.stringify(val)); } catch {}
};

/* ═══════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════ */
const RULES = [
  { icon: "🏏", t: "Batting", d: "Score runs by hitting the ball and running between wickets. 4 = ball reaches boundary rope. 6 = ball clears boundary in air." },
  { icon: "❌", t: "Wide Ball", d: "+1 extra run, ball is re-bowled. Does NOT count as a legal delivery." },
  { icon: "🔴", t: "No Ball", d: "+1 extra run. Does NOT count as a legal delivery. Next ball is a FREE HIT." },
  { icon: "⚡", t: "Free Hit", d: "After every No Ball, the VERY NEXT delivery is a Free Hit. Batsman cannot be out except run-out." },
  { icon: "🎯", t: "How You're Out", d: "Bowled · Caught · LBW · Run-Out · Stumped · Hit Wicket · Obstructing field." },
  { icon: "🔄", t: "Overs", d: "1 over = 6 legal deliveries. Wides and No Balls are NOT legal deliveries." },
  { icon: "🏆", t: "Winning", d: "Team batting second wins by reaching/passing the target." },
  { icon: "🌟", t: "Gully Rules", d: "Agree local rules BEFORE the match: one-pitch catches, tip-and-run, underarm bowling." },
];

const EMOJIS = ["😎","🔥","💪","⚡","🦁","🐯","🦅","🌟","💥","🎯","👑","🏆"];

const mkBatter = (name, isCaptain = false, isWK = false, emoji = "😎") =>
  ({ name, isCaptain, isWK, emoji, runs: 0, balls: 0, fours: 0, sixes: 0, dots: 0, out: false, outHow: "" });

const mkBowler = (name, isCaptain = false) =>
  ({ name, isCaptain, overs: 0, balls: 0, runs: 0, wkts: 0, wides: 0, noBalls: 0, dots: 0 });

const fmtOvers = (b) => `${Math.floor(b / 6)}.${b % 6}`;
const strikeRate = (r, b) => b > 0 ? ((r / b) * 100).toFixed(1) : "0.0";
const economy = (r, b) => b > 0 ? ((r / b) * 6).toFixed(2) : "0.00";
const vib = (p = 30) => { try { navigator.vibrate?.(p); } catch {} };

/* ═══════════════════════════════════════════
   COMMENTARY
═══════════════════════════════════════════ */
const COMM = {
  0: ["Dot ball! Excellent line and length.","Beaten outside off! No run.","Defended solidly back down the pitch.","Played and missed — going down leg!"],
  1: ["Quick single taken! Good running.","Pushed into the off-side for one.","Nudged fine leg for a single."],
  2: ["Two runs! Placed beautifully through covers.","Driven hard, diving stop at mid-off. Two runs.","Lofted over mid-on, sprinting back for two!"],
  3: ["THREE! Excellent running between the wickets!","Placed in the gap, they run three!"],
  4: ["FOUR! Cracked through the covers — boundary!","FOUR! Pulls it away fine, races to the rope!","FOUR! Drives magnificently through extra cover!","FOUR! Cuts hard, beats point all ends up!"],
  6: ["SIX! ENORMOUS HIT! That's gone into orbit!","SIX! MAXIMUM! Pure timing, effortless power!","SIX! COLOSSAL! The crowd goes wild!","SIX! THAT'S HUGE! Picks up the length early and LAUNCHES it!"],
  wide: ["Wide! Radar well off today.","Wasted delivery — straying too far outside.","Wide ball — gift to the batting side!"],
  nb: ["NO BALL! Front foot well over the crease!","NO BALL! Free Hit coming up — batsman rubbing hands!","No Ball! Bowler's nightmare — extra run AND a free hit!"],
  out: ["OUT! Plumb in front! That's stone dead LBW!","WICKET! Caught behind — feather edge!","OUT! Bowled 'im! Off stump cartwheeling!","OUT! Caught at cover — simple chance, well taken!","DISMISSED! Big blow for the batting side!"],
  dead: ["Dead ball called by the umpire.","Delivery called dead — no runs, no ball counted."],
  retired: ["The batsman has retired hurt — tough luck!"],
};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const genComm = (type, batter, bowler) => {
  if (type === "out") return `🔴 ${pick(COMM.out)} ${batter} departs!`;
  if (type === "wide") return `🟡 ${pick(COMM.wide)}`;
  if (type === "nb") return `🟣 ${pick(COMM.nb)}`;
  if (type === "dead") return `⬛ ${pick(COMM.dead)}`;
  if (type === 6) return `🟢 ${pick(COMM[6])} ${batter} hits ${bowler} for a maximum!`;
  if (type === 4) return `🔵 ${pick(COMM[4])} ${batter} off ${bowler}!`;
  return `⚫ ${pick(COMM[type] || COMM[0])}`;
};

/* ═══════════════════════════════════════════
   MOM SCORING
═══════════════════════════════════════════ */
const calcMOMScore = (bat, bowl) => {
  const hasBatted = bat && bat.balls > 0;
  const hasBowled = bowl && bowl.balls > 0;
  const batScore = (() => {
    if (!hasBatted) return 0;
    const sr = (bat.runs / bat.balls) * 100;
    const srBonus = sr > 100 ? (sr - 100) / 10 : sr < 60 ? -(60 - sr) / 15 : 0;
    const dotPenalty = (bat.dots / bat.balls) * 8;
    return bat.runs + srBonus + bat.fours * 1.5 + bat.sixes * 3 - dotPenalty;
  })();
  const bowlScore = (() => {
    if (!hasBowled) return 0;
    const eco = (bowl.runs / bowl.balls) * 6;
    const ecoBonus = eco < 6 ? (6 - eco) * 5 : eco > 10 ? -(eco - 10) * 3 : 0;
    return bowl.wkts * 25 + ecoBonus;
  })();
  if (hasBatted && !hasBowled) return { score: batScore, role: "bat", batScore, bowlScore: 0 };
  if (!hasBatted && hasBowled) return { score: bowlScore, role: "bowl", batScore: 0, bowlScore };
  if (hasBatted && hasBowled) {
    const synergy = (bat.runs >= 20 && bowl.wkts >= 1) ? 15 : 0;
    const total = batScore * 0.55 + bowlScore * 0.45 + synergy;
    return { score: total, role: "all", batScore, bowlScore, synergy };
  }
  return { score: -999, role: "none", batScore: 0, bowlScore: 0 };
};

/* ═══════════════════════════════════════════
   TOAST
═══════════════════════════════════════════ */
function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2800); return () => clearTimeout(t); }, [onDone]);
  return (
    <div style={{
      position:"fixed", top:72, left:"50%", transform:"translateX(-50%)",
      zIndex:9999, background:"linear-gradient(135deg,#1d4ed8,#7c3aed)",
      border:"1px solid rgba(255,255,255,0.2)",
      borderRadius:16, padding:"10px 22px", color:"#fff",
      fontWeight:800, fontSize:14, boxShadow:"0 8px 32px rgba(29,78,216,0.4)",
      whiteSpace:"nowrap", animation:"toastIn .3s cubic-bezier(.34,1.56,.64,1)",
      fontFamily:"'Archivo Black', sans-serif", letterSpacing:0.3
    }}>{msg}</div>
  );
}

/* ═══════════════════════════════════════════
   RADIO MODAL
═══════════════════════════════════════════ */
function RadioModal({ title, subtitle, options, onSelect, onClose, confirmLabel = "Confirm" }) {
  const [sel, setSel] = useState(null);
  const available = options.filter(o => !o.disabled);
  useEffect(() => { if (available.length === 1) setSel(available[0].value); }, []);

  return (
    <div style={C.overlay}>
      <div style={{ ...C.sheet, maxHeight:"80vh", overflowY:"auto" }}>
        <div style={C.sheetHead}>
          <div>
            <div style={C.sheetTitle}>{title}</div>
            {subtitle && <div style={C.sheetSub}>{subtitle}</div>}
          </div>
          <button style={C.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={{ marginTop:14 }}>
          {options.map((o, i) => (
            <label key={i} style={{
              display:"flex", alignItems:"center", gap:12,
              padding:"13px 14px", marginBottom:6,
              background: sel===o.value ? "rgba(29,78,216,0.08)" : "#fff",
              border:`2px solid ${sel===o.value?"#1d4ed8":"#e8edf5"}`,
              borderRadius:14, cursor:o.disabled?"not-allowed":"pointer",
              opacity:o.disabled?0.4:1, transition:"all .15s"
            }}>
              <input type="radio" name="modal_sel" checked={sel===o.value}
                disabled={o.disabled} onChange={() => !o.disabled && setSel(o.value)}
                style={{ accentColor:"#1d4ed8", width:18, height:18, flexShrink:0 }} />
              <div style={{ flex:1 }}>
                <div style={{ color:"#0f172a", fontWeight:700, fontSize:15, fontFamily:"'Archivo Black', sans-serif" }}>
                  {o.label}
                  {o.badge && <span style={{ marginLeft:8, color:"#1d4ed8", fontSize:10, background:"rgba(29,78,216,0.1)", padding:"2px 7px", borderRadius:6, fontWeight:800 }}>{o.badge}</span>}
                  {o.disabled && o.why && <span style={{ marginLeft:8, color:"#94a3b8", fontSize:11 }}>({o.why})</span>}
                </div>
                {o.sub && <div style={{ color:"#64748b", fontSize:12, marginTop:2 }}>{o.sub}</div>}
              </div>
            </label>
          ))}
        </div>
        <button style={{ ...C.primaryBtn, marginTop:10, opacity:sel===null?0.5:1 }}
          disabled={sel===null} onClick={() => sel!==null && onSelect(sel)}>
          ✅ {confirmLabel}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   HOME SCREEN
═══════════════════════════════════════════ */
function HomeScreen({ onStart, onSeries, onPlayers, sessions }) {
  const [overs, setOvers] = useState(6);
  const [showRules, setShowRules] = useState(false);

  const recentMatches = [...(sessions||[])].reverse().slice(0,4);

  return (
    <div style={C.page}>
      {/* Hero */}
      <div style={{
        background:"linear-gradient(160deg,#0a0f2e 0%,#1d4ed8 50%,#7c3aed 100%)",
        padding:"48px 24px 36px", textAlign:"center", position:"relative", overflow:"hidden"
      }}>
        {/* Decorative circles */}
        {[...Array(5)].map((_,i) => (
          <div key={i} style={{
            position:"absolute",
            width:[200,140,100,80,60][i], height:[200,140,100,80,60][i],
            border:"1px solid rgba(255,255,255,0.07)",
            borderRadius:"50%",
            top:["-30%","10%","60%","-10%","40%"][i],
            left:["-10%","70%","-5%","80%","40%"][i],
            animation:`pulse ${[8,6,7,5,9][i]}s ease-in-out infinite alternate`
          }}/>
        ))}
        <div style={{ position:"relative", zIndex:2 }}>
          <div style={{ fontSize:64, marginBottom:8, filter:"drop-shadow(0 4px 16px rgba(0,0,0,0.4))", animation:"float 3s ease-in-out infinite" }}>🏏</div>
          <h1 style={{
            color:"#fff", fontSize:36, fontWeight:900, margin:"0 0 4px",
            fontFamily:"'Archivo Black', sans-serif", letterSpacing:2,
            textShadow:"0 2px 20px rgba(124,58,237,0.6)"
          }}>GULLY CRICKET</h1>
          <p style={{ color:"rgba(255,255,255,0.6)", fontSize:13, margin:0, fontWeight:600, letterSpacing:3, textTransform:"uppercase" }}>Street Score Tracker</p>
        </div>
      </div>

      <div style={{ padding:"20px 16px 60px" }}>
        {/* Quick format presets */}
        <div style={{ ...C.card, marginBottom:14 }}>
          <div style={C.cardLabel}>⚡ QUICK FORMAT</div>
          <div style={{ display:"flex", gap:8, marginTop:10 }}>
            {[[5,"T5"],[6,"T6"],[10,"T10"],[20,"T20"]].map(([o,l]) => (
              <button key={o} onClick={() => setOvers(o)} style={{
                flex:1, padding:"10px 0",
                background: overs===o ? "linear-gradient(135deg,#1d4ed8,#7c3aed)" : "#f8fafc",
                color: overs===o ? "#fff" : "#475569",
                border: `2px solid ${overs===o?"transparent":"#e2e8f0"}`,
                borderRadius:12, fontWeight:900, fontSize:13,
                fontFamily:"'Archivo Black', sans-serif",
                cursor:"pointer", transition:"all .2s",
                boxShadow: overs===o ? "0 4px 16px rgba(29,78,216,0.3)" : "none"
              }}>{l}</button>
            ))}
          </div>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:14 }}>
            <span style={{ color:"#475569", fontSize:13, fontWeight:700 }}>Custom overs</span>
            <div style={{ display:"flex", alignItems:"center", gap:14 }}>
              <button style={C.cntBtn} onClick={() => setOvers(v => Math.max(1,v-1))}>−</button>
              <span style={{ color:"#0f172a", fontWeight:900, fontSize:28, minWidth:32, textAlign:"center", fontFamily:"'Archivo Black', sans-serif" }}>{overs}</span>
              <button style={C.cntBtn} onClick={() => setOvers(v => Math.min(50,v+1))}>+</button>
            </div>
          </div>
        </div>

        {/* Main action buttons */}
        <button style={{ ...C.primaryBtn, marginBottom:10 }} onClick={() => onStart(overs)}>
          🏏 Start New Match
        </button>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
          <button style={C.outlineBtn} onClick={onSeries}>🏆 Series Mode</button>
          <button style={C.outlineBtn} onClick={onPlayers}>👤 Player Stats</button>
        </div>
        <button style={{ ...C.ghostBtn }} onClick={() => setShowRules(true)}>📋 Cricket Rules</button>

        {/* Recent matches */}
        {recentMatches.length > 0 && (
          <div style={{ ...C.card, marginTop:20 }}>
            <div style={C.cardLabel}>📜 RECENT MATCHES</div>
            {recentMatches.map((s,i) => (
              <div key={i} style={{
                display:"flex", justifyContent:"space-between", alignItems:"center",
                padding:"12px 0", borderBottom: i<recentMatches.length-1?"1px solid #f1f5f9":"none"
              }}>
                <div>
                  <div style={{ color:"#0f172a", fontWeight:800, fontSize:13, fontFamily:"'Archivo Black', sans-serif" }}>{s.batName} <span style={{ color:"#94a3b8", fontWeight:400 }}>vs</span> {s.bowlName}</div>
                  <div style={{ color:"#94a3b8", fontSize:11, marginTop:2 }}>{new Date(s.date).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ color:"#1d4ed8", fontSize:12, fontWeight:700 }}>{s.overs} overs</div>
                  {s.winner && <div style={{ color:"#16a34a", fontSize:11, fontWeight:800 }}>{s.winner} won</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
      <style>{ANIM_CSS}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════
   TEAM SETUP
═══════════════════════════════════════════ */
function TeamSetup({ label, color, onDone, onBack }) {
  const [teamName, setTeamName] = useState("");
  const [players, setPlayers] = useState([]);
  const [inp, setInp] = useState("");
  const [captain, setCaptain] = useState(0);
  const [wk, setWk] = useState(-1);
  const [emojis, setEmojis] = useState([]);

  const addPlayer = () => {
    const name = inp.trim();
    if (!name || players.length >= 11) return;
    setPlayers(p => [...p, name]);
    setEmojis(e => [...e, EMOJIS[players.length % EMOJIS.length]]);
    setInp("");
  };

  const removePlayer = (idx) => {
    setPlayers(p => p.filter((_,i) => i!==idx));
    setEmojis(e => e.filter((_,i) => i!==idx));
    if (captain >= idx && captain > 0) setCaptain(c=>c-1);
    if (wk === idx) setWk(-1);
    else if (wk > idx) setWk(w=>w-1);
  };

  const confirm = () => {
    if (!teamName.trim() || players.length < 2) return;
    onDone({
      name: teamName.trim(),
      players: players.map((n,i) => mkBatter(n, i===captain, i===wk, emojis[i]||"😎")),
      bowlers: players.map((n,i) => mkBowler(n, i===captain)),
    });
  };

  return (
    <div style={C.page}>
      <div style={C.topBar}>
        <button style={C.backBtn} onClick={onBack}>‹ Back</button>
        <span style={{ color, fontWeight:900, fontSize:17, fontFamily:"'Archivo Black', sans-serif" }}>{label} Setup</span>
        <div style={{ width:60 }}/>
      </div>
      <div style={{ padding:"16px 16px 60px" }}>
        <div style={C.card}>
          <div style={C.cardLabel}>TEAM DETAILS</div>
          <input style={{ ...C.inp, marginTop:10 }} placeholder={`e.g. Street Lions, Colony XI`}
            value={teamName} onChange={e=>setTeamName(e.target.value)} />
        </div>

        <div style={{ ...C.card, marginTop:12 }}>
          <div style={C.cardLabel}>👥 PLAYERS (min 2, max 11)</div>
          <div style={{ display:"flex", gap:8, marginTop:10 }}>
            <input style={{ ...C.inp, flex:1 }} placeholder={`Player ${players.length+1} name`}
              value={inp} onChange={e=>setInp(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&addPlayer()} />
            <button style={{ ...C.cntBtn, width:48, height:48, fontSize:22, flexShrink:0 }} onClick={addPlayer}>+</button>
          </div>

          {players.length > 0 && (
            <div style={{ marginTop:14 }}>
              <div style={{ color:"#94a3b8", fontSize:10, fontWeight:800, marginBottom:8, letterSpacing:1, textTransform:"uppercase" }}>Tap © = Captain · 🧤 = Keeper</div>
              {players.map((p,i) => (
                <div key={i} style={{
                  display:"flex", alignItems:"center", gap:8,
                  padding:"11px 0", borderBottom: i<players.length-1?"1px solid #f1f5f9":"none"
                }}>
                  <span style={{ fontSize:22, flexShrink:0 }}>{emojis[i]||"😎"}</span>
                  <span style={{ color:"#0f172a", flex:1, fontWeight:700, fontSize:14 }}>{p}</span>
                  <button onClick={() => setCaptain(i)} style={{
                    background: captain===i?"#fbbf24":"#f8fafc",
                    border:`2px solid ${captain===i?"#f59e0b":"#e2e8f0"}`,
                    borderRadius:8, padding:"3px 8px", fontSize:11, fontWeight:900, cursor:"pointer",
                    color: captain===i?"#78350f":"#94a3b8"
                  }}>©</button>
                  <button onClick={() => setWk(wk===i?-1:i)} style={{
                    background: wk===i?"#dbeafe":"#f8fafc",
                    border:`2px solid ${wk===i?"#1d4ed8":"#e2e8f0"}`,
                    borderRadius:8, padding:"3px 8px", fontSize:12, cursor:"pointer"
                  }}>🧤</button>
                  <button onClick={() => removePlayer(i)} style={{ background:"none", border:"none", color:"#ef4444", fontSize:18, cursor:"pointer" }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {players.length >= 2 && (
          <button style={{ ...C.primaryBtn, marginTop:16, opacity:teamName.trim()?1:0.5 }} onClick={confirm}>
            ✅ Confirm {label}
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   COIN TOSS — RANDOM AUTO-PICK
═══════════════════════════════════════════ */
function CoinToss({ teamA, teamB, onResult, onBack }) {
  const [phase, setPhase] = useState("choose"); // choose | flip | decide | auto
  const [calledBy, setCalledBy] = useState(null); // teamA or teamB index or "auto"
  const [result, setResult] = useState(null);
  const [winner, setWinner] = useState(null);
  const [autoCountdown, setAutoCountdown] = useState(3);

  const flip = (choice) => {
    setPhase("flip"); vib(50);
    setTimeout(() => {
      const r = Math.random() < 0.5 ? "H" : "T";
      const won = r === choice;
      setResult(r);
      setWinner(won ? calledBy : (calledBy === teamA.name ? teamB.name : teamA.name));
      setPhase("decide"); vib([60,30,80]);
    }, 1800);
  };

  const autoToss = () => {
    setPhase("auto"); vib(50);
    let cd = 3;
    const interval = setInterval(() => {
      cd--;
      setAutoCountdown(cd);
      if (cd <= 0) {
        clearInterval(interval);
        const r = Math.random() < 0.5 ? "H" : "T";
        const w = Math.random() < 0.5 ? teamA.name : teamB.name;
        setResult(r);
        setWinner(w);
        setPhase("decide"); vib([60,30,80]);
      }
    }, 700);
  };

  const decide = (batFirst) => {
    const bat = winner === teamA.name ? (batFirst ? teamA : teamB) : (batFirst ? teamB : teamA);
    const bowl = bat === teamA ? teamB : teamA;
    onResult(bat, bowl);
  };

  return (
    <div style={C.page}>
      <div style={C.topBar}>
        <button style={C.backBtn} onClick={onBack}>‹ Back</button>
        <span style={{ color:"#1d4ed8", fontWeight:900, fontSize:17, fontFamily:"'Archivo Black', sans-serif" }}>Coin Toss</span>
        <div style={{ width:60 }}/>
      </div>
      <div style={{ padding:"32px 20px", textAlign:"center" }}>
        <div style={{ ...C.card, padding:"24px 20px" }}>
          {phase === "choose" && (
            <>
              <p style={{ color:"#64748b", fontSize:14, marginBottom:20 }}>Who calls the toss?</p>
              <div style={{ display:"flex", gap:10, marginBottom:20 }}>
                <button style={{ ...C.outlineBtn, flex:1, padding:"12px" }} onClick={() => { setCalledBy(teamA.name); setPhase("call"); }}>
                  {teamA.name}
                </button>
                <button style={{ ...C.outlineBtn, flex:1, padding:"12px" }} onClick={() => { setCalledBy(teamB.name); setPhase("call"); }}>
                  {teamB.name}
                </button>
              </div>
              <div style={{ color:"#94a3b8", fontSize:13, margin:"12px 0" }}>— or —</div>
              <button style={{ ...C.ghostBtn, width:"100%" }} onClick={autoToss}>🎲 Auto-Random Toss</button>
            </>
          )}

          {phase === "call" && (
            <>
              <div style={{ fontSize:72, margin:"16px 0", animation:"float 2s ease-in-out infinite" }}>🪙</div>
              <p style={{ color:"#0f172a", fontWeight:800, marginBottom:20, fontSize:16, fontFamily:"'Archivo Black', sans-serif" }}>{calledBy} calls:</p>
              <div style={{ display:"flex", gap:12 }}>
                <button style={{ ...C.primaryBtn, flex:1 }} onClick={() => flip("H")}>👑 Heads</button>
                <button style={{ ...C.dangerBtn, flex:1 }} onClick={() => flip("T")}>🦅 Tails</button>
              </div>
            </>
          )}

          {phase === "auto" && (
            <>
              <div style={{ fontSize:80, margin:"24px 0", display:"inline-block", animation:"spin 0.3s linear infinite" }}>🪙</div>
              <p style={{ color:"#1d4ed8", fontWeight:900, fontSize:20, fontFamily:"'Archivo Black', sans-serif" }}>Auto Toss in {autoCountdown}…</p>
            </>
          )}

          {phase === "flip" && (
            <div style={{ margin:"24px 0" }}>
              <div style={{ fontSize:80, display:"inline-block", animation:"spin 0.3s linear infinite" }}>🪙</div>
              <p style={{ color:"#1d4ed8", fontWeight:800, marginTop:16, fontSize:18 }}>Flipping…</p>
            </div>
          )}

          {phase === "decide" && (
            <>
              <div style={{ fontSize:72, margin:"12px 0", animation:"bounceIn .5s cubic-bezier(.34,1.56,.64,1)" }}>{result==="H"?"👑":"🦅"}</div>
              <p style={{ color:"#1d4ed8", fontSize:24, fontWeight:900, fontFamily:"'Archivo Black', sans-serif" }}>{result==="H"?"HEADS!":"TAILS!"}</p>
              <div style={{ background:"linear-gradient(135deg,rgba(29,78,216,0.08),rgba(124,58,237,0.08))", borderRadius:16, padding:"14px", margin:"12px 0 20px", border:"1px solid rgba(29,78,216,0.15)" }}>
                <p style={{ color:"#0f172a", fontWeight:900, margin:"0 0 4px", fontSize:18, fontFamily:"'Archivo Black', sans-serif" }}>🏆 {winner} won!</p>
                <p style={{ color:"#64748b", fontSize:13, margin:0 }}>Choose your preference:</p>
              </div>
              <div style={{ display:"flex", gap:12 }}>
                <button style={{ ...C.primaryBtn, flex:1 }} onClick={() => decide(true)}>🏏 Bat First</button>
                <button style={{ ...C.dangerBtn, flex:1 }} onClick={() => decide(false)}>⚾ Bowl First</button>
              </div>
            </>
          )}
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotateY(0)}to{transform:rotateY(720deg)}} @keyframes bounceIn{from{transform:scale(0.3);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════
   GAME SCREEN
═══════════════════════════════════════════ */
function GameScreen({ match, onEnd, onBack }) {
  const { battingTeam, bowlingTeam, overs: maxOvers } = match;
  const TOTAL_BALLS = maxOvers * 6;

  const initState = () => ({
    inn:1, target:null,
    score:0, wickets:0, legalBalls:0, totalDeliveries:0,
    extras:{wides:0,noBalls:0},
    batters:JSON.parse(JSON.stringify(battingTeam.players)),
    strikerIdx:0, nonStrikerIdx:1, nextBatterIdx:2,
    bowlers:JSON.parse(JSON.stringify(bowlingTeam.bowlers||bowlingTeam.players.map(p=>mkBowler(p.name,p.isCaptain)))),
    bowlerIdx:0, prevBowlerIdx:-1,
    currentOverBalls:[], completedOvers:[],
    deliveryLog:[],
    freeHit:false,
    partnerships:[{bat1:0,bat2:1,runs:0,balls:0}],
    commentary:[],
    inn1Snapshot:null,
  });

  const [G, setG] = useState(initState);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [matchResult, setMatchResult] = useState(null);
  const [activeTab, setActiveTab] = useState("score"); // score | bat | bowl

  const oversDisplay = fmtOvers(G.legalBalls);
  const crr = G.legalBalls > 0 ? ((G.score/G.legalBalls)*6).toFixed(2) : "0.00";
  const rrr = (G.target!==null && G.inn===2 && TOTAL_BALLS-G.legalBalls>0)
    ? (((G.target+1-G.score)/((TOTAL_BALLS-G.legalBalls)/6))).toFixed(2) : null;
  const inningsBatTeam = G.inn===1 ? battingTeam.name : bowlingTeam.name;
  const inningsBowlTeam = G.inn===1 ? bowlingTeam.name : battingTeam.name;
  const striker = G.batters[G.strikerIdx];
  const nonStriker = G.batters[G.nonStrikerIdx];
  const currentBowler = G.bowlers[G.bowlerIdx];
  const showToast = (msg) => { setToast(msg); vib(50); };

  const triggerEnd = (winner, margin) => {
    setMatchResult({ winner, margin });
    setModal("result");
    loadData(STORE_KEY).then(sessions => {
      const arr = sessions || [];
      arr.push({ id:Date.now().toString(), batName:battingTeam.name, bowlName:bowlingTeam.name, overs:maxOvers, date:new Date().toISOString(), winner, margin });
      saveData(STORE_KEY, arr);
    });
    // Save player stats
    updatePlayerStats(G, winner, battingTeam, bowlingTeam);
  };

  const updatePlayerStats = async (finalG, winner, bt, bwt) => {
    const existing = await loadData(PLAYERS_KEY) || {};
    const inn1Bat = finalG.inn1Snapshot?.batters || (finalG.inn===1?finalG.batters:[]);
    const inn1Bowl = finalG.inn1Snapshot?.bowlers || (finalG.inn===1?finalG.bowlers:[]);
    const inn2Bat = finalG.inn===2?finalG.batters:[];
    const inn2Bowl = finalG.inn===2?finalG.bowlers:[];

    const update = (name, team, bat, bowl) => {
      if (!existing[name]) existing[name] = { name, team, matches:0, runs:0, balls:0, fours:0, sixes:0, wkts:0, bowlBalls:0, bowlRuns:0, highScore:0, bestFigures:{wkts:0,runs:999}, wins:0 };
      const p = existing[name];
      p.matches++;
      if (bat && bat.balls>0) {
        p.runs += bat.runs; p.balls += bat.balls;
        p.fours += bat.fours; p.sixes += bat.sixes;
        if (bat.runs > p.highScore) p.highScore = bat.runs;
      }
      if (bowl && bowl.balls>0) {
        p.wkts += bowl.wkts; p.bowlBalls += bowl.balls; p.bowlRuns += bowl.runs;
        if (bowl.wkts > p.bestFigures.wkts || (bowl.wkts===p.bestFigures.wkts && bowl.runs<p.bestFigures.runs))
          p.bestFigures = {wkts:bowl.wkts, runs:bowl.runs};
      }
      if (team===winner) p.wins++;
    };

    bt.players.forEach(p => {
      const bat = inn1Bat.find(b=>b.name===p.name);
      const bowl = inn2Bowl.find(b=>b.name===p.name);
      update(p.name, bt.name, bat, bowl);
    });
    bwt.players.forEach(p => {
      const bat = inn2Bat.find(b=>b.name===p.name);
      const bowl = inn1Bowl.find(b=>b.name===p.name);
      update(p.name, bwt.name, bat, bowl);
    });
    await saveData(PLAYERS_KEY, existing);
  };

  const startInnings2 = (inn1Score, prevG) => {
    const newG = {
      inn:2, target:inn1Score, score:0, wickets:0, legalBalls:0, totalDeliveries:0,
      extras:{wides:0,noBalls:0},
      batters:JSON.parse(JSON.stringify(bowlingTeam.players)),
      strikerIdx:0, nonStrikerIdx:1, nextBatterIdx:2,
      bowlers:JSON.parse(JSON.stringify(battingTeam.bowlers||battingTeam.players.map(p=>mkBowler(p.name,p.isCaptain)))),
      bowlerIdx:0, prevBowlerIdx:-1,
      currentOverBalls:[], completedOvers:[], deliveryLog:[],
      freeHit:false,
      partnerships:[{bat1:0,bat2:1,runs:0,balls:0}],
      commentary:[],
      inn1Snapshot:{ batters:prevG.batters, bowlers:prevG.bowlers, score:inn1Score, extras:prevG.extras, completedOvers:prevG.completedOvers, deliveryLog:prevG.deliveryLog },
    };
    setG(newG);
    showToast(`🔔 Innings 2 — Target: ${inn1Score+1}`);
    setTimeout(() => setModal("selectBowler"), 400);
  };

  const deliver = (type) => {
    if (modal==="result") return;
    setG(prev => {
      const G2 = JSON.parse(JSON.stringify(prev));
      const striker2 = G2.batters[G2.strikerIdx];
      const bowler2 = G2.bowlers[G2.bowlerIdx];
      const isLegal = (type!=="wide" && type!=="nb" && type!=="dead");

      if (type === "dead") {
        G2.commentary.unshift(genComm("dead", striker2?.name, bowler2?.name));
        G2.totalDeliveries += 1;
        return G2;
      }
      if (type === "wide") {
        G2.score+=1; G2.extras.wides+=1; bowler2.runs+=1; bowler2.wides+=1;
        G2.currentOverBalls.push("Wd"); G2.freeHit=false;
      } else if (type === "nb") {
        G2.score+=1; G2.extras.noBalls+=1; bowler2.runs+=1; bowler2.noBalls+=1;
        G2.currentOverBalls.push("NB"); G2.freeHit=true;
      } else {
        G2.legalBalls+=1; striker2.balls+=1; bowler2.balls+=1;
        G2.freeHit=false;
        if (type==="out") {
          G2.wickets+=1; striker2.out=true; bowler2.wkts+=1;
          G2.currentOverBalls.push("W");
          const pp=G2.partnerships; if(pp.length>0) pp[pp.length-1].balls+=1;
        } else {
          const runs=type;
          G2.score+=runs; striker2.runs+=runs; bowler2.runs+=runs;
          if(runs===0){striker2.dots+=1; bowler2.dots=(bowler2.dots||0)+1;}
          if(runs===4) striker2.fours+=1;
          if(runs===6) striker2.sixes+=1;
          G2.currentOverBalls.push(runs===0?"·":String(runs));
          const pp=G2.partnerships; if(pp.length>0){pp[pp.length-1].runs+=runs; pp[pp.length-1].balls+=1;}
          if(runs%2===1){const tmp=G2.strikerIdx; G2.strikerIdx=G2.nonStrikerIdx; G2.nonStrikerIdx=tmp;}
        }
      }

      G2.totalDeliveries+=1;
      G2.deliveryLog.push({ n:G2.totalDeliveries, type, scoreAfter:G2.score, isLegal });
      G2.commentary.unshift(genComm(type, striker2?.name, bowler2?.name));

      // Milestone
      if(isLegal && type!=="out" && typeof type==="number") {
        const newRuns = striker2.runs;
        [25,50,75,100].forEach(m => {
          if(newRuns>=m && (newRuns-type)<m)
            setTimeout(()=>showToast(`🎉 ${striker2.name} ${m===50?"FIFTY! 🏅":m===100?"CENTURY! 🏆":m+" up!"}`),100);
        });
      }

      const overDone = isLegal && G2.legalBalls%6===0 && G2.legalBalls>0;
      if(overDone && type!=="out") {
        G2.completedOvers.push([...G2.currentOverBalls]);
        G2.currentOverBalls=[];
        bowler2.overs+=1;
        const tmp=G2.strikerIdx; G2.strikerIdx=G2.nonStrikerIdx; G2.nonStrikerIdx=tmp;
      }

      const allOut = G2.wickets >= G2.batters.length;
      const oversFinished = G2.legalBalls >= TOTAL_BALLS;
      const targetChased = G2.target!==null && G2.score>G2.target;

      if(G2.inn===1 && (allOut||oversFinished)) {
        const snap=JSON.parse(JSON.stringify(G2));
        setTimeout(()=>startInnings2(G2.score, snap), 100);
        return G2;
      }
      if(G2.inn===2) {
        if(targetChased){
          const wktsLeft=G2.batters.filter(b=>!b.out).length;
          setTimeout(()=>triggerEnd(inningsBatTeam,`${wktsLeft} wicket${wktsLeft!==1?"s":""}`),100);
          return G2;
        }
        if(allOut||oversFinished) {
          if(G2.score<G2.target) setTimeout(()=>triggerEnd(battingTeam.name,`${G2.target-G2.score} run${G2.target-G2.score!==1?"s":""}`),100);
          else setTimeout(()=>triggerEnd("Match TIED",""),100);
          return G2;
        }
      }

      if(type==="out") {
        const nextAvail=G2.batters.findIndex((b,i)=>!b.out && i!==G2.nonStrikerIdx && i!==G2.strikerIdx);
        if(nextAvail>=0) setTimeout(()=>setModal("selectBatter"),200);
      }
      if(overDone && type!=="out") setTimeout(()=>setModal("selectBowler"),200);
      return G2;
    });
  };

  const undoDelivery = () => {
    setG(prev => {
      if(prev.deliveryLog.length===0) return prev;
      const G2=JSON.parse(JSON.stringify(prev));
      const last=G2.deliveryLog.pop();
      const striker2=G2.batters[G2.strikerIdx];
      const bowler2=G2.bowlers[G2.bowlerIdx];
      if(last.type==="wide"){G2.score-=1;G2.extras.wides-=1;bowler2.runs-=1;bowler2.wides-=1;G2.currentOverBalls.pop();}
      else if(last.type==="nb"){G2.score-=1;G2.extras.noBalls-=1;bowler2.runs-=1;bowler2.noBalls-=1;G2.currentOverBalls.pop();G2.freeHit=false;}
      else if(last.type!=="dead"){
        G2.legalBalls-=1; striker2.balls-=1; bowler2.balls-=1;
        if(last.type==="out"){G2.wickets-=1;striker2.out=false;bowler2.wkts-=1;}
        else{const r=last.type;G2.score-=r;striker2.runs-=r;bowler2.runs-=r;if(r===0)striker2.dots-=1;if(r===4)striker2.fours-=1;if(r===6)striker2.sixes-=1;if(r%2===1){const tmp=G2.strikerIdx;G2.strikerIdx=G2.nonStrikerIdx;G2.nonStrikerIdx=tmp;}}
        if(G2.currentOverBalls.length>0)G2.currentOverBalls.pop();
      }
      return G2;
    });
    showToast("↩ Undone");
  };

  const chipStyle = (label) => {
    const bg = label==="W"?"#dc2626":label==="NB"?"#9333ea":label==="Wd"?"#d97706":label==="6"?"#16a34a":label==="4"?"#1d4ed8":label==="·"?"#94a3b8":"#475569";
    return { display:"inline-flex", alignItems:"center", justifyContent:"center", minWidth:28, height:28, borderRadius:8, fontSize:11, fontWeight:900, background:bg, color:"#fff", flexShrink:0 };
  };

  const availableBatters = G.batters.map((b,i) => ({
    label:`${b.emoji||"😎"} ${b.name}`, value:i,
    disabled:b.out||i===G.nonStrikerIdx||i===G.strikerIdx,
    badge:b.isCaptain?"C":b.isWK?"WK":null,
    sub:b.balls>0?`${b.runs}(${b.balls}) · SR ${strikeRate(b.runs,b.balls)}`:"Yet to bat",
    why:b.out?"Out":(i===G.nonStrikerIdx||i===G.strikerIdx)?"At crease":null,
  }));

  const availableBowlers = G.bowlers.map((b,i) => ({
    label:b.name, value:i, disabled:i===G.prevBowlerIdx,
    badge:b.isCaptain?"C":null,
    sub:b.balls>0?`${fmtOvers(b.balls)} ov · ${b.runs}r · ${b.wkts}w · Eco ${economy(b.runs,b.balls)}`:"Yet to bowl",
    why:i===G.prevBowlerIdx?"Bowled last over":null,
  }));

  // Progress bar for overs
  const overPct = (G.legalBalls/TOTAL_BALLS)*100;

  return (
    <div style={{ ...C.page, background:"#0d1117" }}>
      {/* STICKY HEADER */}
      <div style={{
        background:"linear-gradient(90deg,#0a0f2e,#1d4ed8)",
        padding:"10px 14px", display:"flex", alignItems:"center", gap:8,
        position:"sticky", top:0, zIndex:40,
        boxShadow:"0 2px 20px rgba(29,78,216,0.4)"
      }}>
        <button style={{ background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.15)", color:"#fff", borderRadius:10, padding:"6px 12px", fontWeight:900, cursor:"pointer", fontSize:15 }} onClick={onBack}>‹</button>
        <div style={{ flex:1, textAlign:"center" }}>
          <div style={{ color:"#fff", fontWeight:900, fontSize:14, fontFamily:"'Archivo Black', sans-serif" }}>{inningsBatTeam} <span style={{ color:"rgba(255,255,255,0.4)", fontWeight:400, fontSize:12 }}>vs</span> {inningsBowlTeam}</div>
          <div style={{ color:"rgba(255,255,255,0.5)", fontSize:10 }}>
            {maxOvers} overs{G.target!==null && <span style={{ color:"#fbbf24", fontWeight:800 }}> · Target: {G.target+1}</span>}
          </div>
        </div>
        <button style={{ background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.15)", color:"#fff", borderRadius:10, padding:"6px 10px", fontSize:14, cursor:"pointer" }} onClick={() => setModal("rules")}>📋</button>
      </div>

      {/* FREE HIT BANNER */}
      {G.freeHit && (
        <div style={{ background:"linear-gradient(90deg,#7c3aed,#a855f7)", padding:"10px", textAlign:"center", color:"#fff", fontWeight:900, fontSize:13, fontFamily:"'Archivo Black', sans-serif", animation:"pulse 1s ease-in-out infinite", letterSpacing:1 }}>
          ⚡ FREE HIT — Cannot be dismissed except Run-Out!
        </div>
      )}

      {/* MAIN SCOREBOARD */}
      <div style={{ background:"linear-gradient(135deg,#0a0f2e 0%,#0d1117 100%)", padding:"20px 16px", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"center", gap:6, marginBottom:4 }}>
          <span style={{ fontSize:72, fontWeight:900, color:"#fff", lineHeight:1, fontFamily:"'Archivo Black', sans-serif", textShadow:"0 0 40px rgba(29,78,216,0.5)" }}>{G.score}</span>
          <span style={{ fontSize:32, color:"rgba(255,255,255,0.4)", fontWeight:700, marginBottom:8 }}>/{G.wickets}</span>
        </div>
        <div style={{ display:"flex", justifyContent:"center", gap:20, color:"rgba(255,255,255,0.6)", fontSize:13, fontWeight:600, marginBottom:12 }}>
          <span>🕐 {oversDisplay}/{maxOvers}</span>
          <span>CRR <strong style={{ color:"#60a5fa" }}>{crr}</strong></span>
          {rrr && <span>RRR <strong style={{ color:parseFloat(rrr)>12?"#f87171":"#4ade80" }}>{rrr}</strong></span>}
        </div>

        {/* Over progress bar */}
        <div style={{ background:"rgba(255,255,255,0.08)", borderRadius:8, height:6, overflow:"hidden", marginBottom:8 }}>
          <div style={{ height:"100%", width:`${overPct}%`, background:"linear-gradient(90deg,#1d4ed8,#7c3aed)", borderRadius:8, transition:"width .3s" }}/>
        </div>

        {(G.extras.wides>0||G.extras.noBalls>0) && (
          <div style={{ display:"flex", justifyContent:"center", gap:12 }}>
            {G.extras.wides>0&&<span style={{ color:"#fcd34d", fontSize:11, fontWeight:800, background:"rgba(253,212,77,0.1)", padding:"2px 8px", borderRadius:6 }}>Wd: {G.extras.wides}</span>}
            {G.extras.noBalls>0&&<span style={{ color:"#c4b5fd", fontSize:11, fontWeight:800, background:"rgba(196,181,253,0.1)", padding:"2px 8px", borderRadius:6 }}>NB: {G.extras.noBalls}</span>}
          </div>
        )}
      </div>

      {/* CURRENT OVER */}
      <div style={{ background:"rgba(255,255,255,0.03)", borderBottom:"1px solid rgba(255,255,255,0.06)", padding:"8px 14px", display:"flex", alignItems:"center", flexWrap:"wrap", gap:5 }}>
        <span style={{ color:"rgba(255,255,255,0.3)", fontSize:10, fontWeight:800, flexShrink:0, letterSpacing:1, textTransform:"uppercase" }}>Over {Math.floor(G.legalBalls/6)+1}:</span>
        {G.currentOverBalls.length===0&&<span style={{ color:"rgba(255,255,255,0.2)", fontSize:12 }}>—</span>}
        {G.currentOverBalls.map((b,i)=><span key={i} style={chipStyle(b)}>{b}</span>)}
      </div>

      {/* TABS */}
      <div style={{ display:"flex", background:"rgba(255,255,255,0.03)", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
        {[["score","⚡ Live"],["bat","🏏 Batting"],["bowl","⚾ Bowling"]].map(([t,l])=>(
          <button key={t} onClick={()=>setActiveTab(t)} style={{
            flex:1, padding:"10px 0", border:"none", cursor:"pointer",
            background:"transparent", color:activeTab===t?"#60a5fa":"rgba(255,255,255,0.35)",
            fontWeight:activeTab===t?900:600, fontSize:12,
            borderBottom:activeTab===t?"2px solid #1d4ed8":"2px solid transparent",
            fontFamily:"'Archivo Black', sans-serif"
          }}>{l}</button>
        ))}
      </div>

      {/* TAB CONTENT */}
      {activeTab==="score" && (
        <div style={{ padding:"10px 12px" }}>
          {/* Batters */}
          <div style={{ display:"flex", gap:8, marginBottom:10 }}>
            {[[G.strikerIdx,true],[G.nonStrikerIdx,false]].map(([idx,isStriker])=>{
              const b=G.batters[idx];
              if(!b) return null;
              return (
                <div key={idx} style={{
                  flex:1, background: isStriker?"linear-gradient(135deg,rgba(29,78,216,0.15),rgba(124,58,237,0.1))":"rgba(255,255,255,0.04)",
                  border:`2px solid ${isStriker?"rgba(29,78,216,0.6)":"rgba(255,255,255,0.08)"}`,
                  borderRadius:16, padding:"12px 14px"
                }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                    <span style={{ fontSize:20 }}>{b.emoji||"😎"}</span>
                    {isStriker&&<span style={{ color:"#60a5fa", fontSize:12, fontWeight:900 }}>▶</span>}
                    {b.isCaptain&&<span style={{ color:"#fbbf24", fontSize:10 }}>©</span>}
                    {b.isWK&&<span style={{ fontSize:10 }}>🧤</span>}
                    <span style={{ color:"#f1f5f9", fontWeight:800, fontSize:13, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontFamily:"'Archivo Black', sans-serif" }}>{b.name}</span>
                  </div>
                  <div style={{ color:isStriker?"#60a5fa":"#e2e8f0", fontWeight:900, fontSize:30, lineHeight:1, fontFamily:"'Archivo Black', sans-serif" }}>{b.runs}</div>
                  <div style={{ color:"rgba(255,255,255,0.4)", fontSize:11, marginTop:2 }}>{b.balls}b · SR {strikeRate(b.runs,b.balls)}</div>
                  <div style={{ display:"flex", gap:8, marginTop:4 }}>
                    {b.fours>0&&<span style={{ color:"#60a5fa", fontSize:11, fontWeight:800, background:"rgba(96,165,250,0.1)", padding:"1px 6px", borderRadius:5 }}>{b.fours}×4</span>}
                    {b.sixes>0&&<span style={{ color:"#4ade80", fontSize:11, fontWeight:800, background:"rgba(74,222,128,0.1)", padding:"1px 6px", borderRadius:5 }}>{b.sixes}×6</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bowler */}
          <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:12, padding:"10px 14px", marginBottom:10, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ color:"rgba(255,255,255,0.6)", fontSize:12 }}>⚾ <strong style={{ color:"#f1f5f9", fontFamily:"'Archivo Black', sans-serif" }}>{currentBowler?.name||"—"}</strong></span>
            {currentBowler&&currentBowler.balls>0&&<span style={{ color:"rgba(255,255,255,0.4)", fontSize:11 }}>{fmtOvers(currentBowler.balls)} · {currentBowler.wkts}w · Eco {economy(currentBowler.runs,currentBowler.balls)}</span>}
          </div>

          {/* RUN BUTTONS */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:6, marginBottom:6 }}>
            {[0,1,2,3,4,6].map(r=>(
              <button key={r} onClick={()=>deliver(r)} style={{
                border:`2px solid ${r===4?"rgba(96,165,250,0.4)":r===6?"rgba(74,222,128,0.4)":"rgba(255,255,255,0.1)"}`,
                borderRadius:14, background:r===6?"rgba(74,222,128,0.08)":r===4?"rgba(96,165,250,0.08)":"rgba(255,255,255,0.04)",
                color:r===4?"#60a5fa":r===6?"#4ade80":r===0?"rgba(255,255,255,0.3)":"#f1f5f9",
                fontSize:r>=4?24:20, fontWeight:900, padding:"18px 0", cursor:"pointer",
                fontFamily:"'Archivo Black', sans-serif",
                transition:"all .15s", boxShadow: r===6?"0 0 20px rgba(74,222,128,0.2)":r===4?"0 0 20px rgba(96,165,250,0.2)":"none"
              }}>{r===0?"·":r}</button>
            ))}
          </div>

          {/* EXTRAS */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:6, marginBottom:8 }}>
            <button onClick={()=>deliver("wide")} style={{ ...C.extraDark, borderColor:"rgba(251,191,36,0.3)", background:"rgba(251,191,36,0.05)" }}>
              <span style={{ color:"#fbbf24", fontWeight:900, fontSize:11, fontFamily:"'Archivo Black', sans-serif" }}>WIDE</span>
              <span style={{ color:"rgba(255,255,255,0.3)", fontSize:9 }}>+1</span>
            </button>
            <button onClick={()=>deliver("nb")} style={{ ...C.extraDark, borderColor:"rgba(168,85,247,0.3)", background:"rgba(168,85,247,0.05)" }}>
              <span style={{ color:"#a855f7", fontWeight:900, fontSize:11, fontFamily:"'Archivo Black', sans-serif" }}>NO BALL</span>
              <span style={{ color:"rgba(255,255,255,0.3)", fontSize:9 }}>+1 🔒FH</span>
            </button>
            <button onClick={()=>deliver("out")} style={{ ...C.extraDark, borderColor:"rgba(239,68,68,0.3)", background:"rgba(239,68,68,0.06)" }}>
              <span style={{ color:"#ef4444", fontWeight:900, fontSize:15, fontFamily:"'Archivo Black', sans-serif" }}>OUT</span>
              <span style={{ color:"rgba(255,255,255,0.3)", fontSize:9 }}>wicket ✕</span>
            </button>
            <button onClick={()=>deliver("dead")} style={{ ...C.extraDark, borderColor:"rgba(148,163,184,0.2)", background:"rgba(255,255,255,0.02)" }}>
              <span style={{ color:"#94a3b8", fontSize:11, fontFamily:"'Archivo Black', sans-serif" }}>DEAD</span>
              <span style={{ color:"rgba(255,255,255,0.2)", fontSize:9 }}>ball</span>
            </button>
          </div>

          {/* ACTION ROW */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:5, marginBottom:5 }}>
            {[["🔄","striker"],["⚾","selectBowler"],["📊","scorecard"],["📈","graph"],["↩","undo"]].map(([icon,action])=>(
              <button key={action} onClick={()=>action==="undo"?undoDelivery():setModal(action)} style={C.darkActBtn}>{icon}</button>
            ))}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:5 }}>
            {[["💬","comm"],["🤝","partnership"],["📜","overlog"],["🏅","mom"]].map(([icon,m])=>(
              <button key={m} onClick={()=>setModal(m)} style={C.darkActBtn}>{icon}</button>
            ))}
          </div>
        </div>
      )}

      {activeTab==="bat" && (
        <div style={{ padding:"10px 12px" }}>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr>
                  {["Batsman","R","B","4","6","SR"].map(h=>(
                    <th key={h} style={{ padding:"8px 5px", textAlign:h==="Batsman"?"left":"center", color:"rgba(255,255,255,0.4)", fontWeight:800, borderBottom:"1px solid rgba(255,255,255,0.06)", fontSize:10, letterSpacing:1, textTransform:"uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {G.batters.filter(b=>b.balls>0||b.out).map((b,i)=>(
                  <tr key={i} style={{ borderBottom:"1px solid rgba(255,255,255,0.04)", background:i===G.strikerIdx?"rgba(29,78,216,0.08)":i===G.nonStrikerIdx?"rgba(255,255,255,0.02)":"transparent" }}>
                    <td style={{ padding:"9px 5px", color:b.out?"rgba(255,255,255,0.25)":"#f1f5f9", fontWeight:700 }}>
                      <span style={{ fontSize:14, marginRight:5 }}>{b.emoji||"😎"}</span>
                      {b.out&&<span style={{ color:"#ef4444" }}>✕ </span>}
                      {b.name}{b.isCaptain&&<span style={{ color:"#fbbf24", fontSize:9 }}> ©</span>}
                      {i===G.strikerIdx&&<span style={{ color:"#60a5fa", fontSize:9 }}> ▶</span>}
                    </td>
                    <td style={{ textAlign:"center", fontWeight:900, color:b.runs>=50?"#fbbf24":b.runs>=25?"#4ade80":"#f1f5f9", fontFamily:"'Archivo Black', sans-serif" }}>{b.runs}</td>
                    <td style={{ textAlign:"center", color:"rgba(255,255,255,0.5)" }}>{b.balls}</td>
                    <td style={{ textAlign:"center", color:"#60a5fa", fontWeight:800 }}>{b.fours}</td>
                    <td style={{ textAlign:"center", color:"#4ade80", fontWeight:800 }}>{b.sixes}</td>
                    <td style={{ textAlign:"center", color:"rgba(255,255,255,0.4)" }}>{strikeRate(b.runs,b.balls)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab==="bowl" && (
        <div style={{ padding:"10px 12px" }}>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr>
                  {["Bowler","O","R","W","Eco"].map(h=>(
                    <th key={h} style={{ padding:"8px 5px", textAlign:h==="Bowler"?"left":"center", color:"rgba(255,255,255,0.4)", fontWeight:800, borderBottom:"1px solid rgba(255,255,255,0.06)", fontSize:10, letterSpacing:1, textTransform:"uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {G.bowlers.filter(b=>b.balls>0).map((b,i)=>(
                  <tr key={i} style={{ borderBottom:"1px solid rgba(255,255,255,0.04)", background:i===G.bowlerIdx?"rgba(29,78,216,0.08)":"transparent" }}>
                    <td style={{ padding:"9px 5px", color:"#f1f5f9", fontWeight:700 }}>{b.name}{b.isCaptain&&<span style={{ color:"#fbbf24", fontSize:9 }}> ©</span>}{i===G.bowlerIdx&&<span style={{ color:"#a855f7", fontSize:9 }}> ●</span>}</td>
                    <td style={{ textAlign:"center", color:"rgba(255,255,255,0.5)" }}>{fmtOvers(b.balls)}</td>
                    <td style={{ textAlign:"center", color:"#f1f5f9", fontWeight:800, fontFamily:"'Archivo Black', sans-serif" }}>{b.runs}</td>
                    <td style={{ textAlign:"center", color:"#4ade80", fontWeight:900, fontFamily:"'Archivo Black', sans-serif" }}>{b.wkts}</td>
                    <td style={{ textAlign:"center", color:parseFloat(economy(b.runs,b.balls))>9?"#f87171":"rgba(255,255,255,0.5)", fontWeight:700 }}>{economy(b.runs,b.balls)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODALS */}
      {modal==="selectBatter" && (
        <RadioModal title="🏏 Next Batsman In" subtitle="Who comes to the crease?"
          options={availableBatters.filter(o=>!o.disabled)}
          onSelect={idx=>{
            setG(p=>{const G2=JSON.parse(JSON.stringify(p));G2.strikerIdx=idx;G2.partnerships.push({bat1:idx,bat2:G2.nonStrikerIdx,runs:0,balls:0});return G2;});
            setModal(null);
          }} onClose={()=>setModal(null)} confirmLabel="Send In" />
      )}
      {modal==="selectBowler" && (
        <RadioModal title="⚾ Select Bowler" subtitle="Who bowls this over?"
          options={availableBowlers}
          onSelect={idx=>{setG(p=>({...p,prevBowlerIdx:p.bowlerIdx,bowlerIdx:idx}));setModal(null);}}
          onClose={()=>setModal(null)} confirmLabel="Bowl" />
      )}
      {modal==="striker" && (
        <RadioModal title="🔄 Change Striker" subtitle="Who faces next delivery?"
          options={G.batters.map((b,i)=>({label:`${b.emoji||"😎"} ${b.name}`,value:i,disabled:b.out,badge:i===G.strikerIdx?"Striker ▶":i===G.nonStrikerIdx?"Non-striker":null,sub:`${b.runs}(${b.balls})`}))}
          onSelect={idx=>{setG(p=>{const G2={...p};if(idx===p.nonStrikerIdx){G2.strikerIdx=p.nonStrikerIdx;G2.nonStrikerIdx=p.strikerIdx;}else G2.strikerIdx=idx;return G2;});setModal(null);}}
          onClose={()=>setModal(null)} confirmLabel="Set Striker" />
      )}
      {modal==="scorecard" && <ScorecardModal G={G} battingTeam={battingTeam} bowlingTeam={bowlingTeam} onClose={()=>setModal(null)} />}
      {modal==="graph" && <GraphModal G={G} battingTeam={battingTeam} bowlingTeam={bowlingTeam} onClose={()=>setModal(null)} />}
      {modal==="rules" && <RulesModal onClose={()=>setModal(null)} />}
      {modal==="comm" && <CommModal log={G.commentary} onClose={()=>setModal(null)} />}
      {modal==="partnership" && <PartnershipModal data={G.partnerships} batters={G.batters} onClose={()=>setModal(null)} />}
      {modal==="mom" && <MOMModal G={G} battingTeam={battingTeam} bowlingTeam={bowlingTeam} onClose={()=>setModal(null)} />}
      {modal==="overlog" && <OverLogModal log={G.completedOvers} currentOver={G.currentOverBalls} onClose={()=>setModal(null)} />}
      {modal==="result" && matchResult && <ResultModal result={matchResult} onHome={onEnd} onScorecard={()=>setModal("scorecard")} />}

      {toast && <Toast msg={toast} onDone={()=>setToast(null)} />}
      <style>{ANIM_CSS}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════
   GRAPH MODAL
═══════════════════════════════════════════ */
function GraphModal({ G, battingTeam, bowlingTeam, onClose }) {
  const inn1Log = G.inn1Snapshot ? G.inn1Snapshot.deliveryLog : G.deliveryLog;
  const inn2Log = G.inn1Snapshot ? G.deliveryLog : [];
  const maxLen = Math.max(inn1Log.length, inn2Log.length);
  const merged = Array.from({length:maxLen},(_,i)=>({
    x:i+1,
    inn1:inn1Log[i]?.scoreAfter??null,
    inn2:inn2Log[i]?.scoreAfter??null,
    i1Six:inn1Log[i]?.type===6, i1Four:inn1Log[i]?.type===4, i1Out:inn1Log[i]?.type==="out",
    i2Six:inn2Log[i]?.type===6, i2Four:inn2Log[i]?.type===4, i2Out:inn2Log[i]?.type==="out",
  }));

  const Inn1Dot = ({cx,cy,payload:p})=>{
    if(!cx||!cy||p.inn1==null) return null;
    if(p.i1Six) return <circle cx={cx} cy={cy} r={6} fill="#4ade80" stroke="#000" strokeWidth={1}/>;
    if(p.i1Four) return <circle cx={cx} cy={cy} r={5} fill="#60a5fa" stroke="#000" strokeWidth={1}/>;
    if(p.i1Out) return <circle cx={cx} cy={cy} r={5} fill="#f87171" stroke="#000" strokeWidth={1}/>;
    return null;
  };
  const Inn2Dot = ({cx,cy,payload:p})=>{
    if(!cx||!cy||p.inn2==null) return null;
    if(p.i2Six) return <circle cx={cx} cy={cy} r={6} fill="#a78bfa" stroke="#000" strokeWidth={1}/>;
    if(p.i2Four) return <circle cx={cx} cy={cy} r={5} fill="#f472b6" stroke="#000" strokeWidth={1}/>;
    if(p.i2Out) return <circle cx={cx} cy={cy} r={5} fill="#fb923c" stroke="#000" strokeWidth={1}/>;
    return null;
  };

  const target = G.inn1Snapshot ? G.inn1Snapshot.score : G.target;
  const hasInn2 = inn2Log.length > 0;

  return (
    <div style={C.overlay}>
      <div style={{ ...C.darkSheet, width:"97%" }}>
        <div style={C.sheetHead}>
          <div style={C.sheetTitle}>📈 Run Progression</div>
          <button style={C.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={{ display:"flex", gap:16, margin:"10px 0 6px", flexWrap:"wrap" }}>
          {[[battingTeam.name,"#60a5fa"],[hasInn2?bowlingTeam.name:null,"#a78bfa"]].filter(([n])=>n).map(([name,color])=>(
            <div key={name} style={{ display:"flex", alignItems:"center", gap:6 }}>
              <div style={{ width:20, height:3, background:color, borderRadius:2 }}/>
              <span style={{ color:"rgba(255,255,255,0.7)", fontSize:11, fontWeight:700 }}>{name}</span>
            </div>
          ))}
        </div>
        {merged.length < 2 ? <p style={{ color:"rgba(255,255,255,0.3)", textAlign:"center", padding:"20px 0" }}>Bowl more deliveries to see chart</p> : (
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={merged} margin={{top:8,right:8,left:-20,bottom:4}}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="x" tick={{fill:"rgba(255,255,255,0.3)",fontSize:9}} />
              <YAxis tick={{fill:"rgba(255,255,255,0.3)",fontSize:9}} />
              <Tooltip contentStyle={{background:"#1e2030",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,fontSize:11}} />
              {target!=null&&<ReferenceLine y={target} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" label={{value:`${target}`,fill:"rgba(255,255,255,0.4)",fontSize:9,position:"insideTopRight"}}/>}
              <Line type="monotone" dataKey="inn1" name={battingTeam.name} stroke="#60a5fa" strokeWidth={2.5} dot={<Inn1Dot/>} activeDot={{r:5}} connectNulls />
              {hasInn2&&<Line type="monotone" dataKey="inn2" name={bowlingTeam.name} stroke="#a78bfa" strokeWidth={2.5} strokeDasharray="6 3" dot={<Inn2Dot/>} activeDot={{r:5}} connectNulls />}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   SCORECARD MODAL
═══════════════════════════════════════════ */
function ScorecardModal({ G, battingTeam, bowlingTeam, onClose }) {
  const [tab, setTab] = useState("inn1");
  const inn1 = G.inn1Snapshot || null;
  const inn1Batters = inn1?inn1.batters:(G.inn===1?G.batters:[]);
  const inn1Bowlers = inn1?inn1.bowlers:(G.inn===1?G.bowlers:[]);
  const inn1Extras = inn1?inn1.extras:(G.inn===1?G.extras:{wides:0,noBalls:0});
  const inn1Score = inn1?inn1.score:(G.inn===1?G.score:0);
  const inn2Started = G.inn===2||inn1!==null;
  const inn2Batters = G.inn===2?G.batters:[];
  const inn2Bowlers = G.inn===2?G.bowlers:[];
  const inn2Extras = G.inn===2?G.extras:{wides:0,noBalls:0};
  const inn2Score = G.inn===2?G.score:0;

  const BatRow = ({b,i,isStriker}) => (
    <tr style={{ borderBottom:"1px solid rgba(255,255,255,0.04)", background:isStriker?"rgba(29,78,216,0.08)":"transparent" }}>
      <td style={{ padding:"8px 6px", color:b.out?"rgba(255,255,255,0.25)":"#f1f5f9", fontWeight:700, fontSize:12 }}>
        <span style={{ marginRight:5 }}>{b.emoji||"😎"}</span>
        {b.out&&<span style={{ color:"#ef4444" }}>✕ </span>}
        {b.name}{b.isCaptain&&<span style={{ color:"#fbbf24", fontSize:9 }}> ©</span>}
      </td>
      <td style={{ textAlign:"center", fontWeight:900, color:b.runs>=50?"#fbbf24":b.runs>=25?"#4ade80":"#f1f5f9", fontFamily:"'Archivo Black', sans-serif", fontSize:13 }}>{b.runs}</td>
      <td style={{ textAlign:"center", color:"rgba(255,255,255,0.4)", fontSize:11 }}>{b.balls}</td>
      <td style={{ textAlign:"center", color:"#60a5fa", fontWeight:800, fontSize:11 }}>{b.fours}</td>
      <td style={{ textAlign:"center", color:"#4ade80", fontWeight:800, fontSize:11 }}>{b.sixes}</td>
      <td style={{ textAlign:"center", color:"rgba(255,255,255,0.3)", fontSize:10 }}>{strikeRate(b.runs,b.balls)}</td>
    </tr>
  );

  const BatSection = ({batters,extras,teamName,innScore}) => (
    <div style={{ marginBottom:16 }}>
      <div style={{ color:"rgba(255,255,255,0.4)", fontSize:10, fontWeight:800, letterSpacing:1, marginBottom:8, textTransform:"uppercase" }}>🏏 {teamName} Batting</div>
      <table style={{ width:"100%", borderCollapse:"collapse" }}>
        <thead><tr>{["Batsman","R","B","4","6","SR"].map(h=><th key={h} style={{ padding:"6px 5px", textAlign:h==="Batsman"?"left":"center", color:"rgba(255,255,255,0.3)", fontWeight:800, borderBottom:"1px solid rgba(255,255,255,0.06)", fontSize:10, textTransform:"uppercase", letterSpacing:0.5 }}>{h}</th>)}</tr></thead>
        <tbody>{batters.filter(b=>b.balls>0||b.out).map((b,i)=><BatRow key={i} b={b} i={i}/>)}</tbody>
      </table>
      <div style={{ padding:"6px 8px", color:"rgba(255,255,255,0.4)", fontSize:11, borderTop:"1px solid rgba(255,255,255,0.06)", display:"flex", justifyContent:"space-between", marginTop:4 }}>
        <span>Extras: Wd {extras.wides} · NB {extras.noBalls}</span>
        <span style={{ fontWeight:900, color:"#f1f5f9", fontFamily:"'Archivo Black', sans-serif" }}>Total: {innScore}</span>
      </div>
    </div>
  );

  const BowlSection = ({bowlers,teamName}) => (
    <div style={{ marginBottom:16 }}>
      <div style={{ color:"rgba(255,255,255,0.4)", fontSize:10, fontWeight:800, letterSpacing:1, marginBottom:8, textTransform:"uppercase" }}>⚾ {teamName} Bowling</div>
      <table style={{ width:"100%", borderCollapse:"collapse" }}>
        <thead><tr>{["Bowler","O","R","W","Eco"].map(h=><th key={h} style={{ padding:"6px 5px", textAlign:h==="Bowler"?"left":"center", color:"rgba(255,255,255,0.3)", fontWeight:800, borderBottom:"1px solid rgba(255,255,255,0.06)", fontSize:10, textTransform:"uppercase", letterSpacing:0.5 }}>{h}</th>)}</tr></thead>
        <tbody>
          {bowlers.filter(b=>b.balls>0).map((b,i)=>(
            <tr key={i} style={{ borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
              <td style={{ padding:"8px 5px", color:"#f1f5f9", fontWeight:700, fontSize:12 }}>{b.name}{b.isCaptain&&<span style={{ color:"#fbbf24", fontSize:9 }}> ©</span>}</td>
              <td style={{ textAlign:"center", color:"rgba(255,255,255,0.4)", fontSize:11 }}>{fmtOvers(b.balls)}</td>
              <td style={{ textAlign:"center", color:"#f1f5f9", fontWeight:800, fontFamily:"'Archivo Black', sans-serif", fontSize:12 }}>{b.runs}</td>
              <td style={{ textAlign:"center", color:"#4ade80", fontWeight:900, fontFamily:"'Archivo Black', sans-serif", fontSize:13 }}>{b.wkts}</td>
              <td style={{ textAlign:"center", color:parseFloat(economy(b.runs,b.balls))>9?"#f87171":"rgba(255,255,255,0.4)", fontWeight:700, fontSize:11 }}>{economy(b.runs,b.balls)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div style={C.overlay}>
      <div style={{ ...C.darkSheet, maxHeight:"88vh", overflowY:"auto" }}>
        <div style={C.sheetHead}>
          <div style={C.sheetTitle}>📊 Scorecard</div>
          <button style={C.closeBtn} onClick={onClose}>✕</button>
        </div>
        {inn2Started && (
          <div style={{ display:"flex", justifyContent:"space-around", background:"rgba(29,78,216,0.1)", border:"1px solid rgba(29,78,216,0.2)", borderRadius:12, padding:"12px", margin:"12px 0" }}>
            <div style={{ textAlign:"center" }}>
              <div style={{ color:"#f1f5f9", fontWeight:900, fontSize:22, fontFamily:"'Archivo Black', sans-serif" }}>{inn1Score}</div>
              <div style={{ color:"rgba(255,255,255,0.4)", fontSize:11 }}>{battingTeam.name}</div>
            </div>
            <div style={{ color:"rgba(255,255,255,0.2)", fontWeight:800, fontSize:16, alignSelf:"center" }}>vs</div>
            <div style={{ textAlign:"center" }}>
              <div style={{ color:"#f1f5f9", fontWeight:900, fontSize:22, fontFamily:"'Archivo Black', sans-serif" }}>{inn2Score}</div>
              <div style={{ color:"rgba(255,255,255,0.4)", fontSize:11 }}>{bowlingTeam.name}</div>
            </div>
          </div>
        )}
        <div style={{ display:"flex", gap:6, marginBottom:14 }}>
          {[["inn1",`Inn 1 · ${battingTeam.name}`],...(inn2Started?[["inn2",`Inn 2 · ${bowlingTeam.name}`]]:[])].map(([t,l])=>(
            <button key={t} onClick={()=>setTab(t)} style={{ flex:1, padding:"9px", borderRadius:10, border:`1.5px solid ${tab===t?"#1d4ed8":"rgba(255,255,255,0.08)"}`, background:tab===t?"rgba(29,78,216,0.2)":"transparent", color:tab===t?"#60a5fa":"rgba(255,255,255,0.4)", fontWeight:800, fontSize:11, cursor:"pointer" }}>{l}</button>
          ))}
        </div>
        {tab==="inn1" && <><BatSection batters={inn1Batters} extras={inn1Extras} teamName={battingTeam.name} innScore={inn1Score}/><BowlSection bowlers={inn1Bowlers} teamName={bowlingTeam.name}/></>}
        {tab==="inn2" && inn2Started && (inn2Batters.length===0?<p style={{ color:"rgba(255,255,255,0.3)", textAlign:"center", padding:16 }}>Not started</p>:<><BatSection batters={inn2Batters} extras={inn2Extras} teamName={bowlingTeam.name} innScore={inn2Score}/><BowlSection bowlers={inn2Bowlers} teamName={battingTeam.name}/></>)}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   MOM MODAL
═══════════════════════════════════════════ */
function MOMModal({ G, battingTeam, bowlingTeam, onClose }) {
  const inn1Bat = G.inn1Snapshot?.batters||(G.inn===1?G.batters:[]);
  const inn1Bowl = G.inn1Snapshot?.bowlers||(G.inn===1?G.bowlers:[]);
  const inn2Bat = G.inn===2?G.batters:[];
  const inn2Bowl = G.inn===2?G.bowlers:[];

  const players = [];
  battingTeam.players.forEach(p=>{ const bat=inn1Bat.find(b=>b.name===p.name)||null; const bowl=inn2Bowl.find(b=>b.name===p.name)||null; players.push({...p,team:battingTeam.name,bat,bowl}); });
  bowlingTeam.players.forEach(p=>{ const bat=inn2Bat.find(b=>b.name===p.name)||null; const bowl=inn1Bowl.find(b=>b.name===p.name)||null; players.push({...p,team:bowlingTeam.name,bat,bowl}); });

  const scored = players.map(p=>({...p,...calcMOMScore(p.bat,p.bowl)})).filter(p=>p.role!=="none").sort((a,b)=>b.score-a.score);
  const winner = scored[0]||null;
  const maxScore = scored.length>0?Math.max(...scored.map(p=>p.score)):1;
  const roleLabel = r=>r==="bat"?"🏏 Batter":r==="bowl"?"⚾ Bowler":"⭐ All-Rounder";
  const roleColor = r=>r==="bat"?"#60a5fa":r==="bowl"?"#4ade80":"#a78bfa";

  return (
    <div style={C.overlay}>
      <div style={{ ...C.darkSheet, maxHeight:"88vh", overflowY:"auto" }}>
        <div style={C.sheetHead}>
          <div style={C.sheetTitle}>🏅 Player of the Match</div>
          <button style={C.closeBtn} onClick={onClose}>✕</button>
        </div>
        {winner && (
          <div style={{ background:"linear-gradient(135deg,#1d4ed8,#7c3aed)", borderRadius:20, padding:"20px", marginTop:12, textAlign:"center" }}>
            <div style={{ fontSize:48 }}>{winner.emoji||"🏅"}</div>
            <div style={{ color:"#fff", fontWeight:900, fontSize:22, fontFamily:"'Archivo Black', sans-serif" }}>{winner.name}</div>
            <div style={{ color:"rgba(255,255,255,0.6)", fontSize:12, marginBottom:8 }}>{winner.team} · {roleLabel(winner.role)}</div>
            <div style={{ color:"#fbbf24", fontWeight:900, fontSize:32, fontFamily:"'Archivo Black', sans-serif" }}>{winner.score.toFixed(1)} pts</div>
          </div>
        )}
        <div style={{ color:"rgba(255,255,255,0.3)", fontSize:10, fontWeight:800, letterSpacing:1, textTransform:"uppercase", margin:"16px 0 8px" }}>ALL RANKINGS</div>
        {scored.map((p,i)=>(
          <div key={i} style={{ background:i===0?"rgba(251,191,36,0.05)":"rgba(255,255,255,0.02)", border:`1px solid ${i===0?"rgba(251,191,36,0.2)":"rgba(255,255,255,0.06)"}`, borderRadius:14, padding:"14px", marginBottom:8 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
              <span style={{ fontSize:20 }}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`}</span>
              <div style={{ flex:1 }}>
                <div style={{ color:"#f1f5f9", fontWeight:800, fontSize:14, fontFamily:"'Archivo Black', sans-serif" }}>{p.emoji||"😎"} {p.name}</div>
                <div style={{ display:"flex", gap:6, marginTop:2 }}>
                  <span style={{ color:roleColor(p.role), fontSize:10, fontWeight:800, background:`${roleColor(p.role)}22`, padding:"1px 6px", borderRadius:5 }}>{roleLabel(p.role)}</span>
                  <span style={{ color:"rgba(255,255,255,0.3)", fontSize:10 }}>{p.team}</span>
                </div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ color:i===0?"#fbbf24":"#f1f5f9", fontWeight:900, fontSize:20, fontFamily:"'Archivo Black', sans-serif" }}>{p.score.toFixed(1)}</div>
              </div>
            </div>
            <div style={{ background:"rgba(255,255,255,0.04)", borderRadius:8, height:5, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${(p.score/maxScore)*100}%`, background:roleColor(p.role), borderRadius:8 }}/>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   PLAYER DASHBOARD
═══════════════════════════════════════════ */
function PlayerDashboard({ onBack }) {
  const [players, setPlayers] = useState({});
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{ loadData(PLAYERS_KEY).then(d=>{ setPlayers(d||{}); setLoading(false); }); },[]);

  const list = Object.values(players).sort((a,b)=>b.runs-a.runs);

  if(loading) return <div style={{ ...C.page, display:"flex", alignItems:"center", justifyContent:"center", background:"#0d1117" }}><div style={{ color:"rgba(255,255,255,0.4)", fontSize:16 }}>Loading…</div></div>;

  if(selected) {
    const p = players[selected];
    const avg = p.balls>0?(p.runs/p.matches).toFixed(1):"—";
    const bowlAvg = p.wkts>0?(p.bowlRuns/p.wkts).toFixed(1):"—";
    const bowlEco = p.bowlBalls>0?((p.bowlRuns/p.bowlBalls)*6).toFixed(2):"—";
    const sr = p.balls>0?((p.runs/p.balls)*100).toFixed(1):"—";
    const winPct = p.matches>0?Math.round((p.wins/p.matches)*100):0;

    const radarData = [
      {subject:"Batting",A:Math.min(100,p.runs/5)},
      {subject:"SR",A:sr!=="—"?Math.min(100,parseFloat(sr)/2):0},
      {subject:"Sixes",A:Math.min(100,p.sixes*10)},
      {subject:"Wickets",A:Math.min(100,p.wkts*15)},
      {subject:"Economy",A:bowlEco!=="—"?Math.max(0,100-(parseFloat(bowlEco)-4)*10):0},
      {subject:"Win%",A:winPct},
    ];

    return (
      <div style={{ ...C.page, background:"#0d1117" }}>
        <div style={C.darkTopBar}>
          <button style={C.backBtn} onClick={()=>setSelected(null)}>‹ Back</button>
          <span style={{ color:"#60a5fa", fontWeight:900, fontSize:16, fontFamily:"'Archivo Black', sans-serif" }}>{p.name}</span>
          <div style={{ width:60 }}/>
        </div>
        <div style={{ padding:"16px 16px 60px" }}>
          {/* Hero card */}
          <div style={{ background:"linear-gradient(135deg,#1d4ed8,#7c3aed)", borderRadius:20, padding:"24px 20px", textAlign:"center", marginBottom:16 }}>
            <div style={{ fontSize:56, marginBottom:6 }}>{EMOJIS[list.findIndex(pl=>pl.name===p.name)%EMOJIS.length]||"🏏"}</div>
            <div style={{ color:"#fff", fontWeight:900, fontSize:24, fontFamily:"'Archivo Black', sans-serif" }}>{p.name}</div>
            <div style={{ color:"rgba(255,255,255,0.6)", fontSize:12, marginBottom:16 }}>{p.team || "—"} · {p.matches} matches · {p.wins} wins</div>
            <div style={{ display:"flex", justifyContent:"space-around" }}>
              {[[p.runs,"Runs"],[p.wkts,"Wickets"],[winPct+"%","Win Rate"]].map(([v,l])=>(
                <div key={l} style={{ textAlign:"center" }}>
                  <div style={{ color:"#fbbf24", fontWeight:900, fontSize:24, fontFamily:"'Archivo Black', sans-serif" }}>{v}</div>
                  <div style={{ color:"rgba(255,255,255,0.5)", fontSize:11 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Radar chart */}
          <div style={{ ...C.darkCard, marginBottom:14 }}>
            <div style={C.darkCardLabel}>📊 PERFORMANCE RADAR</div>
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={radarData} margin={{top:10,right:10,left:10,bottom:10}}>
                <PolarGrid stroke="rgba(255,255,255,0.1)"/>
                <PolarAngleAxis dataKey="subject" tick={{fill:"rgba(255,255,255,0.5)",fontSize:10}}/>
                <PolarRadiusAxis domain={[0,100]} tick={false} axisLine={false}/>
                <Radar name="Stats" dataKey="A" stroke="#60a5fa" fill="#1d4ed8" fillOpacity={0.3} strokeWidth={2}/>
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Batting stats */}
          <div style={{ ...C.darkCard, marginBottom:14 }}>
            <div style={C.darkCardLabel}>🏏 BATTING</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop:12 }}>
              {[["Runs",p.runs],["Balls Faced",p.balls],["High Score",p.highScore],["Avg/Match",avg],["Strike Rate",sr],["Fours",p.fours],["Sixes",p.sixes],["Boundary %",p.balls>0?Math.round(((p.fours+p.sixes)/p.balls)*100)+"%":"—"]].map(([label,val])=>(
                <div key={label} style={{ background:"rgba(255,255,255,0.03)", borderRadius:10, padding:"10px 12px" }}>
                  <div style={{ color:"rgba(255,255,255,0.35)", fontSize:10, fontWeight:700, letterSpacing:0.5, textTransform:"uppercase", marginBottom:3 }}>{label}</div>
                  <div style={{ color:"#60a5fa", fontWeight:900, fontSize:20, fontFamily:"'Archivo Black', sans-serif" }}>{val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Bowling stats */}
          {p.bowlBalls>0 && (
            <div style={{ ...C.darkCard, marginBottom:14 }}>
              <div style={C.darkCardLabel}>⚾ BOWLING</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop:12 }}>
                {[["Wickets",p.wkts],["Overs",fmtOvers(p.bowlBalls)],["Runs Given",p.bowlRuns],["Economy",bowlEco],["Avg",bowlAvg],["Best",`${p.bestFigures.wkts}/${p.bestFigures.runs}`]].map(([label,val])=>(
                  <div key={label} style={{ background:"rgba(255,255,255,0.03)", borderRadius:10, padding:"10px 12px" }}>
                    <div style={{ color:"rgba(255,255,255,0.35)", fontSize:10, fontWeight:700, letterSpacing:0.5, textTransform:"uppercase", marginBottom:3 }}>{label}</div>
                    <div style={{ color:"#4ade80", fontWeight:900, fontSize:20, fontFamily:"'Archivo Black', sans-serif" }}>{val}</div>
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
    <div style={{ ...C.page, background:"#0d1117" }}>
      <div style={C.darkTopBar}>
        <button style={C.backBtn} onClick={onBack}>‹ Back</button>
        <span style={{ color:"#60a5fa", fontWeight:900, fontSize:17, fontFamily:"'Archivo Black', sans-serif" }}>Player Stats</span>
        <div style={{ width:60 }}/>
      </div>
      <div style={{ padding:"16px 16px 60px" }}>
        {list.length===0 ? (
          <div style={{ textAlign:"center", padding:"60px 20px" }}>
            <div style={{ fontSize:56, marginBottom:16 }}>📊</div>
            <div style={{ color:"rgba(255,255,255,0.4)", fontSize:16, fontWeight:700 }}>No player stats yet</div>
            <div style={{ color:"rgba(255,255,255,0.2)", fontSize:13, marginTop:8 }}>Play matches to see stats here</div>
          </div>
        ) : (
          <>
            <div style={{ color:"rgba(255,255,255,0.3)", fontSize:10, fontWeight:800, letterSpacing:1, textTransform:"uppercase", marginBottom:12 }}>ALL PLAYERS · {list.length} registered</div>
            {list.map((p,i)=>(
              <button key={p.name} onClick={()=>setSelected(p.name)} style={{
                width:"100%", display:"flex", alignItems:"center", gap:12,
                background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)",
                borderRadius:16, padding:"14px", marginBottom:8, cursor:"pointer", textAlign:"left",
                transition:"all .15s"
              }}>
                <div style={{ width:44, height:44, borderRadius:12, background:"linear-gradient(135deg,#1d4ed8,#7c3aed)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>{EMOJIS[i%EMOJIS.length]}</div>
                <div style={{ flex:1 }}>
                  <div style={{ color:"#f1f5f9", fontWeight:800, fontSize:15, fontFamily:"'Archivo Black', sans-serif" }}>{p.name}</div>
                  <div style={{ color:"rgba(255,255,255,0.35)", fontSize:11, marginTop:2 }}>{p.matches} matches · {p.wins} wins</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ color:"#60a5fa", fontWeight:900, fontSize:20, fontFamily:"'Archivo Black', sans-serif" }}>{p.runs}</div>
                  <div style={{ color:"rgba(255,255,255,0.3)", fontSize:10 }}>runs</div>
                </div>
                <div style={{ color:"rgba(255,255,255,0.2)", fontSize:18 }}>›</div>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   HEAD TO HEAD / SERIES
═══════════════════════════════════════════ */
function SeriesScreen({ sessions, onBack }) {
  const [tab, setTab] = useState("series");

  // Build head-to-head data from sessions
  const h2h = {};
  (sessions||[]).forEach(s=>{
    const key = [s.batName,s.bowlName].sort().join("__VS__");
    if(!h2h[key]) h2h[key]={ team1:[s.batName,s.bowlName].sort()[0], team2:[s.batName,s.bowlName].sort()[1], wins:{}, matches:0 };
    h2h[key].matches++;
    if(s.winner&&s.winner!=="Match TIED") h2h[key].wins[s.winner]=(h2h[key].wins[s.winner]||0)+1;
  });

  const h2hList = Object.values(h2h).sort((a,b)=>b.matches-a.matches);
  const recent = [...(sessions||[])].reverse().slice(0,20);

  return (
    <div style={{ ...C.page, background:"#0d1117" }}>
      <div style={C.darkTopBar}>
        <button style={C.backBtn} onClick={onBack}>‹ Back</button>
        <span style={{ color:"#60a5fa", fontWeight:900, fontSize:17, fontFamily:"'Archivo Black', sans-serif" }}>Series & Records</span>
        <div style={{ width:60 }}/>
      </div>
      <div style={{ display:"flex", background:"rgba(255,255,255,0.03)", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
        {[["series","🏆 H2H"],["history","📜 All Matches"]].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} style={{ flex:1, padding:"11px 0", border:"none", background:"transparent", cursor:"pointer", color:tab===t?"#60a5fa":"rgba(255,255,255,0.35)", fontWeight:tab===t?900:600, fontSize:13, borderBottom:tab===t?"2px solid #1d4ed8":"2px solid transparent", fontFamily:"'Archivo Black', sans-serif" }}>{l}</button>
        ))}
      </div>

      <div style={{ padding:"16px 16px 60px" }}>
        {tab==="series" && (
          h2hList.length===0 ? (
            <div style={{ textAlign:"center", padding:"60px 20px" }}>
              <div style={{ fontSize:56, marginBottom:16 }}>🏆</div>
              <div style={{ color:"rgba(255,255,255,0.4)", fontSize:16, fontWeight:700 }}>No series data yet</div>
            </div>
          ) : h2hList.map((matchup,i)=>{
            const t1wins = matchup.wins[matchup.team1]||0;
            const t2wins = matchup.wins[matchup.team2]||0;
            const ties = matchup.matches-t1wins-t2wins;
            const t1pct = matchup.matches>0?(t1wins/matchup.matches)*100:50;
            return (
              <div key={i} style={{ ...C.darkCard, marginBottom:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                  <div style={{ color:"#f1f5f9", fontWeight:900, fontSize:14, fontFamily:"'Archivo Black', sans-serif" }}>{matchup.team1}</div>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ color:"rgba(255,255,255,0.3)", fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:1 }}>{matchup.matches} matches</div>
                    {ties>0&&<div style={{ color:"rgba(255,255,255,0.2)", fontSize:10 }}>{ties} tied</div>}
                  </div>
                  <div style={{ color:"#f1f5f9", fontWeight:900, fontSize:14, fontFamily:"'Archivo Black', sans-serif", textAlign:"right" }}>{matchup.team2}</div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ color:"#60a5fa", fontWeight:900, fontSize:22, fontFamily:"'Archivo Black', sans-serif", minWidth:24 }}>{t1wins}</span>
                  <div style={{ flex:1, height:8, background:"rgba(255,255,255,0.08)", borderRadius:8, overflow:"hidden" }}>
                    <div style={{ height:"100%", width:`${t1pct}%`, background:"linear-gradient(90deg,#60a5fa,#a78bfa)", borderRadius:8 }}/>
                  </div>
                  <span style={{ color:"#a78bfa", fontWeight:900, fontSize:22, fontFamily:"'Archivo Black', sans-serif", minWidth:24, textAlign:"right" }}>{t2wins}</span>
                </div>
              </div>
            );
          })
        )}

        {tab==="history" && (
          recent.length===0 ? (
            <div style={{ textAlign:"center", padding:"60px 20px" }}>
              <div style={{ fontSize:56, marginBottom:16 }}>📜</div>
              <div style={{ color:"rgba(255,255,255,0.4)", fontSize:16, fontWeight:700 }}>No matches played yet</div>
            </div>
          ) : recent.map((s,i)=>(
            <div key={i} style={{ ...C.darkCard, marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ color:"#f1f5f9", fontWeight:800, fontSize:13, fontFamily:"'Archivo Black', sans-serif" }}>{s.batName} <span style={{ color:"rgba(255,255,255,0.3)" }}>vs</span> {s.bowlName}</div>
                  <div style={{ color:"rgba(255,255,255,0.3)", fontSize:11, marginTop:2 }}>{new Date(s.date).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"2-digit"})} · {s.overs} overs</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  {s.winner && <div style={{ color:s.winner==="Match TIED"?"#fbbf24":"#4ade80", fontSize:12, fontWeight:800 }}>{s.winner==="Match TIED"?"🤝 Tie":`🏆 ${s.winner}`}</div>}
                  {s.margin && <div style={{ color:"rgba(255,255,255,0.3)", fontSize:10 }}>by {s.margin}</div>}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   OTHER MODALS (dark themed)
═══════════════════════════════════════════ */
function OverLogModal({ log, currentOver, onClose }) {
  const chipStyle = b => {
    const bg = b==="W"?"#dc2626":b==="NB"?"#9333ea":b==="Wd"?"#d97706":b==="6"?"#16a34a":b==="4"?"#1d4ed8":b==="·"?"#374151":"#475569";
    return { display:"inline-flex", alignItems:"center", justifyContent:"center", minWidth:28, height:28, borderRadius:8, fontSize:11, fontWeight:900, background:bg, color:"#fff", flexShrink:0 };
  };
  const calcRuns = over => over.reduce((s,b)=>{ const n=parseInt(b); return s+(isNaN(n)?((b==="Wd"||b==="NB")?1:0):n); },0);

  return (
    <div style={C.overlay}>
      <div style={{ ...C.darkSheet, maxHeight:"75vh", overflowY:"auto" }}>
        <div style={C.sheetHead}>
          <div style={C.sheetTitle}>📜 Over Log</div>
          <button style={C.closeBtn} onClick={onClose}>✕</button>
        </div>
        {currentOver.length>0 && (
          <div style={{ background:"rgba(29,78,216,0.1)", border:"1px solid rgba(29,78,216,0.2)", borderRadius:12, padding:"12px", marginTop:12, marginBottom:8 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
              <span style={{ color:"#60a5fa", fontWeight:800, fontSize:13 }}>Current Over</span>
              <span style={{ color:"#f1f5f9", fontWeight:900 }}>{calcRuns(currentOver)} runs</span>
            </div>
            <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>{currentOver.map((b,i)=><span key={i} style={chipStyle(b)}>{b}</span>)}</div>
          </div>
        )}
        {log.map((over,i)=>(
          <div key={i} style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:12, padding:"12px", marginTop:8 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
              <span style={{ color:"#60a5fa", fontWeight:800 }}>Over {i+1}</span>
              <span style={{ color:"#f1f5f9", fontWeight:900 }}>{calcRuns(over)} runs</span>
            </div>
            <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>{over.map((b,j)=><span key={j} style={chipStyle(b)}>{b}</span>)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CommModal({ log, onClose }) {
  return (
    <div style={C.overlay}>
      <div style={{ ...C.darkSheet, maxHeight:"75vh", overflowY:"auto" }}>
        <div style={C.sheetHead}>
          <div style={C.sheetTitle}>💬 Commentary</div>
          <button style={C.closeBtn} onClick={onClose}>✕</button>
        </div>
        {log.length===0 && <p style={{ color:"rgba(255,255,255,0.3)", textAlign:"center", padding:16 }}>No deliveries yet</p>}
        {log.map((c,i)=>(
          <div key={i} style={{ padding:"10px 0", borderBottom:"1px solid rgba(255,255,255,0.04)", color:i===0?"#f1f5f9":"rgba(255,255,255,0.4)", fontSize:i===0?13:12, lineHeight:1.6, fontWeight:i===0?700:400 }}>{c}</div>
        ))}
      </div>
    </div>
  );
}

function PartnershipModal({ data, batters, onClose }) {
  return (
    <div style={C.overlay}>
      <div style={{ ...C.darkSheet, maxHeight:"70vh", overflowY:"auto" }}>
        <div style={C.sheetHead}>
          <div style={C.sheetTitle}>🤝 Partnerships</div>
          <button style={C.closeBtn} onClick={onClose}>✕</button>
        </div>
        {data.length===0 && <p style={{ color:"rgba(255,255,255,0.3)", textAlign:"center", padding:16 }}>No data yet</p>}
        {data.map((p,i)=>{
          const n1=batters[p.bat1]?.name||"?"; const n2=batters[p.bat2]?.name||"?";
          return (
            <div key={i} style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:12, padding:"14px", marginTop:8 }}>
              <div style={{ color:"#60a5fa", fontWeight:900, fontSize:14, fontFamily:"'Archivo Black', sans-serif", marginBottom:8 }}>{n1} & {n2}</div>
              <div style={{ display:"flex", gap:20 }}>
                <div><span style={{ color:"rgba(255,255,255,0.35)", fontSize:11 }}>Runs </span><span style={{ color:"#f1f5f9", fontWeight:900, fontSize:24, fontFamily:"'Archivo Black', sans-serif" }}>{p.runs}</span></div>
                <div><span style={{ color:"rgba(255,255,255,0.35)", fontSize:11 }}>Balls </span><span style={{ color:"rgba(255,255,255,0.6)", fontWeight:700, fontSize:18 }}>{p.balls}</span></div>
                {p.balls>0 && <div><span style={{ color:"rgba(255,255,255,0.35)", fontSize:11 }}>RR </span><span style={{ color:"#4ade80", fontWeight:700 }}>{((p.runs/p.balls)*6).toFixed(1)}</span></div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RulesModal({ onClose }) {
  return (
    <div style={C.overlay}>
      <div style={{ ...C.darkSheet, maxHeight:"82vh", overflowY:"auto" }}>
        <div style={C.sheetHead}>
          <div style={C.sheetTitle}>📋 Cricket Rules</div>
          <button style={C.closeBtn} onClick={onClose}>✕</button>
        </div>
        {RULES.map((r,i)=>(
          <div key={i} style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:12, padding:"14px", marginTop:8 }}>
            <div style={{ color:"#60a5fa", fontWeight:800, marginBottom:5, fontFamily:"'Archivo Black', sans-serif" }}>{r.icon} {r.t}</div>
            <p style={{ color:"rgba(255,255,255,0.5)", fontSize:13, margin:0, lineHeight:1.6 }}>{r.d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultModal({ result, onHome, onScorecard }) {
  const isTie = result.winner==="Match TIED";
  return (
    <div style={{ ...C.overlay, background:"rgba(0,0,0,0.92)" }}>
      <div style={{ background:"#0d1117", border:"1px solid rgba(255,255,255,0.08)", borderRadius:28, padding:"36px 24px", textAlign:"center", maxWidth:340, width:"92%", boxShadow:"0 24px 80px rgba(0,0,0,0.8)" }}>
        <div style={{ fontSize:64, marginBottom:8, animation:"bounceIn .6s cubic-bezier(.34,1.56,.64,1)" }}>{isTie?"🤝":"🏆"}</div>
        {isTie ? (
          <h2 style={{ color:"#f1f5f9", margin:"0 0 20px", fontSize:24, fontFamily:"'Archivo Black', sans-serif" }}>Match Tied!</h2>
        ) : (
          <>
            <div style={{ color:"#60a5fa", fontWeight:900, fontSize:26, fontFamily:"'Archivo Black', sans-serif", marginBottom:4 }}>{result.winner}</div>
            <div style={{ color:"#4ade80", fontWeight:900, fontSize:20, fontFamily:"'Archivo Black', sans-serif", marginBottom:4 }}>WON! 🎉</div>
            <div style={{ color:"rgba(255,255,255,0.4)", fontSize:14, marginBottom:24 }}>by {result.margin}</div>
          </>
        )}
        <button style={{ ...C.primaryBtn, marginBottom:10 }} onClick={onScorecard}>📊 Full Scorecard</button>
        <button style={{ ...C.ghostBtn }} onClick={onHome}>🏠 Back to Home</button>
      </div>
      <style>{`@keyframes bounceIn{from{transform:scale(0.3);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════
   APP ROOT
═══════════════════════════════════════════ */
export default function App() {
  const [phase, setPhase] = useState("home");
  const [hist, setHist] = useState([]);
  const [teamA, setTeamA] = useState(null);
  const [teamB, setTeamB] = useState(null);
  const [overs, setOvers] = useState(6);
  const [match, setMatch] = useState(null);
  const [sessions, setSessions] = useState([]);

  useEffect(()=>{ loadData(STORE_KEY).then(d=>setSessions(d||[])); },[]);

  const go = (p) => { setHist(h=>[...h,phase]); setPhase(p); };
  const back = () => { setHist(h=>{ const n=[...h]; const prev=n.pop(); setPhase(prev||"home"); return n; }); };
  const resetMatch = () => { setPhase("home"); setHist([]); setTeamA(null); setTeamB(null); setMatch(null); loadData(STORE_KEY).then(d=>setSessions(d||[])); };

  return (
    <div style={{ maxWidth:480, margin:"0 auto", minHeight:"100vh", background:"#0d1117", fontFamily:"'Archivo Black', 'Segoe UI', sans-serif" }}>
      <style>{GLOBAL_CSS}</style>
      {phase==="home" && <HomeScreen onStart={ov=>{setOvers(ov);go("teamA");}} onSeries={()=>go("series")} onPlayers={()=>go("players")} sessions={sessions}/>}
      {phase==="teamA" && <TeamSetup label="Team A" color="#60a5fa" onDone={t=>{setTeamA(t);go("teamB");}} onBack={back}/>}
      {phase==="teamB" && <TeamSetup label="Team B" color="#4ade80" onDone={t=>{setTeamB(t);go("toss");}} onBack={back}/>}
      {phase==="toss" && teamA && teamB && <CoinToss teamA={teamA} teamB={teamB} onResult={(bat,bowl)=>{setMatch({battingTeam:bat,bowlingTeam:bowl,overs});go("game");}} onBack={back}/>}
      {phase==="game" && match && <GameScreen match={match} onEnd={resetMatch} onBack={back}/>}
      {phase==="players" && <PlayerDashboard onBack={back}/>}
      {phase==="series" && <SeriesScreen sessions={sessions} onBack={back}/>}
    </div>
  );
}

/* ═══════════════════════════════════════════
   STYLES
═══════════════════════════════════════════ */
const C = {
  page:{ minHeight:"100vh", background:"#f8fafc", paddingBottom:32 },
  topBar:{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"13px 16px", background:"#fff", borderBottom:"1px solid #e2e8f0", position:"sticky", top:0, zIndex:30 },
  darkTopBar:{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"13px 16px", background:"#0d1117", borderBottom:"1px solid rgba(255,255,255,0.06)", position:"sticky", top:0, zIndex:30 },
  card:{ background:"#fff", border:"1px solid #e8edf5", borderRadius:18, padding:"16px", boxShadow:"0 2px 12px rgba(0,0,0,0.04)" },
  darkCard:{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:16, padding:"16px" },
  cardLabel:{ color:"#1d4ed8", fontWeight:900, fontSize:11, letterSpacing:1.5, textTransform:"uppercase", fontFamily:"'Archivo Black', sans-serif" },
  darkCardLabel:{ color:"rgba(255,255,255,0.4)", fontWeight:900, fontSize:10, letterSpacing:1.5, textTransform:"uppercase", fontFamily:"'Archivo Black', sans-serif" },
  inp:{ width:"100%", background:"#f8fafc", border:"1.5px solid #e2e8f0", borderRadius:12, padding:"12px 14px", color:"#0f172a", fontSize:15, outline:"none", boxSizing:"border-box", display:"block", fontFamily:"'Segoe UI', sans-serif" },
  primaryBtn:{ background:"linear-gradient(135deg,#1d4ed8,#7c3aed)", color:"#fff", border:"none", borderRadius:14, padding:"15px 20px", fontSize:15, fontWeight:900, cursor:"pointer", width:"100%", display:"block", fontFamily:"'Archivo Black', sans-serif", boxShadow:"0 4px 20px rgba(29,78,216,0.35)", letterSpacing:0.3 },
  outlineBtn:{ background:"#fff", color:"#1d4ed8", border:"2px solid #1d4ed8", borderRadius:14, padding:"13px 20px", fontSize:14, fontWeight:900, cursor:"pointer", width:"100%", display:"block", fontFamily:"'Archivo Black', sans-serif" },
  ghostBtn:{ background:"transparent", color:"#64748b", border:"1.5px solid #e2e8f0", borderRadius:14, padding:"12px 20px", fontSize:13, fontWeight:700, cursor:"pointer", width:"100%", display:"block" },
  dangerBtn:{ background:"linear-gradient(135deg,#dc2626,#b91c1c)", color:"#fff", border:"none", borderRadius:14, padding:"15px 20px", fontSize:15, fontWeight:900, cursor:"pointer", width:"100%", display:"block", fontFamily:"'Archivo Black', sans-serif" },
  cntBtn:{ background:"rgba(29,78,216,0.08)", border:"1.5px solid rgba(29,78,216,0.2)", color:"#1d4ed8", borderRadius:10, width:38, height:38, fontSize:22, fontWeight:900, cursor:"pointer" },
  backBtn:{ background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.7)", borderRadius:10, padding:"7px 14px", fontSize:15, cursor:"pointer", fontWeight:900 },
  extraDark:{ border:"1px solid", borderRadius:12, fontSize:12, fontWeight:700, padding:"12px 4px", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:3 },
  darkActBtn:{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:12, color:"rgba(255,255,255,0.6)", fontSize:18, fontWeight:700, padding:"11px 4px", cursor:"pointer" },
  overlay:{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:200 },
  sheet:{ background:"#fff", borderRadius:"24px 24px 0 0", padding:"20px 16px 36px", width:"100%", maxWidth:480, maxHeight:"85vh", overflowY:"auto", boxShadow:"0 -8px 40px rgba(0,0,0,0.15)" },
  darkSheet:{ background:"#111827", borderRadius:"24px 24px 0 0", padding:"20px 16px 36px", width:"100%", maxWidth:480, maxHeight:"85vh", overflowY:"auto", boxShadow:"0 -8px 40px rgba(0,0,0,0.5)" },
  sheetHead:{ display:"flex", justifyContent:"space-between", alignItems:"center" },
  sheetTitle:{ color:"#f1f5f9", fontWeight:900, fontSize:19, fontFamily:"'Archivo Black', sans-serif" },
  sheetSub:{ color:"rgba(255,255,255,0.4)", fontSize:12, marginTop:2 },
  closeBtn:{ background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.6)", borderRadius:10, width:34, height:34, fontSize:16, cursor:"pointer", fontWeight:800 },
};

const ANIM_CSS = `
  @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
  @keyframes pulse { 0%,100%{opacity:0.5;transform:scale(1)} 50%{opacity:1;transform:scale(1.05)} }
  @keyframes toastIn { from{opacity:0;transform:translateX(-50%) translateY(-10px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
`;

const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Archivo+Black&display=swap');
  * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  body { margin:0; background:#0d1117; }
  ::-webkit-scrollbar { width:3px; }
  ::-webkit-scrollbar-track { background:transparent; }
  ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:4px; }
  input::placeholder { color:#94a3b8; }
  input { color:#0f172a; }
  input:focus { border-color:#1d4ed8 !important; box-shadow:0 0 0 3px rgba(29,78,216,0.1) !important; }
  button:active { transform:scale(0.95); }
  ${ANIM_CSS}
`;