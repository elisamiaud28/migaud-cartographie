/* Carte des territoires — logique cartographique reprise a l'identique de
   l'application autonome d'origine, alimentee par les donnees de l'application. */
import L from "leaflet";

export function initTerritory({ data, meta, sites, colors, concur, frontiere, enc }) {
  const DATA = data, META = meta, SITES = sites, COLORS = colors, CONCUR = concur,
        FRONTIERE = frontiere, ENC = enc;
  const docHandlers = [];
  const onDoc = (t, fn) => { document.addEventListener(t, fn); docHandlers.push([t, fn]); };


const NA_R = "Sans commercial", NA_F = "Aucune facture", HORS = "Hors périmètre", NA_K = "Sans CPS";
const ECART_OK = "Rattachement respecté", ECART_KO = "Écart à enquêter",
      ECART_PROX = "Écart de proximité";
const dKm = (a,b) => {
  const R=6371, r=Math.PI/180;
  const dLat=(b[0]-a[0])*r, dLng=(b[1]-a[1])*r;
  const h=Math.sin(dLat/2)**2+Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
};
const DEPNAMES = {"17":"Charente-Maritime","37":"Indre-et-Loire","44":"Loire-Atlantique","49":"Maine-et-Loire","79":"Deux-Sèvres","85":"Vendée"};
const MODES = {
  agences:  {prop:"a", title:"Agences",             kpi:"agences",     neutral:null},
  secteurs: {prop:"r", title:"Commerciaux",         kpi:"commerciaux", neutral:NA_R},
  cps:      {prop:"k", title:"CPS — Conseillers Pièces & Services", kpi:"CPS", neutral:NA_K},
  flux:     {prop:"f", title:"Agence réellement facturée", kpi:"agences", neutral:NA_F, admin:true},
  ecart:    {prop:"e", title:"Théorique vs réel",   kpi:"cas",         neutral:NA_F, admin:true}
};
let FLUX = null;
let mode = "agences";
const cfg   = () => MODES[mode];
const color = k => COLORS[k] || "#9AA5A0";
const isNeutral = k => k === NA_R || k === NA_F || k === HORS || k === NA_K;
const siteOf = {}; SITES.forEach(s=>{ if(s.a) siteOf[s.a]=s; });

/* ---------- carte ---------- */
const map = L.map("map",{zoomControl:false,minZoom:6,maxZoom:15});
L.control.zoom({position:"bottomright"}).addTo(map);
const bases = {
  clair: L.layerGroup([
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      {maxZoom:16,attribution:"&copy; Esri, HERE, Garmin"}),
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
      {maxZoom:16,pane:"shadowPane"})
  ]),
  plan: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    {maxZoom:19,attribution:"&copy; les contributeurs OpenStreetMap"}),
  sat: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {maxZoom:18,attribution:"Imagerie Esri, Maxar, Earthstar Geographics"}),
  aucun: L.layerGroup()
};
let baseCur = bases.clair.addTo(map);
const labelsLayer = L.layerGroup().addTo(map);
L.geoJSON(FRONTIERE,{interactive:false,
  style:{color:"#0E1714",weight:3,opacity:.85,fill:false,lineJoin:"round"}}).addTo(map);
const sitesLayer  = L.layerGroup().addTo(map);

/* ---------- sites physiques ---------- */
SITES.forEach(s=>{
  const col = s.a ? color(s.a) : "#C6152F";
  const mk = L.marker([s.lat,s.lng],{
    icon:L.divIcon({className:"",iconSize:[15,15],iconAnchor:[7,7],
      html:`<div class="sitepin" style="background:${col}"></div>`}),
    zIndexOffset:1000, title:"Agence MIGAUD "+s.v});
  mk.bindTooltip(`<b>MIGAUD ${s.v.toUpperCase()}</b>
    <div class="tag">${s.a ? "Agence Service / Pièces" : "Site sans secteur dans le fichier"}</div>
    ${s.a?`<div class="tag"><i class="dot" style="background:${col}"></i>${s.a} · ${META.agences[s.a].nb} communes</div>`:""}`,
    {className:"tt",direction:"top",offset:[0,-8]});
  mk.on("click",()=>{ if(s.a){ setMode("agences"); toggleSolo(s.a); } });
  sitesLayer.addLayer(mk);
});

/* ---------- couches ---------- */
const built = {}, flat = [];
const visKeys = ks => ks.filter(k=>FLUX || k!==HORS);
const coreBounds = L.geoJSON({type:"FeatureCollection",
  features:DATA.features.filter(f=>f.properties.a!==HORS)}).getBounds();
let byCode = {}, visible = new Set(), solo = null, selected = null, allBounds = null;

const BANDS = [
  [.90,.88,"90 % et plus","agence quasi exclusive"],
  [.70,.62,"70 à 89 %","nettement dominante"],
  [.50,.38,"50 à 69 %","majoritaire mais partagée"],
  [0,  .20,"moins de 50 %","commune éclatée"]
];
const bandOf = p => BANDS.find(b=>p>=b[0]);

