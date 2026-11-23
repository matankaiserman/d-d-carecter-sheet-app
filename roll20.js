/* Roll20 (D&D 2024 sheet) PDF export -> character.
   parseRoll20(items, {rules, spells, uid}) where items = [{p,x,y,w,h,s}] (y grows downward).
   Returns {char, warnings}. Works in the browser and in Node (for tests). */
(function(root){
"use strict";
const ABIL=['str','dex','con','int','wis','cha'];
const ABLBL={STRENGTH:'str',DEXTERITY:'dex',CONSTITUTION:'con',INTELLIGENCE:'int',WISDOM:'wis',CHARISMA:'cha'};
const SKILLMAP={'Acrobatics':'acrobatics','Animal Handling':'animal','Arcana':'arcana','Athletics':'athletics','Deception':'deception','History':'history','Insight':'insight','Intimidation':'intimidation','Investigation':'investigation','Medicine':'medicine','Nature':'nature','Perception':'perception','Performance':'performance','Persuasion':'persuasion','Religion':'religion','Sleight of Hand':'sleight','Stealth':'stealth','Survival':'survival'};
const HEB=/[֐-׿]/, LAT=/[A-Za-z]/;
const mod=s=>Math.floor((Number(s)||0)/2)-5;
const ARMOR=/\b(Padded|Leather|Studded|Hide|Chain|Scale|Breastplate|Half Plate|Ring Mail|Splint|Plate)\b.*Armor|^Shield$|Breastplate|Plate Armor/i;
const CLASS_ARMOR={barbarian:'Light, Medium, Shields',bard:'Light',cleric:'Light, Medium, Shields',druid:'Light, Medium, Shields',fighter:'Light, Medium, Heavy, Shields',monk:'None',paladin:'Light, Medium, Heavy, Shields',ranger:'Light, Medium, Shields',rogue:'Light',sorcerer:'None',warlock:'Light',wizard:'None'};
const CLASS_CAST={bard:'cha',cleric:'wis',druid:'wis',paladin:'cha',ranger:'wis',sorcerer:'cha',warlock:'cha',wizard:'int'};

function joinItems(its){
  // join items left-to-right; right-to-left for pure Hebrew runs
  its=its.slice().sort((a,b)=>a.x-b.x);
  const heb=its.filter(i=>HEB.test(i.s)), lat=its.filter(i=>LAT.test(i.s));
  if(heb.length&&!lat.length) its.reverse();
  let out='',prev=null;
  const rtl=heb.length&&!lat.length;
  its.forEach(i=>{ const gap=prev?(rtl?prev.x-(i.x+i.w):i.x-(prev.x+prev.w)):0;
    const sp=prev&&(gap>(rtl?0.6:1.5)||(i.s[0]==='('&&/[A-Za-z]$/.test(out)));
    out+=(sp?' ':'')+i.s; prev=i; });
  return out.replace(/\s+/g,' ').trim();
}
function rows(items){ // group by y
  const it=items.slice().sort((a,b)=>a.y-b.y||a.x-b.x), out=[];
  it.forEach(i=>{ const r=out[out.length-1]; if(r&&Math.abs(r.y-i.y)<=2) r.items.push(i); else out.push({y:i.y,items:[i]}) });
  return out;
}
const text=its=>joinItems(its);
function paragraphs(lines){ // lines: [{y,t}] -> text with paragraph breaks on bigger gaps
  let out='',prev=null;
  lines.forEach(l=>{ if(prev!=null) out+=(l.y-prev>13?'\n\n':' '); out+=l.t; prev=l.y; });
  return out.replace(/ +/g,' ').replace(/ ([,.;:])/g,'$1').trim();
}

function parseRoll20(items,opt){
  opt=opt||{}; const W=[]; const uid=opt.uid||(()=>Math.random().toString(36).slice(2,10));
  const RULES=opt.rules, SDB=opt.spells||[];
  items=items.filter(i=>i.s&&i.s.trim());
  const P=p=>items.filter(i=>i.p===p);
  const pages=[...new Set(items.map(i=>i.p))].sort((a,b)=>a-b);
  const findAll=(re,p)=>items.filter(i=>(p==null||i.p===p)&&(typeof re==='string'?i.s.trim()===re:re.test(i.s.trim())));
  const find=(re,p)=>findAll(re,p)[0];
  const near=(p,x0,x1,y0,y1)=>items.filter(i=>i.p===p&&i.x>=x0&&i.x<=x1&&i.y>=y0&&i.y<=y1);
  const pbItem=find('PROFICIENCY BONUS');
  if(!pbItem) return {char:null,warnings:['This doesn\'t look like a Roll20 D&D 2024 character sheet export (no “PROFICIENCY BONUS” found).']};
  const core=pbItem.p;
  const lbl=(t,maxY)=>items.find(i=>i.p===core&&i.s.trim()===t&&(maxY==null||i.y<maxY));
  const above=(L,dx0,dx1,dy0,dy1)=>L?text(near(core,L.x+dx0,L.x+dx1,L.y-dy1,L.y-dy0)):'';
  const c={};
  // ---- identity
  const nameL=lbl('NAME',70);
  c.name=above(nameL,-15,140,6,20)||'Imported Character';
  c.background=above(lbl('BACKGROUND',90),-5,110,6,16);
  const clsTxt=above(lbl('CLASS',90),-5,110,6,16);
  c.species=above(lbl('SPECIES',120),-5,110,6,16);
  c.subclass=above(lbl('SUBCLASS',120),-5,110,6,16);
  const lvlTxt=above(lbl('LEVEL',100),-10,25,6,18);
  const m=clsTxt.match(/^([A-Za-z]+)\s*(\d+)?/);
  c.cls=m?m[1]:clsTxt; c.level=Number(lvlTxt)||Number(m&&m[2])||1;
  if(/\/|,/.test(clsTxt)) W.push(`Multiclass (“${clsTxt}”) isn't supported — imported as ${c.cls}, level ${c.level}.`);
  const xpL=lbl('XP',110); if(xpL) c.xp=above(xpL,-15,25,6,14);
  // ---- defense & HP
  const acL=lbl('CLASS',60)&&items.find(i=>i.p===core&&i.s.trim()==='ARMOR');
  if(acL){ const v=near(core,acL.x-15,acL.x+30,acL.y+15,acL.y+35).find(i=>/^\d+$/.test(i.s.trim())); c.ac=v?Number(v.s):10 } else c.ac=10;
  const curL=lbl('CURRENT',120), maxLs=findAll('MAX',core).filter(i=>i.y<120);
  const hpCur=curL?above(curL,-12,30,6,16):''; const hpMaxL=curL&&maxLs.filter(i=>i.x>curL.x).sort((a,b)=>a.x-b.x)[0];
  const hpMax=hpMaxL?above(hpMaxL,-12,25,6,16):'';
  c.hp={max:Number(hpMax)||Number(hpCur)||1,cur:Number(hpCur)||Number(hpMax)||1,temp:0};
  const tempL=lbl('TEMP',90); if(tempL){const t=above(tempL,-12,25,6,16); if(/^\d+$/.test(t)) c.hp.temp=Number(t)}
  const hdL=hpMaxL&&maxLs.filter(i=>i.x>hpMaxL.x).sort((a,b)=>a.x-b.x)[0]; const hdTxt=hdL?above(hdL,-12,25,6,16):'';
  const hdm=hdTxt.match(/(\d+)\s*D\s*(\d+)/i);
  c.hd={die:hdm?'d'+hdm[2]:'d8',total:hdm?Number(hdm[1]):c.level,used:0};
  const pbv=near(core,pbItem.x,pbItem.x+80,pbItem.y+15,pbItem.y+55).find(i=>/^[+-]\d+$/.test(i.s.trim()));
  const PB=pbv?Number(pbv.s):2+Math.floor((c.level-1)/4);
  const valBelow=(t)=>{const L=lbl(t,200); if(!L) return ''; return text(near(core,L.x-25,L.x+60,L.y+12,L.y+32))};
  c.speed=Number((valBelow('SPEED').match(/\d+/)||[30])[0]); c.size=valBelow('SIZE')||'Medium';
  const initTxt=valBelow('INITIATIVE');
  // ---- abilities
  c.abilities={}; const abL={};
  Object.entries(ABLBL).forEach(([t,a])=>{ const L=lbl(t); if(!L){W.push('Could not find '+t);c.abilities[a]=10;return}
    abL[a]=L; const v=near(core,L.x+10,L.x+65,L.y+25,L.y+50).filter(i=>/^\d+$/.test(i.s.trim())&&i.h>=11)[0];
    c.abilities[a]=v?Number(v.s):10; if(!v) W.push('Could not read the '+t+' score'); });
  // ---- saves & skills: proficiency = shown bonus - ability modifier
  c.saveProf={}; c.skills={};
  const labelItems=items.filter(i=>i.p===core&&(i.s.trim()==='Saving Throw'||SKILLMAP[i.s.trim()]));
  labelItems.forEach(L=>{
    const val=items.find(i=>i.p===core&&Math.abs(i.y-L.y)<=2&&i.x<L.x&&i.x>L.x-20&&/^[+-]\d+$/.test(i.s.trim())); if(!val) return;
    const bonus=Number(val.s);
    if(L.s.trim()==='Saving Throw'){ // owner = nearest ability label above, same column
      const own=Object.entries(abL).filter(([a,A])=>A.y<L.y&&Math.abs(A.x-L.x)<45).sort((x,y)=>y[1].y-x[1].y)[0]; if(!own) return;
      const d=bonus-mod(c.abilities[own[0]]); if(d>=PB) c.saveProf[own[0]]=true;
    } else { const k=SKILLMAP[L.s.trim()]; const ab={acrobatics:'dex',animal:'wis',arcana:'int',athletics:'str',deception:'cha',history:'int',insight:'wis',intimidation:'cha',investigation:'int',medicine:'wis',nature:'int',perception:'wis',performance:'cha',persuasion:'cha',religion:'int',sleight:'dex',stealth:'dex',survival:'wis'}[k];
      const d=bonus-mod(c.abilities[ab]); if(d>=2*PB) c.skills[k]=2; else if(d>=PB) c.skills[k]=1; }
  });
  c.initBonus=initTxt&&/^[+-]?\d+$/.test(initTxt)?Number(initTxt)-mod(c.abilities.dex):0;
  // ---- page-wide helpers for later sections
  const hdr=(t,from)=>items.filter(i=>i.s.trim()===t&&(from==null||i.p>=from)).sort((a,b)=>a.p-b.p||a.y-b.y);
  // ---- spellcasting ability
  const spAbL=items.find(i=>i.s.trim()==='Ability'&&items.some(j=>j.p===i.p&&j.s.trim()==='Spellcasting'));
  let spAb=null; if(spAbL){const v=items.find(i=>i.p===spAbL.p&&i.x<spAbL.x&&Math.abs(i.y-spAbL.y)<30&&/^(STR|DEX|CON|INT|WIS|CHA)$/.test(i.s.trim())); if(v) spAb=v.s.trim().toLowerCase()}
  const ck=(c.cls||'').toLowerCase();
  c.spellAbility=spAb||CLASS_CAST[ck]||'none';
  // ---- languages, appearance, backstory, alignment, coins (summary page)
  const colText=(p,t0,t1,xmin)=>{ const A=find(t0,p), B=t1?items.filter(i=>i.p===p&&i.s.trim()===t1&&A&&i.y>A.y).sort((a,b)=>a.y-b.y)[0]:null; if(!A) return '';
    return rows(items.filter(i=>i.p===p&&i.x>=xmin&&i.y>A.y+4&&(!B||i.y<B.y-3))).map(r=>text(r.items)).join(' ').replace(/\s+/g,' ').replace(/ ([,.;:])/g,'$1').trim() };
  const langL=find('LANGUAGES'); const sp=langL?langL.p:core+1;
  c.languages=colText(sp,'LANGUAGES','EQUIPMENT',420);
  c.appearance=colText(sp,'APPEARANCE','BACKSTORY & PERSONALITY',420);
  const aliItems=items.filter(i=>i.p===sp&&/^ALIGNMENT/.test(i.s.trim()));
  let back=colText(sp,'BACKSTORY & PERSONALITY','ALIGNMENT',420);
  if(!back){const a=aliItems[0]; if(a) back=''; }
  c.backstory=back.replace(new RegExp('^'+(c.background||'@@').replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s+','i'),'');
  let align=''; const aI=aliItems[0]; if(aI){ align=text(items.filter(i=>i.p===sp&&Math.abs(i.y-aI.y)<=2&&i.x>aI.x)).trim() || aI.s.replace(/^ALIGNMENT\s*/,'') }
  c.alignment=align;
  const cpL=items.find(i=>i.s.trim()==='CP'&&items.some(j=>j.p===i.p&&j.s.trim()==='GP'&&Math.abs(j.y-i.y)<3));
  c.coins={cp:0,sp:0,ep:0,gp:0,pp:0};
  if(cpL){ ['CP','SP','EP','GP','PP'].forEach(k=>{const L=items.find(i=>i.p===cpL.p&&i.s.trim()===k&&Math.abs(i.y-cpL.y)<3); if(!L) return;
    const v=items.find(i=>i.p===cpL.p&&i.y>L.y+6&&i.y<L.y+30&&Math.abs(i.x-L.x)<14&&/^\d+$/.test(i.s.trim())); if(v) c.coins[k.toLowerCase()]=Number(v.s)}) }
  // ---- proficiencies & senses (combat reference page)
  const profPage=(items.find(i=>i.s.trim()==='PROFICIENCIES'&&i.p!==core)||{}).p;
  const profVal=(t)=>{const L=items.find(i=>i.p===profPage&&i.s.trim()===t&&i.x>300); if(!L) return ''; return text(items.filter(i=>i.p===L.p&&Math.abs(i.y-L.y)<=2&&i.x>L.x+5&&i.x<600))};
  c.prof={armor:profVal('ARMOR')||CLASS_ARMOR[ck]||'',weapons:profVal('WEAPONS'),tools:profVal('TOOLS'),languages:c.languages};
  const dv=items.find(i=>/^DARKVISION/.test(i.s.trim()));
  let dark=0; if(dv){const t=dv.s.trim().match(/\d+/)?dv.s.trim():text(items.filter(i=>i.p===dv.p&&Math.abs(i.y-dv.y)<=2&&i.x>dv.x&&i.x<dv.x+80)); dark=Number((t.match(/\d+/)||[0])[0])}
  c.senses=dark?`Darkvision ${dark} ft`:'Darkvision: none';
  const defVal=t=>{const L=items.find(i=>i.s.trim().startsWith(t)&&i.x<60); if(!L) return ''; const r=text(items.filter(i=>i.p===L.p&&Math.abs(i.y-L.y)<=2&&i.x>L.x+20&&i.x<220)); return r||L.s.trim().slice(t.length).trim()};
  const res=defVal('RESISTANCES'),vul=defVal('VULNERABILITIES'),imm=defVal('IMMUNITIES');
  c.defenses=[res&&res!=='None'?'Resistances: '+res:'',vul&&vul!=='None'?'Vulnerabilities: '+vul:'',imm&&imm!=='None'?'Immunities: '+imm:''].filter(Boolean).join(' · ')||'None';

  // ---- spells: list from "CANTRIPS & PREPARED SPELLS" table
  c.spells=[];
  const tbl=find('CANTRIPS & PREPARED SPELLS');
  const SN=n=>SDB.find(x=>x[0].toLowerCase()===n.toLowerCase());
  const spellRows=[];
  if(tbl){
    const p=tbl.p, timeH=items.find(i=>i.p===p&&/^CASTING/.test(i.s.trim())), rangeH=items.find(i=>i.p===p&&/RANGE/.test(i.s.trim())&&i.y>tbl.y);
    const tX=timeH?timeH.x-3:100, rX=rangeH?(rangeH.s.trim()==='RANGE'?rangeH.x-3:rangeH.x+ (rangeH.s.indexOf('RANGE')*3.2)-3):158;
    rows(items.filter(i=>i.p===p&&i.y>tbl.y+25&&i.x<420)).forEach(r=>{
      const nameIts=r.items.filter(i=>i.x<tX), t=text(nameIts), mm=t.match(/^(\d)\s+(.+)$/); if(!mm) return;
      const timeIts=r.items.filter(i=>i.x>=tX&&i.x<rX), rangeIts=r.items.filter(i=>i.x>=rX&&i.x<195);
      spellRows.push({lvl:Number(mm[1]),name:mm[2].trim(),time:text(timeIts),range:text(rangeIts).replace(/\s+C$/,'')});
    });
  }
  // descriptions for spells not in the SRD: from the "CANTRIPS & SPELLS" detail pages
  const detail={};
  hdr('CANTRIPS & SPELLS').forEach(()=>{});
  const detailPages=pages.filter(p=>p!==core&&items.some(i=>i.p===p&&/^LVL/.test(i.s.trim()))&&items.some(i=>i.p===p&&/^NOTES$/.test(i.s.trim()))&&!items.some(i=>i.p===p&&/^CASTING/.test(i.s.trim())));
  detailPages.forEach(p=>{
    const head=items.filter(i=>i.p===p&&/NOTES/.test(i.s.trim())).sort((a,b)=>a.y-b.y)[0]; if(!head) return;
    const descX=head.x-5;
    const names=spellRows.map(s=>{const it=items.find(i=>i.p===p&&i.x<descX-40&&i.x>30&&i.s.trim()===s.name); if(!it) return null;
      const below=items.filter(i=>i.p===p&&Math.abs(i.x-it.x)<4&&i.y>it.y+4&&i.y<it.y+22).sort((a,b)=>a.y-b.y)[0];
      return {s,y:it.y,center:below?(it.y+below.y)/2:it.y+4}}).filter(Boolean).sort((a,b)=>a.y-b.y);
    let top=head.y+8;
    names.forEach(n=>{ const r=n.center-top, bottom=n.center+r;
      const lines=rows(items.filter(i=>i.p===p&&i.x>=descX&&i.y>=top-2&&i.y<bottom)).map(rw=>({y:rw.y,t:text(rw.items)}));
      detail[n.s.name]=paragraphs(lines); top=bottom; });
  });

  // ---- attacks table
  c.attacks=[];
  const atkH=items.find(i=>i.s.trim()==='ATTACKS'&&i.x>200);
  if(atkH){
    const p=atkH.p, hy=items.filter(i=>i.p===p&&i.y>atkH.y&&/^ATK/.test(i.s.trim()))[0];
    const colX=t=>{const it=items.find(i=>i.p===p&&hy&&Math.abs(i.y-hy.y)<=2&&i.s.trim().startsWith(t)); return it?it.x:null};
    const aX=colX('ATK')||130,dX=colX('DAMAGE')||170,rX=colX('RANGE')||260,nX=colX('NOTES')||310;
    const end=items.filter(i=>i.p===p&&i.y>atkH.y&&/^(ACTIONS|BONUS ACTIONS|REACTIONS)$/.test(i.s.trim())).sort((a,b)=>a.y-b.y)[0];
    const body=items.filter(i=>i.p===p&&hy&&i.y>hy.y+6&&(!end||i.y<end.y-4));
    const rowStarts=rows(body.filter(i=>i.x<aX-3)).map(r=>({y:r.y,name:text(r.items)}));
    rowStarts.forEach((r,k)=>{ const next=rowStarts[k+1]?rowStarts[k+1].y:1e9;
      const same=body.filter(i=>Math.abs(i.y-r.y)<=2);
      const atk=text(same.filter(i=>i.x>=aX-2&&i.x<dX-2)), dmg=text(same.filter(i=>i.x>=dX-2&&i.x<rX-2)), range=text(same.filter(i=>i.x>=rX-2&&i.x<nX-2));
      const notes=paragraphs(rows(body.filter(i=>i.x>=nX-2&&i.y>=r.y-2&&i.y<next-2)).map(z=>({y:z.y,t:text(z.items)})));
      const isSpell=!!SN(r.name)||spellRows.some(s=>s.name===r.name);
      if(dmg==='—'||dmg==='-'||!dmg){ if(!detail[r.name]) detail[r.name]=notes; return; } // utility spells stay in the spell list
      const a={id:uid(),name:r.name,kind:'atk',abil:'str',prof:true,bonusAtk:0,dice:'',bonusDmg:0,dmgAbil:false,type:'',range,mastery:'',saveAbil:'dex',notes};
      const dm=dmg.match(/^(\d+d\d+)?\s*([+-]\s*\d+)?\s*(\d+)?\s*([A-Za-z ]*)$/);
      let flat=0; if(dm){ a.dice=dm[1]||''; flat=Number((dm[2]||'').replace(/\s/g,''))||Number(dm[3])||0; a.type=(dm[4]||'').trim() }
      const sv=atk.match(/^(STR|DEX|CON|INT|WIS|CHA)\s+(\d+)$/);
      const cand=isSpell?[c.spellAbility]:['str','dex',...ABIL.filter(x=>x!=='str'&&x!=='dex')];
      if(sv){ a.kind='save'; a.saveAbil=sv[1].toLowerCase(); const dc=Number(sv[2]);
        const ab=(isSpell?[c.spellAbility]:ABIL).find(x=>x!=='none'&&8+mod(c.abilities[x])+PB===dc)||(isSpell?c.spellAbility:'dex'); a.abil=ab; a.bonusAtk=dc-(8+mod(c.abilities[ab]||10)+PB); }
      else { const hit=Number(atk); if(!isNaN(hit)){ let ab=cand.find(x=>x&&x!=='none'&&mod(c.abilities[x])+PB===hit);
          if(!ab){ ab=cand.find(x=>x&&x!=='none'&&mod(c.abilities[x])===hit); if(ab) a.prof=false }
          if(!ab){ ab=cand[0]; a.bonusAtk=hit-mod(c.abilities[ab]||10)-PB }
          if(!isSpell&&ab==='dex'&&mod(c.abilities.dex)>=mod(c.abilities.str)&&/finesse/i.test(notes)) ab='fin';
          a.abil=ab; } }
      const abMod=a.abil==='fin'?Math.max(mod(c.abilities.str),mod(c.abilities.dex)):(a.abil&&a.abil!=='none'?mod(c.abilities[a.abil]):0);
      if(isSpell||(!a.dice&&!/unarmed/i.test(a.name))){ a.dmgAbil=false; a.bonusDmg=flat; }
      else { a.dmgAbil=true; a.bonusDmg=flat-abMod; }
      c.attacks.push(a);
    });
  }
  spellRows.forEach(s=>{ const x=SN(s.name);
    if(x) c.spells.push({id:uid(),lvl:x[1],name:x[0],time:x[4],range:x[5],comp:x[6],dur:x[7],conc:!!x[8],ritual:!!x[9],prep:true,desc:x[10]});
    else c.spells.push({id:uid(),lvl:s.lvl,name:s.name,time:s.time,range:s.range,comp:'',dur:'',conc:false,ritual:/ritual/i.test(s.time),prep:true,desc:(detail[s.name]||'')+'\n\n(Imported from Roll20 — not in the SRD; check components and duration.)'}) });
  if(c.features===undefined){}
  // Agonizing Blast: Roll20 often leaves the CHA bonus out of the damage text
  // ---- actions / bonus actions / reactions
  c.features=[];
  const actHeads=items.filter(i=>/^(ACTIONS|BONUS ACTIONS|REACTIONS|OTHER ACTIONS)$/.test(i.s.trim())&&i.x>200).sort((a,b)=>a.p-b.p||a.y-b.y);
  actHeads.forEach((H,k)=>{ const p=H.p, nx=actHeads[k+1]&&actHeads[k+1].p===p?actHeads[k+1].y:1e9;
    const cat={ACTIONS:'action','BONUS ACTIONS':'bonus',REACTIONS:'reaction','OTHER ACTIONS':'other'}[H.s.trim()];
    const notesH=items.find(i=>i.p===p&&i.y>H.y&&i.y<H.y+30&&i.s.trim()==='NOTES'); const nX=notesH?notesH.x-3:128;
    const body=items.filter(i=>i.p===p&&i.y>H.y+22&&i.y<nx-4);
    const starts=rows(body.filter(i=>i.x<nX)).map(r=>({y:r.y,t:text(r.items)}));
    starts.forEach((r,j)=>{ const ny=starts[j+1]?starts[j+1].y:1e9;
      const t=paragraphs(rows(body.filter(i=>i.x>=nX&&i.y>=r.y-2&&i.y<ny-2)).map(z=>({y:z.y,t:text(z.items)})));
      c.features.push({id:uid(),cat,title:r.t,text:t}) });
  });
  // ---- features / traits / feats
  const secHeads=items.filter(i=>/^(CLASS FEATURES|SPECIES TRAITS|OTHER FEATURES|FEATS)$/.test(i.s.trim())&&i.p>core&&i.h>=8).sort((a,b)=>a.p-b.p||a.y-b.y);
  const stops=items.filter(i=>i.p>core&&i.h>=8&&/^[A-Z ,&]{6,}$/.test(i.s.trim())&&i.x>150&&i.x<350).sort((a,b)=>a.p-b.p||a.y-b.y);
  secHeads.forEach(H=>{
    const sec=H.s.trim(); const nextStop=stops.find(s=>s.p>H.p||(s.p===H.p&&s.y>H.y));
    const inSec=i=>(i.p>H.p||(i.p===H.p&&i.y>H.y+6))&&(!nextStop||i.p<nextStop.p||(i.p===nextStop.p&&i.y<nextStop.y-4));
    const body=items.filter(i=>i.p>=H.p&&inSec(i));
    const ps=[...new Set(body.map(i=>i.p))].sort((a,b)=>a-b);
    const entries=[];
    ps.forEach(p=>[[0,300],[300,9999]].forEach(([x0,x1])=>{
      rows(body.filter(i=>i.p===p&&i.x>=x0&&i.x<x1)).forEach(r=>{
        const isTitle=r.items.every(i=>i.h>=8)&&r.items.some(i=>LAT.test(i.s)||HEB.test(i.s));
        const t=text(r.items);
        if(isTitle){ const last=entries[entries.length-1]; if(last&&!last.lines.length&&last.p===p&&last.x0===x0&&r.y-last.y>0&&r.y-last.y<12) last.title+=' '+t; else entries.push({title:t,lines:[],p,y:r.y,x0}) }
        else if(entries.length) entries[entries.length-1].lines.push({y:r.y,t});
      }); }));
    entries.forEach(e=>{
      let title=e.title.replace(/\s+/g,' ').trim(), body=paragraphs(e.lines);
      if(!body) return; // tracker labels with no text
      const cat=sec==='CLASS FEATURES'?'class':sec==='SPECIES TRAITS'?'species':/\(Feat\)/.test(title)?'feat':'other';
      title=title.replace(/^Eldritch Invocation\s*-\s*/,'Eldritch Invocation: ').replace(/\s*\((Barbarian|Bard|Cleric|Druid|Fighter|Monk|Paladin|Ranger|Rogue|Sorcerer|Warlock|Wizard|Feat)\)\s*$/,'');
      body=body.replace(/^(Origin|General|Fighting Style|Epic Boon) Feat\s*/,'');
      c.features.push({id:uid(),cat,title,text:body});
    });
  });
  if(!secHeads.length) W.push('No feature pages found — class features, traits and feats were not imported.');
  // ---- inventory
  c.inventory=[];
  const invH=items.find(i=>i.s.trim()==='INVENTORY');
  if(invH){
    const wt=/^(\d+(?:\.\d+)?)\s*lbs?$/;
    const invPages=pages.filter(p=>p>=invH.p&&items.some(i=>i.p===p&&wt.test(i.s.trim()))&&!items.some(i=>i.p===p&&/^(CLASS FEATURES|BACKSTORY, PERSONALITY & FEATURES)$/.test(i.s.trim())&&i.y<60));
    const stopY=p=>{const s=items.find(i=>i.p===p&&/^WEIGHT$|Current Total Weight/.test(i.s.trim())); return s?s.y:1e9};
    invPages.forEach(p=>[[0,300],[300,9999]].forEach(([x0,x1])=>{
      const col=items.filter(i=>i.p===p&&i.x>=x0&&i.x<x1&&i.y<stopY(p));
      const heads=col.filter(i=>/^(EQUIPMENT|POSSESSIONS|MAGIC ITEM ATTUNEMENT|NAME|WT\.?|QTY|EQ\.)$/.test(i.s.trim()));
      const rowsW=rows(col).filter(r=>r.items.some(i=>wt.test(i.s.trim())));
      rowsW.forEach((r,k)=>{
        const w=r.items.find(i=>wt.test(i.s.trim())), q=r.items.find(i=>i.x>w.x&&/^\d+$/.test(i.s.trim()));
        const name=text(r.items.filter(i=>i.x<w.x-4)); if(!name) return;
        const qty=q?Number(q.s):1, total=Number(w.s.match(wt)[1]);
        const ny=rowsW[k+1]?rowsW[k+1].y:Math.min(1e9,...heads.filter(h=>h.y>r.y).map(h=>h.y));
        const desc=rows(col.filter(i=>i.y>r.y+4&&i.y<ny-3&&!heads.includes(i))).map(z=>text(z.items));
        let tags=desc[0]||''; let rest=desc.slice(1).join(' ');
        if(/^(Possession|Gear)$/.test(tags)) tags='';
        let notes=[tags.replace(/\s*·\s*/g,' · '),rest].filter(Boolean).join(' — ');
        if(notes.length>220) notes=notes.slice(0,217)+'…';
        c.inventory.push({id:uid(),name,qty,wt:qty?Math.round(total/qty*100)/100:total,eq:ARMOR.test(name),notes});
      });
    }));
    // remove duplicates where Roll20 lists an item twice on the summary page
  }
  // ---- notes
  c.notes={appearance:c.appearance||'',personality:'',backstory:c.backstory||'',notes:''};
  delete c.appearance; delete c.backstory; delete c.languages;
  // ---- rules-based extras: slots, resources, rage toggle
  c.slots={};for(let l=1;l<=9;l++)c.slots[l]={t:0,u:0}; c.pact={lvl:1,t:0,u:0};
  const R=RULES&&RULES.classes&&RULES.classes[ck], L=R&&R.levels[c.level];
  if(L&&L.slots){ if(ck==='warlock'){c.pact.t=L.slots.reduce((a,b)=>a+b,0);c.pact.lvl=L.slots.findIndex(x=>x>0)+1} else for(let l=1;l<=9;l++)c.slots[l].t=L.slots[l-1]||0 }
  if(R&&!hdm) c.hd.die='d'+R.hd;
  c.resources=[]; c.modes=[];
  const has=n=>c.features.some(f=>f.title.toLowerCase().startsWith(n.toLowerCase()));
  const addR=(name,max,reset,note)=>{ if(max>0) c.resources.push({id:uid(),name,cur:max,max,reset,note:note||''}) };
  const cs=(L&&L.cs)||{};
  if(has('Lucky')) addR('Luck Points (Lucky)',PB,'long','Advantage on a D20 Test, or Disadvantage on an attack against you.');
  if(has('Magical Cunning')) addR('Magical Cunning',1,'long','Regain up to half your Pact slots (round up).');
  if(has('Rage')&&cs.rage_count){ const r={id:uid(),name:'Rage',cur:cs.rage_count,max:cs.rage_count,reset:'short1',note:'Regain 1 on a Short Rest, all on a Long Rest.'}; c.resources.push(r);
    c.modes.push({id:uid(),name:'Rage',active:false,over:{str:'',dex:'',con:'',int:'',wis:'',cha:''},dmgBonus:cs.rage_damage_bonus||2,resId:r.id,note:'Resistance to B/P/S · Advantage on STR checks & saves · No spells or Concentration.'}) }
  if(has('Second Wind')&&cs.second_wind_uses) addR('Second Wind',cs.second_wind_uses,'short1','Bonus Action: regain 1d10 + Fighter level HP.');
  if(has('Action Surge')) addR('Action Surge',c.level>=17?2:1,'short','');
  if(cs.sorcery_points) addR('Sorcery Points',cs.sorcery_points,'long','Font of Magic');
  if(has('Bardic Inspiration')) addR('Bardic Inspiration',Math.max(1,mod(c.abilities.cha)),c.level>=5?'short':'long','');
  if(has('Lay On Hands')) addR('Lay On Hands (HP pool)',5*c.level,'long','');
  if(has("Monk's Focus")&&c.level>=2) addR('Focus Points',c.level,'short','');
  if(has('Wild Shape')&&c.level>=2) addR('Wild Shape',c.level>=17?4:c.level>=6?3:2,'short1','');
  if(has('Channel Divinity')) addR('Channel Divinity',ck==='cleric'?(c.level>=18?4:c.level>=6?3:2):(c.level>=11?3:2),'short1','');
  if(has('Arcane Recovery')) addR('Arcane Recovery',1,'long','');
  if(has('Relentless Endurance')) addR('Relentless Endurance',1,'long','Drop to 1 HP instead of 0.');
  if(has('Adrenaline Rush')) addR('Adrenaline Rush',PB,'short','Dash as a Bonus Action + Temp HP = PB.');
  if(has('Breath Weapon')) addR('Breath Weapon',PB,'long','');
  c.restInsp=/human/i.test(c.species)||has('Resourceful');
  c.inspiration=false; c.conditions=[]; c.exhaustion=0; c.death={s:0,f:0}; c.attune=['','',''];
  c.ac=c.ac||10;
  const acNote=c.inventory.find(i=>i.eq&&/armor/i.test(i.name)); c.acNote=acNote?acNote.name:'';
  // ---- sanity warnings
  if(c.features.some(f=>/Agonizing Blast/.test(f.title))) c.attacks.forEach(a=>{ if(/^Eldritch Blast$/i.test(a.name)) a.dmgAbil=true });
  if(!c.spells.length&&c.spellAbility!=='none') W.push('No spells found in the spell table.');
  if(!c.inventory.length) W.push('No inventory items found.');
  if(!c.features.length) W.push('No features found.');
  return {char:c,warnings:W};
}
root.parseRoll20=parseRoll20;
if(typeof module!=='undefined') module.exports={parseRoll20};
})(typeof window!=='undefined'?window:globalThis);
