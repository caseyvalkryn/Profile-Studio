import json, math, uuid, datetime
G=json.load(open('geom.json'))
ORIGIN=G['origin']; FLY=G['fly']; RANCH=G['ranch']
NOW=datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z')
B=142.18432765605763; rad=math.radians(B)
U=(math.sin(rad),math.cos(rad)); V=(math.cos(rad),-math.sin(rad))  # V: across, left-hand side (NE)
CEN=(10.418721773852523,-52.86877459057709)
def P(s,a=0.0): return (round(CEN[0]+s*U[0]+a*V[0],1), round(CEN[1]+s*U[1]+a*V[1],1))
def key(): return str(uuid.uuid4())
def inside(pt,poly):
    x,y=pt; n=len(poly); ins=False
    for i in range(n):
        x1,y1=poly[i]; x2,y2=poly[(i+1)%n]
        if (y1>y)!=(y2>y) and x < (x2-x1)*(y-y1)/(y2-y1)+x1: ins=not ins
    return ins
def edgeDist(pt,poly):
    x,y=pt; best=1e9
    for i in range(len(poly)):
        x1,y1=poly[i]; x2,y2=poly[(i+1)%len(poly)]
        dx,dy=x2-x1,y2-y1; L2=dx*dx+dy*dy
        t=max(0,min(1,((x-x1)*dx+(y-y1)*dy)/L2))
        best=min(best,math.hypot(x-(x1+t*dx),y-(y1+t*dy)))
    return best
def clipBand(poly,s1,s2):
    # Sutherland-Hodgman against s>=s1 and s<=s2 where s=(p-CEN).U
    def sOf(p): return (p[0]-CEN[0])*U[0]+(p[1]-CEN[1])*U[1]
    def clip(pts,keep,bound):
        out=[]
        for i in range(len(pts)):
            a=pts[i]; b=pts[(i+1)%len(pts)]; ka=keep(sOf(a)); kb=keep(sOf(b))
            if ka: out.append(a)
            if ka!=kb:
                t=(bound-sOf(a))/(sOf(b)-sOf(a)); out.append((a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])))
        return out
    r=clip([tuple(p) for p in poly],lambda s:s>=s1,s1); r=clip(r,lambda s:s<=s2,s2)
    return [[round(x,1),round(y,1)] for x,y in r]

# ---- shared parts
SITE={'name':'TST Ranch, Carthage NC','lat':ORIGIN[0],'lon':ORIGIN[1],'elevM':150}
COLL='JIOPs four-camera test, TST Ranch, 12 to 13 Nov 2026'
S_CAM=200
CAMPOS=[P(S_CAM,a) for a in (-15,-5,5,15)]
LAUNCH=P(-270)
def wp(pt,z,hold=0): return {'key':key(),'x':pt[0],'y':pt[1],'z':z,'holdS':hold}
def sensorModel(rangeM): return {'pd':{'kind':'logistic','r50M':0.8*rangeM,'widthM':0.1*rangeM},'scanS':1,'trackM':3,'trackN':5,'coastS':10,'idDwellS':5,'pCorrectId':0.9,'trackErrorM':5}
def cam(id,pos,rangeM,fov,elMin,elMax,fovSrc):
    return {'key':key(),'id':id,'kind':'eoir','x':pos[0],'y':pos[1],'z':2.5,'rangeM':rangeM,'minRangeM':0,'fovDeg':fov,'bearingDeg':round((B+180)%360,1),'elMinDeg':elMin,'elMaxDeg':elMax,'model':sensorModel(rangeM),'entered':{'1.3':{'value':fov,'source':fovSrc}}}