function styleFor(k,f){
  const grad = (mode==="flux"||mode==="ecart") && FLUX && f;
  if(grad){
    const x = FLUX.com[f.properties.c];
    if(!x) return {color:"#5F6E68",weight:1,dashArray:"3,3",opacity:.9,
                   fillColor:color(NA_F),fillOpacity:.16};
    return {color:"#FFFFFF",weight:.7,dashArray:null,opacity:.9,
            fillColor:color(k),fillOpacity:bandOf(x.p)[1]};
  }
  return {color: isNeutral(k) ? "#5F6E68" : "#FFFFFF",
          weight: isNeutral(k) ? 1 : .7,
          dashArray: isNeutral(k) ? "3,3" : null,
          opacity:.9, fillColor:color(k),
          fillOpacity: isNeutral(k) ? .16 : .62};
}

function build(m){
  if(built[m]) return built[m];
  const prop = MODES[m].prop, keys = Object.keys(META[m]);
  const layers = {}, codes = {};
  keys.forEach(k=>{
    const feats = DATA.features.filter(f=>f.properties[prop]===k);
    layers[k] = L.geoJSON({type:"FeatureCollection",features:feats},{
      style:f=>styleFor(k,f),
      onEachFeature(f,lyr){
        const p = f.properties;
        codes[p.c] = lyr;
        lyr.bindTooltip(()=>tipHtml(p),{className:"tt",sticky:true});
        lyr.on("mouseover",()=>{ if(lyr!==selected) lyr.setStyle({weight:2.2,color:"#0E1714",fillOpacity:.8}); });
        lyr.on("mouseout", ()=>{ if(lyr!==selected) lyr.setStyle(styleFor(k,f)); });
        lyr.on("click",()=>select(p.c,false));
      }
    });
    const s = (m==="agences"||m==="flux") ? siteOf[k] : null;
    const M = META[m][k];
    const pos = s ? [s.lat,s.lng] : (M.lat!=null ? [M.lat,M.lng] : null);
    layers[k]._label = pos ? L.marker(pos,{interactive:false,keyboard:false,zIndexOffset:500,
      icon:L.divIcon({className:"",iconSize:null,
        html:`<div class="aglabel" style="box-shadow:inset 0 -3px 0 ${color(k)},0 1px 3px rgba(0,0,0,.14);${s?"margin-top:14px":""}">${k}</div>`})}) : null;
  });
  built[m] = {layers,codes,keys,bounds:coreBounds};
  return built[m];
}

let showLabels = true;
function applyVisibility(){
  const B = built[mode];
  B.keys.forEach(k=>{
    const on = visible.has(k), lyr = B.layers[k];
    if(on && !map.hasLayer(lyr)) map.addLayer(lyr);
    if(!on && map.hasLayer(lyr)) map.removeLayer(lyr);
    const lblOn = on && showLabels;
    if(lyr._label){
      if(lblOn && !labelsLayer.hasLayer(lyr._label)) labelsLayer.addLayer(lyr._label);
      if(!lblOn && labelsLayer.hasLayer(lyr._label)) labelsLayer.removeLayer(lyr._label);
    }
  });
  document.querySelectorAll(".ag").forEach(el=>{
    el.classList.toggle("off",!visible.has(el.dataset.k));
    el.classList.toggle("solo",solo===el.dataset.k);
  });
}

function renderList(){
  const M = META[mode];
  const keys = visKeys(Object.keys(M)).sort((a,b)=> (isNeutral(a)-isNeutral(b)) || a.localeCompare(b,"fr"));
  const maxNb = Math.max(...keys.map(k=>M[k].nb));
  const list = document.getElementById("aglist"); list.innerHTML="";
  keys.forEach(k=>{
    const d = M[k], el = document.createElement("div");
    el.className="ag"; el.dataset.k=k; el.tabIndex=0; el.setAttribute("role","button");
    const s = (mode==="agences"||mode==="flux") ? siteOf[k] : null;
    const meta = d.txt ? d.txt : Object.entries(d.deps||{})
      .map(([a,b])=>`${DEPNAMES[a]||a} ${b}`).join(" · ");
    el.innerHTML = `<i class="chip" style="background:${color(k)}"></i>
      <div><div class="nm">${k}</div><div class="meta">${meta}</div>
      ${s?`<div class="site">Site : ${s.v}</div>`:""}</div>
      <div class="cnt">${d.nb}</div>
      <div class="bar"><i style="width:${(d.nb/maxNb*100).toFixed(1)}%;background:${color(k)}"></i></div>`;
    el.addEventListener("click",()=>toggleSolo(k));
    el.addEventListener("keydown",e=>{ if(e.key==="Enter"||e.key===" "){e.preventDefault();toggleSolo(k);} });
    list.appendChild(el);
  });
  const lg = document.getElementById("legend");
  if((mode==="flux"||mode==="ecart") && FLUX){
    const ref = mode==="ecart" ? color(ECART_KO) : "#4A5F55";
    lg.hidden = false;
    lg.innerHTML = `<div class="lgt">Intensité = part de l'agence dominante (en CA)</div>` +
      BANDS.map(b=>`<div class="lgr">
        <span class="lgs"><i style="background:${ref};opacity:${b[1]}"></i></span>
        <span><b>${b[2]}</b> <span>— ${b[3]}</span></span></div>`).join("") +
      `<div class="lgr" style="margin-top:7px">
        <span class="lgs"><i style="background:#9AA5A0;opacity:.35"></i></span>
        <span><b>Aucune facture</b> <span>— rien à mesurer</span></span></div>`;
  } else lg.hidden = true;
  document.getElementById("listTitle").textContent = cfg().title;
  document.getElementById("kAg").textContent = keys.filter(k=>!isNeutral(k)).length;
  document.getElementById("kAgL").textContent = cfg().kpi;
}

