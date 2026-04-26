import { useState, useEffect, useRef, useCallback } from "react";

// --- CONFIG --------------------------------------------------------------------
const API_KEY    = "AIzaSyBHkAfjfaxRQNDUjDjkCOiICfBC9ocgBDw";
const PROJECT    = "housequest-ab794";
const BUCKET     = "housequest-ab794.firebasestorage.app";
const GOOGLE_CID = "YOUR_GOOGLE_CLIENT_ID"; // Firebase Console ? Auth ? Sign-in method ? Google ? Web client ID

const AUTH_URL = `https://identitytoolkit.googleapis.com/v1/accounts`;
const FS_URL   = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const ST_URL   = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o`;

// --- FIRESTORE HELPERS ---------------------------------------------------------
function toFsVal(v) {
  if (v == null)           return { nullValue: null };
  if (typeof v==="boolean") return { booleanValue: v };
  if (typeof v==="number")  return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};
  if (typeof v==="string")  return { stringValue: v };
  if (Array.isArray(v))     return { arrayValue: v.length?{values:v.map(toFsVal)}:{} };
  if (typeof v==="object")  return { mapValue:{ fields: Object.fromEntries(
    Object.entries(v).filter(([,x])=>x!==undefined).map(([k,x])=>[k,toFsVal(x)])
  )}};
  return { stringValue: String(v) };
}
function fromFsVal(v) {
  if (!v) return null;
  if ("nullValue"    in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return parseInt(v.integerValue);
  if ("doubleValue"  in v) return v.doubleValue;
  if ("stringValue"  in v) return v.stringValue;
  if ("arrayValue"   in v) return (v.arrayValue.values||[]).map(fromFsVal);
  if ("mapValue"     in v) { const r={}; for(const[k,x] of Object.entries(v.mapValue.fields||{})) r[k]=fromFsVal(x); return r; }
  return null;
}
function fromDoc(doc) {
  if (!doc?.fields) return null;
  const r={}; for(const[k,v] of Object.entries(doc.fields)) r[k]=fromFsVal(v);
  return { id: doc.name?.split("/").pop(), ...r };
}
const hdrs = t => ({ "Content-Type":"application/json", ...(t?{Authorization:`Bearer ${t}`}:{}) });
const fsFields = data => ({ fields: Object.fromEntries(Object.entries(data).filter(([,v])=>v!==undefined).map(([k,v])=>[k,toFsVal(v)])) });

async function authPost(ep, body) {
  const r = await fetch(`${AUTH_URL}${ep}?key=${API_KEY}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const d = await r.json(); if(d.error) throw new Error(d.error.message); return d;
}
async function fsCreate(col, data, tok) {
  const r = await fetch(`${FS_URL}/${col}`,{method:"POST",headers:hdrs(tok),body:JSON.stringify(fsFields(data))});
  const d = await r.json(); if(d.error) throw new Error(d.error.message); return fromDoc(d);
}
async function fsPatch(path, data, tok) {
  const r = await fetch(`${FS_URL}/${path}`,{method:"PATCH",headers:hdrs(tok),body:JSON.stringify(fsFields(data))});
  const d = await r.json(); if(d.error) throw new Error(d.error.message); return fromDoc(d);
}
async function fsGet(path, tok) {
  const r = await fetch(`${FS_URL}/${path}`,{headers:hdrs(tok)});
  const d = await r.json(); if(d.error) return null; return fromDoc(d);
}
async function fsDel(path, tok) { await fetch(`${FS_URL}/${path}`,{method:"DELETE",headers:hdrs(tok)}); }
async function fsQuery(q, tok) {
  const r = await fetch(`${FS_URL}:runQuery`,{method:"POST",headers:hdrs(tok),body:JSON.stringify({structuredQuery:q})});
  const rows = await r.json(); return rows.filter(r=>r.document).map(r=>fromDoc(r.document));
}
async function uploadFile(file, tok) {
  const name = `messages/${Date.now()}_${file.name.replace(/[^\w.-]/g,"_")}`;
  const enc  = encodeURIComponent(name);
  const r = await fetch(`${ST_URL}?uploadType=media&name=${enc}`,{method:"POST",headers:{"Content-Type":file.type,Authorization:`Bearer ${tok}`},body:file});
  const d = await r.json(); if(d.error) throw new Error(d.error.message);
  return `${ST_URL}/${enc}?alt=media&token=${d.downloadTokens}`;
}

// --- UTILS ---------------------------------------------------------------------
const AUTH_ERRS = { EMAIL_EXISTS:"Email already registered.", INVALID_LOGIN_CREDENTIALS:"Wrong email or password.", INVALID_PASSWORD:"Wrong email or password.", WEAK_PASSWORD:"Password must be 6+ characters.", TOO_MANY_ATTEMPTS_TRY_LATER:"Too many attempts. Try later." };
const fmtErr = e => AUTH_ERRS[e.message] || e.message || "Something went wrong.";
const mkCode = () => Math.random().toString(36).substr(2,6).toUpperCase();

