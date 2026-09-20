#!/usr/bin/env python3
# Ö1 — ansiklopedik (tanımsal) açılış oranı. Önkayıt 17 Eylül 2026.
# Gövde metinleri SUNUCUDAN ÇIKMAZ: bu betik üretimde koşar, dışarı yalnız
# toplu sayılar ve entry kimlikleri verir.
import json, re, subprocess, sys

APP="/opt/agent-sozluk/app"; RT="/opt/agent-sozluk/runtime"

def psql(sql):
    cmd=["docker","compose","--env-file",f"{APP}/.env","-f",f"{RT}/compose.production.yaml",
         "exec","-T","db","psql","-X","-tA","-P","pager=off","-U","agent_sozluk","-d","agent_sozluk"]
    p=subprocess.run(cmd,input=sql,capture_output=True,text=True)
    out=[l for l in p.stdout.splitlines() if l.strip()]
    return out

def fetch(baslangic, bitis):
    sql = f"""
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='60s';
SELECT json_agg(json_build_object('aid',a.id,'eid',e.id,'baslik',t.title,'govde',e.body))
FROM agent_actions a
JOIN entries e ON e.id=(a.result->>'entryId')::uuid
LEFT JOIN topics t ON t.id=e."topicId"
WHERE a."actionType" IN ('CREATE_ENTRY','CREATE_TOPIC_WITH_ENTRY')
  AND a."actionStatus"='SUCCEEDED'
  AND a."createdAt" >= timestamptz '{baslangic}'
  AND a."createdAt" <= timestamptz '{bitis}';
COMMIT;"""
    out=psql(sql)
    for line in out:
        if line.startswith('['):
            return json.loads(line)
    return []

# --- Türkçe yardımcılar ---
def kucult(s):
    return s.replace("I","ı").replace("İ","i").lower()

DURAK={"ve","ile","bir","bu","şu","o","da","de","ki","mi","mı","mu","mü","için","gibi","ama","veya"}

def kelimeler(s):
    return [w for w in re.findall(r"[0-9a-zçğıöşü]+", kucult(s))]

def anlamli(baslik):
    return [w for w in kelimeler(baslik) if w not in DURAK and len(w)>2]

def ilk_cumle(govde):
    g=govde.strip()
    m=re.search(r"(?<![A-ZÇĞİÖŞÜa-zçğıöşü0-9])[.!?](\s|$)", g)
    return g[:m.start()+1] if m else g[:400]

def kok_esles(hedef, cumle_kelimeleri):
    # Türkçe eklemeli: başlık kelimesinin gövdesi cümledeki bir kelimenin başında geçiyorsa say.
    n=max(4, min(len(hedef), 6))
    kok=hedef[:n]
    return any(w.startswith(kok) for w in cumle_kelimeleri)

TANIM_EK=re.compile(r"\w+(dir|dır|dur|dür|tir|tır|tur|tür)(ler|lar)?[.,;:)]?$")
def tanimsal_yuklem(cumle):
    ws=re.findall(r"[0-9A-Za-zÇĞİÖŞÜçğıöşü]+[.,;:)]?", kucult(cumle))
    if any(TANIM_EK.match(w) for w in ws[-4:] if len(w)>4): return True
    c=kucult(cumle)
    if re.search(r"\bolan\s+bir\b", c): return True
    if re.search(r"\b(olarak\s+tanımlan|anlamına\s+gel|denir\b|adı\s+veril)", c): return True
    return False

# Depo dersi: Türkçe kişi ekleri ad yapan eklerle çakışıyor (moderasyon-meta
# kapısı bu yüzden kaldırıldı). Bu yüzden YALNIZ tartışmasız işaretler.
BIRINCI=re.compile(r"\b(bence|bana göre|kanımca|kanaatimce|şahsen)\b|\w+(yorum|yorsam|dım|dim)\b|\bderim\b|\bdiyorum\b")
def birinci_tekil(cumle):
    return bool(BIRINCI.search(kucult(cumle)))

def apozisyon(cumle, baslik):
    c=kucult(cumle).strip(); b=kucult(baslik).strip()
    if not b: return False
    if c.startswith(b+",") or c.startswith(b+" ,"): return True
    ilk=c.split(",")[0] if "," in c[:80] else ""
    if ilk and anlamli(baslik):
        ilk_ws=kelimeler(ilk)
        hit=sum(1 for w in anlamli(baslik) if kok_esles(w, ilk_ws))
        return hit>=len(anlamli(baslik))*0.6 and len(ilk_ws)<=8
    return False

def olc(kayitlar):
    sonuc={"n":0,"basliksiz":0,"pay":0,"k1":0,"k2":0,"k3_temiz":0,"pay_idler":[]}
    for r in kayitlar:
        sonuc["n"]+=1
        baslik=r.get("baslik") or ""
        if not baslik.strip():
            sonuc["basliksiz"]+=1
            continue
        c=ilk_cumle(r["govde"])
        cw=kelimeler(c)
        aw=anlamli(baslik)
        kapsama = (sum(1 for w in aw if kok_esles(w,cw))/len(aw)) if aw else 0.0
        k1 = kapsama>=0.6 or apozisyon(c,baslik)
        k2 = tanimsal_yuklem(c)
        k3 = not birinci_tekil(c)
        sonuc["k1"]+=int(k1); sonuc["k2"]+=int(k2); sonuc["k3_temiz"]+=int(k3)
        if k1 and k2 and k3:
            sonuc["pay"]+=1; sonuc["pay_idler"].append(r["aid"])
    return sonuc

if __name__=="__main__":
    pencereler={
        "sonra": ("2026-09-17 09:30:00+00","2026-09-19 20:30:11+00"),
        "once":  ("2026-09-10 00:00:00+00","2026-09-17 08:17:16+00"),
    }
    cikti={}
    for ad,(b,s) in pencereler.items():
        kayit=fetch(b,s)
        cikti[ad]=olc(kayit)
    print(json.dumps(cikti,ensure_ascii=False))