function setMode(m){
  if(m===mode && built[m]) return;
  const B0 = built[mode];
  if(B0) B0.keys.forEach(k=>{ map.removeLayer(B0.layers[k]);
    if(B0.layers[k]._label) labelsLayer.removeLayer(B0.layers[k]._label); });
  mode = m;
  const B = build(m);
  byCode = B.codes; allBounds = B.bounds;
  visible = new Set(visKeys(B.keys)); solo = null;
  clearSelection(); renderList(); applyVisibility();
  document.querySelectorAll(".modes button[data-mode]").forEach(b=>b.classList.toggle("on",b.dataset.mode===m));
}

function toggleSolo(k){
  const B = built[mode];
  if(solo===k){ solo=null; visible=new Set(visKeys(B.keys)); applyVisibility(); map.fitBounds(allBounds,{padding:[24,24]}); return; }
  solo=k; visible=new Set([k]); applyVisibility();
  map.fitBounds(B.layers[k].getBounds(),{padding:[28,28]});
}

/* ---------- facturation (admin) ---------- */
const nf = n => n.toLocaleString("fr-FR");
const eur = n => n>=1e6 ? (n/1e6).toLocaleString("fr-FR",{maximumFractionDigits:2})+" M€"
              : n>=1e3 ? Math.round(n/1e3).toLocaleString("fr-FR")+" k€"
              : nf(Math.round(n))+" €";
const caOf = v => v[2]+v[3];
function fact(p){ return FLUX ? FLUX.com[p.c] : null; }

function tipHtml(p){
  const x = fact(p);
  let s = `<b>${p.n}</b>
    <div class="tag"><i class="dot" style="background:${color(p.a)}"></i>${p.a}</div>
    <div class="tag"><i class="dot" style="background:${color(p.r)}"></i>${p.r}</div>
    <div class="tag"><i class="dot" style="background:${color(p.k)}"></i>CPS : ${p.k}</div>
    <div class="cp">${p.cp.join(" · ")}</div>`;
  if(FLUX){
    if(!x) s += `<div class="tag" style="margin-top:5px">Aucune facture ${FLUX.kpi.periode}</div>`;
    else {
      const dom = FLUX.AG[x.d];
      s += `<div class="tag" style="margin-top:5px"><i class="dot" style="background:${color(dom)}"></i>
            ${eur(x.ca)} · ${nf(x.t)} factures — ${Math.round(x.p*100)} % ${dom}</div>`;
      if(dom!==p.a) s += `<div class="tag" style="color:#FF5F71">Écart avec le rattachement théorique</div>`;
    }
  }
  return s;
}

function factBlock(p){
  if(!FLUX) return "";
  const x = fact(p);
  if(!x) return `<div class="fact"><h4>Facturation ${FLUX.kpi.periode}</h4>
     <p class="fnote">Aucune facture SAV ni magasin sur cette commune.</p></div>`;
  const dom = FLUX.AG[x.d];
  const rows = Object.entries(x.a).map(([i,v])=>({a:FLUX.AG[+i],n:v[0]+v[1],ca:caOf(v),
                     aca:v[2],mca:v[3]})).sort((u,v)=>v.ca-u.ca);
  const ref = x.ca>0 ? x.ca : x.t;
  return `<div class="fact"><h4>Facturation ${FLUX.kpi.periode} — ${eur(x.ca)} · ${nf(x.t)} factures</h4>
    ${rows.map(r=>{const part=(x.ca>0?r.ca:r.n)/ref;return `<div class="frow">
        <i class="dot" style="background:${color(r.a)}"></i>
        <span class="fn">${r.a}</span>
        <span class="fv">${eur(r.ca)} · ${Math.round(part*100)} %</span>
        <span class="fb"><i style="width:${(part*100).toFixed(1)}%;background:${color(r.a)}"></i></span>
        <span class="fv" style="grid-column:2/-1;text-align:left;color:#6C837A">
          atelier ${eur(r.aca)} · magasin ${eur(r.mca)} · ${nf(r.n)} factures</span>
      </div>`;}).join("")}
    <p class="fnote">${dom===p.a
      ? "Le flux réel confirme le rattachement théorique."
      : `<b style="color:#FF5F71">Écart :</b> commune rattachée à ${p.a}, mais ${Math.round(x.p*100)} % du CA part vers ${dom}.`}</p>
  </div>`;
}