FIX='Appendix B example value (80 deg horizontal, 2560 x 1920, 25 fps); confirm against the purchased model'
Z2='Varifocal at 2x: about 40 deg horizontal; derive from the calibrated focal length'
Z5='Varifocal at 5x: about 17.6 deg horizontal; derive from the calibrated focal length'
def cams_baseline():
    return [cam('CAM-1',CAMPOS[0],250,80,-24,40,FIX),cam('CAM-2',CAMPOS[1],250,80,-24,40,FIX),
            cam('CAM-3',CAMPOS[2],400,40,-10,20,Z2),cam('CAM-4',CAMPOS[3],450,17.6,-2.6,10.6,Z5)]
def node(id,kind,pt,rangeM=0): return {'key':key(),'id':id,'kind':kind,'x':pt[0],'y':pt[1],'z':0,'rangeM':rangeM,'fovDeg':0,'bearingDeg':0}
def nodes():
    gcs=P(-285,-10); rec=P(215,0)
    return [node('GCS-1','c2',gcs),node('REC-1','c2',rec),node('TM-1','tspi',gcs),node('TM-2','tspi',rec)]
def square(c,side): h=side/2; return [[c[0]-h,c[1]-h],[c[0]+h,c[1]-h],[c[0]+h,c[1]+h],[c[0]-h,c[1]+h]]
def area(id,kind,label,pts,zmax=0): return {'key':key(),'id':id,'kind':kind,'label':label,'pts':pts,'zMinM':0,'zMaxM':zmax}
def rangeAreas(): return [area('RNG-1','range','UAS Fly Area',[list(p) for p in FLY]),area('RNG-2','range','TST Ranch',[list(p) for p in RANCH])]
def da(): return area('DA','asset','Camera site',square(P(S_CAM),24))
def planes(zs):
    return [{'key':key(),'id':f'HP-{i+1}','label':l,'zM':z} for i,(l,z) in enumerate(zs)]
def q(text,note): return {'key':key(),'id':'Q-01','text':text,'note':note}
def m(id,op,th,unit): return {'id':id,'op':op,'threshold':th,'unit':unit}
def threat(id,type,path,speed,group=''): return {'key':key(),'id':id,'type':type,'path':path,'speedMs':speed,'group':group}
DATA_COMMON=['Four camera recordings, RTSP main stream, continuous, native resolution, 25 fps, MP4 segments with timestamps',
 'Camera configuration snapshot per run per camera (Appendix B.1 JSON): resolution, fps, FOV, zoom, focus, exposure, time offset',
 'Camera survey record: WGS84 position, lens height, azimuth, tilt, roll, installation photo',
 'Aircraft GCS telemetry log at the maximum rate: GPS time, latitude, longitude, altitude, accuracy',
 'ATOS tag track for the same aircraft (VAL fused), for comparison with the GCS log',
 'Clock synchronization record: PC, camera, video and telemetry offsets with the measured uncertainty',
 'Detection event table per camera: first possible, first confirmed, first identified; frame index, UTC, still image, reviewer',
 'Computed ranges per event: aircraft and camera ENU positions, ground range, slant range, uncertainty, FOV-limited and occluded flags',
 'Environmental record per run: sun position, sky background, cloud, visibility, wind, obstructions',
 'Target-absent recording interval per run (120 s before launch) for the false-detection count']
# ---- timing and coverage replicas (engine/geo.ts)
def timed(path,v):
    t=0; out=[]
    for i,p in enumerate(path):
        if i: a=path[i-1]; t+=math.hypot(p['x']-a['x'],p['y']-a['y'],p['z']-a['z'])/v
        out.append((p['x'],p['y'],p['z'],t,t+p['holdS'])); t+=p['holdS']
    return out
def posAt(w,t):
    if t<=w[0][3]: return w[0][:3]
    for i in range(len(w)-1):
        a=w[i]; b=w[i+1]
        if t<=a[4]: return a[:3]
        if t<=b[3]:
            f=(t-a[4])/(b[3]-a[4]) if b[3]>a[4] else 1
            return (a[0]+f*(b[0]-a[0]),a[1]+f*(b[1]-a[1]),a[2]+f*(b[2]-a[2]))
    return w[-1][:3]