function fmtTime(iso) { if(!iso) return ""; return new Date(iso).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",hour12:true}); }
function fmtDay(iso) {
  if(!iso) return "";
  const d=new Date(iso), today=new Date(), yest=new Date(); yest.setDate(today.getDate()-1);
  if(d.toDateString()===today.toDateString()) return "Today";
  if(d.toDateString()===yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString([],{month:"long",day:"numeric"});
}
const sameDay = (a,b) => new Date(a).toDateString()===new Date(b).toDateString();

// --- PRIMITIVES ----------------------------------------------------------------
const ABGS = ["bg-amber-500","bg-teal-500","bg-purple-500","bg-blue-500","bg-rose-500","bg-green-500","bg-pink-500","bg-indigo-500"];
function Av({name,size="md"}) {
  const bg=ABGS[(name?.charCodeAt(0)||0)%ABGS.length];
  const sz=size==="xs"?"w-6 h-6 text-xs":size==="sm"?"w-7 h-7 text-xs":size==="lg"?"w-12 h-12 text-lg":"w-9 h-9 text-sm";
  return <div className={`${bg} ${sz} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 uppercase`}>{name?.[0]||"?"}</div>;
}
function Badge({children,v="gray"}) {
  const c={amber:"bg-amber-900 text-amber-300 border-amber-700",green:"bg-green-900 text-green-300 border-green-800",red:"bg-red-900 text-red-300 border-red-800",blue:"bg-blue-900 text-blue-300 border-blue-800",gray:"bg-gray-700 text-gray-300 border-gray-600",purple:"bg-purple-900 text-purple-300 border-purple-800"};
  return <span className={`${c[v]||c.gray} border text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap`}>{children}</span>;
}
function Inp({className="",...p}) { return <input className={`w-full bg-gray-700 text-white border border-gray-600 rounded-xl px-3 py-2.5 focus:border-amber-500 focus:outline-none placeholder-gray-500 text-sm ${className}`} {...p}/>; }
function Btn({children,v="primary",className="",...p}) {
  const c={primary:"bg-amber-500 hover:bg-amber-400 text-gray-900 font-bold disabled:opacity-50",ghost:"bg-gray-700 hover:bg-gray-600 text-white border border-gray-600 disabled:opacity-50",danger:"bg-red-800 hover:bg-red-700 text-white disabled:opacity-50",success:"bg-green-700 hover:bg-green-600 text-white disabled:opacity-50"};
  return <button className={`${c[v]||c.primary} px-4 py-2 rounded-xl transition-all text-sm ${className}`} {...p}>{children}</button>;
}
function Modal({title,onClose,children,wide}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{background:"rgba(0,0,0,0.85)"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className={`bg-gray-800 rounded-t-2xl sm:rounded-2xl p-5 w-full ${wide?"sm:max-w-xl":"sm:max-w-md"} border border-gray-700 max-h-[92vh] overflow-y-auto`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-700 transition-colors">?</button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Spin({sm}) { const s=sm?"w-4 h-4 border-2":"w-7 h-7 border-2"; return <div className={`${s} border-amber-500 border-t-transparent rounded-full animate-spin mx-auto`}/>; }
function Err({msg}) { return msg?<div className="bg-red-900/60 text-red-300 border border-red-800 p-3 rounded-xl mb-3 text-sm">{msg}</div>:null; }

// --- CHAT COMPONENTS -----------------------------------------------------------
const REACT_EMOJIS = ["??","??","??","??","??","??","??","??"];
const ALL_EMOJIS   = ["??","??","??","??","??","??","??","??","??","??","??","??","??","??","??","??","??","??","??","??","??","??","??","??","??","??","??","??","??","??","??","??","??","??","??","??","??","??","??","??","??","??","??","?","?","??","??","??","??","??","??","??","??","??","?","??","??","?","??","??","??","??","??","??","??","??","??"];

function EmojiPicker({onPick,onClose}) {
  return (
    <div className="absolute bottom-full left-0 mb-2 bg-gray-800 border border-gray-700 rounded-2xl p-3 shadow-2xl z-50 w-72" onClick={e=>e.stopPropagation()}>
      <div className="flex flex-wrap gap-0.5 max-h-44 overflow-y-auto">
        {ALL_EMOJIS.map(e=><button key={e} onClick={()=>{onPick(e);onClose();}} className="text-xl hover:bg-gray-700 p-1.5 rounded-lg transition-colors">{e}</button>)}
      </div>
    </div>
  );
}

function ImgViewer({src,onClose}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95" onClick={onClose}>
      <button className="absolute top-4 right-4 text-white text-2xl z-10 bg-gray-800 w-10 h-10 rounded-full flex items-center justify-center hover:bg-gray-700" onClick={onClose}>?</button>
      <img src={src} className="max-w-full max-h-full object-contain p-4" onClick={e=>e.stopPropagation()}/>
    </div>
  );
}

function MsgBubble({msg,isMe,uid,members,onReply,onReact,onDelete,onPin,isAdm,searchQ}) {
  const [menu,setMenu]   = useState(false);
  const [imgView,setImg] = useState(null);
  const ref              = useRef();
  const sender           = members.find(m=>m.id===msg.senderId);

  useEffect(()=>{
    if(!menu) return;
    const fn=e=>{ if(ref.current&&!ref.current.contains(e.target)) setMenu(false); };
    document.addEventListener("mousedown",fn,true);
    return ()=>document.removeEventListener("mousedown",fn,true);
  },[menu]);

  if(msg.deleted) return (
    <div className={`flex ${isMe?"justify-end":"justify-start"} mb-1.5`}>
      <div className="text-gray-600 text-xs italic px-3 py-2 bg-gray-800/50 rounded-2xl border border-gray-700/50">?? Deleted message</div>
    </div>
  );

  const rxCounts = {};
  if(msg.reactions) for(const[e,uids] of Object.entries(msg.reactions)) if(uids?.length) rxCounts[e]=uids;
  const hl = searchQ && msg.text?.toLowerCase().includes(searchQ.toLowerCase());

  return (
    <div className={`flex ${isMe?"flex-row-reverse":"flex-row"} items-end gap-2 mb-2`}>
      {!isMe && <Av name={sender?.name||"?"} size="xs"/>}
      <div className={`max-w-[75%] flex flex-col ${isMe?"items-end":"items-start"} relative`} ref={ref}>
        {!isMe && <span className="text-xs text-amber-400 font-semibold mb-1 ml-1">{sender?.name||"?"}</span>}

        {/* Reply preview */}
        {msg.replyTo?.senderName && (
          <div className={`text-xs border-l-2 border-amber-500 pl-2 pr-3 py-1 mb-1 bg-black/20 rounded-lg max-w-full ${isMe?"text-right":"text-left"}`}>
            <span className="font-semibold text-amber-400">{msg.replyTo.senderName}</span>
            <p className="text-gray-400 truncate">{msg.replyTo.text||"?? Media"}</p>
          </div>
        )}

        {/* Bubble */}
        <div
          onClick={()=>setMenu(p=>!p)}
          className={`relative rounded-2xl px-3 py-2 cursor-pointer select-text transition-all
            ${isMe?"bg-amber-600 text-white rounded-br-sm":"bg-gray-700 text-white rounded-bl-sm"}
            ${hl?"ring-2 ring-yellow-400 ring-offset-1 ring-offset-gray-900":""}`}
        >
          {msg.type==="image"&&msg.mediaUrl&&(
            <img src={msg.mediaUrl} className="rounded-xl max-w-full max-h-56 mb-1 cursor-zoom-in object-cover" onClick={e=>{e.stopPropagation();setImg(msg.mediaUrl);}}/>
          )}
          {msg.type==="video"&&msg.mediaUrl&&(
            <video src={msg.mediaUrl} controls className="rounded-xl max-w-full max-h-56 mb-1" onClick={e=>e.stopPropagation()}/>
          )}
          {msg.text&&<p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{msg.text}</p>}
          <div className={`flex items-center gap-1 mt-0.5 ${isMe?"justify-end":""}`}>
            <span className={`text-xs ${isMe?"text-amber-200":"text-gray-500"}`}>{fmtTime(msg.timestamp)}</span>
            {isMe&&<span className="text-xs text-amber-200">??</span>}
          </div>
        </div>

        {/* Reactions row */}
        {Object.keys(rxCounts).length>0&&(
          <div className={`flex gap-1 mt-1 flex-wrap ${isMe?"justify-end":""}`}>
            {Object.entries(rxCounts).map(([e,uids])=>(
              <button key={e} onClick={()=>onReact(msg,e)} className={`flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full border transition-colors ${uids.includes(uid)?"bg-amber-900/60 border-amber-600":"bg-gray-800 border-gray-700 hover:border-amber-600"}`}>
                <span>{e}</span><span className="text-gray-400 text-xs">{uids.length}</span>
              </button>
            ))}
          </div>
        )}

        {/* Context menu */}
        {menu&&(
          <div className={`absolute ${isMe?"right-0":"left-0"} -top-1 -translate-y-full bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl z-40 overflow-hidden min-w-max`} onClick={e=>e.stopPropagation()}>
            <div className="flex gap-0.5 px-2 py-2 border-b border-gray-700 bg-gray-750">
              {REACT_EMOJIS.map(e=>(
                <button key={e} onClick={()=>{onReact(msg,e);setMenu(false);}} className="text-lg hover:scale-125 transition-transform p-1 rounded-lg hover:bg-gray-700">{e}</button>
              ))}
            </div>
            {[
              ["? Reply",       ()=>{onReply(msg);setMenu(false);},   false],
              ["?? Copy",        ()=>{navigator.clipboard?.writeText(msg.text||"");setMenu(false);}, false],
              isAdm&&["?? Pin",  ()=>{onPin(msg);setMenu(false);},    false],
              isMe&&["?? Delete",()=>{onDelete(msg);setMenu(false);}, true],
            ].filter(Boolean).map(([label,fn,danger])=>(
              <button key={label} onClick={fn} className={`block w-full text-left px-4 py-2.5 text-sm hover:bg-gray-700 transition-colors ${danger?"text-red-400":"text-white"}`}>{label}</button>
            ))}
          </div>
        )}
      </div>
      {imgView&&<ImgViewer src={imgView} onClose={()=>setImg(null)}/>}
    </div>
  );
}

function ChatInput({onSend,onFile,replyTo,onCancelReply,busy}) {
  const [text,setText]   = useState("");
  const [emoji,setEmoji] = useState(false);
  const [uploading,setUp]= useState(false);
  const fileRef  = useRef();
  const taRef    = useRef();

  const send = () => {
    if(!text.trim()) return;
    onSend(text.trim()); setText("");
    taRef.current?.focus();
  };

  const handleKey = e => { if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();} };

  const handleFile = async e => {
    const f = e.target.files?.[0]; e.target.value="";
    if(!f) return;
    setUp(true);
    await onFile(f);
    setUp(false);
  };

  // Auto-resize textarea
  useEffect(()=>{
    const ta = taRef.current; if(!ta) return;
    ta.style.height="auto";
    ta.style.height=Math.min(ta.scrollHeight,120)+"px";
  },[text]);

  return (
    <div className="bg-gray-800 border-t border-gray-700 px-3 pt-2 pb-3 flex-shrink-0">
      {replyTo&&(
        <div className="flex items-center gap-2 mb-2 bg-gray-700/70 rounded-xl px-3 py-2 border-l-2 border-amber-500">
          <div className="flex-1 min-w-0">
            <span className="text-amber-400 text-xs font-semibold">Replying to {replyTo.senderName}</span>
            <p className="text-gray-400 text-xs truncate">{replyTo.text||"?? Media"}</p>
          </div>
          <button onClick={onCancelReply} className="text-gray-500 hover:text-white transition-colors text-lg w-6 h-6 flex items-center justify-center">?</button>
        </div>
      )}
      <div className="flex items-end gap-2">
        {/* Emoji button */}
        <div className="relative flex-shrink-0">
          <button onClick={()=>setEmoji(p=>!p)} className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-amber-400 transition-colors text-xl rounded-full hover:bg-gray-700">??</button>
          {emoji&&<EmojiPicker onPick={e=>setText(p=>p+e)} onClose={()=>setEmoji(false)}/>}
        </div>
        {/* Text area */}
        <textarea
          ref={taRef}
          value={text}
          onChange={e=>setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Message…"
          rows={1}
          className="flex-1 bg-gray-700 text-white border border-gray-600 rounded-2xl px-4 py-2.5 focus:border-amber-500 focus:outline-none text-sm resize-none placeholder-gray-500 leading-5"
          style={{minHeight:"42px",maxHeight:"120px"}}
        />
        {/* Attach button */}
        <button onClick={()=>fileRef.current?.click()} disabled={uploading} className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-amber-400 transition-colors text-xl rounded-full hover:bg-gray-700 disabled:opacity-40 flex-shrink-0">
          {uploading?<Spin sm/>:"??"}
        </button>
        <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFile}/>
        {/* Send */}
        <button onClick={send} disabled={busy||!text.trim()} className="w-10 h-10 flex items-center justify-center bg-amber-500 hover:bg-amber-400 text-gray-900 rounded-full transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 text-lg shadow-lg hover:shadow-amber-500/30">
          ?
        </button>
      </div>
    </div>
  );
}

// --- MAIN APP ------------------------------------------------------------------
export default function App() {
  const [token,  setToken]  = useState(null);
  const [user,   setUser]   = useState(null);
  const [screen, setScreen] = useState("landing");
  const [tab,    setTab]    = useState("tasks");

  const [groups,  setGroups]  = useState([]);
  const [tasks,   setTasks]   = useState([]);
  const [members, setMembers] = useState([]);
  const [msgs,    setMsgs]    = useState([]);
  const [gView,   setGView]   = useState(null);

  const [modal,   setModal]   = useState(null);
  const [form,    setForm]    = useState({});
  const [err,     setErr]     = useState("");
  const [busy,    setBusy]    = useState(false);

  // Chat state
  const [replyTo,  setReplyTo]  = useState(null);
  const [searchQ,  setSearchQ]  = useState("");
  const [pinned,   setPinned]   = useState(null);
  const [atBot,    setAtBot]    = useState(true);
  const [gsLoaded, setGsLoaded] = useState(false);
  const [needRole, setNeedRole] = useState(false);
  const [gCred,    setGCred]    = useState(null);

  const bottomRef = useRef();
  const msgsBoxRef= useRef();

  const f  = k => v  => setForm(p=>({...p,[k]:v}));
  const ef = k => e  => f(k)(e.target.value);
  const openModal  = (m,init={}) => { setModal(m); setForm(init); setErr(""); };
  const closeModal = () => { setModal(null); setForm({}); setErr(""); };

  // -- Load Google Sign-In script ----------------------------------------------
  useEffect(()=>{
    if(GOOGLE_CID==="YOUR_GOOGLE_CLIENT_ID") return;
    const s=document.createElement("script"); s.src="https://accounts.google.com/gsi/client"; s.async=true;
    s.onload=()=>{
      window.google?.accounts.id.initialize({ client_id:GOOGLE_CID, callback:handleGoogleCb, use_fedcm_for_prompt:false });
      setGsLoaded(true);
    };
    document.head.appendChild(s);
    return ()=>{ try{document.head.removeChild(s);}catch{} };
  },[]);

  async function handleGoogleCb(resp) {
    setBusy(true);
    try {
      const a = await authPost(":signInWithIdp",{ postBody:`id_token=${resp.credential}&providerId=google.com`, requestUri:window.location.href, returnSecureToken:true });
      let profile = await fsGet(`users/${a.localId}`, a.idToken);
      if(!profile) { setGCred({...a}); setNeedRole(true); setBusy(false); return; }
      await finishLogin(a.localId, a.idToken, profile);
    } catch(e) { setErr(fmtErr(e)); }
    setBusy(false);
  }

  async function finishGoogleWithRole(role) {
    if(!gCred) return;
    setBusy(true);
    try {
      const profile = await fsPatch(`users/${gCred.localId}`,{ name:gCred.displayName||"User", email:gCred.email, role, points:0 }, gCred.idToken);
      await finishLogin(gCred.localId, gCred.idToken, profile);
      setNeedRole(false); setGCred(null);
    } catch(e) { setErr(fmtErr(e)); }
    setBusy(false);
  }

  async function finishLogin(uid, idToken, profile) {
    const u = { uid, ...profile };
    setToken(idToken); setUser(u);
    await loadGroups(uid, idToken);
    setScreen("dashboard"); setForm({});
  }

  function triggerGoogle() {
    if(GOOGLE_CID==="YOUR_GOOGLE_CLIENT_ID") { setErr("Add your Google Client ID in the app config first. See setup instructions."); return; }
    if(!gsLoaded) { setErr("Google Sign-In loading… try again."); return; }
    window.google?.accounts.id.prompt();
  }

  // -- Data loaders ------------------------------------------------------------
  const loadGroups = useCallback(async (uid,tok)=>{
    const gs = await fsQuery({from:[{collectionId:"groups"}],where:{fieldFilter:{field:{fieldPath:"memberIds"},op:"ARRAY_CONTAINS",value:{stringValue:uid}}}},tok);
    setGroups(gs); return gs;
  },[]);

  const loadGroup = useCallback(async (g,tok)=>{
    const [ts,ms] = await Promise.all([
      fsQuery({from:[{collectionId:"tasks"}],where:{fieldFilter:{field:{fieldPath:"groupId"},op:"EQUAL",value:{stringValue:g.id}}}},tok),
      Promise.all((g.memberIds||[]).map(id=>fsGet(`users/${id}`,tok))),
    ]);
    setTasks(ts); setMembers(ms.filter(Boolean));
  },[]);

  const loadMsgs = useCallback(async (gid,tok)=>{
    if(!gid||!tok) return;
    const ms = await fsQuery({from:[{collectionId:"messages"}],where:{fieldFilter:{field:{fieldPath:"groupId"},op:"EQUAL",value:{stringValue:gid}}},limit:150},tok);
    ms.sort((a,b)=>new Date(a.timestamp)-new Date(b.timestamp));
    setMsgs(ms);
  },[]);

  // Auto-poll chat every 5s
  useEffect(()=>{
    if(tab!=="chat"||!gView||!token) return;
    loadMsgs(gView.id,token);
    const iv=setInterval(()=>loadMsgs(gView.id,token),5000);
    return ()=>clearInterval(iv);
  },[tab,gView?.id,token,loadMsgs]);

  // Auto-scroll to bottom
  useEffect(()=>{ if(atBot) bottomRef.current?.scrollIntoView({behavior:"smooth"}); },[msgs.length]);

  function handleMsgsScroll() {
    const el=msgsBoxRef.current; if(!el) return;
    setAtBot(el.scrollHeight-el.scrollTop-el.clientHeight<80);
  }
  function scrollDown() { bottomRef.current?.scrollIntoView({behavior:"smooth"}); setAtBot(true); }

  // -- Auth --------------------------------------------------------------------
  async function doRegister() {
    if(!form.name?.trim()||!form.email?.trim()||!form.password) return setErr("All fields required");
    if(!form.role) return setErr("Please choose a role");
    setBusy(true);
    try {
      const a = await authPost(":signUp",{email:form.email.trim().toLowerCase(),password:form.password,returnSecureToken:true});
      const profile = await fsPatch(`users/${a.localId}`,{name:form.name.trim(),email:form.email.trim().toLowerCase(),role:form.role,points:0},a.idToken);
      await finishLogin(a.localId,a.idToken,profile);
    } catch(e) { setErr(fmtErr(e)); }
    setBusy(false);
  }
  async function doLogin() {
    if(!form.email?.trim()||!form.password) return setErr("All fields required");
    setBusy(true);
    try {
      const a = await authPost(":signInWithPassword",{email:form.email.trim().toLowerCase(),password:form.password,returnSecureToken:true});
      const profile = await fsGet(`users/${a.localId}`,a.idToken);
      if(!profile) throw new Error("Profile not found — please register first.");
      await finishLogin(a.localId,a.idToken,profile);
    } catch(e) { setErr(fmtErr(e)); }
    setBusy(false);
  }
  function doLogout() { setUser(null); setToken(null); setGroups([]); setMsgs([]); setScreen("landing"); }

  // -- Groups ------------------------------------------------------------------
  async function createGroup() {
    if(!form.gname?.trim()) return setErr("Group name required");
    setBusy(true);
    try {
      const g = await fsCreate("groups",{name:form.gname.trim(),adminId:user.uid,memberIds:[user.uid],inviteCode:mkCode()},token);
      setGroups(p=>[...p,g]); closeModal();
    } catch(e) { setErr(fmtErr(e)); }
    setBusy(false);
  }
  async function joinGroup() {
    if(!form.code?.trim()) return setErr("Enter a code");
    setBusy(true);
    try {
      const gs = await fsQuery({from:[{collectionId:"groups"}],where:{fieldFilter:{field:{fieldPath:"inviteCode"},op:"EQUAL",value:{stringValue:form.code.toUpperCase().trim()}}}},token);
      if(!gs.length) return setErr("Invalid code — check with your admin");
      const g=gs[0]; if((g.memberIds||[]).includes(user.uid)) return setErr("Already in this group");
      const upd={...g,memberIds:[...(g.memberIds||[]),user.uid]};
      await fsPatch(`groups/${g.id}`,upd,token);
      setGroups(p=>[...p.filter(x=>x.id!==g.id),upd]); closeModal();
    } catch(e) { setErr(fmtErr(e)); }
    setBusy(false);
  }
  async function removeMember(mid) {
    const upd={...gView,memberIds:gView.memberIds.filter(id=>id!==mid)};
    await fsPatch(`groups/${gView.id}`,upd,token);
    setGView(upd); setMembers(p=>p.filter(m=>m.id!==mid));
    setGroups(p=>p.map(g=>g.id===gView.id?upd:g));
  }
  async function regenCode() {
    const upd={...gView,inviteCode:mkCode()};
    await fsPatch(`groups/${gView.id}`,upd,token);
    setGView(upd); setGroups(p=>p.map(g=>g.id===gView.id?upd:g));
  }
  async function leaveGroup() {
    const upd={...gView,memberIds:gView.memberIds.filter(id=>id!==user.uid)};
    await fsPatch(`groups/${gView.id}`,upd,token);
    setGroups(p=>p.filter(g=>g.id!==gView.id)); back();
  }

  // -- Tasks -------------------------------------------------------------------
  async function addTask() {
    if(!form.title?.trim()) return setErr("Title required");
    const pts=parseInt(form.points)||0;
    if(pts<1) return setErr("Points must be = 1");
    setBusy(true);
    try {
      const t=await fsCreate("tasks",{groupId:gView.id,title:form.title.trim(),description:form.desc||"",assignedTo:form.assignTo||"all",points:pts,reward:form.reward||"",recurring:form.recurring||"none",status:"pending",createdAt:new Date().toISOString(),submittedBy:null,submittedAt:null},token);
      setTasks(p=>[...p,t]); closeModal();
    } catch(e) { setErr(fmtErr(e)); }
    setBusy(false);
  }
  async function submitTask(t) { const u={...t,status:"submitted",submittedBy:user.uid,submittedAt:new Date().toISOString()}; await fsPatch(`tasks/${t.id}`,u,token); setTasks(p=>p.map(x=>x.id===t.id?u:x)); }
  async function unsubmitTask(t) { const u={...t,status:"pending",submittedBy:null,submittedAt:null}; await fsPatch(`tasks/${t.id}`,u,token); setTasks(p=>p.map(x=>x.id===t.id?u:x)); }
  async function approveTask(t) {
    const nt=t.recurring!=="none"?{...t,status:"pending",submittedBy:null,submittedAt:null}:{...t,status:"approved"};
    await fsPatch(`tasks/${t.id}`,nt,token); setTasks(p=>p.map(x=>x.id===t.id?nt:x));
    const mem=members.find(m=>m.id===t.submittedBy);
    if(mem){ const np=(mem.points||0)+t.points; await fsPatch(`users/${mem.id}`,{...mem,points:np},token); setMembers(p=>p.map(m=>m.id===mem.id?{...m,points:np}:m)); if(mem.id===user.uid) setUser(u=>({...u,points:np})); }
  }
  async function rejectTask(t) { const u={...t,status:"pending",submittedBy:null,submittedAt:null}; await fsPatch(`tasks/${t.id}`,u,token); setTasks(p=>p.map(x=>x.id===t.id?u:x)); }
  async function deleteTask(t) { await fsDel(`tasks/${t.id}`,token); setTasks(p=>p.filter(x=>x.id!==t.id)); }

  // -- Messages ----------------------------------------------------------------
  async function sendMsg(text,mediaUrl=null,mediaType=null) {
    if(!text&&!mediaUrl) return;
    const type=mediaUrl?(mediaType?.startsWith("video")?"video":"image"):"text";
    const m={groupId:gView.id,senderId:user.uid,senderName:user.name,text:text||"",type,mediaUrl:mediaUrl||null,replyTo:replyTo?{id:replyTo.id,senderName:replyTo.senderName,text:replyTo.text,type:replyTo.type}:null,reactions:{},timestamp:new Date().toISOString(),deleted:false};
    const saved=await fsCreate("messages",m,token);
    setMsgs(p=>[...p,saved]); setReplyTo(null);
    setTimeout(()=>bottomRef.current?.scrollIntoView({behavior:"smooth"}),80);
  }
  async function handleFile(file) {
    try { const url=await uploadFile(file,token); await sendMsg("",url,file.type); }
    catch(e) { alert("Upload failed: "+e.message); }
  }
  async function handleReact(msg,emoji) {
    const rxs={...(msg.reactions||{})}; const arr=[...(rxs[emoji]||[])]; const i=arr.indexOf(user.uid);
    if(i>=0) arr.splice(i,1); else arr.push(user.uid);
    rxs[emoji]=arr; const upd={...msg,reactions:rxs};
    await fsPatch(`messages/${msg.id}`,upd,token); setMsgs(p=>p.map(m=>m.id===msg.id?upd:m));
  }
  async function handleDeleteMsg(msg) { const u={...msg,deleted:true}; await fsPatch(`messages/${msg.id}`,u,token); setMsgs(p=>p.map(m=>m.id===msg.id?u:m)); }
  async function handlePin(msg) { setPinned(msg); await fsPatch(`groups/${gView.id}`,{...gView,pinnedMsgId:msg.id},token); }

  async function openGroup(g) {
    setGView(g); setScreen("group"); setTab("tasks"); setBusy(true); setMsgs([]); setPinned(null);
    try { await loadGroup(g,token); } catch {}
    setBusy(false);
  }
  function back() { setGView(null); setTasks([]); setMembers([]); setMsgs([]); setScreen("dashboard"); }

  const filteredMsgs = searchQ ? msgs.filter(m=>m.text?.toLowerCase().includes(searchQ.toLowerCase())) : msgs;

  // ------------------------------------------------------------------------------
  // SCREENS
  // ------------------------------------------------------------------------------

  const GoogleBtn = ({label="Continue with Google"}) => (
    <button onClick={triggerGoogle} className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-800 font-semibold px-4 py-2.5 rounded-xl transition-colors border border-gray-200 text-sm">
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      {label}
    </button>
  );

  // -- Landing -----------------------------------------------------------------
  if(screen==="landing") return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6 text-center">
      <div className="mb-10">
        <div className="w-20 h-20 bg-amber-500 rounded-2xl flex items-center justify-center text-4xl mx-auto mb-5 shadow-lg shadow-amber-500/20">??</div>
        <h1 className="text-5xl font-black text-white mb-3 tracking-tight">HouseQuest</h1>
        <p className="text-gray-400 text-lg max-w-xs mx-auto">Gamified home tasks with chat, points &amp; rewards.</p>
        <div className="mt-3 inline-flex items-center gap-1.5 bg-gray-800 border border-green-800 rounded-full px-3 py-1">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"/>
          <span className="text-green-400 text-xs font-medium">Connected to Firebase</span>
        </div>
      </div>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <Btn v="primary" className="w-full py-3 text-base" onClick={()=>{setForm({});setErr("");setScreen("login");}}>Sign In</Btn>
        <Btn v="ghost"   className="w-full py-3 text-base" onClick={()=>{setForm({});setErr("");setScreen("register");}}>Create Account</Btn>
        <div className="relative"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-700"/></div><div className="relative text-center"><span className="bg-gray-900 px-3 text-gray-600 text-xs">or</span></div></div>
        <GoogleBtn label="Continue with Google"/>
      </div>
    </div>
  );

  // -- Login -------------------------------------------------------------------
  if(screen==="login") return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <button onClick={()=>setScreen("landing")} className="text-gray-400 hover:text-white text-sm mb-5 flex items-center gap-1">? Back</button>
        <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
          <h2 className="text-2xl font-bold text-white mb-5">Welcome back</h2>
          <Err msg={err}/>
          <div className="space-y-3">
            <Inp placeholder="Email" type="email" value={form.email||""} onChange={ef("email")}/>
            <Inp placeholder="Password" type="password" value={form.password||""} onChange={ef("password")} onKeyDown={e=>e.key==="Enter"&&doLogin()}/>
            <Btn v="primary" className="w-full py-3" disabled={busy} onClick={doLogin}>{busy?<Spin sm/>:"Sign In"}</Btn>
            <div className="relative"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-700"/></div><div className="relative text-center"><span className="bg-gray-800 px-3 text-gray-600 text-xs">or</span></div></div>
            <GoogleBtn/>
          </div>
          <p className="text-gray-500 text-sm mt-4 text-center">No account? <button className="text-amber-400 hover:text-amber-300" onClick={()=>{setForm({});setErr("");setScreen("register");}}>Register</button></p>
        </div>
      </div>
    </div>
  );

  // -- Register -----------------------------------------------------------------
  if(screen==="register") return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <button onClick={()=>setScreen("landing")} className="text-gray-400 hover:text-white text-sm mb-5 flex items-center gap-1">? Back</button>
        <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
          <h2 className="text-2xl font-bold text-white mb-5">Create Account</h2>
          <Err msg={err}/>
          <div className="space-y-3">
            <Inp placeholder="Your name" value={form.name||""} onChange={ef("name")}/>
            <Inp placeholder="Email" type="email" value={form.email||""} onChange={ef("email")}/>
            <Inp placeholder="Password (min. 6 characters)" type="password" value={form.password||""} onChange={ef("password")}/>
            <div>
              <p className="text-gray-400 text-xs mb-2 font-semibold uppercase tracking-wide">I am a:</p>
              <div className="grid grid-cols-2 gap-2">
                {[["admin","??","Admin","Creates groups & tasks"],["member","??","Member","Completes tasks"]].map(([r,ico,lbl,sub])=>(
                  <button key={r} onClick={()=>f("role")(r)} className={`p-3 rounded-xl border-2 text-left transition-all ${form.role===r?"border-amber-500 bg-amber-950":"border-gray-700 hover:border-gray-600"}`}>
                    <div className="text-xl mb-1">{ico}</div>
                    <div className={`font-bold text-sm ${form.role===r?"text-amber-400":"text-white"}`}>{lbl}</div>
                    <div className="text-gray-500 text-xs">{sub}</div>
                  </button>
                ))}
              </div>
            </div>
            <Btn v="primary" className="w-full py-3" disabled={busy} onClick={doRegister}>{busy?<Spin sm/>:"Create Account"}</Btn>
            <div className="relative"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-700"/></div><div className="relative text-center"><span className="bg-gray-800 px-3 text-gray-600 text-xs">or</span></div></div>
            <GoogleBtn/>
          </div>
          <p className="text-gray-500 text-sm mt-4 text-center">Have account? <button className="text-amber-400 hover:text-amber-300" onClick={()=>{setForm({});setErr("");setScreen("login");}}>Sign In</button></p>
        </div>
      </div>
    </div>
  );

  // -- Dashboard ----------------------------------------------------------------
  if(screen==="dashboard") return (
    <div className="min-h-screen bg-gray-900 text-white pb-10">
      <div className="bg-gray-800 border-b border-gray-700 px-5 py-4 sticky top-0 z-10">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center text-sm">??</div>
            <span className="font-black text-lg tracking-tight">HouseQuest</span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-semibold">{user?.name}</div>
              <div className="text-xs text-amber-400">? {user?.points||0} pts</div>
            </div>
            <Av name={user?.name} size="sm"/>
            <button onClick={doLogout} className="text-gray-500 hover:text-gray-300 text-xs ml-1">Sign out</button>
          </div>
        </div>
      </div>
      <div className="max-w-lg mx-auto p-5 space-y-5">
        <div className="bg-gradient-to-r from-amber-900 to-amber-800 border border-amber-700 rounded-2xl p-4 flex items-center gap-4">
          <div className="text-3xl">?</div>
          <div><div className="text-amber-300 text-xs font-semibold uppercase tracking-wide">Your Points</div><div className="text-white text-3xl font-black">{user?.points||0}</div></div>
          <div className="ml-auto"><span className="text-amber-300 text-sm">{user?.role==="admin"?"?? Admin":"?? Member"}</span></div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-base text-gray-200">My Groups</h2>
            <Btn v="primary" className="text-xs py-1.5" onClick={()=>openModal(user?.role==="admin"?"createGroup":"joinGroup")}>{user?.role==="admin"?"+ Create Group":"+ Join Group"}</Btn>
          </div>
          {groups.length===0?(
            <div className="bg-gray-800 rounded-2xl p-8 text-center border border-gray-700">
              <div className="text-4xl mb-3">{user?.role==="admin"?"??":"??"}</div>
              <p className="text-gray-400 text-sm">{user?.role==="admin"?"Create your first group and invite your family!":"Ask your admin for an invite code to join a group."}</p>
            </div>
          ):(
            <div className="space-y-2">
              {groups.map(g=>(
                <button key={g.id} onClick={()=>openGroup(g)} className="w-full bg-gray-800 hover:border-amber-600 border border-gray-700 rounded-2xl p-4 text-left transition-all group">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-700 group-hover:bg-amber-900 rounded-xl flex items-center justify-center text-xl transition-colors">??</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-white text-sm">{g.name}</div>
                      <div className="text-gray-500 text-xs">{(g.memberIds||[]).length} members</div>
                    </div>
                    {g.adminId===user?.uid&&<Badge v="amber">Admin</Badge>}
                    <span className="text-gray-600 text-xl">›</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {modal==="createGroup"&&<Modal title="Create Group" onClose={closeModal}><Err msg={err}/><Inp placeholder="Group name" value={form.gname||""} onChange={ef("gname")} className="mb-3"/><Btn v="primary" className="w-full py-3" disabled={busy} onClick={createGroup}>{busy?<Spin sm/>:"Create Group"}</Btn></Modal>}
      {modal==="joinGroup"&&<Modal title="Join a Group" onClose={closeModal}><p className="text-gray-400 text-sm mb-3">Enter the 6-letter invite code from your admin.</p><Err msg={err}/><Inp placeholder="e.g. AB1C2D" value={form.code||""} onChange={ef("code")} className="mb-3 uppercase tracking-widest text-center text-xl font-bold"/><Btn v="primary" className="w-full py-3" disabled={busy} onClick={joinGroup}>{busy?<Spin sm/>:"Join Group"}</Btn></Modal>}
      {needRole&&<Modal title="One more step" onClose={()=>setNeedRole(false)}><p className="text-gray-400 text-sm mb-4">What is your role in the household?</p><Err msg={err}/><div className="grid grid-cols-2 gap-3">{[["admin","??","Admin","Creates tasks"],["member","??","Member","Completes tasks"]].map(([r,ico,lbl,sub])=><button key={r} onClick={()=>finishGoogleWithRole(r)} className="p-4 rounded-xl border-2 border-gray-700 hover:border-amber-500 text-center transition-all"><div className="text-2xl mb-1">{ico}</div><div className="font-bold text-white text-sm">{lbl}</div><div className="text-gray-500 text-xs">{sub}</div></button>)}</div></Modal>}
    </div>
  );

  // -- Group --------------------------------------------------------------------
  if(screen==="group") {
    const isAdm   = gView?.adminId===user?.uid;
    const pending = tasks.filter(t=>t.status==="submitted");
    const myTasks = isAdm?tasks:tasks.filter(t=>t.assignedTo==="all"||t.assignedTo===user?.uid);
    const active  = myTasks.filter(t=>t.status!=="approved");
    const done    = myTasks.filter(t=>t.status==="approved");
    const board   = [...members].sort((a,b)=>(b.points||0)-(a.points||0));
    const sb      = {pending:["gray","To Do"],submitted:["amber","Submitted ?"],approved:["green","? Done"]};
    const unread  = msgs.filter(m=>m.senderId!==user?.uid&&!m.deleted).length;

    return (
      <div className="h-screen flex flex-col bg-gray-900 text-white">
        {/* Header */}
        <div className="bg-gray-800 border-b border-gray-700 px-5 py-4 flex-shrink-0 z-10">
          <div className="max-w-lg mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={back} className="text-gray-400 hover:text-white text-sm">? Back</button>
              <div><div className="font-bold text-white text-sm">{gView?.name}</div><div className="text-gray-500 text-xs">{members.length} members</div></div>
            </div>
            <div className="flex gap-2">
              {isAdm&&tab==="tasks"&&<Btn v="ghost" className="text-xs py-1.5" onClick={()=>openModal("addTask")}>+ Task</Btn>}
              {isAdm&&<Btn v="ghost" className="text-xs py-1.5" onClick={()=>setModal("invCode")}>?? Invite</Btn>}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-gray-800 border-b border-gray-700 flex-shrink-0">
          <div className="max-w-lg mx-auto flex">
            {[["tasks",`Tasks${pending.length>0?` ??${pending.length}`:""}`],["chat",`Chat${unread>0?` •${unread}`:""}`],["board","??"],["members","??"]].map(([t,lbl])=>(
              <button key={t} onClick={()=>setTab(t)} className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${tab===t?"border-amber-500 text-amber-400":"border-transparent text-gray-500 hover:text-gray-300"}`}>{lbl}</button>
            ))}
          </div>
        </div>

        {/* Body */}
        {busy?(
          <div className="flex justify-center items-center flex-1"><Spin/></div>
        ):(
          <>
            {/* -- TASKS TAB -- */}
            {tab==="tasks"&&(
              <div className="flex-1 overflow-y-auto max-w-lg mx-auto w-full p-5 space-y-5">
                {isAdm&&pending.length>0&&(
                  <div>
                    <h3 className="text-amber-400 font-bold text-xs uppercase tracking-wide mb-2">?? Needs Approval ({pending.length})</h3>
                    <div className="space-y-2">
                      {pending.map(t=>{
                        const sub=members.find(m=>m.id===t.submittedBy);
                        return (
                          <div key={t.id} className="bg-gray-800 border-2 border-amber-700 rounded-2xl p-4">
                            <div className="flex items-start gap-3">
                              <Av name={sub?.name||"?"} size="sm"/>
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-sm">{t.title}</div>
                                <div className="text-gray-400 text-xs mt-0.5">{sub?.name||"Someone"} says it's done</div>
                                <div className="flex gap-2 mt-1.5 flex-wrap">
                                  <span className="text-amber-400 text-xs font-bold">? {t.points} pts</span>
                                  {t.reward&&<span className="text-green-400 text-xs">?? {t.reward}</span>}
                                  {t.recurring!=="none"&&<Badge v="purple">?? {t.recurring}</Badge>}
                                </div>
                              </div>
                              <div className="flex flex-col gap-1.5 flex-shrink-0">
                                <Btn v="success" className="text-xs py-1.5 px-3" onClick={()=>approveTask(t)}>? Approve</Btn>
                                <Btn v="danger"  className="text-xs py-1.5 px-3" onClick={()=>rejectTask(t)}>? Reject</Btn>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div>
                  <h3 className="text-gray-300 font-bold text-xs uppercase tracking-wide mb-2">{isAdm?"All Tasks":"My Tasks"} <span className="text-gray-600">({active.length})</span></h3>
                  {active.length===0?(
                    <div className="bg-gray-800 border border-gray-700 rounded-2xl p-8 text-center"><div className="text-3xl mb-2">??</div><p className="text-gray-400 text-sm">{isAdm?"No tasks yet — press '+ Task'!":"Nothing to do — all caught up!"}</p></div>
                  ):(
                    <div className="space-y-2">
                      {active.map(t=>{
                        const aUser=t.assignedTo!=="all"?members.find(m=>m.id===t.assignedTo):null;
                        const [bv,bl]=sb[t.status]||["gray",t.status];
                        const canMark=!isAdm&&t.status==="pending"&&(t.assignedTo==="all"||t.assignedTo===user?.uid);
                        const canUndo=!isAdm&&t.status==="submitted"&&t.submittedBy===user?.uid;
                        return (
                          <div key={t.id} className={`bg-gray-800 rounded-2xl p-4 border ${t.status==="submitted"?"border-amber-700":"border-gray-700"}`}>
                            <div className="flex items-start gap-3">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${t.status==="submitted"?"bg-amber-900":"bg-gray-700"}`}>{t.status==="submitted"?"?":"??"}</div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-sm">{t.title}</span>
                                  <Badge v={bv}>{bl}</Badge>
                                  {t.recurring!=="none"&&<Badge v="purple">?? {t.recurring}</Badge>}
                                </div>
                                {t.description&&<p className="text-gray-500 text-xs mt-1">{t.description}</p>}
                                <div className="flex gap-3 mt-1.5 flex-wrap items-center">
                                  <span className="text-amber-400 text-xs font-bold">? {t.points} pts</span>
                                  {t.reward&&<span className="text-green-400 text-xs">?? {t.reward}</span>}
                                  <span className="text-gray-600 text-xs">? {aUser?aUser.name:"Everyone"}</span>
                                </div>
                              </div>
                              <div className="flex flex-col gap-1 flex-shrink-0">
                                {canMark&&<Btn v="success" className="text-xs py-1.5 px-2" onClick={()=>submitTask(t)}>Mark Done</Btn>}
                                {canUndo&&<Btn v="ghost"   className="text-xs py-1.5 px-2" onClick={()=>unsubmitTask(t)}>Undo</Btn>}
                                {isAdm&&<button onClick={()=>deleteTask(t)} className="text-gray-600 hover:text-red-400 p-1 text-lg transition-colors">??</button>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                {done.length>0&&(
                  <div>
                    <h3 className="text-gray-600 font-bold text-xs uppercase tracking-wide mb-2">Completed ({done.length})</h3>
                    <div className="space-y-1.5 opacity-60">
                      {done.slice(0,5).map(t=>{
                        const sub=members.find(m=>m.id===t.submittedBy);
                        return <div key={t.id} className="bg-gray-800 rounded-xl p-3 border border-gray-700 flex items-center justify-between gap-3"><div className="flex items-center gap-2 min-w-0"><span className="text-green-500">?</span><span className="text-sm text-gray-400 truncate">{t.title}</span>{sub&&<span className="text-xs text-gray-600 hidden sm:inline">{sub.name}</span>}</div><span className="text-amber-600 text-xs font-bold flex-shrink-0">+{t.points} pts</span></div>;
                      })}
                      {done.length>5&&<p className="text-gray-600 text-xs text-center">+{done.length-5} more</p>}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* -- CHAT TAB -- */}
            {tab==="chat"&&(
              <div className="flex-1 flex flex-col overflow-hidden max-w-lg mx-auto w-full">
                {/* Search */}
                <div className="px-4 py-2 border-b border-gray-700 flex-shrink-0">
                  <Inp placeholder="?? Search messages…" value={searchQ} onChange={e=>setSearchQ(e.target.value)} className="py-2 text-sm"/>
                </div>
                {/* Pinned */}
                {pinned&&(
                  <div className="px-4 py-2 bg-gray-800/80 border-b border-amber-900/50 flex items-center gap-2 flex-shrink-0">
                    <span className="text-amber-500 text-sm">??</span>
                    <p className="flex-1 text-xs text-gray-400 truncate"><span className="text-amber-400 font-medium">{pinned.senderName}</span>: {pinned.text||"?? Media"}</p>
                    {isAdm&&<button onClick={()=>setPinned(null)} className="text-gray-600 hover:text-gray-400 text-xs">?</button>}
                  </div>
                )}
                {/* Messages */}
                <div ref={msgsBoxRef} className="flex-1 overflow-y-auto px-4 py-4" onScroll={handleMsgsScroll}>
                  {filteredMsgs.length===0&&(
                    <div className="text-center py-16">
                      <div className="text-5xl mb-3">??</div>
                      <p className="text-gray-500 text-sm">{searchQ?"No messages match your search.":"No messages yet. Say hello!"}</p>
                    </div>
                  )}
                  {filteredMsgs.map((msg,i)=>{
                    const showDate=i===0||!sameDay(filteredMsgs[i-1].timestamp,msg.timestamp);
                    return (
                      <div key={msg.id}>
                        {showDate&&<div className="text-center my-4"><span className="bg-gray-800 text-gray-500 text-xs px-3 py-1 rounded-full border border-gray-700">{fmtDay(msg.timestamp)}</span></div>}
                        <MsgBubble msg={msg} isMe={msg.senderId===user?.uid} uid={user?.uid} members={members} onReply={setReplyTo} onReact={handleReact} onDelete={handleDeleteMsg} onPin={handlePin} isAdm={isAdm} searchQ={searchQ}/>
                      </div>
                    );
                  })}
                  <div ref={bottomRef}/>
                </div>
                {/* Scroll-to-bottom */}
                {!atBot&&(
                  <button onClick={scrollDown} className="absolute bottom-24 right-5 bg-amber-500 hover:bg-amber-400 text-gray-900 rounded-full w-10 h-10 flex items-center justify-center shadow-lg font-bold text-lg transition-all">?</button>
                )}
                <ChatInput onSend={t=>sendMsg(t)} onFile={handleFile} replyTo={replyTo} onCancelReply={()=>setReplyTo(null)} busy={false}/>
              </div>
            )}

            {/* -- LEADERBOARD TAB -- */}
            {tab==="board"&&(
              <div className="flex-1 overflow-y-auto max-w-lg mx-auto w-full p-5">
                <h2 className="font-bold text-lg mb-4">?? Leaderboard</h2>
                {board.length===0?<p className="text-gray-500 text-sm text-center py-8">No members yet</p>:(
                  <div className="space-y-2">
                    {board.map((m,i)=>{
                      const medals=["??","??","??"];
                      const fin=tasks.filter(t=>t.status==="approved"&&t.submittedBy===m.id).length;
                      return (
                        <div key={m.id} className={`bg-gray-800 rounded-2xl p-4 border flex items-center gap-3 ${i===0?"border-amber-600":"border-gray-700"}`}>
                          <div className="text-2xl w-8 text-center">{medals[i]||<span className="text-gray-500 text-sm font-bold">{i+1}</span>}</div>
                          <Av name={m.name}/>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm">{m.name}</span>
                              {m.id===gView?.adminId&&<Badge v="amber">Admin</Badge>}
                              {m.id===user?.uid&&<Badge v="blue">You</Badge>}
                            </div>
                            <div className="text-gray-500 text-xs">{fin} tasks done</div>
                          </div>
                          <div className="text-right"><div className="text-amber-400 font-black text-xl">{m.points||0}</div><div className="text-gray-600 text-xs">pts</div></div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* -- MEMBERS TAB -- */}
            {tab==="members"&&(
              <div className="flex-1 overflow-y-auto max-w-lg mx-auto w-full p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-lg">?? Members ({members.length})</h2>
                  {isAdm&&<Btn v="ghost" className="text-xs" onClick={()=>setModal("invCode")}>?? Invite Code</Btn>}
                </div>
                <div className="space-y-2">
                  {members.map(m=>{
                    const isMe=m.id===user?.uid, isGAdm=m.id===gView?.adminId;
                    return (
                      <div key={m.id} className="bg-gray-800 rounded-2xl p-4 border border-gray-700 flex items-center gap-3">
                        <Av name={m.name}/>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{m.name}</span>
                            {isGAdm&&<Badge v="amber">Admin</Badge>}
                            {isMe&&<Badge v="blue">You</Badge>}
                          </div>
                          <div className="text-gray-500 text-xs capitalize">{m.role} · {m.email}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-amber-400 font-bold">? {m.points||0}</div>
                          {isAdm&&!isMe&&!isGAdm&&<button onClick={()=>removeMember(m.id)} className="text-red-600 hover:text-red-400 text-xs block mt-1">Remove</button>}
                          {!isAdm&&isMe&&<button onClick={leaveGroup} className="text-red-600 hover:text-red-400 text-xs block mt-1">Leave</button>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* Modals */}
        {modal==="invCode"&&(
          <Modal title="Invite Members" onClose={closeModal}>
            <p className="text-gray-400 text-sm mb-4">Share this code to invite people to <strong className="text-white">{gView?.name}</strong>.</p>
            <div className="bg-gray-900 rounded-2xl p-6 text-center mb-4 border border-gray-700">
              <div className="text-gray-500 text-xs mb-2 uppercase tracking-widest">Invite Code</div>
              <div className="text-4xl font-black tracking-widest text-amber-400">{gView?.inviteCode}</div>
            </div>
            <Btn v="ghost" className="w-full py-2.5" onClick={regenCode}>?? Generate New Code</Btn>
          </Modal>
        )}
        {modal==="addTask"&&(
          <Modal title="Add New Task" onClose={closeModal}>
            <Err msg={err}/>
            <div className="space-y-3">
              <Inp placeholder="Task title" value={form.title||""} onChange={ef("title")}/>
              <textarea className="w-full bg-gray-700 text-white border border-gray-600 rounded-xl px-3 py-2.5 focus:border-amber-500 focus:outline-none text-sm resize-none placeholder-gray-500 h-16" placeholder="Description (optional)" value={form.desc||""} onChange={ef("desc")}/>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-gray-500 text-xs mb-1 block">Points ?</label><Inp type="number" min="1" placeholder="e.g. 10" value={form.points||""} onChange={ef("points")}/></div>
                <div><label className="text-gray-500 text-xs mb-1 block">Reward ??</label><Inp placeholder="e.g. Ice cream" value={form.reward||""} onChange={ef("reward")}/></div>
              </div>
              <div><label className="text-gray-500 text-xs mb-1 block">Assign to</label>
                <select className="w-full bg-gray-700 text-white border border-gray-600 rounded-xl px-3 py-2.5 focus:border-amber-500 focus:outline-none text-sm" value={form.assignTo||"all"} onChange={ef("assignTo")}>
                  <option value="all">?? Everyone</option>
                  {members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div><label className="text-gray-500 text-xs mb-1 block">Repeats</label>
                <select className="w-full bg-gray-700 text-white border border-gray-600 rounded-xl px-3 py-2.5 focus:border-amber-500 focus:outline-none text-sm" value={form.recurring||"none"} onChange={ef("recurring")}>
                  <option value="none">One time</option>
                  <option value="daily">Daily ??</option>
                  <option value="weekly">Weekly ??</option>
                  <option value="monthly">Monthly ??</option>
                </select>
              </div>
              <Btn v="primary" className="w-full py-3" disabled={busy} onClick={addTask}>{busy?<Spin sm/>:"Add Task"}</Btn>
            </div>
          </Modal>
        )}
      </div>
    );
  }
  return null;
}