/* ---------- fiche commune ---------- */
const detail = document.getElementById("detail");
function clearSelection(){
  if(selected){ selected.setStyle(styleFor(selected.feature.properties[cfg().prop],selected.feature)); selected=null; }
  detail.classList.remove("on"); detail.innerHTML="";
}
function select(code,zoom){
  const lyr = byCode[code]; if(!lyr) return;
  clearSelection(); selected = lyr;
  lyr.setStyle({weight:3,color:"#0E1714",fillOpacity:.85}); lyr.bringToFront();
  if(zoom) map.fitBounds(lyr.getBounds(),{padding:[70,70],maxZoom:12});
  const p = lyr.feature.properties, s = siteOf[p.a];
  const flags = [];
  if(FLUX && p.dA!=null && p.e!==ECART_OK){
    flags.push(p.e===ECART_PROX
      ? `Écart de proximité : l'agence réellement facturée est à ${p.dR} km, l'agence de rattachement à ${p.dA} km. Le client va au plus court — c'est le découpage qui est en cause.`
      : `Écart à enquêter : le client s'éloigne — agence de rattachement à ${p.dA} km, agence réellement facturée à ${p.dR} km.`);
  }
  if(p.r===NA_R) flags.push("Aucun commercial n'a cette commune dans son secteur.");
  if(p.ins.length>1) flags.push("Contour mutualisé : "+p.ins.join(", ")+" partagent le même tracé.");
  detail.innerHTML = `<button class="close" type="button" aria-label="Fermer">&times;</button>
    <div class="dn">${p.n}</div>
    <div class="row"><span>Agence</span><b style="color:${color(p.a)}">${p.a}</b></div>
    ${s?`<div class="row"><span>Site</span><b>MIGAUD ${s.v}</b></div>`:""}
    <div class="row"><span>Commercial</span><b style="color:${color(p.r)}">${p.r}</b></div>
    <div class="row"><span>CPS</span><b style="color:${color(p.k)}">${p.k}</b></div>
    <div class="row"><span>Code${p.cp.length>1?"s":""} postal${p.cp.length>1?"aux":""}</span><b class="mono">${p.cp.join(" · ")}</b></div>
    <div class="row"><span>Code INSEE</span><b class="mono">${p.ins.join(" · ")}</b></div>
    <div class="row"><span>Département</span><b>${p.dep} — ${DEPNAMES[p.dep]||""}</b></div>
    ${flags.length?`<div class="flag">${flags.join("<br>")}</div>`:""}
    ${factBlock(p)}`;
  detail.classList.add("on");
  detail.querySelector(".close").addEventListener("click",clearSelection);
}
map.on("click",e=>{ if(e.originalEvent.target.id==="map") clearSelection(); });

/* ---------- recherche commune / CP / INSEE ---------- */
DATA.features.forEach(f=>{
  const p=f.properties;
  flat.push({c:p.c,n:p.n,a:p.a,r:p.r,cp:p.cp,ins:p.ins,
    key:(p.n+" "+p.ins.join(" ")+" "+p.cp.join(" ")).toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g,"")});
});
const q=document.getElementById("q"), results=document.getElementById("results");
const featByCode={}; DATA.features.forEach(f=>featByCode[f.properties.c]=f);
let hlLayer=null;
function setHighlight(codes){
  if(hlLayer){ map.removeLayer(hlLayer); hlLayer=null; }
  if(!codes.length) return;
  hlLayer=L.geoJSON({type:"FeatureCollection",
      features:codes.map(c=>featByCode[c]).filter(Boolean)},
    {interactive:false,
     style:{color:"#C6152F",weight:3.5,opacity:.95,fill:true,
            fillColor:"#C6152F",fillOpacity:.08}}).addTo(map);
  hlLayer.bringToFront();
}
q.addEventListener("input",()=>{
  const v = q.value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  results.innerHTML="";
  if(v.length<2){ setHighlight([]); return; }
  const all = flat.filter(x=>(FLUX || x.a!==HORS) && x.key.includes(v));
  setHighlight(all.slice(0,400).map(x=>x.c));
  if(all.length && all.length<=120 && hlLayer)
    map.fitBounds(hlLayer.getBounds(),{padding:[60,60],maxZoom:11});
  const hits = all.sort((a,b)=>a.n.localeCompare(b.n,"fr")).slice(0,60);
  if(!hits.length){ setHighlight([]);
    const li=document.createElement("li"); li.className="none";
    li.textContent="Aucune commune du périmètre MIGAUD"; results.appendChild(li); return;
  }
  hits.forEach(x=>{
    const li=document.createElement("li"); li.tabIndex=0;
    const k = mode==="agences"?x.a:x.r;
    li.innerHTML=`<i class="dot" style="background:${color(k)}"></i><span>${x.n}</span>
                  <span class="rc mono">${x.cp.join("/")} · ${x.ins[0]}</span>`;
    const go=()=>{
      setHighlight([]); q.value=""; results.innerHTML="";
      if(!visible.has(k)){ visible=new Set(visKeys(built[mode].keys)); solo=null; applyVisibility(); }
      select(x.c,true);
      if(window.matchMedia("(max-width:860px)").matches) side.classList.remove("open");
    };
    li.addEventListener("click",go);
    li.addEventListener("keydown",e=>{ if(e.key==="Enter") go(); });
    results.appendChild(li);
  });
});

