import { useState, useEffect } from "react";
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell
} from "recharts";

/* ═══════════════════════════════════════════════════
   STORAGE
═══════════════════════════════════════════════════ */
const STORE_KEY = "gully-v5";
const loadSessions = async () => {
  try { const r = await window.storage.get(STORE_KEY); return r ? JSON.parse(r.value) : []; }
  catch { return []; }
};
const saveSessions = async (arr) => {
  try { await window.storage.set(STORE_KEY, JSON.stringify(arr)); } catch {}
};

/* ═══════════════════════════════════════════════════
   CONSTANTS & HELPERS
═══════════════════════════════════════════════════ */
const RULES = [
  { icon: "🏏", t: "Batting", d: "Score runs by hitting the ball and running between wickets. 4 = ball reaches boundary rope. 6 = ball clears boundary in air." },
  { icon: "❌", t: "Wide Ball", d: "+1 extra run, ball is re-bowled. It does NOT count as a legal delivery. Batsman CANNOT be bowled/caught off a wide." },
  { icon: "🔴", t: "No Ball", d: "+1 extra run. Does NOT count as a legal delivery. Next ball is a FREE HIT — batsman can only be dismissed by run-out." },
  { icon: "⚡", t: "Free Hit", d: "After every No Ball, the VERY NEXT delivery is a Free Hit. Batsman cannot be out except run-out. Field restrictions apply." },
  { icon: "🎯", t: "How You're Out", d: "Bowled · Caught · LBW · Run-Out · Stumped · Hit Wicket · Obstructing field · Handled ball." },
  { icon: "📐", t: "Boundaries", d: "4 runs: ball rolls to/over rope. 6 runs: ball clears rope on full. No physical running needed for boundaries." },
  { icon: "🔄", t: "Overs", d: "1 over = 6 legal deliveries. Wides and No Balls are NOT legal deliveries. Same bowler cannot bowl two consecutive overs." },
  { icon: "🏆", t: "Winning", d: "Team batting second wins by reaching/passing the target. Team batting first wins if second team falls short or is all out." },
  { icon: "🌟", t: "Gully Rules", d: "Agree local rules BEFORE the match: one-pitch catches, tip-and-run, underarm bowling, etc. Gully rules vary by colony!" },
];

const mkBatter = (name, isCaptain = false, isWK = false) =>
  ({ name, isCaptain, isWK, runs: 0, balls: 0, fours: 0, sixes: 0, dots: 0, out: false, outHow: "" });

const mkBowler = (name, isCaptain = false) =>
  ({ name, isCaptain, overs: 0, balls: 0, runs: 0, wkts: 0, wides: 0, noBalls: 0 });

const fmtOvers = (balls) => `${Math.floor(balls / 6)}.${balls % 6}`;
const strikeRate = (r, b) => b > 0 ? ((r / b) * 100).toFixed(1) : "0.0";
const economy = (r, b) => b > 0 ? ((r / b) * 6).toFixed(2) : "0.00";
const vib = (p = 30) => { try { navigator.vibrate?.(p); } catch {} };

/* ═══════════════════════════════════════════════════
   COMMENTARY GENERATOR
═══════════════════════════════════════════════════ */
const COMM = {
  0: ["Dot ball. Well bowled.", "Beaten! No run.", "Defended solidly.", "Played and missed!"],
  1: ["Quick single taken.", "One run, good running.", "Pushed for a single."],
  2: ["Two runs, good running between the wickets!", "Driven for two."],
  3: ["Three! Excellent running.", "Three runs — great effort!"],
  4: ["FOUR! Beautiful shot!", "Cracking drive for FOUR!", "FOUR — finds the gap perfectly!"],
  6: ["SIX! MASSIVE HIT!", "INTO THE STANDS! SIX!", "MAXIMUM! That's gone miles!"],
  wide: ["Wide! Poor delivery outside off.", "Wide ball — straying too far.", "Wasted delivery — Wide!"],
  nb: ["NO BALL! Bowler overstepped!", "Front foot NO BALL — free hit coming!", "No Ball! Extra run + Free Hit!"],
  out: ["OUT! Brilliant delivery!", "WICKET! He's gone!", "OUT! Big blow for the batting side!"],
};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const genComm = (type, batter, bowler) => {
  if (type === "out") return `🔴 ${pick(COMM.out)} ${batter} is out!`;
  if (type === "wide") return `🟡 ${pick(COMM.wide)}`;
  if (type === "nb") return `🟣 ${pick(COMM.nb)}`;
  if (type === 6) return `🟢 ${pick(COMM[6])} ${batter} hits ${bowler} for a maximum!`;
  if (type === 4) return `🔵 ${pick(COMM[4])} ${batter} off ${bowler}!`;
  return `⚫ ${pick(COMM[type] || COMM[0])}`;
};

/* ═══════════════════════════════════════════════════
   TOAST
═══════════════════════════════════════════════════ */
function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2500); return () => clearTimeout(t); }, [onDone]);
  return (
    <div style={{
      position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)",
      zIndex: 9999, background: "#1d4ed8", border: "2px solid #3b82f6",
      borderRadius: 12, padding: "10px 20px", color: "#fff",
      fontWeight: 700, fontSize: 14, boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
      whiteSpace: "nowrap", animation: "toastIn .25s ease"
    }}>{msg}</div>
  );
}