def covered(s,p):
    R=math.hypot(p[0]-s['x'],p[1]-s['y'],p[2]-s['z'])
    if R>s['rangeM']: return False
    br=math.degrees(math.atan2(p[0]-s['x'],p[1]-s['y']))%360
    d=abs((br-s['bearingDeg']+540)%360-180)
    if d>s['fovDeg']/2: return False
    el=math.degrees(math.atan2(p[2]-s['z'],math.hypot(p[0]-s['x'],p[1]-s['y'])))
    return s['elMinDeg']<=el<=s['elMaxDeg']
def windows(sensor,w):
    end=w[-1][4]; out=[]; cur=None
    for t in range(0,int(end)+1):
        c=covered(sensor,posAt(w,t))
        if c and cur is None: cur=t
        if not c and cur is not None: out.append((cur,t-1)); cur=None
    if cur is not None: out.append((cur,int(end)))
    return out
def card(id,name,kind,tS,focus,caption,notes,layers=None,clip=None,yaw=-35,pitch=55,elev='alongPath',ref='asset',zoom=1.0):
    L={'reach':True,'events':True,'envelopes':False,'telemetry':False,'labels':True}
    if layers: L.update(layers)
    return {'key':key(),'id':id,'name':name,'view':{'kind':kind,'centre':{'x':0,'y':0},'zoom':zoom,'yawDeg':yaw,'pitchDeg':pitch,'ref':ref,'elevationMode':elev},
            'layers':L,'displays':{'timeline':True,'chart':False,'readout':True},'clip':clip,'focus':focus,'tS':tS,'caption':caption,'notes':notes}
def ev(id,t,type,label,tk,sk): return {'key':key(),'id':id,'tS':round(t,1),'type':type,'label':label,'threatKey':tk,'sensorKey':sk}
def vignette(id,name,cls,Q,threats,sensors,nodes_,areas,planes_,events,snapshots,cards,measures,notes,data,truthKeys):
    return {'schema':'profile-studio/8','id':id,'name':name,'updated':NOW,'collection':COLL,'class':cls,'version':1,'site':SITE,
            'questions':[Q],'threats':threats,'sensors':sensors,'effectors':[],'nodes':nodes_,'areas':areas,'planes':planes_,'events':events,
            'snapshots':snapshots,'cards':cards,'debrief':None,'chainTime':{'decisionS':5,'assignS':3},'measures':measures,
            'report':{'notes':notes,'dataSources':DATA_COMMON+data,'truth':{'source':'Aircraft GCS telemetry log (GPS time, lat, lon, alt); ATOS tag track as the second source','intervalS':0.2,'stationKeys':truthKeys}}}
def check(v):
    bad=[]
    for t in v['threats']:
        for w in t['path']:
            pt=(w['x'],w['y'])
            if not inside(pt,FLY): bad.append(f"{t['id']} waypoint {pt} outside the fly area")
            elif edgeDist(pt,FLY)<3: bad.append(f"{t['id']} waypoint {pt} within 3 m of the fly area edge")
    for s in v['sensors']+v['nodes']:
        if not inside((s['x'],s['y']),RANCH): bad.append(f"{s['id']} outside the ranch")
    return bad
def report(v):
    print('==',v['id'],v['name'])
    for t in v['threats']:
        w=timed(t['path'],t['speedMs']); print(f"  {t['id']} end {w[-1][4]:.0f} s")
        for s in v['sensors']:
            ws=windows(s,w)
            if ws:
                p=posAt(w,ws[0][0]); R=math.hypot(p[0]-s['x'],p[1]-s['y'])
                print(f"    {s['id']:10s} first {ws[0][0]:4d} s at {R:4.0f} m ground; windows {ws}")
            else: print(f"    {s['id']:10s} no window")
    for b in check(v): print('  !!',b)