/* ---------- notes ---------- */
const nbNoCo = DATA.features.filter(f=>f.properties.r===NA_R).length;
const partage = Object.keys(META.secteurs).filter(k=>k.includes(" / "));
const sansTerr = SITES.filter(s=>!s.a).map(s=>s.v);
document.getElementById("notes").innerHTML = `<div id="arb" hidden><h3>À arbitrer</h3>
  ${nbNoCo?`<p><b>${nbNoCo} communes</b> couvertes par une agence mais dans aucun secteur commercial.
     <a data-focus="${NA_R}" data-mode="secteurs">Les voir</a></p>`:""}
  ${partage.length?`<p><b>Secteur identique</b> pour ${partage[0].replace(" / "," et ")} : les mêmes ${META.secteurs[partage[0]].nb} communes.
     <a data-focus="${partage[0]}" data-mode="secteurs">Les voir</a></p>`:""}
  ${sansTerr.length?`<p><b>${sansTerr.join(", ")}</b> : site présent sur la carte, aucune commune rattachée dans le fichier.</p>`:""}</div>
  <p>Contours communaux recalculés d'après le Code officiel géographique en vigueur. Codes postaux : référentiel INSEE / La Poste.</p>
  <p style="color:#6C837A">Données de facturation au 27/08/2026 · carte générée le 27/08/2026 — vérifiez que vous utilisez bien la dernière version du fichier.</p>`;
["notes","adminStats"].forEach(id=>document.getElementById(id).addEventListener("click",e=>{
  const g=e.target.closest("tr.goto");
  if(g){ select(g.dataset.c,true); return; }
  const b=e.target.closest("#expHors");
  if(b && FLUX && FLUX._rows){
    const list = FLUX._rows.filter(o=>o.fuite>0 || o.n.a===HORS)
      .sort((u,v)=>v.fuite-u.fuite);
    const rows=[["Commune","Departement","Rattachement","CA total","Nb factures","CA hors rattachement","Part hors","Destination principale","Type ecart","Dist. rattachement (km)","Dist. reelle (km)"]];
    list.forEach(o=>rows.push([o.n.n,o.n.dep,o.n.a===HORS?"Hors perimetre":o.n.a,
      o.x.ca,o.x.t,o.fuite,Math.round(o.fuite/Math.max(o.x.ca,1)*100)+"%",o.dest||FLUX.AG[o.x.d],
      o.n.a===HORS?"hors perimetre":(o.n.e===ECART_PROX?"proximite":"a enqueter"),
      o.n.dA??"",o.n.dR??""]));
    const csv="\uFEFF"+rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(";")).join("\r\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
    const a2=document.createElement("a");
    a2.href=url; a2.download="CA_hors_secteur_MIGAUD.csv"; a2.click();
    URL.revokeObjectURL(url); return;
  }
  const a=e.target.closest("a[data-focus]"); if(!a) return;
  setMode(a.dataset.mode); toggleSolo(a.dataset.focus);
}));

/* ---------- contrôles ---------- */
document.querySelectorAll(".modes button").forEach(b=>b.addEventListener("click",()=>setMode(b.dataset.mode)));
document.getElementById("reset").addEventListener("click",()=>{
  setHighlight([]); q.value=""; results.innerHTML="";
  solo=null; visible=new Set(visKeys(built[mode].keys)); applyVisibility(); clearSelection();
  map.fitBounds(allBounds,{padding:[24,24]});
});
document.getElementById("fit").addEventListener("click",()=>{
  const B=built[mode], on=B.keys.filter(k=>visible.has(k));
  map.fitBounds(on.length?L.featureGroup(on.map(k=>B.layers[k])).getBounds():allBounds,{padding:[24,24]});
});
document.querySelectorAll(".seg button[data-base]").forEach(b=>b.addEventListener("click",()=>{
  document.querySelectorAll(".seg button[data-base]").forEach(x=>x.classList.remove("on"));
  b.classList.add("on"); map.removeLayer(baseCur);
  baseCur = bases[b.dataset.base].addTo(map);
  if(baseCur.bringToBack) baseCur.bringToBack();
  else if(baseCur.eachLayer) baseCur.eachLayer(l=>l.bringToBack&&l.bringToBack());
}));
document.getElementById("tSites").addEventListener("click",function(){
  this.classList.toggle("on");
  if(map.hasLayer(sitesLayer)) map.removeLayer(sitesLayer); else map.addLayer(sitesLayer);
});
document.getElementById("tConcur").addEventListener("click",function(){
  const cp=document.getElementById("cpanel");
  cp.hidden = !cp.hidden;
});
document.getElementById("tLabels").addEventListener("click",function(){
  this.classList.toggle("on"); showLabels = this.classList.contains("on"); applyVisibility();
});
document.getElementById("exp").addEventListener("click",()=>{
  const rows=[["Code INSEE","Commune","Code postal","Agence Service/Pieces","Site","Commercial","CPS","Departement"]
    .concat(FLUX?["CA HT","Factures","Agence dominante (CA)","Part CA","Ecart"]:[])];
  DATA.features.filter(f=>visible.has(f.properties[cfg().prop]))
    .sort((a,b)=>a.properties[cfg().prop].localeCompare(b.properties[cfg().prop],"fr")
                 ||a.properties.n.localeCompare(b.properties.n,"fr"))
    .forEach(f=>{const p=f.properties;
      const x=FLUX?FLUX.com[p.c]:null;
      rows.push([p.ins.join(" "),p.n,p.cp.join(" "),p.a,(siteOf[p.a]||{}).v||"",p.r,p.k,p.dep]
        .concat(FLUX?[x?x.ca:0, x?x.t:0, x?FLUX.AG[x.d]:"", x?Math.round(x.p*100)+"%":"",
                      x?(FLUX.AG[x.d]===p.a?"conforme":"ecart"):""]:[]));});
  const csv="\uFEFF"+rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(";")).join("\r\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a");
  a.href=url; a.download="territoires_MIGAUD_"+mode+".csv"; a.click();
  URL.revokeObjectURL(url);
});

