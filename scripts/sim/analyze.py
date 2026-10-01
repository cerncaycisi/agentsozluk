import subprocess, collections, sys, json
PSQL=["/home/agent/pg16/root/usr/lib/postgresql/16/bin/psql","-h","127.0.0.1","-U","agent","-XAtq","-F","\t"]
def q(db, sql):
    out=subprocess.run(PSQL+["-d",db,"-c",sql],capture_output=True,text=True,env={"LD_LIBRARY_PATH":"/home/agent/pg16/root/usr/lib/x86_64-linux-gnu"}).stdout
    return [l.split("\t") for l in out.splitlines() if l]
hubs=set(l.strip() for l in open('/home/agent/style-lab/hubs.txt') if l.strip())
import os
SINCE=os.environ.get("SIM_SINCE","2026-09-28 12:00+00")
for db in sys.argv[1:]:
    runs=q(db,f"""select "runStatus", count(*) from agent_runs where trigger='ADMIN_BULK' and "startedAt" >= '{SINCE}' and coalesce("errorCode",'')<>'SIM_RESTART' group by 1""")
    ent=q(db,f"""select u.username, lower(t.title) from entries e join agent_content_records c on c."entryId"=e.id join agent_runs r on r.id=c."runId" join topics t on t.id=e."topicId" join users u on u.id=e."authorId" where r.trigger='ADMIN_BULK' and r."startedAt" >= '{SINCE}'""")
    rej=q(db,f"""select a."rejectionCode", count(*) from agent_actions a join agent_runs r on r.id=a."runId" where r.trigger='ADMIN_BULK' and r."startedAt" >= '{SINCE}' and a."actionStatus"='REJECTED' group by 1 order by 2 desc""")
    n=len(ent); topics=collections.Counter(t for _,t in ent)
    top10=sum(c for _,c in topics.most_common(10))
    hub=sum(1 for _,t in ent if t in hubs)
    per=collections.defaultdict(collections.Counter)
    for u,t in ent: per[u][t]+=1
    conc=[sum((c/sum(v.values()))**2 for c in v.values()) for v in per.values() if sum(v.values())>=2]
    total_runs=sum(int(c) for _,c in runs)
    print(f"== {db}: koşu {dict((s,int(c)) for s,c in runs)} | entry {n} ({n/max(total_runs,1):.2f}/koşu)")
    print(f"   ilk 10 başlık payı {top10}/{n} = {top10/max(n,1):.0%} | eski çekim merkezleri {hub}/{n} = {hub/max(n,1):.0%} | farklı başlık {len(topics)} | ajan yoğunlaşması (≥2 entry) {sum(conc)/max(len(conc),1):.2f} (n={len(conc)})")
    print("   en çok:", ", ".join(f"{t} {c}" for t,c in topics.most_common(6)))
    print("   redler:", ", ".join(f"{r} {c}" for r,c in rej[:6]))
