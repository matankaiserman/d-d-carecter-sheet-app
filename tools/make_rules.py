import json,re,sys
md=open('/tmp/srdmd/classes.md',encoding='utf-8').read().split('\n')
fe=open('/tmp/srdmd/feats.md',encoding='utf-8').read().split('\n')
LV=json.load(open('/tmp/5e-database/src/2024/en/5e-SRD-Levels.json'))
CL=json.load(open('/tmp/5e-database/src/2024/en/5e-SRD-Classes.json'))
EQ=json.load(open('/tmp/5e-database/src/2024/en/5e-SRD-Equipment.json'))
def clean(lines):
    t='\n'.join(lines).strip()
    t=re.sub(r'\*\*(.+?)\*\*',r'\1',t); t=re.sub(r'(?<![A-Za-z0-9])_(.+?)_(?![A-Za-z0-9])',r'\1',t)
    t=re.sub(r'\n{3,}','\n\n',t); return t
# split into heading blocks
blocks=[]; cur=None
for line in md:
    m=re.match(r'^(#{2,4}) (.*)',line)
    if m:
        cur={'h':len(m.group(1)),'t':m.group(2).strip(),'lines':[]}; blocks.append(cur)
    elif cur: cur['lines'].append(line)
classes={}; options={'invocations':[],'metamagic':[]}
cls=None; sect=None; sub=None
for b in blocks:
    if b['h']==2: cls=b['t'].lower(); classes[cls]={'name':b['t'],'feat':{},'sub':None}; sect=None; continue
    if b['h']==3:
        t=b['t']; sub=None
        if t.endswith('Class Features'): sect='features'
        elif ' Subclass: ' in t: sect='sub'; classes[cls]['sub']={'name':t.split(': ',1)[1],'desc':clean(b['lines']),'feat':{}}
        elif t=='Eldritch Invocation Options': sect='inv'
        elif t=='Metamagic Options': sect='meta'
        else: sect=None
        continue
    if b['h']==4:
        m=re.match(r'Level (\d+): (.*)',b['t'])
        if sect=='features' and m: classes[cls]['feat'].setdefault(m.group(2),{})[int(m.group(1))]=clean(b['lines'])
        elif sect=='sub' and m: classes[cls]['sub']['feat'].setdefault(int(m.group(1)),[]).append({'name':m.group(2),'text':clean(b['lines'])})
        elif sect=='inv':
            txt=clean(b['lines']); pre=''; mm=re.match(r'Prerequisite: ([^\n]*)\n*',txt)
            if mm: pre=mm.group(1); txt=txt[mm.end():]
            lvl=re.search(r'Level (\d+)\+ Warlock',pre); pact=re.search(r'Pact of the (\w+)',pre); invreq=re.search(r'([A-Z][\w\' ]+) Invocation',pre)
            options['invocations'].append({'name':b['t'],'pre':pre,'lvl':int(lvl.group(1)) if lvl else 1,'req':(invreq.group(1).strip() if invreq else ''),'rep':'Repeatable.' in txt,'text':txt})
        elif sect=='meta': options['metamagic'].append({'name':b['t'],'text':clean(b['lines'])})
# levels data
out={}
for c in CL:
    k=c['index']; L={}
    for l in LV:
        if l.get('class',{}).get('index')==k and not l.get('subclass'):
            sc=l.get('spellcasting') or {}
            L[l['level']]={'f':[f['name'] for f in l['features']],'cs':l.get('class_specific') or {},
                           'cant':sc.get('cantrips_known'),'prep':sc.get('prepared_spells'),
                           'slots':[sc.get(f'spell_slots_level_{i}',0) for i in range(1,10)] if sc else None}
    d=classes.get(k,{}); out[k]={'name':c['name'],'hd':c['hit_die'],'levels':L,'feat':d.get('feat',{}),'sub':d.get('sub')}
# feats
feats=[]; cat=None; curf=None
for line in fe:
    m=re.match(r'^### (.*) Feats',line)
    if m: cat=m.group(1).lower(); continue
    m=re.match(r'^#### (.*)',line)
    if m: curf={'name':m.group(1),'cat':cat,'lines':[]}; feats.append(curf); continue
    if curf is not None and not line.startswith('#'): curf['lines'].append(line)
FE=[]
for f in feats:
    t=clean(f['lines']); pre=''; mm=re.match(r'(.*?) Feat(?: \(Prerequisite: ([^)]*)\))?\n*',t)
    if mm: pre=mm.group(2) or ''; t=t[mm.end():]
    lvl=re.search(r'Level (\d+)\+',pre)
    # ability bump parse
    ab=[]; mx=20
    m2=re.search(r'Ability Score Increase\. Increase (?:your )?(.*?) by 1, to a maximum of (\d+)',t)
    if m2:
        mx=int(m2.group(2)); s=m2.group(1)
        ab=['str','dex','con','int','wis','cha'] if 'of your choice' in s else [a[:3].lower() for a in re.findall(r'(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)',s)]
    FE.append({'name':f['name'],'cat':f['cat'],'pre':pre,'lvl':int(lvl.group(1)) if lvl else 1,'ab':ab,'max':mx,'rep':'Repeatable.' in t,'text':t})
W=[{'name':e['name'],'m':e['mastery']['name']} for e in EQ if e.get('mastery')]
rules={'classes':out,'inv':options['invocations'],'meta':options['metamagic'],'feats':FE,'weapons':W,
 'credit':'System Reference Document 5.2.1 © Wizards of the Coast LLC, CC-BY-4.0. Converted via downfallx/dnd-5e-srd-markdown and 5e-bits/5e-database.'}
json.dump(rules,open(sys.argv[1],'w'),ensure_ascii=False,separators=(',',':'))
print(len(out),[ (k,len(v['feat']),v['sub']['name'] if v['sub'] else None) for k,v in out.items()])
print(len(rules['inv']),len(rules['meta']),[(f['name'],f['cat'],f['lvl'],f['ab'],f['max']) for f in FE])
print([ (i['name'],i['lvl'],i['req'],i['rep']) for i in rules['inv']])