/* ---------- concurrence ---------- */
const MCOL = {
  "John Deere":     {c:"#367C2B", b:"#FFDE00"},
  "Fendt":          {c:"#0E4D24", b:"#FFFFFF"},
  "Valtra":         {c:"#A6192E", b:"#FFFFFF"},
  "Fendt / Valtra": {c:"#0E4D24", c2:"#A6192E", b:"#FFFFFF"},
  "Deutz-Fahr":     {c:"#8FC31F", b:"#1C1C1C"},
  "Claas":          {c:"#00A65A", b:"#FFFFFF"},
  "New Holland":    {c:"#0072CE", b:"#FFFFFF"},
  "Massey Ferguson":{c:"#E4002B", b:"#FFFFFF"},
  "Kubota":         {c:"#ED6C00", b:"#FFFFFF"},
  "Pellenc":        {c:"#C0CA33", b:"#5C5C10"}
};
const mstyle = m => MCOL[m] || {c:"#888",b:"#fff"};
const mfill = s => s.c2 ? `linear-gradient(135deg,${s.c} 0 50%,${s.c2} 50% 100%)` : s.c;
const concurLayer = L.layerGroup();
const eOff = new Set();
const ENSByM = {};
CONCUR.forEach(s=>{ (ENSByM[s.m]=ENSByM[s.m]||new Set()).add(s.e); });
CONCUR.forEach(s=>{
  const st = mstyle(s.m);
  s._mk = L.marker([s.lat,s.lng],{
    icon:L.divIcon({className:"",iconSize:[13,13],iconAnchor:[6,6],
      html:`<div class="cpin" style="background:${mfill(st)};border-color:${st.b}"></div>`}),
    zIndexOffset:800, title:s.e+" "+s.v})
   .bindTooltip(`<b>${s.e}</b>
      <div class="tag"><i class="dot" style="background:${mfill(st)}"></i>${s.m}</div>
      <div class="tag">${s.v} (${s.d})${s.n?" · "+s.n+" agences":""}${s.a?" · position approchée":""}</div>
      ${s.adr?`<div class="tag" style="font-size:11px;color:#6C837A">${s.adr}</div>`:""}`,
      {className:"tt",direction:"top",offset:[0,-7]});
});
function refreshConcur(){
  let any=false;
  CONCUR.forEach(s=>{
    const on = !eOff.has(s.e); any = any||on;
    if(on && !concurLayer.hasLayer(s._mk)) concurLayer.addLayer(s._mk);
    if(!on && concurLayer.hasLayer(s._mk)) concurLayer.removeLayer(s._mk);
  });
  if(any && !map.hasLayer(concurLayer)) map.addLayer(concurLayer);
  if(!any && map.hasLayer(concurLayer)) map.removeLayer(concurLayer);
  document.getElementById("tConcur").classList.toggle("on",any);
  document.querySelectorAll("#cpanel .crow").forEach(el=>{
    if(el.dataset.e) el.classList.toggle("off",eOff.has(el.dataset.e));
    else {
      const ens=[...ENSByM[el.dataset.m]];
      el.classList.toggle("off",ens.every(e=>eOff.has(e)));
    }
  });
}
function buildCPanel(){
  const cp=document.getElementById("cpanel");
  cp.innerHTML = `<div class="ctop">
      <button data-all="1" type="button">Tout afficher</button>
      <button data-all="0" type="button">Tout masquer</button></div>` +
    Object.keys(MCOL).filter(m=>ENSByM[m]).map(m=>{
      const st=mstyle(m);
      const nbM=CONCUR.filter(s=>s.m===m).reduce((a,x)=>a+(x.n||1),0);
      return `<div class="crow mq" data-m="${m}" role="button" tabindex="0">
          <i class="sw" style="background:${mfill(st)};border-color:${st.b}"></i>
          <span class="nmk">${m}</span><span class="ct">${nbM}</span></div>` +
        [...ENSByM[m]].sort((a,b)=>a.localeCompare(b,"fr")).map(e=>{
          const nbE=CONCUR.filter(s=>s.e===e).reduce((a,x)=>a+(x.n||1),0);
          return `<div class="crow en" data-e="${e}" role="button" tabindex="0">
            <span class="nmk">${e}</span><span class="ct">${nbE}</span></div>`;
        }).join("");
    }).join("");
  cp.addEventListener("click",e=>{
    const b=e.target.closest("[data-all]");
    if(b){ eOff.clear(); if(b.dataset.all==="0") CONCUR.forEach(s=>eOff.add(s.e));
      refreshConcur(); return; }
    const row=e.target.closest(".crow"); if(!row) return;
    if(row.dataset.e){
      eOff.has(row.dataset.e) ? eOff.delete(row.dataset.e) : eOff.add(row.dataset.e);
    } else {
      const ens=[...ENSByM[row.dataset.m]];
      const allOff=ens.every(x=>eOff.has(x));
      ens.forEach(x=> allOff ? eOff.delete(x) : eOff.add(x));
    }
    refreshConcur();
  });
}
CONCUR.forEach(s=>eOff.add(s.e));   // masqués par défaut, comme avant
buildCPanel(); refreshConcur();