/* ═══════════════════════════════════════════════════
   RADIO SELECT MODAL (for batsman in / bowler select / change striker)
═══════════════════════════════════════════════════ */
function RadioModal({ title, subtitle, options, onSelect, onClose, confirmLabel = "Confirm" }) {
  const [sel, setSel] = useState(null);
  const available = options.filter(o => !o.disabled);

  useEffect(() => {
    if (available.length === 1) setSel(available[0].value);
  }, []);

  return (
    <div style={C.overlay}>
      <div style={{ ...C.sheet, maxHeight: "78vh", overflowY: "auto" }}>
        <div style={C.sheetHead}>
          <div>
            <div style={C.sheetTitle}>{title}</div>
            {subtitle && <div style={C.sheetSub}>{subtitle}</div>}
          </div>
          <button style={C.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={{ marginTop: 12 }}>
          {options.map((o, i) => (
            <label key={i} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "13px 14px", marginBottom: 6,
              background: sel === o.value ? "#eff6ff" : "#fff",
              border: `2px solid ${sel === o.value ? "#2563eb" : "#e2e8f0"}`,
              borderRadius: 12, cursor: o.disabled ? "not-allowed" : "pointer",
              opacity: o.disabled ? 0.4 : 1, transition: "all .15s"
            }}>
              <input
                type="radio"
                name="modal_sel"
                checked={sel === o.value}
                disabled={o.disabled}
                onChange={() => !o.disabled && setSel(o.value)}
                style={{ accentColor: "#2563eb", width: 20, height: 20, flexShrink: 0 }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ color: "#1e293b", fontWeight: 700, fontSize: 15 }}>
                  {o.label}
                  {o.badge && <span style={{ marginLeft: 8, color: "#2563eb", fontSize: 11, background: "#dbeafe", padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>{o.badge}</span>}
                  {o.disabled && o.why && <span style={{ marginLeft: 8, color: "#94a3b8", fontSize: 11 }}>({o.why})</span>}
                </div>
                {o.sub && <div style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>{o.sub}</div>}
              </div>
            </label>
          ))}
        </div>

        <button
          style={{ ...C.primaryBtn, marginTop: 8, opacity: sel === null ? 0.5 : 1 }}
          disabled={sel === null}
          onClick={() => sel !== null && onSelect(sel)}
        >✅ {confirmLabel}</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   HOME SCREEN
═══════════════════════════════════════════════════ */
function HomeScreen({ onStart, sessions }) {
  const [overs, setOvers] = useState(6);
  const [showRules, setShowRules] = useState(false);

  return (
    <div style={C.page}>
      {/* Hero */}
      <div style={{
        background: "linear-gradient(160deg, #1d4ed8 0%, #1e40af 60%, #1e3a8a 100%)",
        padding: "44px 24px 32px", textAlign: "center", position: "relative", overflow: "hidden"
      }}>
        <div style={{ position: "absolute", top: -40, right: -40, width: 160, height: 160, background: "rgba(255,255,255,0.06)", borderRadius: "50%" }} />
        <div style={{ position: "absolute", bottom: -20, left: -30, width: 120, height: 120, background: "rgba(255,255,255,0.04)", borderRadius: "50%" }} />
        <div style={{ fontSize: 56, marginBottom: 10, position: "relative" }}>🏏</div>
        <h1 style={{ color: "#fff", fontSize: 30, fontWeight: 900, margin: "0 0 6px", letterSpacing: 1.5, position: "relative" }}>GULLY CRICKET</h1>
        <p style={{ color: "#bfdbfe", fontSize: 13, margin: 0, fontWeight: 600, letterSpacing: 0.5, position: "relative" }}>Street Score Tracker</p>
      </div>

      <div style={{ padding: "16px 16px 40px" }}>
        {/* Overs setting */}
        <div style={C.card}>
          <div style={C.cardTitle}>⚙️ Match Settings</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
            <span style={{ color: "#475569", fontSize: 14, fontWeight: 600 }}>Overs per innings</span>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <button style={C.cntBtn} onClick={() => setOvers(v => Math.max(1, v - 1))}>−</button>
              <span style={{ color: "#1e293b", fontWeight: 900, fontSize: 26, minWidth: 32, textAlign: "center" }}>{overs}</span>
              <button style={C.cntBtn} onClick={() => setOvers(v => Math.min(50, v + 1))}>+</button>
            </div>
          </div>
        </div>

        <button style={{ ...C.primaryBtn, marginTop: 14 }} onClick={() => onStart(overs)}>
          🏏 Start New Match
        </button>
        <button style={{ ...C.outlineBtn, marginTop: 10 }} onClick={() => setShowRules(true)}>
          📋 Cricket Rules
        </button>

        {/* History */}
        {sessions.length > 0 && (
          <div style={{ ...C.card, marginTop: 16 }}>
            <div style={C.cardTitle}>📜 Recent Matches</div>
            {sessions.slice().reverse().slice(0, 5).map((s, i, arr) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 0", borderBottom: i < arr.length - 1 ? "1px solid #f1f5f9" : "none"
              }}>
                <div>
                  <div style={{ color: "#1e293b", fontWeight: 700, fontSize: 13 }}>{s.batName} vs {s.bowlName}</div>
                  <div style={{ color: "#94a3b8", fontSize: 11 }}>{new Date(s.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: "#2563eb", fontSize: 12, fontWeight: 600 }}>{s.overs} overs</div>
                  {s.winner && <div style={{ color: "#16a34a", fontSize: 11, fontWeight: 700 }}>{s.winner} won</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   TEAM SETUP
═══════════════════════════════════════════════════ */
function TeamSetup({ label, color, onDone, onBack }) {
  const [teamName, setTeamName] = useState("");
  const [players, setPlayers] = useState([]);
  const [inp, setInp] = useState("");
  const [captain, setCaptain] = useState(0);
  const [wk, setWk] = useState(-1);

  const addPlayer = () => {
    const name = inp.trim();
    if (!name || players.length >= 11) return;
    setPlayers(p => [...p, name]);
    setInp("");
  };

  const removePlayer = (idx) => {
    setPlayers(p => p.filter((_, i) => i !== idx));
    if (captain >= idx && captain > 0) setCaptain(c => c - 1);
    if (wk === idx) setWk(-1);
    else if (wk > idx) setWk(w => w - 1);
  };

  const confirm = () => {
    if (!teamName.trim() || players.length < 2) return;
    onDone({
      name: teamName.trim(),
      players: players.map((n, i) => mkBatter(n, i === captain, i === wk)),
      bowlers: players.map((n, i) => mkBowler(n, i === captain)),
    });
  };

  return (
    <div style={C.page}>
      <div style={C.topBar}>
        <button style={C.backBtn} onClick={onBack}>‹ Back</button>
        <span style={{ color: color, fontWeight: 800, fontSize: 16 }}>{label} Setup</span>
        <div style={{ width: 60 }} />
      </div>

      <div style={{ padding: "16px 16px 40px" }}>
        <div style={C.card}>
          <div style={C.cardTitle}>Team Details</div>
          <input
            style={{ ...C.inp, marginTop: 10 }}
            placeholder={`Team name (e.g. Street Lions)`}
            value={teamName}
            onChange={e => setTeamName(e.target.value)}
          />
        </div>

        <div style={{ ...C.card, marginTop: 12 }}>
          <div style={C.cardTitle}>👥 Add Players (min 2, max 11)</div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input
              style={{ ...C.inp, flex: 1 }}
              placeholder={`Player ${players.length + 1} name`}
              value={inp}
              onChange={e => setInp(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addPlayer()}
            />
            <button
              style={{ ...C.cntBtn, width: 46, height: 46, fontSize: 22, flexShrink: 0 }}
              onClick={addPlayer}
            >+</button>
          </div>

          {players.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ color: "#64748b", fontSize: 11, fontWeight: 700, marginBottom: 6, letterSpacing: 0.5 }}>
                TAP © = Captain · 🧤 = Wicketkeeper
              </div>
              {players.map((p, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "10px 0", borderBottom: i < players.length - 1 ? "1px solid #f1f5f9" : "none"
                }}>
                  <span style={{ color: color, fontWeight: 800, fontSize: 12, width: 22 }}>#{i + 1}</span>
                  <span style={{ color: "#1e293b", flex: 1, fontWeight: 600, fontSize: 14 }}>{p}</span>
                  <button
                    onClick={() => setCaptain(i)}
                    style={{
                      background: captain === i ? "#fbbf24" : "#f8fafc",
                      border: `1.5px solid ${captain === i ? "#f59e0b" : "#e2e8f0"}`,
                      borderRadius: 6, padding: "3px 8px", fontSize: 11,
                      fontWeight: 800, cursor: "pointer",
                      color: captain === i ? "#78350f" : "#94a3b8"
                    }}>©</button>
                  <button
                    onClick={() => setWk(wk === i ? -1 : i)}
                    style={{
                      background: wk === i ? "#dbeafe" : "#f8fafc",
                      border: `1.5px solid ${wk === i ? "#2563eb" : "#e2e8f0"}`,
                      borderRadius: 6, padding: "3px 8px", fontSize: 12,
                      cursor: "pointer"
                    }}>🧤</button>
                  <button
                    onClick={() => removePlayer(i)}
                    style={{ background: "none", border: "none", color: "#ef4444", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {players.length >= 2 && (
          <button
            style={{ ...C.primaryBtn, marginTop: 16, background: teamName.trim() ? "#2563eb" : "#94a3b8" }}
            onClick={confirm}
          >✅ Confirm {label}</button>
        )}
        {players.length >= 2 && !teamName.trim() && (
          <p style={{ color: "#ef4444", textAlign: "center", fontSize: 12, marginTop: 6 }}>Please enter a team name</p>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   COIN TOSS
═══════════════════════════════════════════════════ */
function CoinToss({ teamA, teamB, onResult, onBack }) {
  const [phase, setPhase] = useState("pick"); // pick | flip | decide
  const [result, setResult] = useState(null);
  const [winner, setWinner] = useState(null);

  const flip = (choice) => {
    setPhase("flip"); vib(50);
    setTimeout(() => {
      const r = Math.random() < 0.5 ? "H" : "T";
      const won = (r === choice);
      setResult(r);
      setWinner(won ? teamA.name : teamB.name);
      setPhase("decide"); vib([60, 30, 80]);
    }, 1600);
  };

  const decide = (batFirst) => {
    // batFirst = true means toss winner bats
    const bat = winner === teamA.name
      ? (batFirst ? teamA : teamB)
      : (batFirst ? teamB : teamA);
    const bowl = bat === teamA ? teamB : teamA;
    onResult(bat, bowl);
  };

  return (
    <div style={C.page}>
      <div style={C.topBar}>
        <button style={C.backBtn} onClick={onBack}>‹ Back</button>
        <span style={{ color: "#2563eb", fontWeight: 800, fontSize: 16 }}>Coin Toss</span>
        <div style={{ width: 60 }} />
      </div>

      <div style={{ padding: "32px 20px", textAlign: "center" }}>
        <div style={{ ...C.card, padding: "20px 16px" }}>
          <p style={{ color: "#475569", fontSize: 14, margin: "0 0 4px" }}>
            <strong style={{ color: "#2563eb" }}>{teamA.name}</strong> calls the toss
          </p>

          {phase === "pick" && (
            <>
              <div style={{ fontSize: 72, margin: "24px 0" }}>🪙</div>
              <p style={{ color: "#1e293b", fontWeight: 700, marginBottom: 20 }}>Choose Heads or Tails</p>
              <div style={{ display: "flex", gap: 12 }}>
                <button style={{ ...C.primaryBtn, flex: 1 }} onClick={() => flip("H")}>👑 Heads</button>
                <button style={{ ...C.outlineBtn, flex: 1 }} onClick={() => flip("T")}>🦅 Tails</button>
              </div>
            </>
          )}

          {phase === "flip" && (
            <div style={{ margin: "32px 0" }}>
              <div style={{ fontSize: 80, display: "inline-block", animation: "spin 0.3s linear infinite" }}>🪙</div>
              <p style={{ color: "#2563eb", fontWeight: 700, marginTop: 16, fontSize: 17 }}>Flipping…</p>
            </div>
          )}

          {phase === "decide" && (
            <>
              <div style={{ fontSize: 68, margin: "16px 0" }}>{result === "H" ? "👑" : "🦅"}</div>
              <p style={{ color: "#2563eb", fontSize: 22, fontWeight: 900 }}>{result === "H" ? "HEADS!" : "TAILS!"}</p>
              <div style={{ background: "#eff6ff", borderRadius: 12, padding: "12px", margin: "12px 0 20px" }}>
                <p style={{ color: "#1e293b", fontWeight: 800, margin: "0 0 4px", fontSize: 16 }}>🏆 {winner} won!</p>
                <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>What do you choose?</p>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <button style={{ ...C.primaryBtn, flex: 1 }} onClick={() => decide(true)}>🏏 Bat First</button>
                <button style={{ ...C.dangerBtn, flex: 1 }} onClick={() => decide(false)}>⚾ Bowl First</button>
              </div>
            </>
          )}
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotateY(0)}to{transform:rotateY(720deg)}}`}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   CORE GAME ENGINE
   KEY RULES:
   - Wide / No Ball = NOT a legal delivery → balls counter does NOT increment
   - Wide / No Ball = +1 run to score + extras
   - After No Ball → freeHit = true for next delivery
   - Free Hit: batsman can only be out run-out
   - Legal deliveries count toward over (6 legal = over done)
   - After OUT: show next batter modal
   - After Over: show next bowler modal
   - Striker rotates on odd runs (1,3)
   - Striker rotates at end of over
═══════════════════════════════════════════════════ */
function GameScreen({ match, onEnd, onBack }) {
  const { battingTeam, bowlingTeam, overs: maxOvers } = match;
  const TOTAL_BALLS = maxOvers * 6;

  /* ── initial state factory ── */
  const initState = () => ({
    /* innings meta */
    inn: 1,                        // 1 or 2
    target: null,                  // set after innings 1 ends

    /* current innings scoring */
    score: 0,
    wickets: 0,
    legalBalls: 0,                 // counts only legal deliveries for over tracking
    totalDeliveries: 0,            // every delivery including wides & no-balls (for log)
    extras: { wides: 0, noBalls: 0 },

    /* batting — arrays cloned per innings */
    batters: JSON.parse(JSON.stringify(battingTeam.players)),
    strikerIdx: 0,
    nonStrikerIdx: 1,
    nextBatterIdx: 2,              // next batter to come in after wicket

    /* bowling */
    bowlers: JSON.parse(JSON.stringify(
      (bowlingTeam.bowlers || bowlingTeam.players.map(p => mkBowler(p.name, p.isCaptain)))
    )),
    bowlerIdx: 0,
    prevBowlerIdx: -1,

    /* over tracking */
    currentOverBalls: [],          // array of labels for THIS over
    completedOvers: [],            // array of over arrays (for log)

    /* delivery log for graph */
    deliveryLog: [],

    /* free hit */
    freeHit: false,

    /* partnership */
    partnerships: [{ bat1: 0, bat2: 1, runs: 0, balls: 0 }],

    /* commentary (newest first) */
    commentary: [],

    /* saved innings 1 for reference */
    inn1Snapshot: null,
  });

  const [G, setG] = useState(initState);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [matchResult, setMatchResult] = useState(null);

  /* ── derived display values ── */
  const oversDisplay = fmtOvers(G.legalBalls);
  const crr = G.legalBalls > 0 ? ((G.score / G.legalBalls) * 6).toFixed(2) : "0.00";
  const rrr = (G.target !== null && G.inn === 2 && TOTAL_BALLS - G.legalBalls > 0)
    ? (((G.target + 1 - G.score) / ((TOTAL_BALLS - G.legalBalls) / 6))).toFixed(2)
    : null;

  const inningsBatTeam = G.inn === 1 ? battingTeam.name : bowlingTeam.name;
  const inningsBowlTeam = G.inn === 1 ? bowlingTeam.name : battingTeam.name;

  const striker = G.batters[G.strikerIdx];
  const nonStriker = G.batters[G.nonStrikerIdx];
  const currentBowler = G.bowlers[G.bowlerIdx];

  const showToast = (msg) => { setToast(msg); vib(50); };

  /* ══════════════════════════════════
     END MATCH HELPER
  ══════════════════════════════════ */
  const triggerEnd = (winner, margin, finalG) => {
    setMatchResult({ winner, margin });
    setModal("result");
    loadSessions().then(sessions => {
      sessions.push({
        id: Date.now().toString(),
        batName: battingTeam.name,
        bowlName: bowlingTeam.name,
        overs: maxOvers,
        date: new Date().toISOString(),
        winner,
        margin,
      });
      saveSessions(sessions);
    });
  };

  /* ══════════════════════════════════
     TRANSITION TO INNINGS 2
  ══════════════════════════════════ */
  const startInnings2 = (inn1Score, prevG) => {
    const newG = {
      inn: 2,
      target: inn1Score,
      score: 0,
      wickets: 0,
      legalBalls: 0,
      totalDeliveries: 0,
      extras: { wides: 0, noBalls: 0 },
      batters: JSON.parse(JSON.stringify(bowlingTeam.players)),
      strikerIdx: 0,
      nonStrikerIdx: 1,
      nextBatterIdx: 2,
      bowlers: JSON.parse(JSON.stringify(
        (battingTeam.bowlers || battingTeam.players.map(p => mkBowler(p.name, p.isCaptain)))
      )),
      bowlerIdx: 0,
      prevBowlerIdx: -1,
      currentOverBalls: [],
      completedOvers: [],
      deliveryLog: [],
      freeHit: false,
      partnerships: [{ bat1: 0, bat2: 1, runs: 0, balls: 0 }],
      commentary: [],
      inn1Snapshot: {
        batters: prevG.batters,
        bowlers: prevG.bowlers,
        score: inn1Score,
        extras: prevG.extras,
        completedOvers: prevG.completedOvers,
        deliveryLog: prevG.deliveryLog,
      },
    };
    setG(newG);
    showToast(`🔔 Innings 2 — Target: ${inn1Score + 1}`);
    setTimeout(() => setModal("selectBowler"), 300);
  };

  /* ══════════════════════════════════
     MAIN DELIVER FUNCTION
  ══════════════════════════════════ */
  const deliver = (type) => {
    if (modal === "result") return;

    setG(prev => {
      // Deep clone to avoid mutation
      const G2 = JSON.parse(JSON.stringify(prev));
      const striker2 = G2.batters[G2.strikerIdx];
      const bowler2 = G2.bowlers[G2.bowlerIdx];
      const isLegal = (type !== "wide" && type !== "nb");

      // ── Build delivery log entry ──
      const entry = {
        n: G2.totalDeliveries + 1,       // delivery number (including extras)
        legalN: G2.legalBalls + (isLegal ? 1 : 0),
        overLabel: `${Math.floor(G2.legalBalls / 6)}.${G2.legalBalls % 6}`,
        type,
        scoreBefore: G2.score,
        scoreAfter: G2.score, // will update below
        isLegal,
        label: "",
      };

      // ── Process delivery ──
      if (type === "wide") {
        G2.score += 1;
        G2.extras.wides += 1;
        bowler2.runs += 1;
        bowler2.wides += 1;
        entry.label = "Wd";
        G2.currentOverBalls.push("Wd");
        G2.freeHit = false; // wides don't trigger free hit, only NB

      } else if (type === "nb") {
        G2.score += 1;
        G2.extras.noBalls += 1;
        bowler2.runs += 1;
        bowler2.noBalls += 1;
        entry.label = "NB";
        G2.currentOverBalls.push("NB");
        G2.freeHit = true; // NEXT ball is free hit

      } else {
        // Legal delivery
        G2.legalBalls += 1;
        striker2.balls += 1;
        bowler2.balls += 1;
        const prevFreeHit = G2.freeHit;
        G2.freeHit = false; // clear free hit after use

        if (type === "out") {
          // On free hit, out is NOT valid (except run-out handled same way)
          G2.wickets += 1;
          striker2.out = true;
          bowler2.wkts += 1;
          entry.label = "W";
          G2.currentOverBalls.push("W");
          // Partnership end
          const pp = G2.partnerships;
          if (pp.length > 0) pp[pp.length - 1].balls += 1;

        } else {
          // Runs: 0,1,2,3,4,6
          const runs = type;
          G2.score += runs;
          striker2.runs += runs;
          bowler2.runs += runs;
          if (runs === 0) { striker2.dots += 1; bowler2.dots = (bowler2.dots || 0) + 1; }
          if (runs === 4) striker2.fours += 1;
          if (runs === 6) striker2.sixes += 1;
          entry.label = runs === 0 ? "·" : String(runs);
          G2.currentOverBalls.push(entry.label);

          // Partnership update
          const pp = G2.partnerships;
          if (pp.length > 0) { pp[pp.length - 1].runs += runs; pp[pp.length - 1].balls += 1; }

          // ── Rotate striker on odd runs ──
          if (runs % 2 === 1) {
            const tmp = G2.strikerIdx;
            G2.strikerIdx = G2.nonStrikerIdx;
            G2.nonStrikerIdx = tmp;
          }
        }
      }

      // ── Update delivery log ──
      G2.totalDeliveries += 1;
      entry.scoreAfter = G2.score;
      G2.deliveryLog.push(entry);

      // ── Add commentary ──
      const s2 = G2.batters[G2.strikerIdx];
      const b2 = G2.bowlers[G2.bowlerIdx];
      G2.commentary.unshift(genComm(type, striker2?.name, b2?.name));

      // ── Milestone checks ──
      if (isLegal && type !== "out") {
        const prevRuns = striker2.runs - (type === "wide" || type === "nb" ? 0 : (typeof type === "number" ? type : 0));
        // Note: striker2.runs already updated
        [25, 50, 75, 100].forEach(m => {
          if ((striker2.runs - (typeof type === "number" && type > 0 ? type : 0)) < m && striker2.runs >= m) {
            setTimeout(() => showToast(`🎉 ${striker2.name} ${m === 50 ? "FIFTY!" : m === 100 ? "CENTURY!! 🏆" : m + " up!"}`), 100);
          }
        });
      }

      // ── Check over completion (only on legal deliveries) ──
      const overDone = isLegal && (G2.legalBalls % 6 === 0) && G2.legalBalls > 0;
      if (overDone && type !== "out") {
        G2.completedOvers.push([...G2.currentOverBalls]);
        G2.currentOverBalls = [];
        bowler2.overs += 1;
        // Rotate striker at end of over
        const tmp = G2.strikerIdx;
        G2.strikerIdx = G2.nonStrikerIdx;
        G2.nonStrikerIdx = tmp;
      }

      // ── Check end conditions ──
      // In gully cricket, last batter can still bat alone — innings ends only when ALL are out
      const allOut = G2.wickets >= G2.batters.length;
      const oversFinished = G2.legalBalls >= TOTAL_BALLS;
      const targetChased = G2.target !== null && G2.score > G2.target;
      const tiedOut = G2.target !== null && G2.score === G2.target && (allOut || oversFinished);

      if (G2.inn === 1 && (allOut || oversFinished)) {
        // Save snapshot and start innings 2
        const snap = JSON.parse(JSON.stringify(G2));
        setTimeout(() => startInnings2(G2.score, snap), 100);
        return G2;
      }

      if (G2.inn === 2) {
        if (targetChased) {
          const wktsLeft = G2.batters.filter(b => !b.out).length;
          setTimeout(() => triggerEnd(inningsBatTeam, `${wktsLeft} wicket${wktsLeft !== 1 ? "s" : ""}`, G2), 100);
          return G2;
        }
        if (tiedOut) {
          setTimeout(() => triggerEnd("Match TIED", "", G2), 100);
          return G2;
        }
        if (allOut || oversFinished) {
          if (G2.score < G2.target) {
            const diff = G2.target - G2.score;
            const winner = G2.inn === 2 ? (battingTeam.name) : (bowlingTeam.name);
            // Team batting first wins
            setTimeout(() => triggerEnd(battingTeam.name, `${diff} run${diff !== 1 ? "s" : ""}`, G2), 100);
          } else if (G2.score === G2.target) {
            setTimeout(() => triggerEnd("Match TIED", "", G2), 100);
          }
          return G2;
        }
      }

      // ── Trigger modals AFTER state update ──
      if (type === "out") {
        // Only show next-batter modal if innings hasn't ended AND there is a batter to come
        const nextAvail = G2.batters.findIndex((b, i) => !b.out && i !== G2.nonStrikerIdx && i !== G2.strikerIdx);
        const innings1Over = G2.inn === 1 && G2.wickets >= G2.batters.length;
        const innings2Over = G2.inn === 2 && (G2.wickets >= G2.batters.length || (G2.target !== null && (G2.score > G2.target || G2.score === G2.target)));
        if (nextAvail >= 0 && !innings1Over && !innings2Over) {
          setTimeout(() => setModal("selectBatter"), 200);
        }
      }
      if (overDone && type !== "out") {
        setTimeout(() => setModal("selectBowler"), 200);
      }

      return G2;
    });
  };

  /* ── Undo last delivery ── */
  const undoDelivery = () => {
    setG(prev => {
      if (prev.deliveryLog.length === 0) return prev;
      const G2 = JSON.parse(JSON.stringify(prev));
      const last = G2.deliveryLog.pop();
      const striker2 = G2.batters[G2.strikerIdx];
      const bowler2 = G2.bowlers[G2.bowlerIdx];

      if (last.type === "wide") {
        G2.score -= 1; G2.extras.wides -= 1;
        bowler2.runs -= 1; bowler2.wides -= 1;
        G2.currentOverBalls.pop();
      } else if (last.type === "nb") {
        G2.score -= 1; G2.extras.noBalls -= 1;
        bowler2.runs -= 1; bowler2.noBalls -= 1;
        G2.currentOverBalls.pop();
        G2.freeHit = false;
      } else {
        G2.legalBalls -= 1;
        striker2.balls -= 1;
        bowler2.balls -= 1;
        if (last.type === "out") {
          G2.wickets -= 1;
          striker2.out = false;
          bowler2.wkts -= 1;
        } else {
          const r = last.type;
          G2.score -= r; striker2.runs -= r; bowler2.runs -= r;
          if (r === 0) striker2.dots -= 1;
          if (r === 4) striker2.fours -= 1;
          if (r === 6) striker2.sixes -= 1;
          if (r % 2 === 1) {
            const tmp = G2.strikerIdx; G2.strikerIdx = G2.nonStrikerIdx; G2.nonStrikerIdx = tmp;
          }
        }
        if (G2.currentOverBalls.length > 0) G2.currentOverBalls.pop();
      }
      return G2;
    });
    showToast("↩ Last delivery undone");
  };

  /* ── Ball chip color ── */
  const chipStyle = (label) => {
    const bg = label === "W" ? "#dc2626" : label === "NB" ? "#9333ea" : label === "Wd" ? "#d97706"
      : label === "6" ? "#16a34a" : label === "4" ? "#2563eb" : label === "·" ? "#94a3b8" : "#475569";
    return {
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      minWidth: 28, height: 28, borderRadius: 6, fontSize: 11, fontWeight: 800,
      background: bg, color: "#fff", flexShrink: 0
    };
  };

  /* ── Graph data ── */
  const graphData = G.deliveryLog.filter(d => d.isLegal || d.type === "wide" || d.type === "nb").map(d => ({
    x: d.n,
    score: d.scoreAfter,
    isWide: d.type === "wide",
    isNb: d.type === "nb",
    isFour: d.type === 4,
    isSix: d.type === 6,
    isOut: d.type === "out",
    isDot: d.type === 0,
    label: d.label,
  }));

  /* ── Batters for modal ── */
  const availableBatters = G.batters.map((b, i) => ({
    label: b.name,
    value: i,
    disabled: b.out || i === G.nonStrikerIdx || i === G.strikerIdx,
    badge: b.isCaptain ? "Captain" : b.isWK ? "WK" : null,
    sub: b.balls > 0 ? `${b.runs}(${b.balls}) · SR ${strikeRate(b.runs, b.balls)}` : "Yet to bat",
    why: b.out ? "Out" : (i === G.nonStrikerIdx || i === G.strikerIdx) ? "At crease" : null,
  }));

  const availableBowlers = G.bowlers.map((b, i) => ({
    label: b.name,
    value: i,
    disabled: i === G.prevBowlerIdx,
    badge: b.isCaptain ? "Captain" : null,
    sub: b.balls > 0 ? `${fmtOvers(b.balls)} ov · ${b.runs}r · ${b.wkts}w · Eco ${economy(b.runs, b.balls)}` : "Yet to bowl",
    why: i === G.prevBowlerIdx ? "Bowled last over" : null,
  }));

  const allBattersForStriker = G.batters.map((b, i) => ({
    label: b.name,
    value: i,
    disabled: b.out,
    badge: i === G.strikerIdx ? "Striker ▶" : i === G.nonStrikerIdx ? "Non-striker" : null,
    sub: `${b.runs}(${b.balls})`,
  }));

  return (
    <div style={{ ...C.page, background: "#f8fafc" }}>
      {/* ── STICKY HEADER ── */}
      <div style={{
        background: "#1d4ed8", padding: "10px 14px",
        display: "flex", alignItems: "center", gap: 8,
        position: "sticky", top: 0, zIndex: 40
      }}>
        <button style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 8, padding: "6px 12px", fontWeight: 800, cursor: "pointer", fontSize: 15 }} onClick={onBack}>‹</button>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ color: "#fff", fontWeight: 900, fontSize: 15 }}>{inningsBatTeam}</div>
          <div style={{ color: "#bfdbfe", fontSize: 11 }}>
            vs {inningsBowlTeam} · {maxOvers} overs
            {G.target !== null && <span style={{ color: "#fbbf24", fontWeight: 700 }}> · Target: {G.target + 1}</span>}
          </div>
        </div>
        <button style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 8, padding: "6px 10px", fontSize: 15, cursor: "pointer" }} onClick={() => setModal("rules")}>📋</button>
      </div>

      {/* FREE HIT BANNER */}
      {G.freeHit && (
        <div style={{ background: "#7c3aed", padding: "8px", textAlign: "center", color: "#fff", fontWeight: 800, fontSize: 13, letterSpacing: 0.3 }}>
          ⚡ FREE HIT — Batsman cannot be dismissed (except Run-Out)!
        </div>
      )}

      {/* ── SCOREBOARD ── */}
      <div style={{ background: "#1d4ed8", padding: "0 16px 20px", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 4 }}>
          <span style={{ fontSize: 64, fontWeight: 900, color: "#fff", lineHeight: 1 }}>{G.score}</span>
          <span style={{ fontSize: 30, color: "#93c5fd", fontWeight: 700, marginBottom: 6 }}>/{G.wickets}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 20, color: "#bfdbfe", fontSize: 13, fontWeight: 600, marginTop: 4 }}>
          <span>🕐 {oversDisplay}/{maxOvers}</span>
          <span>CRR {crr}</span>
          {rrr && <span style={{ color: parseFloat(rrr) > 12 ? "#fca5a5" : "#86efac" }}>RRR {rrr}</span>}
        </div>
        {(G.extras.wides > 0 || G.extras.noBalls > 0) && (
          <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 4 }}>
            {G.extras.wides > 0 && <span style={{ color: "#fcd34d", fontSize: 12, fontWeight: 700 }}>Wd: {G.extras.wides}</span>}
            {G.extras.noBalls > 0 && <span style={{ color: "#c4b5fd", fontSize: 12, fontWeight: 700 }}>NB: {G.extras.noBalls}</span>}
          </div>
        )}
      </div>

      {/* ── CURRENT OVER CHIPS ── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "8px 14px", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 5 }}>
        <span style={{ color: "#94a3b8", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
          Over {Math.floor(G.legalBalls / 6) + 1}:
        </span>
        {G.currentOverBalls.length === 0 && <span style={{ color: "#cbd5e1", fontSize: 12 }}>—</span>}
        {G.currentOverBalls.map((b, i) => <span key={i} style={chipStyle(b)}>{b}</span>)}
      </div>

      {/* ── BATTERS ── */}
      <div style={{ display: "flex", gap: 8, padding: "10px 12px" }}>
        {[[G.strikerIdx, true], [G.nonStrikerIdx, false]].map(([idx, isStriker]) => {
          const b = G.batters[idx];
          if (!b) return null;
          return (
            <div key={idx} style={{
              flex: 1, background: "#fff",
              border: `2px solid ${isStriker ? "#2563eb" : "#e2e8f0"}`,
              borderRadius: 14, padding: "10px 12px",
              boxShadow: isStriker ? "0 2px 12px rgba(37,99,235,0.12)" : "0 1px 4px rgba(0,0,0,0.06)"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
                {isStriker && <span style={{ color: "#2563eb", fontSize: 11, fontWeight: 800 }}>▶</span>}
                {b.isCaptain && <span style={{ color: "#f59e0b", fontSize: 10 }}>©</span>}
                {b.isWK && <span style={{ fontSize: 10 }}>🧤</span>}
                <span style={{ color: "#1e293b", fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</span>
              </div>
              <div style={{ color: isStriker ? "#2563eb" : "#334155", fontWeight: 900, fontSize: 26, lineHeight: 1 }}>{b.runs}</div>
              <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 2 }}>{b.balls}b</div>
              <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
                {b.fours > 0 && <span style={{ color: "#2563eb", fontSize: 11, fontWeight: 700 }}>{b.fours}×4</span>}
                {b.sixes > 0 && <span style={{ color: "#16a34a", fontSize: 11, fontWeight: 700 }}>{b.sixes}×6</span>}
              </div>
              {b.balls > 0 && <div style={{ color: "#cbd5e1", fontSize: 10, marginTop: 2 }}>SR {strikeRate(b.runs, b.balls)}</div>}
            </div>
          );
        })}
      </div>

      {/* ── BOWLER ── */}
      <div style={{ padding: "0 12px 8px" }}>
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#64748b", fontSize: 12 }}>⚾ <strong style={{ color: "#1e293b" }}>{currentBowler?.name || "—"}</strong></span>
          {currentBowler && currentBowler.balls > 0 && (
            <span style={{ color: "#94a3b8", fontSize: 12 }}>
              {fmtOvers(currentBowler.balls)} · {currentBowler.wkts}w · {currentBowler.runs}r · Eco {economy(currentBowler.runs, currentBowler.balls)}
            </span>
          )}
        </div>
      </div>

      {/* ── RUN BUTTONS ── */}
      <div style={{ padding: "0 12px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 6 }}>
          {[0, 1, 2, 3, 4, 6].map(r => (
            <button
              key={r}
              onClick={() => deliver(r)}
              style={{
                border: `2px solid ${r === 4 ? "#2563eb" : r === 6 ? "#16a34a" : "#e2e8f0"}`,
                borderRadius: 12, background: r === 6 ? "#f0fdf4" : r === 4 ? "#eff6ff" : "#fff",
                color: r === 4 ? "#2563eb" : r === 6 ? "#16a34a" : r === 0 ? "#94a3b8" : "#1e293b",
                fontSize: r >= 4 ? 22 : 20, fontWeight: 900, padding: "16px 0", cursor: "pointer",
                boxShadow: "0 1px 4px rgba(0,0,0,0.06)"
              }}
            >{r === 0 ? "·" : r}</button>
          ))}
        </div>

        {/* EXTRAS ROW */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginTop: 7 }}>
          <button onClick={() => deliver("wide")} style={{ ...C.extraBtn, borderColor: "#f59e0b", background: "#fffbeb" }}>
            <span style={{ color: "#d97706", fontWeight: 800, fontSize: 12 }}>WIDE</span>
            <span style={{ color: "#92400e", fontSize: 10 }}>+1 extra</span>
          </button>
          <button onClick={() => deliver("nb")} style={{ ...C.extraBtn, borderColor: "#9333ea", background: "#faf5ff" }}>
            <span style={{ color: "#7c3aed", fontWeight: 800, fontSize: 12 }}>NO BALL</span>
            <span style={{ color: "#6d28d9", fontSize: 10 }}>+1 🔒FH</span>
          </button>
          <button onClick={() => deliver("out")} style={{ ...C.extraBtn, borderColor: "#dc2626", background: "#fff1f2" }}>
            <span style={{ color: "#dc2626", fontWeight: 900, fontSize: 15 }}>OUT</span>
            <span style={{ color: "#991b1b", fontSize: 10 }}>wicket ✕</span>
          </button>
          <button onClick={undoDelivery} style={{ ...C.extraBtn, borderColor: "#94a3b8", background: "#f8fafc" }}>
            <span style={{ color: "#64748b", fontSize: 15 }}>↩</span>
            <span style={{ color: "#94a3b8", fontSize: 10 }}>UNDO</span>
          </button>
        </div>

        {/* ACTION BUTTONS */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 5, marginTop: 8 }}>
          {[
            ["🔄 Bat", "striker"],
            ["⚾ Bowl", "selectBowler"],
            ["📊 Card", "scorecard"],
            ["📈 Graph", "graph"],
            ["💬 Feed", "comm"],
          ].map(([lbl, m]) => (
            <button key={m} style={C.actBtn} onClick={() => setModal(m)}>{lbl}</button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 5, marginTop: 5 }}>
          {[
            ["🤝 Partner", "partnership"],
            ["📜 Overs", "overlog"],
            ["🏅 MOM", "mom"],
            ["📊 Stats", "matchstats"],
          ].map(([lbl, m]) => (
            <button key={m} style={{ ...C.actBtn, fontSize: 11 }} onClick={() => setModal(m)}>{lbl}</button>
          ))}
        </div>
      </div>

      {/* ══ MODALS ══ */}

      {/* Select next batter after wicket */}
      {modal === "selectBatter" && (
        <RadioModal
          title="🏏 Next Batsman In"
          subtitle="Choose who comes to bat next"
          options={availableBatters.filter(o => !o.disabled || o.why === "At crease").map(o => ({
            ...o,
            disabled: G.batters[o.value]?.out || o.value === G.nonStrikerIdx || o.value === G.strikerIdx
          }))}
          onSelect={(idx) => {
            setG(p => {
              const G2 = JSON.parse(JSON.stringify(p));
              G2.strikerIdx = idx;
              G2.nextBatterIdx = Math.max(G2.nextBatterIdx, idx + 1);
              G2.partnerships.push({ bat1: idx, bat2: G2.nonStrikerIdx, runs: 0, balls: 0 });
              return G2;
            });
            setModal(null);
          }}
          onClose={() => setModal(null)}
          confirmLabel="Send In"
        />
      )}

      {/* Select bowler */}
      {modal === "selectBowler" && (
        <RadioModal
          title="⚾ Select Bowler"
          subtitle="Who bowls this over?"
          options={availableBowlers}
          onSelect={(idx) => {
            setG(p => ({ ...p, prevBowlerIdx: p.bowlerIdx, bowlerIdx: idx }));
            setModal(null);
          }}
          onClose={() => setModal(null)}
          confirmLabel="Bowl"
        />
      )}

      {/* Change striker */}
      {modal === "striker" && (
        <RadioModal
          title="🔄 Change Striker"
          subtitle="Who faces the next delivery?"
          options={allBattersForStriker}
          onSelect={(idx) => {
            setG(p => {
              const G2 = { ...p };
              if (idx === p.nonStrikerIdx) {
                G2.strikerIdx = p.nonStrikerIdx;
                G2.nonStrikerIdx = p.strikerIdx;
              } else {
                G2.strikerIdx = idx;
              }
              return G2;
            });
            setModal(null);
          }}
          onClose={() => setModal(null)}
          confirmLabel="Set Striker"
        />
      )}

      {modal === "scorecard" && <ScorecardModal G={G} battingTeam={battingTeam} bowlingTeam={bowlingTeam} onClose={() => setModal(null)} />}
      {modal === "graph" && <GraphModal G={G} battingTeam={battingTeam} bowlingTeam={bowlingTeam} onClose={() => setModal(null)} />}
      {modal === "rules" && <RulesModal onClose={() => setModal(null)} />}
      {modal === "comm" && <CommModal log={G.commentary} onClose={() => setModal(null)} />}
      {modal === "partnership" && <PartnershipModal data={G.partnerships} batters={G.batters} onClose={() => setModal(null)} />}
      {modal === "mom" && (
        <MOMModal
          G={G}
          battingTeam={battingTeam}
          bowlingTeam={bowlingTeam}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "overlog" && <OverLogModal log={G.completedOvers} currentOver={G.currentOverBalls} onClose={() => setModal(null)} />}
      {modal === "matchstats" && <MatchStatsModal G={G} totalBalls={TOTAL_BALLS} onClose={() => setModal(null)} />}
      {modal === "result" && matchResult && (
        <ResultModal result={matchResult} onHome={onEnd} onScorecard={() => setModal("scorecard")} />
      )}

      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   GRAPH MODAL — BOTH INNINGS
═══════════════════════════════════════════════════ */
const mkGraphSeries = (log) =>
  log.map((d, idx) => ({
    x: idx + 1,
    score: d.scoreAfter,
    isWide: d.type === "wide",
    isNb: d.type === "nb",
    isFour: d.type === 4,
    isSix: d.type === 6,
    isOut: d.type === "out",
  }));

const DotInn1 = (props) => {
  const { cx, cy, payload: p } = props;
  if (!cx || !cy) return null;
  if (p.isSix)  return <circle cx={cx} cy={cy} r={6} fill="#16a34a" stroke="#fff" strokeWidth={2}/>;
  if (p.isFour) return <circle cx={cx} cy={cy} r={5} fill="#2563eb" stroke="#fff" strokeWidth={2}/>;
  if (p.isOut)  return <circle cx={cx} cy={cy} r={5} fill="#dc2626" stroke="#fff" strokeWidth={2}/>;
  if (p.isNb)   return <circle cx={cx} cy={cy} r={4} fill="#9333ea" stroke="#fff" strokeWidth={1}/>;
  if (p.isWide) return <circle cx={cx} cy={cy} r={4} fill="#d97706" stroke="#fff" strokeWidth={1}/>;
  return null;
};
const DotInn2 = (props) => {
  const { cx, cy, payload: p } = props;
  if (!cx || !cy) return null;
  if (p.isSix)  return <polygon points={`${cx},${cy-7} ${cx+6},${cy+4} ${cx-6},${cy+4}`} fill="#15803d" stroke="#fff" strokeWidth={1.5}/>;
  if (p.isFour) return <polygon points={`${cx},${cy-6} ${cx+5},${cy+3} ${cx-5},${cy+3}`} fill="#1d4ed8" stroke="#fff" strokeWidth={1.5}/>;
  if (p.isOut)  return <polygon points={`${cx},${cy-6} ${cx+5},${cy+3} ${cx-5},${cy+3}`} fill="#b91c1c" stroke="#fff" strokeWidth={1.5}/>;
  if (p.isNb)   return <polygon points={`${cx},${cy-5} ${cx+4},${cy+3} ${cx-4},${cy+3}`} fill="#7c3aed" stroke="#fff" strokeWidth={1}/>;
  if (p.isWide) return <polygon points={`${cx},${cy-5} ${cx+4},${cy+3} ${cx-4},${cy+3}`} fill="#b45309" stroke="#fff" strokeWidth={1}/>;
  return null;
};

const DualGraphTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
      <div style={{ color: "#64748b", fontSize: 10, marginBottom: 4 }}>Delivery #{label}</div>
      {payload.map((p, i) => p.value != null && (
        <div key={i} style={{ color: p.color, fontWeight: 700 }}>{p.name}: {p.value}</div>
      ))}
    </div>
  );
};

function GraphModal({ G, battingTeam, bowlingTeam, onClose }) {
  // Inn1 data: from snapshot if in inn2, else current log
  const inn1Log = G.inn1Snapshot ? G.inn1Snapshot.deliveryLog : G.deliveryLog;
  const inn2Log = G.inn1Snapshot ? G.deliveryLog : [];
  const inn1Name = battingTeam.name;
  const inn2Name = bowlingTeam.name;

  // Merge both into a single array aligned by delivery index
  const maxLen = Math.max(inn1Log.length, inn2Log.length);
  const merged = Array.from({ length: maxLen }, (_, i) => ({
    x: i + 1,
    inn1: inn1Log[i]?.scoreAfter ?? null,
    inn2: inn2Log[i]?.scoreAfter ?? null,
    // inn1 annotations
    i1Six: inn1Log[i]?.type === 6,
    i1Four: inn1Log[i]?.type === 4,
    i1Out: inn1Log[i]?.type === "out",
    i1Wd: inn1Log[i]?.type === "wide",
    i1Nb: inn1Log[i]?.type === "nb",
    // inn2 annotations
    i2Six: inn2Log[i]?.type === 6,
    i2Four: inn2Log[i]?.type === 4,
    i2Out: inn2Log[i]?.type === "out",
    i2Wd: inn2Log[i]?.type === "wide",
    i2Nb: inn2Log[i]?.type === "nb",
  }));

  // Custom dots that read inn1/inn2 fields
  const Inn1Dot = (props) => {
    const { cx, cy, payload: p } = props;
    if (!cx || !cy || p.inn1 == null) return null;
    if (p.i1Six)  return <circle cx={cx} cy={cy} r={6} fill="#16a34a" stroke="#fff" strokeWidth={2}/>;
    if (p.i1Four) return <circle cx={cx} cy={cy} r={5} fill="#2563eb" stroke="#fff" strokeWidth={2}/>;
    if (p.i1Out)  return <circle cx={cx} cy={cy} r={5} fill="#dc2626" stroke="#fff" strokeWidth={2}/>;
    if (p.i1Wd)   return <circle cx={cx} cy={cy} r={4} fill="#d97706" stroke="#fff" strokeWidth={1}/>;
    if (p.i1Nb)   return <circle cx={cx} cy={cy} r={4} fill="#9333ea" stroke="#fff" strokeWidth={1}/>;
    return null;
  };
  const Inn2Dot = (props) => {
    const { cx, cy, payload: p } = props;
    if (!cx || !cy || p.inn2 == null) return null;
    if (p.i2Six)  return <circle cx={cx} cy={cy} r={6} fill="#15803d" stroke="#f0fdf4" strokeWidth={2}/>;
    if (p.i2Four) return <circle cx={cx} cy={cy} r={5} fill="#1d4ed8" stroke="#eff6ff" strokeWidth={2}/>;
    if (p.i2Out)  return <circle cx={cx} cy={cy} r={5} fill="#b91c1c" stroke="#fff1f2" strokeWidth={2}/>;
    if (p.i2Wd)   return <circle cx={cx} cy={cy} r={4} fill="#b45309" stroke="#fffbeb" strokeWidth={1}/>;
    if (p.i2Nb)   return <circle cx={cx} cy={cy} r={4} fill="#7c3aed" stroke="#faf5ff" strokeWidth={1}/>;
    return null;
  };

  const hasInn2 = inn2Log.length > 0;
  const target = G.inn1Snapshot ? G.inn1Snapshot.score : G.target;

  return (
    <div style={C.overlay}>
      <div style={{ ...C.sheet, width: "97%" }}>
        <div style={C.sheetHead}>
          <div style={C.sheetTitle}>📈 Run Progression</div>
          <button style={C.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Team legend */}
        <div style={{ display: "flex", gap: 16, margin: "10px 0 4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 24, height: 3, background: "#2563eb", borderRadius: 2 }}/>
            <span style={{ color: "#1e293b", fontSize: 12, fontWeight: 700 }}>{inn1Name}</span>
          </div>
          {hasInn2 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 24, height: 3, background: "#dc2626", borderRadius: 2, borderTop: "2px dashed #dc2626" }}/>
              <span style={{ color: "#1e293b", fontSize: 12, fontWeight: 700 }}>{inn2Name}</span>
            </div>
          )}
        </div>
        {/* Annotation legend */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {[["#16a34a","SIX"], ["#2563eb","4"], ["#d97706","Wide"], ["#9333ea","NB"], ["#dc2626","OUT"]].map(([c,l]) => (
            <div key={l} style={{ display:"flex", alignItems:"center", gap:3 }}>
              <div style={{ width:9, height:9, borderRadius:"50%", background:c }}/>
              <span style={{ color:"#64748b", fontSize:10 }}>{l}</span>
            </div>
          ))}
        </div>

        {merged.length < 2 ? (
          <p style={{ color: "#94a3b8", textAlign: "center", padding: "20px 0" }}>Bowl more deliveries to see chart</p>
        ) : (
          <ResponsiveContainer width="100%" height={230}>
            <ComposedChart data={merged} margin={{ top: 8, right: 12, left: -18, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="x" tick={{ fill: "#94a3b8", fontSize: 9 }} label={{ value: "Delivery #", position: "insideBottomRight", offset: -4, fill: "#94a3b8", fontSize: 9 }} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 9 }} />
              <Tooltip content={<DualGraphTooltip />} />
              {target != null && (
                <ReferenceLine y={target} stroke="#64748b" strokeDasharray="4 4" strokeWidth={1}
                  label={{ value: `Inn1: ${target}`, fill: "#64748b", fontSize: 9, position: "insideTopRight" }} />
              )}
              <Line type="monotone" dataKey="inn1" name={inn1Name} stroke="#2563eb" strokeWidth={2.5}
                dot={<Inn1Dot />} activeDot={{ r: 5 }} connectNulls />
              {hasInn2 && (
                <Line type="monotone" dataKey="inn2" name={inn2Name} stroke="#dc2626" strokeWidth={2.5}
                  strokeDasharray="6 3" dot={<Inn2Dot />} activeDot={{ r: 5 }} connectNulls />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
        {!hasInn2 && (
          <p style={{ color: "#cbd5e1", fontSize: 11, textAlign: "center", marginTop: 4 }}>2nd innings line will appear after innings break</p>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   SCORECARD MODAL — FULL MATCH (BOTH INNINGS)
═══════════════════════════════════════════════════ */
const BatTable = ({ batters, extras, teamName, innScore, inn }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ background: "#1d4ed8", borderRadius: "8px 8px 0 0", padding: "7px 10px", display: "flex", justifyContent: "space-between" }}>
      <span style={{ color: "#fff", fontWeight: 800, fontSize: 13 }}>🏏 {teamName} batting</span>
      <span style={{ color: "#fbbf24", fontWeight: 900, fontSize: 13 }}>Inn {inn}</span>
    </div>
    <div style={{ overflowX: "auto", border: "1px solid #dbeafe", borderTop: "none", borderRadius: "0 0 8px 8px" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "#eff6ff" }}>
            {["Batsman","R","B","4s","6s","SR"].map(h => (
              <th key={h} style={{ padding:"6px 5px", textAlign: h==="Batsman"?"left":"center", color:"#2563eb", fontWeight:800, borderBottom:"1px solid #dbeafe" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {batters.map((b, i) => (
            <tr key={i} style={{ borderBottom:"1px solid #f1f5f9", background: i%2===0?"#fff":"#fafafa" }}>
              <td style={{ padding:"7px 5px", color: b.out?"#94a3b8":"#1e293b", fontWeight:600, maxWidth:110 }}>
                {b.out && <span style={{ color:"#dc2626" }}>✕ </span>}
                {b.name}
                {b.isCaptain && <span style={{ color:"#f59e0b", fontSize:9 }}> ©</span>}
                {b.isWK && <span style={{ fontSize:9 }}> 🧤</span>}
              </td>
              <td style={{ textAlign:"center", fontWeight:900, color: b.runs>=50?"#f59e0b": b.runs>=25?"#16a34a":"#1e293b" }}>{b.runs}</td>
              <td style={{ textAlign:"center", color:"#475569" }}>{b.balls}</td>
              <td style={{ textAlign:"center", color:"#2563eb", fontWeight:700 }}>{b.fours}</td>
              <td style={{ textAlign:"center", color:"#16a34a", fontWeight:700 }}>{b.sixes}</td>
              <td style={{ textAlign:"center", color:"#64748b" }}>{strikeRate(b.runs,b.balls)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ padding:"5px 10px", color:"#64748b", fontSize:11, borderTop:"1px solid #f1f5f9", display:"flex", justifyContent:"space-between" }}>
        <span>Extras: Wd {extras.wides} · NB {extras.noBalls}</span>
        <span style={{ fontWeight:800, color:"#1e293b" }}>Total: {innScore}</span>
      </div>
    </div>
  </div>
);

const BowlTable = ({ bowlers, teamName, inn }) => {
  const active = bowlers.filter(b => b.balls > 0);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ background: "#475569", borderRadius: "8px 8px 0 0", padding: "7px 10px", display: "flex", justifyContent: "space-between" }}>
        <span style={{ color: "#fff", fontWeight: 800, fontSize: 13 }}>⚾ {teamName} bowling</span>
        <span style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 11 }}>Inn {inn}</span>
      </div>
      <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderTop: "none", borderRadius: "0 0 8px 8px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Bowler","O","R","W","Wd","NB","Eco"].map(h => (
                <th key={h} style={{ padding:"6px 4px", textAlign: h==="Bowler"?"left":"center", color:"#475569", fontWeight:800, borderBottom:"1px solid #e2e8f0" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {active.length === 0 && <tr><td colSpan={7} style={{ textAlign:"center", color:"#94a3b8", padding:12 }}>No overs bowled</td></tr>}
            {active.map((b, i) => (
              <tr key={i} style={{ borderBottom:"1px solid #f1f5f9", background: i%2===0?"#fff":"#fafafa" }}>
                <td style={{ padding:"7px 5px", color:"#1e293b", fontWeight:600 }}>
                  {b.name}{b.isCaptain && <span style={{ color:"#f59e0b", fontSize:9 }}> ©</span>}
                </td>
                <td style={{ textAlign:"center", color:"#475569" }}>{fmtOvers(b.balls)}</td>
                <td style={{ textAlign:"center", color:"#1e293b", fontWeight:700 }}>{b.runs}</td>
                <td style={{ textAlign:"center", color:"#16a34a", fontWeight:800 }}>{b.wkts}</td>
                <td style={{ textAlign:"center", color:"#d97706" }}>{b.wides}</td>
                <td style={{ textAlign:"center", color:"#9333ea" }}>{b.noBalls}</td>
                <td style={{ textAlign:"center", color: parseFloat(economy(b.runs,b.balls))>9?"#dc2626":"#475569", fontWeight:700 }}>{economy(b.runs,b.balls)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

function ScorecardModal({ G, battingTeam, bowlingTeam, onClose }) {
  const [tab, setTab] = useState("inn1");

  // Inn1: battingTeam batted, bowlingTeam bowled
  const inn1 = G.inn1Snapshot || null;
  const inn1Batters  = inn1 ? inn1.batters  : (G.inn === 1 ? G.batters  : []);
  const inn1Bowlers  = inn1 ? inn1.bowlers  : (G.inn === 1 ? G.bowlers  : []);
  const inn1Extras   = inn1 ? inn1.extras   : (G.inn === 1 ? G.extras   : { wides:0, noBalls:0 });
  const inn1Score    = inn1 ? inn1.score    : (G.inn === 1 ? G.score    : 0);

  // Inn2: bowlingTeam batted (only if inn2 started)
  const inn2Started  = G.inn === 2 || inn1 !== null;
  const inn2Batters  = G.inn === 2 ? G.batters  : [];
  const inn2Bowlers  = G.inn === 2 ? G.bowlers  : [];
  const inn2Extras   = G.inn === 2 ? G.extras   : { wides:0, noBalls:0 };
  const inn2Score    = G.inn === 2 ? G.score    : 0;

  const tabs = [
    ["inn1", `Inn 1 · ${battingTeam.name}`],
    ...(inn2Started ? [["inn2", `Inn 2 · ${bowlingTeam.name}`]] : []),
  ];

  return (
    <div style={C.overlay}>
      <div style={{ ...C.sheet, maxHeight: "88vh", overflowY: "auto" }}>
        <div style={C.sheetHead}>
          <div style={C.sheetTitle}>📊 Full Scorecard</div>
          <button style={C.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Match summary bar */}
        {inn2Started && (
          <div style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:10, padding:"8px 12px", margin:"10px 0", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={{ textAlign:"center", flex:1 }}>
              <div style={{ color:"#1e293b", fontWeight:900, fontSize:18 }}>{inn1Score}</div>
              <div style={{ color:"#64748b", fontSize:11 }}>{battingTeam.name}</div>
            </div>
            <div style={{ color:"#94a3b8", fontWeight:800, fontSize:14 }}>vs</div>
            <div style={{ textAlign:"center", flex:1 }}>
              <div style={{ color:"#1e293b", fontWeight:900, fontSize:18 }}>{inn2Score}</div>
              <div style={{ color:"#64748b", fontSize:11 }}>{bowlingTeam.name}</div>
            </div>
          </div>
        )}

        <div style={{ display:"flex", gap:5, margin:"8px 0 12px", flexWrap:"wrap" }}>
          {tabs.map(([t, l]) => (
            <button key={t}
              style={{ flex:1, minWidth:100, padding:"8px", borderRadius:8, border:`2px solid ${tab===t?"#2563eb":"#e2e8f0"}`, background:tab===t?"#2563eb":"#fff", color:tab===t?"#fff":"#64748b", fontWeight:700, fontSize:11, cursor:"pointer" }}
              onClick={() => setTab(t)}>{l}</button>
          ))}
        </div>

        {tab === "inn1" && (
          <>
            <BatTable batters={inn1Batters} extras={inn1Extras} teamName={battingTeam.name} innScore={inn1Score} inn={1} />
            <BowlTable bowlers={inn1Bowlers} teamName={bowlingTeam.name} inn={1} />
            {inn1Batters.filter(b => b.balls > 0).length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ color:"#64748b", fontSize:11, fontWeight:700, marginBottom:4 }}>Runs distribution</div>
                <BarChart width={300} height={110} data={inn1Batters.filter(b=>b.balls>0).map(b=>({ n:b.name.split(" ")[0].slice(0,6), r:b.runs }))} margin={{ top:4,right:0,left:-24,bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="n" tick={{ fill:"#2563eb", fontSize:9 }} />
                  <YAxis tick={{ fill:"#94a3b8", fontSize:9 }} />
                  <Tooltip contentStyle={{ background:"#fff", border:"1px solid #e2e8f0", fontSize:11 }} />
                  <Bar dataKey="r" name="Runs" radius={[4,4,0,0]}>
                    {inn1Batters.filter(b=>b.balls>0).map((_,i) => <Cell key={i} fill={["#1d4ed8","#2563eb","#3b82f6","#60a5fa","#93c5fd"][i%5]} />)}
                  </Bar>
                </BarChart>
              </div>
            )}
          </>
        )}

        {tab === "inn2" && inn2Started && (
          <>
            {inn2Batters.length === 0
              ? <p style={{ color:"#94a3b8", textAlign:"center", padding:16 }}>Innings 2 not started yet</p>
              : <>
                  <BatTable batters={inn2Batters} extras={inn2Extras} teamName={bowlingTeam.name} innScore={inn2Score} inn={2} />
                  <BowlTable bowlers={inn2Bowlers} teamName={battingTeam.name} inn={2} />
                  {inn2Batters.filter(b=>b.balls>0).length > 0 && (
                    <div style={{ marginTop:8 }}>
                      <div style={{ color:"#64748b", fontSize:11, fontWeight:700, marginBottom:4 }}>Runs distribution</div>
                      <BarChart width={300} height={110} data={inn2Batters.filter(b=>b.balls>0).map(b=>({ n:b.name.split(" ")[0].slice(0,6), r:b.runs }))} margin={{ top:4,right:0,left:-24,bottom:0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="n" tick={{ fill:"#dc2626", fontSize:9 }} />
                        <YAxis tick={{ fill:"#94a3b8", fontSize:9 }} />
                        <Tooltip contentStyle={{ background:"#fff", border:"1px solid #e2e8f0", fontSize:11 }} />
                        <Bar dataKey="r" name="Runs" radius={[4,4,0,0]}>
                          {inn2Batters.filter(b=>b.balls>0).map((_,i) => <Cell key={i} fill={["#b91c1c","#dc2626","#ef4444","#f87171","#fca5a5"][i%5]} />)}
                        </Bar>
                      </BarChart>
                    </div>
                  )}
                </>
            }
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   OTHER MODALS
═══════════════════════════════════════════════════ */
function OverLogModal({ log, currentOver, onClose }) {
  const chipStyle = (b) => {
    const bg = b === "W" ? "#dc2626" : b === "NB" ? "#9333ea" : b === "Wd" ? "#d97706"
      : b === "6" ? "#16a34a" : b === "4" ? "#2563eb" : b === "·" ? "#e2e8f0" : "#94a3b8";
    return { display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 26, height: 26, borderRadius: 6, fontSize: 11, fontWeight: 800, background: bg, color: bg === "#e2e8f0" ? "#94a3b8" : "#fff", flexShrink: 0 };
  };
  const calcRuns = (over) => over.reduce((s, b) => {
    const n = parseInt(b); return s + (isNaN(n) ? (b === "Wd" || b === "NB" ? 1 : 0) : n);
  }, 0);

  return (
    <div style={C.overlay}>
      <div style={{ ...C.sheet, maxHeight: "75vh", overflowY: "auto" }}>
        <div style={C.sheetHead}>
          <div style={C.sheetTitle}>📜 Over-by-Over</div>
          <button style={C.closeBtn} onClick={onClose}>✕</button>
        </div>
        {currentOver.length > 0 && (
          <div style={{ background: "#eff6ff", borderRadius: 10, padding: "10px 12px", marginTop: 10, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ color: "#2563eb", fontWeight: 800 }}>Current Over</span>
              <span style={{ color: "#1e293b", fontWeight: 900 }}>{calcRuns(currentOver)} runs so far</span>
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{currentOver.map((b, i) => <span key={i} style={chipStyle(b)}>{b}</span>)}</div>
          </div>
        )}
        {log.length === 0 && !currentOver.length && <p style={{ color: "#94a3b8", textAlign: "center", padding: 16 }}>No overs completed yet</p>}
        {log.map((over, i) => (
          <div key={i} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px", marginTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ color: "#2563eb", fontWeight: 800 }}>Over {i + 1}</span>
              <span style={{ color: "#1e293b", fontWeight: 900 }}>{calcRuns(over)} runs</span>
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{over.map((b, j) => <span key={j} style={chipStyle(b)}>{b}</span>)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CommModal({ log, onClose }) {
  return (
    <div style={C.overlay}>
      <div style={{ ...C.sheet, maxHeight: "75vh", overflowY: "auto" }}>
        <div style={C.sheetHead}>
          <div style={C.sheetTitle}>💬 Live Commentary</div>
          <button style={C.closeBtn} onClick={onClose}>✕</button>
        </div>
        {log.length === 0 && <p style={{ color: "#94a3b8", textAlign: "center", padding: 16 }}>No deliveries bowled yet</p>}
        {log.map((c, i) => (
          <div key={i} style={{ padding: "9px 0", borderBottom: "1px solid #f1f5f9", color: i === 0 ? "#1e293b" : "#64748b", fontSize: i === 0 ? 13 : 12, lineHeight: 1.5, fontWeight: i === 0 ? 600 : 400 }}>{c}</div>
        ))}
      </div>
    </div>
  );
}

function PartnershipModal({ data, batters, onClose }) {
  return (
    <div style={C.overlay}>
      <div style={{ ...C.sheet, maxHeight: "70vh", overflowY: "auto" }}>
        <div style={C.sheetHead}>
          <div style={C.sheetTitle}>🤝 Partnerships</div>
          <button style={C.closeBtn} onClick={onClose}>✕</button>
        </div>
        {data.length === 0 && <p style={{ color: "#94a3b8", textAlign: "center", padding: 16 }}>No data yet</p>}
        {data.map((p, i) => {
          const n1 = batters[p.bat1]?.name || "?"; const n2 = batters[p.bat2]?.name || "?";
          return (
            <div key={i} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px", marginTop: 8 }}>
              <div style={{ color: "#2563eb", fontWeight: 800, fontSize: 14, marginBottom: 6 }}>{n1} & {n2}</div>
              <div style={{ display: "flex", gap: 20 }}>
                <div><span style={{ color: "#64748b", fontSize: 11 }}>Runs </span><span style={{ color: "#1e293b", fontWeight: 900, fontSize: 22 }}>{p.runs}</span></div>
                <div><span style={{ color: "#64748b", fontSize: 11 }}>Balls </span><span style={{ color: "#475569", fontWeight: 700, fontSize: 16 }}>{p.balls}</span></div>
                {p.balls > 0 && <div><span style={{ color: "#64748b", fontSize: 11 }}>Run Rate </span><span style={{ color: "#16a34a", fontWeight: 700 }}>{((p.runs / p.balls) * 6).toFixed(1)}</span></div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MOM SCORING FORMULAS
   ─────────────────────────────────────────────────
   Three distinct formulas based on player role:

   BAT ONLY (bowled 0 balls):
     score = runs
           + SR_bonus  (SR > 100 → +(SR-100)/10, SR < 60 → -(60-SR)/15)
           + 4s × 1.5
           + 6s × 3
           − dot_penalty (dots/balls × 8)

   BOWL ONLY (batted 0 balls):
     score = wkts × 25
           + eco_bonus  (eco < 6 → +(6-eco)×5, eco > 10 → -(eco-10)×3)
           + dot_bowl_bonus (bowler dots tracked separately)

   ALL-ROUNDER (batted AND bowled):
     bat_part = runs
              + SR_bonus
              + 4s × 1.2
              + 6s × 2.5
              − dot_penalty
     bowl_part = wkts × 20
               + eco_bonus × 0.85
     score = bat_part × 0.55 + bowl_part × 0.45
           + synergy_bonus (if runs≥20 AND wkts≥1 → +15)
═══════════════════════════════════════════════════ */

const calcMOMScore = (bat, bowl) => {
  const hasBatted  = bat  && bat.balls  > 0;
  const hasBowled  = bowl && bowl.balls > 0;

  // ── Batting sub-score ──
  const batScore = (() => {
    if (!hasBatted) return 0;
    const sr    = bat.balls > 0 ? (bat.runs / bat.balls) * 100 : 0;
    const srBonus = sr > 100 ? (sr - 100) / 10
                  : sr < 60  ? -(60 - sr) / 15
                  : 0;
    const dotPenalty = bat.balls > 0 ? (bat.dots / bat.balls) * 8 : 0;
    return bat.runs + srBonus + bat.fours * 1.5 + bat.sixes * 3 - dotPenalty;
  })();

  // ── Bowling sub-score ──
  const bowlScore = (() => {
    if (!hasBowled) return 0;
    const eco     = bowl.balls > 0 ? (bowl.runs / bowl.balls) * 6 : 99;
    const ecoBonus = eco < 6  ? (6  - eco) * 5
                   : eco > 10 ? -(eco - 10) * 3
                   : 0;
    return bowl.wkts * 25 + ecoBonus;
  })();

  // ── Role classification & final score ──
  if (hasBatted && !hasBowled) {
    // Pure batter
    return { score: batScore, role: "bat", batScore, bowlScore: 0 };
  }
  if (!hasBatted && hasBowled) {
    // Pure bowler
    return { score: bowlScore, role: "bowl", batScore: 0, bowlScore };
  }
  if (hasBatted && hasBowled) {
    // All-rounder
    const srForAR  = bat.balls > 0 ? (bat.runs / bat.balls) * 100 : 0;
    const srBonusAR = srForAR > 100 ? (srForAR - 100) / 10
                    : srForAR < 60  ? -(60 - srForAR) / 15
                    : 0;
    const dotPenAR = bat.balls > 0 ? (bat.dots / bat.balls) * 8 : 0;
    const eco      = bowl.balls > 0 ? (bowl.runs / bowl.balls) * 6 : 99;
    const ecoBonusAR = eco < 6  ? (6  - eco) * 5
                     : eco > 10 ? -(eco - 10) * 3
                     : 0;
    const bPart   = bat.runs + srBonusAR + bat.fours * 1.2 + bat.sixes * 2.5 - dotPenAR;
    const wPart   = bowl.wkts * 20 + ecoBonusAR * 0.85;
    const synergy = (bat.runs >= 20 && bowl.wkts >= 1) ? 15 : 0;
    const total   = bPart * 0.55 + wPart * 0.45 + synergy;
    return { score: total, role: "all", batScore: bPart, bowlScore: wPart, synergy };
  }
  return { score: -999, role: "none", batScore: 0, bowlScore: 0 };
};

function MOMModal({ G, battingTeam, bowlingTeam, onClose }) {
  // Collect all players from both innings with their batting & bowling records
  // Inn1: battingTeam batted, bowlingTeam bowled
  // Inn2: bowlingTeam batted, battingTeam bowled

  const inn1Bat  = G.inn1Snapshot?.batters  || (G.inn === 1 ? G.batters  : []);
  const inn1Bowl = G.inn1Snapshot?.bowlers  || (G.inn === 1 ? G.bowlers  : []);
  const inn2Bat  = G.inn === 2 ? G.batters  : [];
  const inn2Bowl = G.inn === 2 ? G.bowlers  : [];

  // Build unified player list: { name, isCaptain, bat, bowl }
  const players = [];

  // battingTeam players: batted in inn1, bowled in inn2
  battingTeam.players.forEach(p => {
    const bat  = inn1Bat.find(b => b.name === p.name)  || null;
    const bowl = inn2Bowl.find(b => b.name === p.name) || null;
    players.push({ name: p.name, isCaptain: p.isCaptain, isWK: p.isWK, team: battingTeam.name, bat, bowl });
  });

  // bowlingTeam players: bowled in inn1, batted in inn2
  bowlingTeam.players.forEach(p => {
    const bat  = inn2Bat.find(b => b.name === p.name)  || null;
    const bowl = inn1Bowl.find(b => b.name === p.name) || null;
    players.push({ name: p.name, isCaptain: p.isCaptain, isWK: p.isWK, team: bowlingTeam.name, bat, bowl });
  });

  // Compute MOM score for each
  const scored = players.map(p => ({
    ...p,
    ...calcMOMScore(p.bat, p.bowl),
  })).filter(p => p.role !== "none")
    .sort((a, b) => b.score - a.score);

  const winner = scored[0] || null;

  const roleLabel = (r) => r === "bat" ? "🏏 Batter" : r === "bowl" ? "⚾ Bowler" : "⭐ All-Rounder";
  const roleColor = (r) => r === "bat" ? "#2563eb" : r === "bowl" ? "#16a34a" : "#7c3aed";

  const ScoreBar = ({ label, val, max, color }) => {
    const pct = max > 0 ? Math.min(100, Math.max(0, (val / max) * 100)) : 0;
    return (
      <div style={{ marginBottom: 6 }}>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#64748b", marginBottom:2 }}>
          <span>{label}</span><span style={{ fontWeight:700, color }}>{val.toFixed(1)} pts</span>
        </div>
        <div style={{ height:6, background:"#f1f5f9", borderRadius:4 }}>
          <div style={{ height:6, width:`${pct}%`, background:color, borderRadius:4, transition:"width .4s" }}/>
        </div>
      </div>
    );
  };

  const maxScore = scored.length > 0 ? Math.max(...scored.map(p => p.score)) : 1;

  return (
    <div style={C.overlay}>
      <div style={{ ...C.sheet, maxHeight: "88vh", overflowY: "auto" }}>
        <div style={C.sheetHead}>
          <div style={C.sheetTitle}>🏅 Player of the Match</div>
          <button style={C.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Formula legend */}
        <div style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:10, padding:"10px 12px", margin:"10px 0 14px", fontSize:11 }}>
          <div style={{ color:"#1e293b", fontWeight:800, marginBottom:6 }}>📐 Rating Formula</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
            <div style={{ background:"#eff6ff", borderRadius:8, padding:"8px" }}>
              <div style={{ color:"#2563eb", fontWeight:800, fontSize:10, marginBottom:4 }}>🏏 BATTER</div>
              <div style={{ color:"#475569", fontSize:9, lineHeight:1.6 }}>
                Runs + SR bonus<br/>+ 4s×1.5 + 6s×3<br/>− dot ball penalty
              </div>
            </div>
            <div style={{ background:"#f0fdf4", borderRadius:8, padding:"8px" }}>
              <div style={{ color:"#16a34a", fontWeight:800, fontSize:10, marginBottom:4 }}>⚾ BOWLER</div>
              <div style={{ color:"#475569", fontSize:9, lineHeight:1.6 }}>
                Wkts×25<br/>+ Economy bonus<br/>(low eco = more pts)
              </div>
            </div>
            <div style={{ background:"#faf5ff", borderRadius:8, padding:"8px" }}>
              <div style={{ color:"#7c3aed", fontWeight:800, fontSize:10, marginBottom:4 }}>⭐ ALL-RDR</div>
              <div style={{ color:"#475569", fontSize:9, lineHeight:1.6 }}>
                Bat×55% + Bowl×45%<br/>+ synergy bonus<br/>(20r + 1w = +15pts)
              </div>
            </div>
          </div>
        </div>

        {/* Winner card */}
        {winner && (
          <div style={{ background:"linear-gradient(135deg,#1d4ed8,#4338ca)", borderRadius:16, padding:"18px 16px", marginBottom:16, textAlign:"center" }}>
            <div style={{ fontSize:40, marginBottom:4 }}>🏅</div>
            <div style={{ color:"#fff", fontWeight:900, fontSize:20 }}>{winner.name}</div>
            <div style={{ color:"#bfdbfe", fontSize:12, marginBottom:6 }}>
              {winner.team} · {roleLabel(winner.role)}
              {winner.isCaptain && " ©"}{winner.isWK && " 🧤"}
            </div>
            <div style={{ color:"#fbbf24", fontWeight:900, fontSize:28 }}>{winner.score.toFixed(1)} pts</div>

            {/* Stat breakdown */}
            <div style={{ background:"rgba(255,255,255,0.12)", borderRadius:10, padding:"10px 12px", marginTop:12, textAlign:"left" }}>
              {winner.role === "bat" && winner.bat && (
                <div style={{ color:"#e2e8f0", fontSize:11 }}>
                  {winner.bat.runs}r ({winner.bat.balls}b) · SR {((winner.bat.runs/Math.max(winner.bat.balls,1))*100).toFixed(1)}
                  · {winner.bat.fours}×4 · {winner.bat.sixes}×6
                </div>
              )}
              {winner.role === "bowl" && winner.bowl && (
                <div style={{ color:"#e2e8f0", fontSize:11 }}>
                  {winner.bowl.wkts}w · {fmtOvers(winner.bowl.balls)} ov
                  · Eco {winner.bowl.balls>0?((winner.bowl.runs/winner.bowl.balls)*6).toFixed(2):"—"}
                  · {winner.bowl.runs}r
                </div>
              )}
              {winner.role === "all" && (
                <div style={{ color:"#e2e8f0", fontSize:11 }}>
                  {winner.bat?.runs}r ({winner.bat?.balls}b) · SR {winner.bat?.balls>0?((winner.bat.runs/winner.bat.balls)*100).toFixed(1):"—"}
                  &nbsp;|&nbsp;
                  {winner.bowl?.wkts}w · Eco {winner.bowl?.balls>0?((winner.bowl.runs/winner.bowl.balls)*6).toFixed(2):"—"}
                  {winner.synergy > 0 && <span style={{ color:"#fbbf24" }}> +synergy!</span>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* All players ranked */}
        <div style={{ color:"#64748b", fontSize:11, fontWeight:700, marginBottom:8, letterSpacing:0.3 }}>FULL RANKINGS</div>
        {scored.map((p, i) => (
          <div key={i} style={{
            background: i===0?"#fffbeb":i===1?"#f8fafc":i===2?"#f8fafc":"#fff",
            border:`1.5px solid ${i===0?"#f59e0b":i<3?"#e2e8f0":"#f1f5f9"}`,
            borderRadius:12, padding:"12px 14px", marginBottom:8
          }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
              <span style={{ fontWeight:900, fontSize:16, minWidth:24, color: i===0?"#f59e0b":i===1?"#94a3b8":i===2?"#b45309":"#cbd5e1" }}>
                {i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`}
              </span>
              <div style={{ flex:1 }}>
                <div style={{ color:"#1e293b", fontWeight:700, fontSize:14 }}>
                  {p.name}
                  {p.isCaptain && <span style={{ color:"#f59e0b", fontSize:10 }}> ©</span>}
                  {p.isWK && <span style={{ fontSize:10 }}> 🧤</span>}
                </div>
                <div style={{ display:"flex", gap:8, marginTop:1 }}>
                  <span style={{ background:roleColor(p.role)+"22", color:roleColor(p.role), fontSize:10, fontWeight:800, padding:"1px 6px", borderRadius:4 }}>
                    {roleLabel(p.role)}
                  </span>
                  <span style={{ color:"#94a3b8", fontSize:10 }}>{p.team}</span>
                </div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ color: i===0?"#f59e0b":"#1e293b", fontWeight:900, fontSize:18 }}>{p.score.toFixed(1)}</div>
                <div style={{ color:"#94a3b8", fontSize:9 }}>pts</div>
              </div>
            </div>

            {/* Score bars */}
            {p.role === "bat" && (
              <ScoreBar label="Batting Score" val={p.batScore} max={maxScore} color="#2563eb" />
            )}
            {p.role === "bowl" && (
              <ScoreBar label="Bowling Score" val={p.bowlScore} max={maxScore} color="#16a34a" />
            )}
            {p.role === "all" && (
              <>
                <ScoreBar label={`Batting (×55%)`} val={p.batScore * 0.55} max={maxScore} color="#2563eb" />
                <ScoreBar label={`Bowling (×45%)`} val={p.bowlScore * 0.45} max={maxScore} color="#16a34a" />
                {p.synergy > 0 && <ScoreBar label="Synergy Bonus" val={p.synergy} max={maxScore} color="#7c3aed" />}
              </>
            )}

            {/* Raw stats line */}
            <div style={{ color:"#94a3b8", fontSize:10, marginTop:4 }}>
              {p.bat && p.bat.balls > 0 && (
                <span>🏏 {p.bat.runs}r({p.bat.balls}b) {p.bat.fours}×4 {p.bat.sixes}×6 SR{((p.bat.runs/p.bat.balls)*100).toFixed(0)}</span>
              )}
              {p.bat && p.bat.balls > 0 && p.bowl && p.bowl.balls > 0 && <span> · </span>}
              {p.bowl && p.bowl.balls > 0 && (
                <span>⚾ {p.bowl.wkts}w/{fmtOvers(p.bowl.balls)}ov Eco{p.bowl.balls>0?((p.bowl.runs/p.bowl.balls)*6).toFixed(1):"—"}</span>
              )}
              {(!p.bat || p.bat.balls === 0) && (!p.bowl || p.bowl.balls === 0) && (
                <span>Did not bat or bowl</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MatchStatsModal({ G, totalBalls, onClose }) {
  const proj = G.legalBalls > 0 ? Math.round((G.score / G.legalBalls) * totalBalls) : 0;
  const dots = G.deliveryLog.filter(d => d.type === 0).length;
  const dotPct = G.deliveryLog.filter(d => d.isLegal).length > 0
    ? ((dots / G.deliveryLog.filter(d => d.isLegal).length) * 100).toFixed(0) : 0;
  const bdRuns = G.batters.reduce((s, b) => s + b.fours * 4 + b.sixes * 6, 0);
  const bd = G.batters.reduce((s, b) => s + b.fours + b.sixes, 0);
  const rows = [
    ["📈 Projected Total", `~${proj}`],
    ["⚫ Dot Ball %", `${dotPct}%`],
    ["🏏 Boundaries Hit", bd],
    ["🔢 Boundary Runs", bdRuns],
    ["❌ Total Extras", G.extras.wides + G.extras.noBalls],
    ["⏱ Balls Remaining", Math.max(0, totalBalls - G.legalBalls)],
    ["🔢 Wickets Left", G.batters.length - 1 - G.wickets],
    ["🎯 Legal Deliveries", G.legalBalls],
    ["📦 Total Deliveries", G.totalDeliveries],
  ];

  return (
    <div style={C.overlay}>
      <div style={C.sheet}>
        <div style={C.sheetHead}>
          <div style={C.sheetTitle}>📊 Match Analysis</div>
          <button style={C.closeBtn} onClick={onClose}>✕</button>
        </div>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
            <span style={{ color: "#475569", fontSize: 13 }}>{k}</span>
            <span style={{ color: "#1e293b", fontWeight: 800, fontSize: 14 }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RulesModal({ onClose }) {
  return (
    <div style={C.overlay}>
      <div style={{ ...C.sheet, maxHeight: "82vh", overflowY: "auto" }}>
        <div style={C.sheetHead}>
          <div style={C.sheetTitle}>📋 Cricket Rules</div>
          <button style={C.closeBtn} onClick={onClose}>✕</button>
        </div>
        {RULES.map((r, i) => (
          <div key={i} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px", marginTop: 8 }}>
            <div style={{ color: "#2563eb", fontWeight: 800, marginBottom: 5 }}>{r.icon} {r.t}</div>
            <p style={{ color: "#475569", fontSize: 13, margin: 0, lineHeight: 1.6 }}>{r.d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultModal({ result, onHome, onScorecard }) {
  const isTie = result.winner === "Match TIED";
  return (
    <div style={{ ...C.overlay, background: "rgba(15,23,42,0.95)" }}>
      <div style={{ background: "#fff", borderRadius: 24, padding: "32px 24px", textAlign: "center", maxWidth: 340, width: "92%", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}>
        <div style={{ fontSize: 60, marginBottom: 8 }}>{isTie ? "🤝" : "🏆"}</div>
        {isTie ? (
          <h2 style={{ color: "#1e293b", margin: "0 0 20px", fontSize: 22 }}>Match Tied!</h2>
        ) : (
          <>
            <div style={{ color: "#2563eb", fontWeight: 900, fontSize: 24, marginBottom: 4 }}>{result.winner}</div>
            <div style={{ color: "#16a34a", fontWeight: 800, fontSize: 18, marginBottom: 4 }}>WON! 🎉</div>
            <div style={{ color: "#64748b", fontSize: 14, marginBottom: 20 }}>by {result.margin}</div>
          </>
        )}
        <button style={{ ...C.primaryBtn, marginBottom: 10 }} onClick={onScorecard}>📊 Full Scorecard</button>
        <button style={{ ...C.outlineBtn }} onClick={onHome}>🏠 Back to Home</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   APP ROOT
═══════════════════════════════════════════════════ */
export default function App() {
  const [phase, setPhase] = useState("home");
  const [hist, setHist] = useState([]);
  const [teamA, setTeamA] = useState(null);
  const [teamB, setTeamB] = useState(null);
  const [overs, setOvers] = useState(6);
  const [match, setMatch] = useState(null);
  const [sessions, setSessions] = useState([]);

  useEffect(() => { loadSessions().then(setSessions); }, []);

  const go = (p) => { setHist(h => [...h, phase]); setPhase(p); };
  const back = () => {
    setHist(h => {
      const n = [...h]; const prev = n.pop();
      setPhase(prev || "home");
      return n;
    });
  };

  const resetMatch = () => {
    setPhase("home"); setHist([]); setTeamA(null); setTeamB(null); setMatch(null);
    loadSessions().then(setSessions);
  };

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: "#f8fafc", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <style>{GLOBAL_CSS}</style>
      {phase === "home" && <HomeScreen onStart={(ov) => { setOvers(ov); go("teamA"); }} sessions={sessions} />}
      {phase === "teamA" && <TeamSetup label="Team A" color="#2563eb" onDone={t => { setTeamA(t); go("teamB"); }} onBack={back} />}
      {phase === "teamB" && <TeamSetup label="Team B" color="#16a34a" onDone={t => { setTeamB(t); go("toss"); }} onBack={back} />}
      {phase === "toss" && teamA && teamB && (
        <CoinToss teamA={teamA} teamB={teamB}
          onResult={(bat, bowl) => { setMatch({ battingTeam: bat, bowlingTeam: bowl, overs }); go("game"); }}
          onBack={back} />
      )}
      {phase === "game" && match && (
        <GameScreen match={match} onEnd={resetMatch} onBack={back} />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   STYLES
═══════════════════════════════════════════════════ */
const C = {
  page: { minHeight: "100vh", background: "#f8fafc", paddingBottom: 32 },
  topBar: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", background: "#fff", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 30 },
  card: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "16px", boxShadow: "0 1px 6px rgba(0,0,0,0.05)" },
  cardTitle: { color: "#2563eb", fontWeight: 800, fontSize: 13, letterSpacing: 0.3 },
  inp: { width: "100%", background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "11px 14px", color: "#1e293b", fontSize: 15, outline: "none", boxSizing: "border-box", display: "block" },
  primaryBtn: { background: "#2563eb", color: "#fff", border: "none", borderRadius: 12, padding: "14px 20px", fontSize: 15, fontWeight: 800, cursor: "pointer", width: "100%", display: "block" },
  outlineBtn: { background: "#fff", color: "#2563eb", border: "2px solid #2563eb", borderRadius: 12, padding: "13px 20px", fontSize: 15, fontWeight: 700, cursor: "pointer", width: "100%", display: "block" },
  dangerBtn: { background: "#dc2626", color: "#fff", border: "none", borderRadius: 12, padding: "14px 20px", fontSize: 15, fontWeight: 800, cursor: "pointer", width: "100%", display: "block" },
  cntBtn: { background: "#eff6ff", border: "1.5px solid #bfdbfe", color: "#2563eb", borderRadius: 8, width: 36, height: 36, fontSize: 20, fontWeight: 900, cursor: "pointer" },
  backBtn: { background: "#f1f5f9", border: "none", color: "#2563eb", borderRadius: 8, padding: "6px 12px", fontSize: 15, cursor: "pointer", fontWeight: 800 },
  extraBtn: { border: "2px solid", borderRadius: 10, fontSize: 12, fontWeight: 700, padding: "10px 4px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 },
  actBtn: { background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 10, color: "#2563eb", fontSize: 12, fontWeight: 700, padding: "9px 4px", cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" },
  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200, padding: 0 },
  sheet: { background: "#fff", borderRadius: "20px 20px 0 0", padding: "20px 16px 32px", width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 -8px 32px rgba(0,0,0,0.12)" },
  sheetHead: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  sheetTitle: { color: "#1e293b", fontWeight: 900, fontSize: 18 },
  sheetSub: { color: "#64748b", fontSize: 12, marginTop: 2 },
  closeBtn: { background: "#f1f5f9", border: "none", color: "#64748b", borderRadius: 8, width: 32, height: 32, fontSize: 16, cursor: "pointer", fontWeight: 800 },
};

const GLOBAL_CSS = `
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body { margin: 0; background: #f8fafc; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: #f1f5f9; }
  ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
  input::placeholder { color: #cbd5e1; }
  input:focus { border-color: #2563eb !important; }
  button:active { transform: scale(0.96); }
  @keyframes toastIn { from { opacity: 0; transform: translateX(-50%) translateY(-8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
  @keyframes spin { from { transform: rotateY(0); } to { transform: rotateY(720deg); } }
`;