/* ---------- déverrouillage admin ---------- */
//
const gate=document.getElementById("gate"), pwd=document.getElementById("pwd"), gerr=document.getElementById("gerr");
const b64 = s => Uint8Array.from(atob(s),c=>c.charCodeAt(0));

async function unlock(pass){
  if(!crypto.subtle) throw new Error("nocrypto");
  const km = await crypto.subtle.importKey("raw",new TextEncoder().encode(pass),"PBKDF2",false,["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    {name:"PBKDF2",salt:b64(ENC.s),iterations:ENC.i,hash:"SHA-256"},
    km,{name:"AES-GCM",length:256},false,["decrypt"]);
  const clear = await crypto.subtle.decrypt({name:"AES-GCM",iv:b64(ENC.n)},key,b64(ENC.d));
  return JSON.parse(new TextDecoder().decode(clear));
}

function applyFlux(){
  const B0 = built.agences || build("agences");
  DATA.features.forEach(f=>{
    const p=f.properties, x=FLUX.com[p.c];
    p.f = x ? FLUX.AG[x.d] : NA_F;
    if(!x){ p.e = NA_F; return; }
    if(p.a===HORS){ p.e = HORS; return; }
    if(p.f===p.a){ p.e = ECART_OK; return; }
    const lyr = B0.codes[p.c];
    const sA = siteOf[p.a], sR = siteOf[p.f];
    if(lyr && sA && sR){
      const ctr = lyr.getBounds().getCenter(), c=[ctr.lat,ctr.lng];
      p.dA = Math.round(dKm(c,[sA.lat,sA.lng]));
      p.dR = Math.round(dKm(c,[sR.lat,sR.lng]));
      p.e = (p.dR < p.dA - 1) ? ECART_PROX : ECART_KO;
    } else p.e = ECART_KO;
  });
  const mk = prop => {
    const o={};
    DATA.features.forEach(f=>{
      const k=f.properties[prop];
      o[k] = o[k] || {nb:0, vol:0, ca:0};
      const x = FLUX.com[f.properties.c];
      o[k].nb++; o[k].vol += x?x.t:0; o[k].ca += x?x.ca:0;
    });
    Object.keys(o).forEach(k=>{
      o[k].txt = o[k].vol ? `${eur(o[k].ca)} · ${nf(o[k].vol)} factures` : "0 facture";
    });
    return o;
  };
  META.flux  = mk("f");
  META.ecart = mk("e");
  const K=FLUX.kpi;
  document.getElementById("adminModes").hidden=false;
  document.getElementById("tConcur").hidden=false;
  document.getElementById("arb").hidden=false;
  updateKCom();
  visible = new Set(built[mode].keys); solo=null; applyVisibility();
  document.getElementById("lock").classList.add("open");
  document.getElementById("lock").textContent="🔓";
  const featByC = {}; DATA.features.forEach(f=>featByC[f.properties.c]=f.properties);
  const rows = Object.entries(FLUX.com).map(([c,x])=>{
    const n = featByC[c]||{};
    const iAssigned = FLUX.AG.indexOf(n.a);
    const caIn = (n.a===HORS||iAssigned<0) ? 0 : caOf(x.a[String(iAssigned)]||[0,0,0,0]);
    const dest = Object.entries(x.a).filter(([i])=>+i!==iAssigned)
                   .sort((u,v)=>caOf(v[1])-caOf(u[1]))[0];
    return {c,x,n,fuite:x.ca-caIn,dest:dest?FLUX.AG[+dest[0]]:null,
            destCa:dest?caOf(dest[1]):0};
  });
  FLUX._rows = rows;
  const hors = rows.filter(o=>o.n.a===HORS).sort((u,v)=>v.x.ca-u.x.ca);
  const fuites = rows.filter(o=>o.n.a && o.n.a!==HORS && o.fuite>0);
  const urg  = fuites.filter(o=>o.n.e===ECART_KO).sort((u,v)=>v.fuite-u.fuite).slice(0,8);
  const prox = fuites.filter(o=>o.n.e===ECART_PROX).sort((u,v)=>v.fuite-u.fuite).slice(0,8);
  document.getElementById("adminStats").hidden=false;
  document.getElementById("adminStats").innerHTML = `
    <h3 style="color:var(--accent-soft)">Facturation ${K.periode}</h3>
    <p><b>${eur(K.catotal)}</b> de CA HT et ${nf(K.total)} factures analysés :
       ${eur(K.catot)} sur les communes rattachées à une agence,
       ${eur(K.horsca)} sur ${K.horscom} communes limitrophes hors secteur
       (<a data-focus="${HORS}" data-mode="agences">les voir</a>) et ${eur(K.koca)} non rattachés.</p>
    <p><b>${K.conf} communes sur ${K.nbcom}</b> facturées conformément à leur rattachement
       (${Math.round(100*K.conf/K.nbcom)} % des communes, <b>${Math.round(100*K.caconf/K.catot)} % du CA</b>).
       <a data-focus="${ECART_KO}" data-mode="ecart">Voir les écarts</a></p>
    <h4 style="margin:12px 0 2px;font-family:var(--cond);font-size:11.5px;letter-spacing:.13em;text-transform:uppercase;color:#FF5F71">Urgent — le client s'éloigne de son agence</h4>
    <table class="tbl">${urg.map(o=>`<tr class="goto" data-c="${o.c}" style="cursor:pointer">
      <td><b>${o.n.n}</b><br><span style="color:var(--muted)">${o.n.a} (${o.n.dA} km) → ${o.dest||""} (${o.n.dR} km)<br>CA total ${eur(o.x.ca)} · ${nf(o.x.t)} fact. · fuite ${Math.round(o.fuite/o.x.ca*100)} %</span></td>
      <td><b style="color:#FF5F71">${eur(o.fuite)}</b></td></tr>`).join("")}</table>
    <h4 style="margin:12px 0 2px;font-family:var(--cond);font-size:11.5px;letter-spacing:.13em;text-transform:uppercase;color:#E8A94F">Découpage à revoir — l'agence réelle est plus proche</h4>
    <table class="tbl">${prox.map(o=>`<tr class="goto" data-c="${o.c}" style="cursor:pointer">
      <td><b>${o.n.n}</b><br><span style="color:var(--muted)">${o.n.a} (${o.n.dA} km) → ${o.dest||""} (${o.n.dR} km)<br>CA total ${eur(o.x.ca)} · ${nf(o.x.t)} fact. · fuite ${Math.round(o.fuite/o.x.ca*100)} %</span></td>
      <td><b>${eur(o.fuite)}</b></td></tr>`).join("")}</table>
    <h4 style="margin:12px 0 2px;font-family:var(--cond);font-size:11.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--muted)">Hors périmètre — top 10 en CA</h4>
    <table class="tbl">${hors.slice(0,10).map(o=>`<tr class="goto" data-c="${o.c}" style="cursor:pointer">
      <td><b>${o.n.n}</b><br><span style="color:var(--muted)">${o.n.dep} — ${FLUX.AG[o.x.d]} (${Math.round(o.x.p*100)} %) · ${nf(o.x.t)} fact.</span></td>
      <td>${eur(o.x.ca)}</td></tr>`).join("")}</table>
    <button id="expHors" type="button" style="margin-top:9px;width:100%;padding:8px;border-radius:7px;border:1px solid var(--line);background:var(--ink);color:var(--text);font:inherit;font-size:11.5px;cursor:pointer">Exporter tout le hors-secteur (CSV)</button>
    <h4 style="margin:12px 0 2px;font-family:var(--cond);font-size:11.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--muted)">Concurrence</h4>
    <p class="fnote" style="margin:2px 0 0">${CONCUR.reduce((s,x)=>s+(x.n||1),0)} sites, ${new Set(CONCUR.map(s=>s.e)).size} enseignes, ${new Set(CONCUR.map(s=>s.m)).size} marques.
    Sélection par marque ou enseigne via le bouton <b>Concurrents</b> en haut à droite de la carte.</p>
    <p class="fnote">${FLUX.ko.length} couples code postal / ville n'ont pas pu être rattachés à une commune
       (${eur(K.koca)}, ${(100*K.koca/K.catotal).toFixed(1)} % du CA) : libellés tronqués ou communes disparues.</p>`;
  renderList();
  if(selected) select(selected.feature.properties.c,false);
}

function openGate(){
  if(FLUX){ setMode("flux"); return; }
  gate.hidden=false; gerr.textContent=""; pwd.value=""; pwd.focus();
}
const lockBtn=document.getElementById("lock"); if(lockBtn) lockBtn.addEventListener("click",openGate);
document.getElementById("gcancel").addEventListener("click",()=>{gate.hidden=true;});
gate.addEventListener("click",e=>{ if(e.target===gate) gate.hidden=true; });
document.getElementById("gok").addEventListener("click",submitPwd);
pwd.addEventListener("keydown",e=>{ if(e.key==="Enter") submitPwd(); });
async function submitPwd(){
  gerr.textContent="Déchiffrement…";
  try{
    FLUX = await unlock(pwd.value);
    gate.hidden=true; applyFlux(); setMode("flux");
  }catch(err){
    FLUX=null;
    gerr.textContent = (err && err.message==="nocrypto")
      ? "Chiffrement indisponible : ouvrez le fichier dans Chrome ou Edge."
      : "Mot de passe incorrect.";
  }
}

//
const side=document.getElementById("side");
document.getElementById("burger").addEventListener("click",()=>side.classList.toggle("open"));
onDoc("keydown",e=>{ if(e.key==="Escape"){
  if(typeof gate!=="undefined" && !gate.hidden){ gate.hidden=true; return; }
  setHighlight([]); clearSelection(); side.classList.remove("open"); } });

/* ---------- init ---------- */
function updateKCom(){
  document.getElementById("kCom").textContent =
    FLUX ? DATA.features.length : DATA.features.filter(f=>f.properties.a!==HORS).length;
}
updateKCom();
document.getElementById("kDep").textContent  = new Set(DATA.features.map(f=>f.properties.dep)).size;
document.getElementById("kSite").textContent = SITES.length;
const B0 = build("agences");
byCode=B0.codes; allBounds=B0.bounds; visible=new Set(B0.keys);
renderList(); applyVisibility();
map.fitBounds(allBounds,{padding:[24,24]});

  return function cleanupTerritory(){
    docHandlers.forEach(([t,fn])=>document.removeEventListener(t,fn));
    try { map.remove(); } catch(e) { /* deja detruit */ }
  };
}
